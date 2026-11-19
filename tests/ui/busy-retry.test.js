// 월별 기록 금액 고치기 중 서버가 'BUSY'(다른 저장이 몰려 차례를 못 받음)를 주면 화면이 알아서 다시 보내서 저장돼요
var T = require('../lib/browser.js'), ok = T.ok, api = T.api;
var DATE = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), K = '쿠팡부자재/평택';
T.run(async function () {
  var o = await T.open(), p = o.page;
  await api(p, 'loading.save', { cust: '쿠팡부자재', place: { name: '테스트출발', addr: '가상도 가상시 출발로 1' } });
  await api(p, 'dispatch.import', { cust: K, rows: [{ date: DATE, key: 'b1', d: { fc: '센터1', bundle: '5', kg: '500', date: DATE, from: '테스트출발', addr: '가상도 가상시 1' } }] });
  var d = await api(p, 'dispatch.day', { cust: K, date: DATE });
  await api(p, 'dispatch.save', { cust: K, date: DATE, orders: [{ id: d.orders[0].id, truck: 1, seq: 1 }], trucks: [{ no: 1 }] });
  await T.dispatch(p, DATE, '쿠팡부자재'); await p.click('#dpView [data-v="month"]'); await p.waitForSelector('[data-cost]', { timeout: 10000 });
  await p.evaluate(function () { var c = window.JoilDemo.call, n = 0; window.__busyN = 0; window.JoilDemo.call = function (req) { if (req.action === 'dispatch.save' && n++ < 2) { window.__busyN++; return Promise.reject(new Error('BUSY|다른 저장이 몰려 차례를 기다리다 시간이 지났어요.')); } return c(req); }; });
  await (await p.$$('[data-cost]'))[0].click(); await p.waitForSelector('#dpRv'); await p.fill('#dpRv', '123000'); await p.click('#dpRvOk');
  await p.waitForTimeout(6000);
  d = await api(p, 'dispatch.day', { cust: K, date: DATE });
  var errToast = await p.$$eval('.toast.err', function (l) { return l.map(function (x) { return x.innerText; }); });
  ok('BUSY 두 번 뒤 자동으로 다시 보내서 저장', d.trucks[0].cost === 123000 && (await p.evaluate(function () { return window.__busyN; })) === 2, [d.trucks[0].cost]);
  ok('실패 알림 없음', !errToast.length, errToast);
  await T.done(o);
});
