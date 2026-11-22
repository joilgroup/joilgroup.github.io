// 출발·도착 버튼 (019 · 애플 기사 화면 go.html): 시각 + 그때 위치 한 번 · 두 번 눌러도 한 번 · 되돌리기 · 위치 없이도 · 배차 화면 dispatch.events · 협력사는 배정 탭만 · 애플 기본 탭
var L = require('../sb/lib.js'), ok = require('../lib/mock.js').ok;
(async function () {
  var S = await L.boot(); if (!S) { console.log('PASS (건너뜀) 시험용 Postgres 가 없어요'); return; }
  try {
    await L.users(S, [{ id: 'a', name: '관리', role: 'admin', perms: 'quote' }, { id: 'p', name: '협력A', role: 'partner', perms: 'none', tabs: ['애플'] }, { id: 'q', name: '협력B', role: 'partner', perms: 'none', tabs: ['쿠팡부자재/평택'] }]);
    var tok = {}; for (var u of ['a', 'p', 'q']) tok[u] = (await S.call('', 'login', { id: u, password: 'test1234' })).token;
    var tabs = await S.call(tok.a, 'dispatch.tabs', { cust: '애플' });
    ok('애플 기본 탭', tabs.ok && tabs.tabs.length === 1 && tabs.tabs[0].name === '애플' && tabs.tabs[0].suf === '', tabs);
    var D0 = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), K = '애플';
    var o = function (fc) { return { from: '가상상차', fc: fc, addr: '가상시 ' + fc, hours: '09:00~17:00', bundle: '4' }; };
    await S.call(tok.a, 'dispatch.import', { cust: K, rows: [{ date: D0, key: 'k1', d: o('하차A') }, { date: D0, key: 'k2', d: o('하차B') }] });
    var dp = await S.call(tok.a, 'dispatch.day', { cust: K, date: D0 });
    await S.call(tok.a, 'dispatch.save', { cust: K, date: D0, orders: [{ id: dp.orders[0].id, truck: 1, seq: 1 }, { id: dp.orders[1].id, truck: 1, seq: 2 }], trucks: [{ no: 1, car: '12가3456' }] });
    var t = (await S.call(tok.a, 'dispatch.day', { cust: K, date: D0 })).trucks[0].token;
    var e0 = await S.call('', 'drv.events', { t: t }); ok('처음엔 기록 없음', e0.ok && e0.events.length === 0, e0);
    var e1 = await S.call('', 'drv.event', { t: t, kind: 'dep', stop: 0, lat: 37.51, lng: 127.02, acc: 12 });
    ok('출발: 시각 + 위치', e1.ok && e1.events.length === 1 && e1.events[0].kind === 'dep' && e1.events[0].lat === 37.51 && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(e1.events[0].at), e1);
    var e2 = await S.call('', 'drv.event', { t: t, kind: 'dep', stop: 0, lat: 37.6, lng: 127.1 });
    ok('두 번 눌러도 한 번만', e2.events.filter(function (x) { return x.kind === 'dep'; }).length === 1 && e2.events[0].lat === 37.51, e2);
    var e3 = await S.call('', 'drv.event', { t: t, kind: 'arr', stop: 0, fc: '하차A' });
    ok('위치 없이도 시각은 기록', e3.events.some(function (x) { return x.kind === 'arr' && x.stop === 0 && x.lat === null && x.fc === '하차A'; }), e3);
    var e4 = await S.call('', 'drv.event', { t: t, kind: 'arr', stop: 0, undo: true });
    ok('되돌리기', !e4.events.some(function (x) { return x.kind === 'arr'; }) && e4.events.length === 1, e4);
    var e5 = await S.call('', 'drv.event', { t: t, kind: 'arr', stop: 1, fc: '하차B', lat: 999, lng: 127 });
    ok('엉뚱한 좌표는 버리고 시각만', e5.events.some(function (x) { return x.stop === 1 && x.lat === null && x.lng === null; }), e5);
    var bad = await S.call('', 'drv.event', { t: t, kind: 'zzz' }); ok('이상한 종류 거절', !bad.ok, bad);
    var nf = await S.call('', 'drv.event', { t: '0123456789abcdef0123', kind: 'dep' }); ok('없는 링크 거절', !nf.ok && /찾을 수 없/.test(nf.error), nf);
    var de = await S.call(tok.a, 'dispatch.events', { cust: K, date: D0 });
    ok('배차 화면: 그 날짜·탭 기록', de.ok && de.events.length === 2 && de.events.every(function (x) { return x.no === 1; }), de);
    var dp2 = await S.call(tok.p, 'dispatch.events', { cust: K, date: D0 }); ok('협력사: 배정 탭은 보임', dp2.ok && dp2.events.length === 2, dp2);
    var dq = await S.call(tok.q, 'dispatch.events', { cust: K, date: D0 }); ok('협력사: 다른 탭은 막힘', !dq.ok, dq);
    var dr = await S.call('', 'drv.get', { t: t }); ok('기사 링크(drv.get)는 그대로', dr.ok && dr.stops.length === 2 && !('events' in dr), dr);
  } finally { await S.stop(); }
})().catch(function (e) { ok('실행 오류', false, e.stack || String(e)); });
