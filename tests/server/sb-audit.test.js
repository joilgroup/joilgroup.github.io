// 변경 이력 (008 DB 트리거 + core.js dispatch.history·admin.audit): 바뀐 칸만 · 누가 · 금액은 분석 권한자만 · 협력사 못 봄 · 비밀번호 값 없음
var L = require('../sb/lib.js'), ok = require('../lib/mock.js').ok;
(async function () {
  var S = await L.boot(); if (!S) { console.log('PASS (건너뜀) 시험용 Postgres 가 없어요'); return; }
  try {
    await L.users(S, [{ id: 'a', name: '관리', role: 'admin', perms: 'quote,analysis' }, { id: 's', name: '직원', role: 'user', perms: 'quote' }, { id: 'p', name: '협력A', role: 'partner', perms: 'none', tabs: ['쿠팡부자재/평택'] }]);
    var tok = {}; for (var u of ['a', 's', 'p']) tok[u] = (await S.call('', 'login', { id: u, password: 'test1234' })).token;
    var D = '2026-11-20', C = '쿠팡부자재';
    var o = function (fc, n) { return { fc: fc, bundle: String(n), kg: String(n * 300), item: '박스', addr: '경기 평택시 테스트로 ' + n, from: '평택센터' }; };
    await S.call(tok.a, 'dispatch.import', { cust: C, rows: [{ date: D, key: 'k1', d: o('고양1', 3) }, { date: D, key: 'k2', d: o('안성4', 5) }] });
    var day = await S.call(tok.a, 'dispatch.day', { cust: C, date: D }), ids = day.orders.map(function (x) { return x.id; });
    var sv = await S.call(tok.a, 'dispatch.save', { cust: C, date: D, orders: [{ id: ids[0], truck: 1, seq: 1 }, { id: ids[1], truck: 2, seq: 2 }], trucks: [{ no: 1, car: '12가3456', driver: '김기사', ton: '5톤' }, { no: 2, car: '34나5678', driver: '이기사', cost: 250000 }] });
    var tk1 = sv.trucks[0].token, tk2 = sv.trucks[1].token;
    var n0 = (await S.sql`select count(*)::int n from audit where tbl = 'truck'`)[0].n;
    // 같은 내용으로 다시 저장 (다 지우고 다시 넣지만 바뀐 게 없음)
    await S.call(tok.a, 'dispatch.save', { cust: C, date: D, patch: true, trucks: [] });
    var n1 = (await S.sql`select count(*)::int n from audit where tbl = 'truck'`)[0].n;
    ok('바뀐 게 없으면 이력 없음 (다시 넣기여도)', n0 === 2 && n1 === 2, [n0, n1]);
    await S.call(tok.s, 'dispatch.save', { cust: C, date: D, patch: true, trucks: [{ no: 1, token: tk1, set: { phone: '010-1111-2222', status: '배차완료' } }] });
    var h = await S.call(tok.a, 'dispatch.history', { cust: C, date: D, tk: tk1 });
    var e = h.list[0];
    ok('호차 고침: 바뀐 칸만 · 누가', h.ok && e.tbl === 'truck' && e.op === 'edit' && e.who === '직원' && e.no === 1 && Object.keys(e.chg).sort().join() === 'phone,status' && e.chg.phone[1] === '010-1111-2222', h);
    ok('처음 만든 호차는 add', h.list[h.list.length - 1].op === 'add' && h.list[h.list.length - 1].chg.car[1] === '12가3456', h.list);
    await S.call(tok.a, 'dispatch.save', { cust: C, date: D, patch: true, trucks: [{ no: 2, token: tk2, set: { cost: 260000, memo: '메모' } }] });
    var ha = await S.call(tok.a, 'dispatch.history', { cust: C, date: D, tk: tk2 }), hs = await S.call(tok.s, 'dispatch.history', { cust: C, date: D, tk: tk2 });
    ok('금액 이력: 분석 권한자는 보임', ha.list[0].chg.cost && ha.list[0].chg.cost[0] === 250000 && ha.list[0].chg.cost[1] === 260000, ha.list[0]);
    ok('금액 이력: 직원은 금액 칸 빠짐 (다른 칸은 보임)', !hs.list[0].chg.cost && hs.list[0].chg.memo && JSON.stringify(hs).indexOf('250000') === -1 && JSON.stringify(hs).indexOf('260000') === -1, hs);
    var hp = await S.call(tok.p, 'dispatch.history', { cust: '쿠팡부자재/평택', date: D }); ok('협력사는 이력 못 봄', !hp.ok, hp);
    // 오더: 호차 배정·고치기·지우기
    await S.call(tok.a, 'dispatch.editOrder', { cust: C, date: D, id: ids[0], patch: { bundle: '4' } });
    await S.call(tok.a, 'dispatch.save', { cust: C, date: D, patch: true, orders: [{ id: ids[1], truck: 1, seq: 2 }], trucks: [] });
    var ho = await S.call(tok.a, 'dispatch.history', { cust: C, date: D, ids: [ids[0], ids[1]] });
    var kinds = ho.list.map(function (x) { return x.op + ':' + Object.keys(x.chg).sort().join('+'); });
    ok('오더 이력: 추가 · 호차 배정 · 내용 고침 칸마다', kinds.indexOf('edit:d.bundle') !== -1 && kinds.indexOf('edit:truck') !== -1 && kinds.indexOf('add:d.fc') !== -1 && ho.list.every(function (x) { return x.tbl === 'order'; }), kinds);
    var seqOnly = (await S.sql`select count(*)::int n from audit where tbl = 'order' and chg ? 'seq'`)[0].n; ok('순서(seq)만 바뀐 건 안 남김', seqOnly === 0);
    await S.call(tok.a, 'dispatch.deleteOrders', { cust: C, date: D, ids: [ids[0]] });
    var hd = await S.call(tok.a, 'dispatch.history', { cust: C, date: D, ids: [ids[0]] }); ok('오더 지우기 이력', hd.list[0].op === 'del' && hd.list[0].chg['d.fc'][0] === '고양1', hd.list[0]);
    // 호차 지우기 (다시 안 넣음 → 끝날 때 del)
    await S.call(tok.a, 'dispatch.save', { cust: C, date: D, patch: true, drop: [{ no: 2, token: tk2 }], trucks: [] });
    var hx = await S.call(tok.a, 'dispatch.history', { cust: C, date: D, tk: tk2 }); ok('호차 지우기 이력', hx.list[0].op === 'del' && hx.list[0].who === '관리', hx.list[0]);
    var stash = (await S.sql`select count(*)::int n from audit_stash`)[0].n; ok('임시 보관(stash) 비워짐', stash === 0, stash);
    // 단가표 · 특이사항 · 월별 단가 · 계정
    await S.call(tok.a, 'dispatch.ratesSave', { cust: C, mode: 'add', rows: [{ from: '평택센터', to: '고양', ton: '5', price: 150000 }] });
    await S.call(tok.a, 'dispatch.ratesSave', { cust: C, mode: 'add', rows: [{ from: '평택센터', to: '고양', ton: '5', price: 160000 }, { from: '평택센터', to: '안성', ton: '5', price: 120000 }] });
    await S.call(tok.a, 'dispatch.notesSave', { cust: C, list: [{ fc: '고양1', note: '14시부터 하차가능' }] });
    await S.call(tok.a, 'dispatch.priceSave', { cust: C, ym: '2026-11', price: '12500' });
    await S.call(tok.a, 'admin.updateUser', { id: 's', patch: { perms: ['quote', 'track'] } });
    await S.call(tok.a, 'admin.resetPassword', { id: 's' });
    var al = await S.call(tok.a, 'admin.audit', { days: 1 }), by = function (t) { return al.list.filter(function (x) { return x.tbl === t; }); };
    var rt = by('rate');
    ok('단가표: 바뀐 단가만 edit · 새 줄 add', rt.some(function (x) { return x.op === 'edit' && x.chg.price && x.chg.price[0] === 150000 && x.chg.price[1] === 160000; }) && rt.filter(function (x) { return x.op === 'add'; }).length === 2 && !rt.some(function (x) { return x.op === 'del'; }), rt);
    ok('특이사항 · 월별 단가 이력', by('note')[0].op === 'add' && by('price')[0].chg['2026-11'][1] === 12500, [by('note'), by('price')]);
    var ac = by('account');
    ok('계정 권한 변경 · 비밀번호는 값 없이 (바뀜)', ac.some(function (x) { return x.ref === 's' && x.chg.perms && x.chg.perms[1] === 'quote,track'; }) && ac.some(function (x) { return x.chg.pw_hash && x.chg.pw_hash[1] === '(바뀜)'; }) && JSON.stringify(ac).indexOf('salt') === -1, ac);
    var raw = await S.sql`select chg::text t from audit where tbl = 'account'`; ok('DB 이력에도 비밀번호 해시 없음', raw.every(function (r) { return !/[0-9a-f]{64}/.test(r.t); }), raw);
    var as = await S.call(tok.s, 'admin.audit', {}); ok('관리자 이력은 관리자만', !as.ok, as);
    var lg = (await S.sql`select count(*)::int n from audit where tbl = 'account' and chg ? 'last_login'`)[0].n; ok('로그인 시각은 이력에 안 남김', lg === 0);
  } finally { await S.stop(); }
})().catch(function (e) { ok('실행 오류', false, e.stack || String(e)); });
