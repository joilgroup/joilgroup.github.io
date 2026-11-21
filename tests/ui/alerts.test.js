// 자동 알림 🔔: 개수 표시 · 눌러서 목록 · 알림을 누르면 그 날짜·탭 배차 화면으로 (데모 모드)
var T = require('../lib/browser.js'), ok = T.ok, api = T.api, K = '쿠팡부자재/평택';
T.run(async function () {
  var o = await T.open(), p = o.page;
  var D = await p.evaluate(function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); });
  await api(p, 'dispatch.import', { cust: K, rows: [{ date: D, key: 'al1', d: { fc: '알림센터', bundle: '2', kg: '200', date: D, from: '출발', addr: '가상시 가상로 1' } }] });
  await p.reload(); await p.waitForTimeout(1500);
  var n = await p.$eval('#alrBell .alr-n', function (x) { return x.hidden ? '' : x.textContent; });
  ok('종에 알림 개수', n === '1', n);
  await p.click('#alrBell'); await p.waitForSelector('.alr-pop [data-ai]');
  var t = await T.text(p, '.alr-pop'); ok('알림 목록: 미배정 · 탭 · 글', /미배정/.test(t) && /호차 미배정 오더 1줄/.test(t), t);
  await p.click('.alr-pop [data-ai]'); await p.waitForSelector('#dpDate', { timeout: 10000 }); await p.waitForTimeout(800);
  ok('알림을 누르면 그 날짜·탭 배차 화면', (await p.$eval('#dpDate', function (x) { return x.value; })) === D && /부자재-평택/.test(await T.text(p, '#dpTabs .on')));
  ok('화면 오류 없음', !p.errs.length, p.errs);
  await T.done(o);
});
