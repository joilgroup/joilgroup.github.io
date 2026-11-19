// 운송비 톤수: 2026-11-01 배차분부터 11~14번들·5,000kg 초과~8,000kg = 8톤 · 그 전 날짜는 예전 기준(11톤) · 8톤 단가가 없으면 '단가 없음'
var T = require('../lib/browser.js'), ok = T.ok, api = T.api, K = '쿠팡부자재/평택';
var P = { '5톤': 100000, '8톤': 180000, '11톤': 250000, '14톤': 300000 };
async function costs(p, date, rows) {
  await api(p, 'dispatch.import', { cust: K, rows: rows.map(function (r, i) { return { date: date, key: 'tr' + date + i, d: { fc: '센터' + i, bundle: String(r[0]), kg: String(r[1]), date: date, from: '테스트출발', addr: '경기도 가상시 가상구 길' + i } }; }) });
  var d = await api(p, 'dispatch.day', { cust: K, date: date });
  await api(p, 'dispatch.save', { cust: K, date: date, orders: d.orders.map(function (x, i) { return { id: x.id, truck: i + 1, seq: 1 }; }), trucks: d.orders.map(function (x, i) { return { no: i + 1 }; }) });
  await T.dispatch(p, date, '쿠팡부자재'); await T.tab(p, '부자재-평택'); await p.waitForSelector('.dp-tt tbody .tt-cv', { timeout: 10000 });
  return p.$$eval('.dp-tt tbody .tt-cv', function (l) { return l.map(function (x) { return x.innerText.replace(/\s+/g, ' '); }).filter(Boolean); });
}
T.run(async function () {
  var o = await T.open(), p = o.page;
  await api(p, 'dispatch.ratesSave', { cust: '쿠팡부자재', mode: 'add', rows: Object.keys(P).map(function (t) { return { from: '테스트출발', to: '가상시', ton: t, price: P[t] }; }) });
  await api(p, 'loading.save', { cust: '쿠팡부자재', place: { name: '테스트출발', addr: '경기도 가상시 출발로 1' } });
  await p.reload(); await p.waitForTimeout(800);
  // [번들, kg]: 12번들 · 6,000kg · 15번들 · 9번들 4,000kg
  var c = await costs(p, '2026-11-20', [[12, 1000], [3, 6000], [15, 1000], [9, 4000]]);
  ok('11월 이후: 12번들 → 8톤', /180,000/.test(c[0]), c);
  ok('11월 이후: 6,000kg → 8톤', /180,000/.test(c[1]), c);
  ok('11월 이후: 15번들 → 11톤', /250,000/.test(c[2]), c);
  ok('11월 이후: 9번들 4,000kg → 5톤 그대로', /100,000/.test(c[3]), c);
  c = await costs(p, '2026-10-20', [[12, 1000], [3, 6000]]);
  ok('10월 이전: 12번들·6,000kg은 예전처럼 11톤', /250,000/.test(c[0]) && /250,000/.test(c[1]), c);
  await T.done(o);
});
