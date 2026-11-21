// 자동 알림 (011): alerts_scan 이 미배정 오더·차량정보 빈 호차·인수증 미도착을 올리고 해결되면 내림 · RPC joil_alerts(공개 키) 권한 · 금액 없음
var L = require('../sb/lib.js'), ok = require('../lib/mock.js').ok;
(async function () {
  var S = await L.boot(); if (!S) { console.log('PASS (건너뜀) 시험용 Postgres 가 없어요'); return; }
  try {
    await L.users(S, [{ id: 'a', name: '관리', role: 'admin', perms: 'quote,analysis' }, { id: 'p', name: '협력A', role: 'partner', perms: 'none', tabs: ['쿠팡부자재/평택'] }, { id: 'x', name: '견적없음', role: 'user', perms: 'track' }]);
    var tok = {}; for (var u of ['a', 'p', 'x']) tok[u] = (await S.call('', 'login', { id: u, password: 'test1234' })).token;
    var kst = function (h) { return new Date(Date.now() + 9 * 3600e3 + (h || 0) * 3600e3).toISOString().slice(0, 10); };
    var D0 = kst(0), DY = kst(-24), C = '쿠팡부자재', P = '쿠팡부자재/평택';
    var o = function (fc) { return { fc: fc, bundle: '3', kg: '300', item: '박스', addr: '가상시', from: '출발' }; };
    await S.call(tok.a, 'dispatch.import', { cust: C, rows: [{ date: D0, key: 'a1', d: o('센터1') }, { date: D0, key: 'a2', d: o('센터2') }] });
    await S.call(tok.a, 'dispatch.import', { cust: P, rows: [{ date: D0, key: 'b1', d: o('센터3') }, { date: DY, key: 'b2', d: o('센터4') }] });
    var dp = await S.call(tok.a, 'dispatch.day', { cust: P, date: D0 });
    await S.call(tok.a, 'dispatch.save', { cust: P, date: D0, orders: [{ id: dp.orders[0].id, truck: 1, seq: 1 }], trucks: [{ no: 1, car: '', cost: 250000 }] });
    var dy = await S.call(tok.a, 'dispatch.day', { cust: P, date: DY });
    await S.call(tok.a, 'dispatch.save', { cust: P, date: DY, orders: [{ id: dy.orders[0].id, truck: 1, seq: 1 }], trucks: [{ no: 1, car: '12가3456', driver: '김기사' }] });
    await S.sql`select joil.alerts_scan()`;
    var rpc = async function (t) { return S.sql.begin(async function (tx) { await tx.unsafe('set local role anon'); return (await tx.unsafe('select public.joil_alerts($1) r', [t]))[0].r; }).catch(function (e) { return { err: e.message }; }); };
    var ra = await rpc(tok.a), kinds = ra.list.map(function (x) { return x.kind + ':' + x.cust; }).sort();
    var h = new Date(Date.now() + 9 * 3600e3).getUTCHours();
    ok('관리자: 미배정(본 탭) · 차량정보 빈 호차(평택)' + (h >= 10 ? ' · 어제 인수증' : ''), kinds.indexOf('un:' + C) !== -1 && kinds.indexOf('nocar:' + P) !== -1 && (h < 10 || kinds.indexOf('rcpt:' + P) !== -1), kinds);
    ok('알림 글: 개수·호차 번호', ra.list.some(function (x) { return x.kind === 'un' && x.msg === '호차 미배정 오더 2줄'; }) && ra.list.some(function (x) { return x.kind === 'nocar' && /1호차/.test(x.msg); }), ra.list);
    ok('알림에 금액 없음', JSON.stringify(ra).indexOf('250000') === -1);
    var rp = await rpc(tok.p); ok('협력사: 배정 탭의 차량정보·인수증 알림만', rp.list.length >= 1 && rp.list.every(function (x) { return x.cust === P && x.kind !== 'un'; }), rp);
    var rx = await rpc(tok.x); ok('배차 권한 없는 직원은 빈 목록', rx.ok && rx.list.length === 0, rx);
    var rb = await rpc('nope'); ok('토큰 틀리면 거부', /만료/.test(rb.err || ''), rb);
    // 해결되면 내려감
    await S.call(tok.a, 'dispatch.save', { cust: P, date: D0, patch: true, trucks: [{ no: 1, token: (await S.call(tok.a, 'dispatch.day', { cust: P, date: D0 })).trucks[0].token, set: { car: '99하9999' } }] });
    await S.sql`select joil.alerts_scan()`;
    var r2 = await rpc(tok.a); ok('차량정보를 넣으면 다음 확인에서 알림이 내려감', !r2.list.some(function (x) { return x.kind === 'nocar'; }), r2.list);
    var anon = await S.sql.begin(async function (tx) { await tx.unsafe('set local role anon'); return tx.unsafe('select joil.alerts_scan()'); }).catch(function (e) { return e.message; });
    ok('공개 키로 확인 작업·알림 표 직접 못 씀', typeof anon === 'string' && /permission denied/.test(anon), anon);
  } finally { await S.stop(); }
})().catch(function (e) { ok('실행 오류', false, e.stack || String(e)); });
