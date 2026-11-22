// 주소 좌표(dispatch.geo · 기사 링크 drv.get): 구글 서버(int.geo)를 거치지 않고 Supabase 안에서(주소캐시 + 카카오) 바로 · 두 번째는 캐시에서 · 못 찾으면 덜 엄격하게 다시 (가짜 주소·가짜 카카오)
var L = require('../sb/lib.js'), ok = require('../lib/mock.js').ok;
(async function () {
  var calls = [], gasCalls = 0;
  var fake = function (url) {
    calls.push(url); var q = decodeURIComponent((String(url).match(/query=([^&]*)/) || [])[1] || '');
    var hit = /가상로 1$/.test(q) || q === '가상시 가상구 가상로2길 3';
    var body = JSON.stringify({ documents: hit ? [{ x: '127.1', y: '37.5', address_name: q, address: { region_1depth_name: '가상' } }] : [] });
    return Promise.resolve({ status: 200, text: function () { return Promise.resolve(body); }, json: function () { return Promise.resolve(JSON.parse(body)); } });
  };
  var S = await L.boot({ netFetch: fake, fetch: function () { gasCalls++; return Promise.reject(new Error('구글 서버를 부르면 안 돼요')); } });
  if (!S) { console.log('PASS (건너뜀) 시험용 Postgres 가 없어요'); return; }
  try {
    await L.users(S, [{ id: 'a', name: '관리', role: 'admin', perms: 'quote' }]);
    await S.sql.unsafe("insert into gas_props (key, value) values ('KAKAO_REST_KEY', 'test-key') on conflict (key) do update set value = excluded.value");
    var tok = (await S.call('', 'login', { id: 'a', password: 'test1234' })).token;
    var r = await S.call(tok, 'dispatch.geo', { addrs: ['가상시 가상구 가상로 1', '가상시 가상구 가상로2길 3 (2층)', '없는 주소 999'] });
    ok('좌표를 구글 서버 없이 찾음', r.ok && gasCalls === 0 && r.coords['가상시 가상구 가상로 1'] && r.coords['가상시 가상구 가상로 1'].lat === 37.5, [r, gasCalls]);
    ok('괄호 설명 빼고 다시 찾기(덜 엄격)', !!r.coords['가상시 가상구 가상로2길 3 (2층)'], r.coords);
    ok('끝내 못 찾으면 빼고 오류 없음', !r.coords['없는 주소 999']);
    var n = calls.length; r = await S.call(tok, 'dispatch.geo', { addrs: ['가상시 가상구 가상로 1'] });
    ok('두 번째는 저장된 좌표(카카오 안 부름)', r.ok && calls.length === n && r.coords['가상시 가상구 가상로 1'], [calls.length, n]);
  } finally { await S.stop(); }
})().catch(function (e) { console.log('FAIL 테스트 중단 :: ' + e.message); process.exit(1); });
