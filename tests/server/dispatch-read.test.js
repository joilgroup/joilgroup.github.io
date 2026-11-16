// 배차 읽기: '그날(그 달) 줄만 읽기'(rowsWhere_)가 시트 전체를 읽어 고른 것과 같은 결과인지 · 오래된 '바뀐 시각' 지우기
var M = require('../lib/mock.js'), ok = M.ok, call = M.call, S = M.sheets, r;
var keys = ['쿠팡부자재', '쿠팡부자재/평택', '쿠팡부자재/부산', '삼다수/경인항'], dates = [];
for (var d = 1; d <= 20; d++) dates.push('2026-10-' + ('0' + d).slice(-2));
var seed = 7; function rnd(n) { seed = (seed * 9301 + 49297) % 233280; return Math.floor(seed / 233280 * n); }
// 여러 날·여러 탭에 날짜 순서를 뒤섞어 가져오기
for (var round = 0; round < 3; round++) keys.forEach(function (k) {
  var rows = []; for (var i = 0; i < 25; i++) { var dt = dates[rnd(dates.length)]; rows.push({ date: dt, key: k + '|' + round + '|' + i + '|' + dt, d: { fc: '센터' + rnd(9), bundle: String(1 + rnd(9)), date: dt, from: '출발' } }); }
  r = call('adm', 'dispatch.import', { cust: k, rows: rows }); if (r.error) ok('가져오기', false, r.error);
});
keys.forEach(function (k) { dates.forEach(function (dt, j) {
  var day = call('adm', 'dispatch.day', { cust: k, date: dt }); if (!day.orders.length) return;
  r = call('adm', 'dispatch.save', { cust: k, date: dt, orders: day.orders.map(function (o, i) { return { id: o.id, truck: 1 + (i % 3), seq: i + 1 }; }), trucks: [{ no: 1, car: '1' + j }, { no: 2, car: '2' + j }, { no: 3, car: '3' + j, status: '회차' }] });
  if (r.error) ok('저장', false, r.error);
}); });
// 합차 1건 · 날짜 변경 1건
var d1 = call('adm', 'dispatch.day', { cust: '쿠팡부자재', date: '2026-10-05' }), d2 = call('adm', 'dispatch.day', { cust: '쿠팡부자재/평택', date: '2026-10-05' });
if (d1.trucks[0] && d2.trucks[0]) call('adm', 'dispatch.save', { cust: '쿠팡부자재/평택', date: '2026-10-05', patch: 1, orders: [], drop: [], trucks: [{ token: d2.trucks[0].token, no: d2.trucks[0].no, set: { join: d1.trucks[0].token } }] });
var d3 = call('adm', 'dispatch.day', { cust: '쿠팡부자재/부산', date: '2026-10-07' });
if (d3.orders.length) call('adm', 'dispatch.moveOrders', { cust: '쿠팡부자재/부산', date: '2026-10-07', ids: d3.orders.slice(0, 2).map(function (o) { return o.id; }), toDate: '2026-10-19' });

// 기대값: 시트 전체에서 직접 고르기
var txt = function (v) { return String(v == null ? '' : v).replace(/^'/, ''); };
function expectOrders(cust, test) { return S['배차오더'].d.slice(1).filter(function (x) { return x[0] !== '' && txt(x[1]) === cust && test(txt(x[2])); }).sort(function (a, b) { return txt(a[2]) < txt(b[2]) ? -1 : txt(a[2]) > txt(b[2]) ? 1 : a[6] - b[6]; }).map(function (x) { return txt(x[0]); }); }
function expectTrucks(cust, test) { return S['배차호차'].d.slice(1).filter(function (x) { return txt(x[0]) === cust && test(txt(x[1])); }).sort(function (a, b) { return txt(a[1]) < txt(b[1]) ? -1 : txt(a[1]) > txt(b[1]) ? 1 : a[2] - b[2]; }).map(function (x) { return txt(x[1]) + '#' + x[2] + '#' + txt(x[3]); }); }
var bad = [], n = 0;
keys.forEach(function (k) {
  dates.concat(['2026-10-25']).forEach(function (dt) {
    n++; var a = M.ctx.dispDay_(k, dt), eq = function (x) { return x === dt; };
    if (JSON.stringify(a.orders.map(function (o) { return o.id; })) !== JSON.stringify(expectOrders(k, eq)) || JSON.stringify(a.trucks.map(function (t) { return t.date + '#' + t.no + '#' + t.car; })) !== JSON.stringify(expectTrucks(k, eq))) bad.push(k + ' ' + dt);
  });
  n++; var m = M.ctx.dispMonth_(k, '2026-10'), inM = function (x) { return x.slice(0, 7) === '2026-10'; };
  if (JSON.stringify(m.orders.map(function (o) { return o.id; })) !== JSON.stringify(expectOrders(k, inM)) || m.trucks.length !== expectTrucks(k, inM).length) bad.push(k + ' 월');
});
ok('날짜별·월별 결과가 시트 전체에서 고른 것과 같음 (' + n + '건)', !bad.length, bad.slice(0, 5));
var all = call('adm', 'dispatch.dayAll', { keys: keys, date: '2026-10-05' });
ok('여러 탭 한 번에(dayAll)도 같음', keys.every(function (k) { return JSON.stringify(all.byKey[k].orders.map(function (o) { return o.id; })) === JSON.stringify(expectOrders(k, function (x) { return x === '2026-10-05'; })); }));
ok('합차 표시(jn)', all.byKey['쿠팡부자재/평택'].trucks.some(function (t) { return t.jn && t.jn[0].base; }));
var days = M.ctx.dispDay_('쿠팡부자재', '2026-10-05').days, cnt = 0; S['배차오더'].d.slice(1).forEach(function (x) { if (txt(x[1]) === '쿠팡부자재' && txt(x[2]) === '2026-10-05') cnt++; });
ok('날짜 이동용 오더 수(days) — 120일 안일 때', !days['2026-10-05'] || days['2026-10-05'] === cnt, [days['2026-10-05'], cnt]);
// 읽는 칸 수
var cells = 0, orig = M.Sheet.prototype.getRange; M.Sheet.prototype.getRange = function (r0, c0, nr, nc) { var R = orig.apply(this, arguments), g = R.getValues; R.getValues = function () { cells += (nr || 1) * (nc || 1); return g(); }; return R; };
M.ctx.dispDay_('쿠팡부자재', '2026-10-05'); var total = S['배차오더'].d.length * S['배차오더'].d[0].length + S['배차호차'].d.length * S['배차호차'].d[0].length;
M.Sheet.prototype.getRange = orig;
ok('하루 열 때 시트 전체보다 훨씬 적게 읽음', cells < total / 2, cells + ' / ' + total);

// 오래된 '바뀐 시각' 기록 지우기
M.props['DST|쿠팡부자재|2020-01-01'] = String(Date.now() - 100 * 86400000); M.props['DST|쿠팡부자재|2026-10-05'] = String(Date.now() - 86400000); delete M.cache['DST_GC'];
M.ctx.dispTouch_('쿠팡부자재', '2026-10-06');
ok('60일 지난 기록은 지우고 최근 것은 둠', !('DST|쿠팡부자재|2020-01-01' in M.props) && ('DST|쿠팡부자재|2026-10-05' in M.props) && ('DST|쿠팡부자재|2026-10-06' in M.props));
M.props['DST|쿠팡부자재|2020-01-02'] = '1'; M.ctx.dispTouch_('쿠팡부자재', '2026-10-06');
ok('6시간에 한 번만 정리', 'DST|쿠팡부자재|2020-01-02' in M.props);
