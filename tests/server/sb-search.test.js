// 배차 이력 찾기 (core.js dispatch.search · 010 색인): 차량번호(띄어쓰기 무시)·기사·전화 일부·센터·오더 키 · 기사별/센터별 · 협력사는 자기 탭만 · 금액 없음
var L = require('../sb/lib.js'), ok = require('../lib/mock.js').ok;
(async function () {
  var S = await L.boot(); if (!S) { console.log('PASS (건너뜀) 시험용 Postgres 가 없어요'); return; }
  try {
    await L.users(S, [{ id: 'a', name: '관리', role: 'admin', perms: 'quote,analysis' }, { id: 's', name: '직원', role: 'user', perms: 'quote' }, { id: 'p', name: '협력A', role: 'partner', perms: 'none', tabs: ['쿠팡부자재/평택'] }]);
    var tok = {}; for (var u of ['a', 's', 'p']) tok[u] = (await S.call('', 'login', { id: u, password: 'test1234' })).token;
    var C = '쿠팡부자재', P = '쿠팡부자재/평택';
    var o = function (fc, n) { return { fc: fc, bundle: String(n), kg: String(n * 100), item: '박스', addr: '가상시 가상로 ' + n, from: '평택센터' }; };
    var put = async function (cust, date, rows, trucks) {
      await S.call(tok.a, 'dispatch.import', { cust: cust, rows: rows.map(function (r, i) { return { date: date, key: cust + date + i, d: r }; }) });
      var d = await S.call(tok.a, 'dispatch.day', { cust: cust, date: date });
      await S.call(tok.a, 'dispatch.save', { cust: cust, date: date, orders: d.orders.map(function (x, i) { return { id: x.id, truck: i < trucks.length ? i + 1 : '', seq: i + 1 }; }), trucks: trucks });
    };
    await put(C, '2026-11-01', [o('고양1', 3), o('안성4', 5)], [{ no: 1, car: '경기12가 3456', driver: '김기사', phone: '010-1234-5678', ton: '5톤', cost: 250000 }, { no: 2, car: '34나5678', driver: '이기사', phone: '010-9999-0000' }]);
    await put(C, '2026-11-05', [o('고양1', 2), o('미배정센터', 1)], [{ no: 1, car: '경기12가3456', driver: '김기사', phone: '010-1234-5678' }]);
    await put(P, '2026-11-03', [o('평택2', 4)], [{ no: 1, car: '56다7890', driver: '박기사', phone: '010-5555-1111' }]);
    await put('삼다수', '2026-11-03', [o('고양1', 9)], [{ no: 1, car: '경기12가3456', driver: '김기사' }]);
    var r = await S.call(tok.s, 'dispatch.search', { q: '12가3456', co: C });
    ok('차량번호 (띄어쓰기 달라도) · 최근 날짜부터 · 다른 업체(삼다수)는 안 섞임', r.ok && r.list.length === 2 && r.list[0].date === '2026-11-05' && r.list.every(function (x) { return x.cust === C; }), r);
    ok('운행 한 건 = 탭·호차·차량·센터·번들', r.list[1].no === 1 && r.list[1].fcs.join() === '고양1' && r.list[1].bundle === 3 && r.list[1].driver === '김기사', r.list[1]);
    ok('기사별: 같은 차는 한 줄 · 횟수 · 처음/마지막', r.drivers.length === 1 && r.drivers[0].n === 2 && r.drivers[0].first === '2026-11-01' && r.drivers[0].last === '2026-11-05', r.drivers);
    ok('금액은 안 보냄 (분석 권한자여도)', JSON.stringify(await S.call(tok.a, 'dispatch.search', { q: '김기사', co: C })).indexOf('250000') === -1);
    var ph = await S.call(tok.s, 'dispatch.search', { q: '5678', co: C }); ok('전화번호·차량 일부 숫자', ph.list.length === 3, ph.list.map(function (x) { return x.date + x.car; }));
    var ce = await S.call(tok.s, 'dispatch.search', { q: '고양1', co: C }); ok('센터별 방문 이력', ce.centers[0].fc === '고양1' && ce.centers[0].n === 2, ce.centers);
    var un = await S.call(tok.s, 'dispatch.search', { q: '미배정센터', co: C }); ok('호차 미배정 오더도 찾음', un.list.length === 1 && un.list[0].no === null, un.list);
    var key = await S.call(tok.s, 'dispatch.search', { q: 'fc', co: C }); ok('오더 칸 이름(fc 등)으로는 안 걸림 (값만 찾음)', key.ok && key.list.length === 0, key.list.length);
    var rg = await S.call(tok.s, 'dispatch.search', { q: '김기사', co: C, from: '2026-11-04', to: '2026-11-30' }); ok('기간', rg.list.length === 1 && rg.list[0].date === '2026-11-05', rg.list);
    var pt = await S.call(tok.p, 'dispatch.search', { q: '기사', co: C }); ok('협력사: 자기 탭만', pt.ok && pt.list.length === 1 && pt.list[0].cust === P, pt);
    var px = await S.call(tok.p, 'dispatch.search', { q: '기사', co: '삼다수' }); ok('협력사: 배정 안 된 업체는 막힘', !px.ok, px);
    var sh = await S.call(tok.s, 'dispatch.search', { q: '김', co: C }); ok('한 글자는 거부', !sh.ok && /두 글자/.test(sh.error), sh);
    var pc = await S.call(tok.s, 'dispatch.search', { q: '100%_', co: C }); ok('특수 글자(%·_)는 글자 그대로', pc.ok && pc.list.length === 0, pc);
    var ix = await S.sql`select indexname from pg_indexes where indexname in ('disp_trucks_find', 'disp_orders_find') order by 1`; ok('찾기 색인 (pg_trgm)', ix.length === 2, ix);
  } finally { await S.stop(); }
})().catch(function (e) { ok('실행 오류', false, e.stack || String(e)); });
