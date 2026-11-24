// 차량 위치 '배차 출발~도착만'(022): 출발 누르기 전·마지막 도착 뒤·출발 14시간 뒤 위치는 버림 · 하루 두 번 배차면 사이는 버림 · '항상' 차는 예전처럼 · 기사 화면 안내(trk) (가짜 데이터)
var L = require('../sb/lib.js'), ok = require('../lib/mock.js').ok;
(async function () {
  var S = await L.boot(); if (!S) { console.log('PASS (건너뜀) 시험용 Postgres 가 없어요'); return; }
  try {
    await L.users(S, [{ id: 'a', name: '관리', role: 'admin', perms: 'quote' }]);
    var tok = (await S.call('', 'login', { id: 'a', password: 'test1234' })).token, K = '애플';
    var D0 = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    var o = function (fc, k) { return { date: D0, key: k, d: { from: '가상상차', fc: fc, addr: '가상시 ' + fc, bundle: '4' } }; };
    await S.call(tok, 'dispatch.import', { cust: K, rows: [o('하차A', 'k1'), o('하차B', 'k2'), o('하차C', 'k3')] });
    var dp = await S.call(tok, 'dispatch.day', { cust: K, date: D0 });
    await S.call(tok, 'dispatch.save', { cust: K, date: D0, orders: [{ id: dp.orders[0].id, truck: 1, seq: 1 }, { id: dp.orders[1].id, truck: 1, seq: 2 }, { id: dp.orders[2].id, truck: 2, seq: 3 }], trucks: [{ no: 1, car: '12가 3456' }, { no: 2, car: '12가3456 (오후)' }] });
    var tr = (await S.call(tok, 'dispatch.day', { cust: K, date: D0 })).trucks, t1 = tr.filter(function (x) { return x.no === 1; })[0].token, t2 = tr.filter(function (x) { return x.no === 2; })[0].token;
    var sql = S.sql;
    var vw = (await sql.unsafe("insert into public.vehicles (plate, device_id, track_mode) values ('12가3456', '12가3456', 'work') returning id"))[0].id;
    var va = (await sql.unsafe("insert into public.vehicles (plate, device_id) values ('99나9999', '99나9999') returning id"))[0].id;
    var T0 = Date.now() - 20 * 3600e3, at = function (min) { return new Date(T0 + min * 60000).toISOString(); };
    var put = async function (v, min) { await sql.unsafe('insert into public.positions (vehicle_id, fix_time, lat, lng) values ($1, $2, 37.5, 127.0)', [v, at(min)]); return Number((await sql.unsafe('select count(*) n from public.positions where vehicle_id = $1 and fix_time = $2', [v, at(min)]))[0].n) === 1; };
    var ev = function (t, kind, stop, min, last) { return sql.unsafe("insert into joil.drv_events (token, cust, date, no, kind, stop, at, last) values ($1, $2, $3, 1, $4, $5, $6, $7)", [t, K, D0, kind, stop, at(min), !!last]); };

    ok('출발 누르기 전: 버림', !(await put(vw, 0)));
    ok("'항상' 차는 예전처럼 저장", await put(va, 0));
    await ev(t1, 'dep', 0, 10);
    ok('출발 뒤: 저장', await put(vw, 15));
    await ev(t1, 'arr', 0, 60);
    ok('중간 하차지 도착 뒤에도 계속 저장', await put(vw, 70));
    await ev(t1, 'arr', 1, 120, true);
    ok('마지막 도착 뒤: 버림', !(await put(vw, 130)));
    await sql.unsafe("update joil.drv_events set undone_at = now() where token = $1 and last", [t1]);
    ok('마지막 도착을 되돌리면 다시 저장', await put(vw, 135));
    await sql.unsafe("update joil.drv_events set undone_at = null where token = $1 and last", [t1]);
    await ev(t2, 'dep', 0, 300);
    ok('하루 두 번째 배차(차량번호 뒤에 글자 있어도): 출발 뒤 저장', await put(vw, 310));
    ok('두 번째 배차 도착을 안 누르면 출발 14시간 안까진 저장', await put(vw, 300 + 13 * 60));
    ok('…14시간이 지나면 버림', !(await put(vw, 300 + 14 * 60 + 5)));
    var v = (await sql.unsafe('select last_time from public.vehicles where id = $1', [vw]))[0];
    ok('버린 위치는 마지막 위치에도 안 남음', v.last_time.toISOString() === at(300 + 13 * 60), v);

    var g = await S.call('', 'drv.get', { t: t1 });
    ok("기사 화면: '출발~도착만' 차면 안내 켜짐(trk)", g.ok && g.trk === true, g.trk);
    await sql.unsafe("update public.vehicles set track_mode = 'always' where id = $1", [vw]);
    ok("'항상'으로 바꾸면 안내 없음", !(await S.call('', 'drv.get', { t: t1 })).trk);
    await S.call('', 'drv.event', { t: t1, kind: 'arr', stop: 1, undo: true });
    var e = await S.call('', 'drv.event', { t: t1, kind: 'arr', stop: 1, fc: '하차B', last: true });
    var last = (await sql.unsafe("select last from joil.drv_events where token = $1 and kind = 'arr' and stop = 1 and undone_at is null", [t1]))[0];
    ok('drv.event: 마지막 도착 표시(last) 저장', e.ok && last && last.last === true, [e, last]);
  } finally { await S.stop(); }
})().catch(function (e) { ok('실행 오류', false, e.stack || String(e)); });
