// 경유비: 주소가 같은 하차지는 한 곳 (도 이름을 안 적었거나 층이 붙어도) · 주소가 다르면 경유 1곳
var T = require('../lib/browser.js'), ok = T.ok, api = T.api, DATE = '2026-11-12', K = '쿠팡부자재/평택';
T.run(async function () {
  var o = await T.open(), p = o.page;
  await api(p, 'dispatch.ratesSave', { cust: '쿠팡부자재', mode: 'add', rows: ['1톤', '2.5톤', '3.5톤', '5톤'].map(function (t) { return { from: '테스트출발', to: '가상시', ton: t, price: 100000 }; }) });
  for (var n = 1; n <= 4; n++) await api(p, 'dispatch.mapSave', { fc: '센터' + n, dest: '가상시' });
  await api(p, 'loading.save', { cust: '쿠팡부자재', place: { name: '테스트출발', addr: '경기도 가상시 출발로 1' } });
  var od = function (k, fc, addr) { return { date: DATE, key: k, d: { fc: fc, bundle: '3', kg: '300', date: DATE, from: '테스트출발', addr: addr } }; };
  await api(p, 'dispatch.import', { cust: K, rows: [od('v1', '센터1', '가상시 가상구 테스트로 12 3층'), od('v2', '센터2', '경기도 가상시 가상구 테스트로 12'), od('v3', '센터3', '경기도 가상시 가상구 테스트로 12'), od('v4', '센터4', '가상시 가상구 다른로 7')] });
  var d = await api(p, 'dispatch.day', { cust: K, date: DATE });
  await api(p, 'dispatch.save', { cust: K, date: DATE, orders: d.orders.map(function (x, i) { return { id: x.id, truck: i < 2 ? 1 : 2, seq: i + 1 }; }), trucks: [{ no: 1 }, { no: 2 }] });
  await p.reload(); await p.waitForTimeout(800); await T.dispatch(p, DATE, '쿠팡부자재'); await T.tab(p, '부자재-평택');
  await p.waitForSelector('.dp-tt tbody .tt-cv', { timeout: 10000 });
  var cv = await p.$$eval('.dp-tt tbody .tt-cv', function (l) { return l.map(function (x) { return x.innerText.replace(/\s+/g, ' '); }).filter(Boolean); });
  ok('같은 주소(도 이름 없음 + 3층 / 도 이름 있음)는 경유비 없음 → 100,000', /100,000/.test(cv[0]) && !/130,000/.test(cv[0]), cv);
  ok('주소가 다르면 경유 1곳 → 130,000', cv.some(function (x, i) { return i > 0 && /130,000/.test(x); }), cv);
  await T.done(o);
});
