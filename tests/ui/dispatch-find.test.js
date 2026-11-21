// 배차 이력 찾기 창: 🔍 이력 찾기 → 차량번호로 찾기 → 운행 목록·기사별·센터별 → 줄을 누르면 그 날짜·탭으로 (데모 모드)
var T = require('../lib/browser.js'), ok = T.ok, api = T.api, K = '쿠팡부자재/평택';
T.run(async function () {
  var o = await T.open(), p = o.page;
  for (var d of ['2026-10-02', '2026-10-09']) {
    await api(p, 'dispatch.import', { cust: K, rows: [{ date: d, key: 'f' + d, d: { fc: '찾기센터', bundle: '2', kg: '200', date: d, from: '출발', addr: '가상시 가상로 1' } }] });
    var day = await api(p, 'dispatch.day', { cust: K, date: d });
    await api(p, 'dispatch.save', { cust: K, date: d, orders: [{ id: day.orders[0].id, truck: 1, seq: 1 }], trucks: [{ no: 1, car: '77가 7777', driver: '찾기기사', phone: '010-7777-1234' }] });
  }
  await p.reload(); await p.waitForTimeout(800); await T.dispatch(p, '2026-11-20', '쿠팡부자재');
  await p.click('#dpFind'); await p.waitForSelector('#dfQ');
  await p.fill('#dfQ', '77가7777'); await p.selectOption('#dfSpan', '0'); await p.click('#dfGo');
  await p.waitForSelector('#dfOut tr.click', { timeout: 10000 });
  var rows = await p.$$eval('#dfOut tr.click', function (l) { return l.map(function (x) { return x.innerText.replace(/\s+/g, ' '); }); });
  ok('차량번호로 지난 배차 2건 (최근부터 · 탭 이름 · 센터)', rows.length === 2 && /2026-10-09/.test(rows[0]) && /부자재-평택/.test(rows[0]) && /찾기센터/.test(rows[0]), rows);
  await p.click('#dfView [data-v="drivers"]'); var dv = await T.text(p, '#dfOut');
  ok('기사별: 횟수 2', /찾기기사/.test(dv) && /\b2\b/.test(dv), dv);
  await p.click('#dfView [data-v="centers"]'); var cv = await T.text(p, '#dfOut');
  ok('센터별 방문', /찾기센터/.test(cv), cv);
  await p.click('#dfView [data-v="list"]'); await p.click('#dfOut tr.click'); await p.waitForTimeout(1500);
  ok('줄을 누르면 그 날짜·탭으로 이동', (await p.$eval('#dpDate', function (x) { return x.value; })) === '2026-10-09' && /부자재-평택/.test(await T.text(p, '#dpTabs .on')), await p.$eval('#dpDate', function (x) { return x.value; }));
  ok('화면 오류 없음', !p.errs.length, p.errs);
  await T.done(o);
});
