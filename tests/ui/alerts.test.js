// 자동 알림 🔔: 배차 알림은 긴급만(오늘 차가 안 잡힌 호차의 상차 마감·출발 마감) · 개수 · 지나면 빨간 알림 · 누르면 그 날짜·탭 배차 화면 · 관리자 이동시간 표 (데모 모드)
var T = require('../lib/browser.js'), ok = T.ok, api = T.api, K = '쿠팡부자재/평택';
T.run(async function () {
  var o = await T.open(), p = o.page;
  await p.evaluate(function () { window.__demoNow = 12 * 60 + 30; }); // 데모 지금 = 12:30
  var D = await p.evaluate(function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); });
  // 하차 14시 → 데모 이동 72분 → 출발 마감 12:48 (1시간 안 → 임박) · 다른 호차는 미배정이면 알림 없음
  await api(p, 'dispatch.import', { cust: K, rows: [{ date: D, key: 'al1', d: { fc: '알림센터', bundle: '2', kg: '200', date: D, from: '출발', addr: '가상시 가상로 1', hours: '09:00~14:00' } }, { date: D, key: 'al2', d: { fc: '미배정센터', bundle: '2', kg: '200', date: D, from: '출발', addr: '가상시 가상로 2', hours: '09:00~14:00' } }] });
  var dp = await api(p, 'dispatch.day', { cust: K, date: D }), id1 = dp.orders.filter(function (x) { return x.key === 'al1'; })[0].id;
  await api(p, 'dispatch.save', { cust: K, date: D, orders: [{ id: id1, truck: 1, seq: 1 }], trucks: [{ no: 1, car: '' }] });
  await p.reload(); await p.evaluate(function () { window.__demoNow = 12 * 60 + 30; }); await p.waitForTimeout(300);
  await p.evaluate(function () { document.dispatchEvent(new Event('visibilitychange')); }); await p.waitForTimeout(1500);
  var n = await p.$eval('#alrBell .alr-n', function (x) { return x.hidden ? '' : x.textContent; });
  ok('종에 알림 개수 (긴급만 · 미배정 오더는 알림 없음)', n === '1', n);
  await p.click('#alrBell'); await p.waitForSelector('.alr-pop [data-ai]');
  var t = await T.text(p, '.alr-pop'); ok('알림 목록: 긴급 · 출발 마감', /긴급/.test(t) && /1호차 12:48 전 출발해야 함 \(알림센터 14시까지 하차\)/.test(t) && !/미배정/.test(t), t);
  ok('관리자: 이동시간 표 링크', !!(await p.$('#alrRt')));
  await p.click('#alrRt'); await p.waitForSelector('[data-rf]'); ok('이동시간 표 · 다시 조회 버튼', /알림 계산/.test(await T.text(p, '.modal')));
  await p.click('[data-rf]'); await p.waitForTimeout(500); ok('다시 조회 후 알림', /다시 조회했어요/.test(await T.text(p, 'body')));
  await p.keyboard.press('Escape'); await p.evaluate(function () { var b = document.querySelector('.backdrop'); if (b) b.parentNode.removeChild(b); });
  // 지나면 빨간 알림
  await p.evaluate(function () { window.__demoNow = 13 * 60; });
  var late = await api(p, 'alerts.list', {}); ok('지나면 lvl=late · 출발 마감 지남', late.list.length === 1 && late.list[0].lvl === 'late' && /출발 마감 지남/.test(late.list[0].msg), late);
  await p.evaluate(function () { window.__demoNow = 12 * 60 + 30; });
  await p.click('#alrBell'); await p.waitForSelector('.alr-pop [data-ai]');
  await p.click('.alr-pop [data-ai]'); await p.waitForSelector('#dpDate', { timeout: 10000 }); await p.waitForTimeout(800);
  ok('알림을 누르면 그 날짜·탭 배차 화면', (await p.$eval('#dpDate', function (x) { return x.value; })) === D && /부자재-평택/.test(await T.text(p, '#dpTabs .on')));
  ok('화면 오류 없음', !p.errs.length, p.errs);
  await T.done(o);
});
