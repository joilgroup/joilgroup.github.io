// 실시간 반영: joil_stamps 가 준 채널에 웹소켓으로 붙고, 신호가 오면 바로 다시 받음 · 연결돼 있으면 15초 확인을 건너뜀 (가짜 서버·가짜 웹소켓)
var T = require('../lib/browser.js'), ok = T.ok;
var FN = 'https://sbtest.supabase.co/functions/v1/joil', REST = 'https://sbtest.supabase.co';
T.run(async function () {
  var cfg = "window.JOIL_CONFIG={API_URL:'https://script.google.com/macros/s/FAKE/exec',SB_FN:'" + FN + "',SB_REST:'" + REST + "',SB_ANON:'anon-test',SB_ROUTE:'all'};";
  var o = await T.open({ login: false, config: cfg }), p = o.page, hits = [], stamp = 1;
  var user = { id: 'admin', name: '관리자', role: 'admin', mustChange: false, perms: ['quote', 'analysis', 'search', 'track', 'admin'], dispTabs: [] };
  var day = { orders: [], trucks: [], days: {}, receipts: [] };
  await p.addInitScript(function () { // 가짜 Realtime 웹소켓: 들어온 채널 기록 · window.__rtFire() 로 신호 보내기
    window.__rt = { url: '', joins: [] };
    window.WebSocket = function (url) { var me = this; window.__rt.url = url; me.readyState = 0; window.__rt.ws = me; setTimeout(function () { me.readyState = 1; me.onopen && me.onopen(); }, 50); };
    window.WebSocket.prototype.send = function (s) { var m = JSON.parse(s), me = this; if (m.event === 'phx_join') { window.__rt.joins.push(m.topic); setTimeout(function () { me.onmessage({ data: JSON.stringify({ topic: m.topic, event: 'phx_reply', ref: m.ref, payload: { status: 'ok' } }) }); }, 20); } };
    window.WebSocket.prototype.close = function () {};
    window.__rtFire = function () { var ws = window.__rt.ws; ws.onmessage({ data: JSON.stringify({ topic: window.__rt.joins[0], event: 'broadcast', payload: { type: 'broadcast', event: 'stamp', payload: { s: 2 } } }) }); };
  });
  await p.route(/^https:\/\/(script\.google\.com|sbtest\.supabase\.co)\//, function (r) {
    var u = r.request().url(), rpc = u.indexOf('/rest/v1/rpc/') !== -1, body = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
    var a = rpc ? 'rpc' : body.action; hits.push(a);
    var out = rpc ? { ok: true, stamps: (body.p_keys || []).reduce(function (o2, k) { o2[k] = stamp; return o2; }, {}), topics: (body.p_keys || []).reduce(function (o2, k) { o2[k] = 'jtopic' + encodeURIComponent(k).length; return o2; }, {}) }
      : Object.assign({ ok: true }, a === 'login' ? { token: 'tok', user: user, settings: { tons: ['5톤'] } } : a === 'me' ? { user: user, settings: { tons: ['5톤'] } } : a === 'dispatch.tabs' ? { tabs: [{ name: '부자재-인천', suf: '', prefix: '부자재' }] } : a === 'dispatch.dayAll' ? { byKey: { '쿠팡부자재': day } } : {});
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(out) });
  });
  await p.reload(); await T.login(p, 'admin', 'x');
  await p.evaluate(function () { location.hash = '#/dispatch'; }); await p.waitForTimeout(2500);
  var rt = await p.evaluate(function () { return { url: window.__rt.url, joins: window.__rt.joins }; });
  ok('Realtime 웹소켓 연결 (공개 키) · joil_stamps 가 준 채널에 들어감', /^wss:\/\/sbtest\.supabase\.co\/realtime\/v1\/websocket\?apikey=anon-test/.test(rt.url) && rt.joins.length === 1 && /^realtime:jtopic/.test(rt.joins[0]), rt);
  var n0 = hits.filter(function (x) { return x === 'dispatch.dayAll'; }).length, r0 = hits.filter(function (x) { return x === 'rpc'; }).length;
  stamp = 2; await p.evaluate(function () { window.__rtFire(); }); await p.waitForTimeout(1500);
  var n1 = hits.filter(function (x) { return x === 'dispatch.dayAll'; }).length;
  ok('신호가 오면 바로 확인 → 바뀌었으면 다시 받음', n1 === n0 + 1, hits.slice(-6));
  var r1 = hits.filter(function (x) { return x === 'rpc'; }).length;
  await p.waitForTimeout(16500);
  var r2 = hits.filter(function (x) { return x === 'rpc'; }).length;
  ok('연결돼 있으면 15초 확인을 건너뜀', r1 === r0 + 1 && r2 === r1, [r0, r1, r2]);
  ok('화면 오류 없음', !p.errs.length, p.errs);
  await o.browser.close();
});
