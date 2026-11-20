// 서버 이전 갈림길: 기본은 모든 요청이 지금 서버(Apps Script) · SB_ROUTE 'dispatch' 면 로그인·배차만 Supabase 함수로, 15초 확인은 DB 직접 조회(RPC)로
// 바깥 서버는 가짜로 응답해요(어느 주소로 무슨 액션이 갔는지만 봐요). 관리자 → API 키의 '서버 이전 준비' 칸(데모)도 확인.
var T = require('../lib/browser.js'), ok = T.ok;
var GAS = 'https://script.google.com/macros/s/FAKE/exec', FN = 'https://sbtest.supabase.co/functions/v1/joil', REST = 'https://sbtest.supabase.co';
var D = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
async function run(route) {
  var cfg = "window.JOIL_CONFIG={API_URL:'" + GAS + "',SB_FN:'" + FN + "',SB_REST:'" + REST + "',SB_ANON:'anon-test'" + (route ? ",SB_ROUTE:'" + route + "'" : '') + "};";
  var o = await T.open({ login: false, config: cfg }), p = o.page, hits = [];
  var user = { id: 'admin', name: '관리자', role: 'admin', mustChange: false, perms: ['quote', 'analysis', 'search', 'track', 'admin'], dispTabs: [] };
  var reply = function (a) {
    if (a === 'login') return { token: 'tok-' + Date.now(), user: user, settings: { tons: ['5톤'] } };
    if (a === 'me') return { user: user, settings: { tons: ['5톤'] } };
    if (a === 'dispatch.tabs') return { tabs: [{ name: '부자재-인천', suf: '', prefix: '부자재' }] };
    if (a === 'dispatch.day' || a === 'dispatch.dayAll') return { orders: [], trucks: [], days: {}, receipts: [], byKey: { '쿠팡부자재': { orders: [], trucks: [], days: {}, receipts: [] } } };
    return {};
  };
  await p.route(/^https:\/\/(script\.google\.com|sbtest\.supabase\.co)\//, function (r) {
    var u = r.request().url(), host = u.indexOf(GAS) === 0 ? 'gas' : u.indexOf('/rest/v1/rpc/') !== -1 ? 'rpc' : 'fn', body = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
    var a = body.action || (host === 'rpc' ? u.replace(/^.*\/rpc\//, '') : ''); hits.push(host + ' ' + a);
    var out = host === 'rpc' ? { ok: true, stamps: {} } : Object.assign({ ok: true }, reply(a));
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(out) });
  });
  await p.reload(); await T.login(p, 'admin', 'x');
  await p.evaluate(function () { location.hash = '#/dispatch'; }); await p.waitForTimeout(2500);
  await o.browser.close(); return hits;
}
T.run(async function () {
  var h0 = await run('');
  ok('기본: 로그인·배차가 모두 지금 서버(Apps Script)로', h0.indexOf('gas login') !== -1 && h0.some(function (x) { return /^gas dispatch\./.test(x); }) && !h0.some(function (x) { return /^(fn|rpc) /.test(x); }), h0);
  var h1 = await run('dispatch');
  ok('Supabase 갈림길: 로그인은 Supabase 함수로', h1.indexOf('fn login') !== -1 && h1.indexOf('gas login') === -1, h1);
  ok('Supabase 갈림길: 배차 조회도 Supabase 함수로', h1.some(function (x) { return /^fn dispatch\.(tabs|day|dayAll)$/.test(x); }) && !h1.some(function (x) { return /^gas dispatch\./.test(x); }), h1);
  ok('Supabase 갈림길: 15초 확인은 함수가 아니라 DB 직접 조회(RPC)', h1.indexOf('rpc joil_stamps') !== -1 && h1.indexOf('fn dispatch.stamp') === -1, h1);
  ok('Supabase 갈림길: 안 옮긴 액션(공지·날씨 등)은 그대로 Apps Script', h1.some(function (x) { return /^gas /.test(x); }), h1);

  var o = await T.open({}), p = o.page; // 데모: 관리자 → API 키에서 Supabase 연결 뒤 '서버 이전 준비' 칸
  await T.api(p, 'admin.saveTrackKeys', { url: 'https://demo.supabase.co', key: 'x' });
  await p.evaluate(function () { location.hash = '#/admin'; }); await p.waitForTimeout(800);
  await p.evaluate(function () { var b = Array.prototype.filter.call(document.querySelectorAll('button, a'), function (x) { return /API 키/.test(x.textContent); })[0]; if (b) b.click(); }); await p.waitForTimeout(800);
  ok('관리자 API 키 화면에 서버 이전 준비 칸', !!(await p.$('#sbMig')), await T.text(p, '#adminBody').catch(function () { return ''; }));
  if (await p.$('#sbStat')) { await p.click('#sbStat'); await p.waitForTimeout(500); ok('상태 보기 (데모)', /자동 백업: 꺼짐/.test(await T.text(p, '#sbOut'))); await p.click('#sbCopy'); await p.waitForTimeout(500); ok('시험 복사는 데모에서 안내만', /데모 모드/.test(await T.text(p, '#sbOut'))); }
  ok('화면 오류 없음', !p.errs.length, p.errs);
  await o.browser.close();
});
