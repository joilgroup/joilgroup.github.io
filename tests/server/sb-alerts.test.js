// 자동 알림 (011 → 018): 배차 알림은 '오늘 차가 안 잡힌 호차의 상차 마감·출발 마감'만 · 하차지는 경로 순서대로(앞 하차 30분) · 길찾기 × 1.2 · 조합마다 한 번만 조회
// RPC joil_alerts(공개 키) 권한 · 금액 없음 · 가짜 카카오(netFetch)만
var L = require('../sb/lib.js'), ok = require('../lib/mock.js').ok;
var U = null;
(async function () {
  U = await import(require('path').join(__dirname, '..', '..', 'supabase', 'functions', 'joil', 'urgent.js'));
  // 시간 글자 읽기 (낮 구간 중 가장 늦은 끝 · 하차불가·점심은 빼고 · 못 읽으면 null)
  var de = function (t) { var e = U.dayEnd(t); return e == null ? null : U.fmt(e); };
  ok('시간 읽기: 여러 형식', de('9:00~11:30 // 13:00~17:30') === '17:30' && de('09~16') === '16시' && de('9시~16시') === '16시' && de('16:00까지') === '16시' && de('오후 2시~4시') === '16시' && de('08:20-12:00 / 13:00-16:40') === '16:40' && de('14시 ~ 18시, (필히 14시 이후로 배차부탁)') === '18시' && de('오전 9시~오후 5시') === '17시' && de('8시~11시, 12시30분~16시30분 (점심시간 : 11:00~12:30 하차 불가), 18:30 ~ 22:00') === '16:30',
    [de('9:00~11:30 // 13:00~17:30'), de('09~16'), de('9시~16시'), de('16:00까지')]);
  ok('시간 읽기: 야간 구간·하차불가 빼기', de('08:30~15:30(11:30~12:30 불가) / 19:30~02:30(22:00~23:00 불가)') === '15:30' && de('9:30 ~ 15:30, 20시 이후 (점심시간 11:40~13:10 하차불가)') === '15:30' && de('14:30~17:00 (10:00~14:30 작업불가)') === '17시');
  ok('시간 읽기: 못 읽으면 null', de('지정없음') === null && de('0') === null && de('') === null && de('6/1~6/9 점심') === null);
  // 경로 순서대로: 평택(상차 16시) > 화성(14시, 30분) > 이천(15시, 2시간) → 13시 출발이면 이천에 못 감 → 출발 마감 = 15시 − (30분 + 하차 30분 + 2시간) = 12시
  var dl = U.deadline(16 * 60, [{ name: '화성', end: 14 * 60 }, { name: '이천', end: 15 * 60 }], [1500, 6000]); // 25분·100분 × 1.2 = 30분·120분
  ok('경로 순서대로 가장 이른 출발 마감 (이천 때문에 12시)', dl.kind === 'dep' && dl.at === 12 * 60 && dl.stop === '이천', dl);
  ok('1시간 전부터 알림 · 지나면 빨간 알림', U.message(3, dl, 10 * 60 + 59) === null && U.message(3, dl, 11 * 60 + 30).lvl === 'soon' && /12시 전 출발해야 함/.test(U.message(3, dl, 11 * 60 + 30).msg) && U.message(3, dl, 12 * 60 + 1).lvl === 'late' && /출발 마감 지남/.test(U.message(3, dl, 12 * 60 + 1).msg));
  var dl2 = U.deadline(11 * 60, [{ name: '화성', end: 17 * 60 }], [1500]);
  ok('상차 마감이 더 이르면 상차 마감', dl2.kind === 'load' && /상차 마감 11시 임박/.test(U.message(1, dl2, 10 * 60 + 30).msg) && /상차 마감 지남/.test(U.message(1, dl2, 11 * 60 + 5).msg));

  var calls = { geo: 0, route: 0 };
  var fakeFetch = async function (url) {
    var body;
    if (/address\.json|keyword\.json/.test(url)) { calls.geo++; var q = decodeURIComponent(url.split('query=')[1]); body = { documents: [{ x: String(127 + q.length / 100), y: String(37 + q.length / 1000), address_name: q }] }; }
    else if (/directions/.test(url)) { calls.route++; body = { routes: [{ result_code: 0, summary: { duration: /destination=127\.08,/.test(url) ? 1500 : 6000, distance: 50000 } }] }; } // 화성(주소 8글자 → 127.08)까지 25분, 이천까지 100분
    return { status: 200, text: async function () { return JSON.stringify(body); } };
  };
  var S = await L.boot({ netFetch: fakeFetch }); if (!S) { console.log('PASS (건너뜀) 시험용 Postgres 가 없어요'); return; }
  try {
    await L.users(S, [{ id: 'a', name: '관리', role: 'admin', perms: 'quote,analysis' }, { id: 'p', name: '협력A', role: 'partner', perms: 'none', tabs: ['쿠팡부자재/평택'] }, { id: 'x', name: '견적없음', role: 'user', perms: 'track' }]);
    var tok = {}; for (var u of ['a', 'p', 'x']) tok[u] = (await S.call('', 'login', { id: u, password: 'test1234' })).token;
    await S.sql.unsafe("insert into gas_props (key, value) values ('KAKAO_REST_KEY', 'test-key') on conflict (key) do update set value = excluded.value");
    var D0 = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), C = '쿠팡부자재', P = '쿠팡부자재/평택';
    var at = function (h, m) { return Date.parse(D0 + 'T00:00:00Z') - 9 * 3600e3 + (h * 60 + (m || 0)) * 60e3; }; // 오늘 한국 시각
    await S.sql.unsafe("insert into loading_places (id, name, addr, time, cust) values ('pl1', '가상평택센터', '가상 평택시 1', '08:00~16:00', '')");
    var o = function (fc, addr, hours) { return { fc: fc, bundle: '3', kg: '300', item: '박스', addr: addr, hours: hours, from: '가상평택센터' }; };
    await S.call(tok.a, 'dispatch.import', { cust: P, rows: [{ date: D0, key: 'a1', d: o('화성1', '가상 화성시 1', '09:00~14:00') }, { date: D0, key: 'a2', d: o('이천1', '가상 이천시 22번지 긴주소', '09:00 ~ 15:00 (12:00~13:00 하차불가)') }, { date: D0, key: 'a3', d: o('센터3', '가상 화성시 1', '지정없음') }, { date: D0, key: 'a4', d: o('센터4', '가상 화성시 1', '09:00~14:00') }] });
    var dp = await S.call(tok.a, 'dispatch.day', { cust: P, date: D0 }), id = function (k) { return dp.orders.filter(function (x) { return x.key === k; })[0].id; };
    await S.call(tok.a, 'dispatch.save', { cust: P, date: D0, orders: [{ id: id('a1'), truck: 1, seq: 1 }, { id: id('a2'), truck: 1, seq: 2 }, { id: id('a3'), truck: 2, seq: 1 }, { id: id('a4'), truck: 3, seq: 1 }],
      trucks: [{ no: 1, car: '', cost: 250000 }, { no: 2, car: '' }, { no: 3, car: '12가3456', status: '배차완료' }] });
    // 예전 알림이 남아 있으면 내려가야 함
    await S.sql.unsafe("insert into alerts (ref, kind, cust, date, n, msg) values ('nocar|x|" + D0 + "', 'nocar', '" + P + "', '" + D0 + "', 1, '예전 알림')");
    await S.sql`select joil.alerts_scan()`;
    var n = await S.srv.urgent.scan(at(11, 0));
    var rpc = async function (t) { return S.sql.begin(async function (tx) { await tx.unsafe('set local role anon'); return (await tx.unsafe('select public.joil_alerts($1) r', [t]))[0].r; }).catch(function (e) { return { err: e.message }; }); };
    var ra = await rpc(tok.a);
    ok('예전 배차 알림(차량정보 빈 호차 등)은 내려감', !ra.list.some(function (x) { return x.kind !== 'urg'; }), ra.list);
    var u1 = ra.list.filter(function (x) { return x.nos === '1'; })[0];
    ok('1호차: 이천 때문에 출발 마감 임박 (11시 기준)', n >= 1 && u1 && u1.lvl === 'soon' && /1호차 .* 전 출발해야 함 \(이천1/.test(u1.msg), ra.list);
    ok('시간을 못 읽는 하차지만 있는 호차·차가 잡힌 호차는 상차 마감으로만', !ra.list.some(function (x) { return x.nos === '3'; }), ra.list);
    ok('알림에 금액 없음', JSON.stringify(ra).indexOf('250000') === -1);
    var routes = calls.route;
    ok('길찾기는 조합마다 한 번 (상차지→화성, 화성→이천)', routes === 2, calls);
    await S.srv.urgent.scan(at(11, 5));
    ok('두 번째 확인에서는 다시 조회 안 함 (DB 표에 저장)', calls.route === routes, calls);
    var late = await S.srv.urgent.scan(at(15, 30)), rl = await rpc(tok.a), l1 = rl.list.filter(function (x) { return x.nos === '1'; })[0], l2 = rl.list.filter(function (x) { return x.nos === '2'; })[0];
    ok('지나면 빨간 알림 (출발 마감 지남)', late >= 1 && l1 && l1.lvl === 'late' && /출발 마감 지남/.test(l1.msg), rl.list);
    ok('하차 시간을 못 읽어도 상차 마감은 (2호차 · 16시 임박)', l2 && /2호차 상차 마감 16시 임박/.test(l2.msg), rl.list);
    var rp = await rpc(tok.p); ok('협력사: 배정 탭의 긴급 알림만', rp.list.length >= 1 && rp.list.every(function (x) { return x.cust === P && x.kind === 'urg'; }), rp);
    var rx = await rpc(tok.x); ok('배차 권한 없는 직원은 빈 목록', rx.ok && rx.list.length === 0, rx);
    var rb = await rpc('nope'); ok('토큰 틀리면 거부', /만료/.test(rb.err || ''), rb);
    // 차를 잡으면 내려감
    var t1 = (await S.call(tok.a, 'dispatch.day', { cust: P, date: D0 })).trucks.filter(function (t) { return t.no === 1; })[0];
    await S.call(tok.a, 'dispatch.save', { cust: P, date: D0, patch: true, trucks: [{ no: 1, token: t1.token, set: { car: '99하9999', status: '배차완료' } }] });
    await S.srv.urgent.scan(at(15, 35));
    var r2 = await rpc(tok.a); ok('차량정보를 넣으면 다음 확인에서 알림이 내려감', !r2.list.some(function (x) { return x.nos === '1'; }), r2.list);
    // 관리자: 이동시간 표 · 다시 조회
    var rt = await S.call(tok.a, 'admin.routes', {});
    ok('관리자: 이동시간 표 (보정 1.2배)', rt.ok && rt.routes.length === 2 && rt.routes.some(function (r) { return r.min === 25 && r.adj === 30; }), rt);
    var rr = await S.call(tok.a, 'admin.routeRefetch', { from: rt.routes[0].from, to: rt.routes[0].to });
    ok('관리자: 조합 다시 조회', rr.ok && calls.route === routes + 1, [rr, calls]);
    var rn = await S.call(tok.p, 'admin.routes', {}); ok('협력사는 이동시간 표 못 봄', !rn.ok, rn);
    var anon = await S.sql.begin(async function (tx) { await tx.unsafe('set local role anon'); return tx.unsafe('select joil.alerts_scan()'); }).catch(function (e) { return e.message; });
    ok('공개 키로 확인 작업·알림 표 직접 못 씀', typeof anon === 'string' && /permission denied/.test(anon), anon);
  } finally { await S.stop(); }
})().catch(function (e) { ok('실행 오류', false, e.stack || String(e)); });
