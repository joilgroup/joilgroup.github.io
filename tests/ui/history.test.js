// 변경 이력: 호차 ⋯ → 변경 이력 창 (바뀐 칸·누가) · 관리자 → 변경 이력 탭 (데모 모드)
var T = require('../lib/browser.js'), ok = T.ok, api = T.api, DATE = '2026-11-13', K = '쿠팡부자재/평택';
T.run(async function () {
  var o = await T.open(), p = o.page;
  await api(p, 'dispatch.import', { cust: K, rows: [{ date: DATE, key: 'h1', d: { fc: '센터1', bundle: '3', kg: '300', date: DATE, from: '출발', addr: '가상시 가상로 1' } }] });
  var d = await api(p, 'dispatch.day', { cust: K, date: DATE });
  var s1 = await api(p, 'dispatch.save', { cust: K, date: DATE, orders: [{ id: d.orders[0].id, truck: 1, seq: 1 }], trucks: [{ no: 1, car: '12가3456' }] });
  await api(p, 'dispatch.save', { cust: K, date: DATE, patch: true, trucks: [{ no: 1, token: s1.trucks[0].token, set: { driver: '김기사' } }] });
  var h = await api(p, 'dispatch.history', { cust: K, date: DATE, tk: s1.trucks[0].token });
  ok('데모 서버: 호차 이력 (추가 · 운전원 변경)', h.list.length === 2 && h.list[0].chg.driver && h.list[0].chg.driver[1] === '김기사', h);
  await p.reload(); await p.waitForTimeout(800); await T.dispatch(p, DATE, '쿠팡부자재'); await T.tab(p, '부자재-평택');
  await p.waitForSelector('[data-thist]', { state: 'attached', timeout: 10000 });
  await p.$eval('[data-thist]', function (b) { b.click(); });
  await p.waitForSelector('.hist-table', { timeout: 10000 });
  var txt = await p.$eval('.hist-table', function (t) { return t.innerText.replace(/\s+/g, ' '); });
  ok('호차 변경 이력 창: 누가 · 무엇 · 전 → 후', /운전원 \(빈 칸\) → 김기사/.test(txt) && /1호차 변경/.test(txt) && /1호차 추가/.test(txt), txt);
  await p.evaluate(function () { location.hash = ''; });
  await api(p, 'admin.audit', {});
  await p.goto(p.url().replace(/#.*$/, '') + '#/admin'); await p.waitForTimeout(800);
  var tabBtn = await p.$('.rail button[data-tab="audit"]'); ok('관리자 메뉴에 변경 이력 탭', !!tabBtn);
  if (tabBtn) { await tabBtn.click(); await p.waitForSelector('#audOut', { timeout: 10000 }); await p.waitForTimeout(500); var at = await p.$eval('#audOut', function (x) { return x.innerText; }); ok('관리자 변경 이력 화면이 열림', /변경 이력이 없어요|언제/.test(at), at); }
  var ub = await p.$('.rail button[data-tab="usage"]'); ok('관리자 메뉴에 사용량 탭', !!ub);
  if (ub) { await ub.click(); await p.waitForTimeout(800); ok('사용량: DB 용량 · 500MB 중', /500MB 중/.test(await T.text(p, '#usOut')), await T.text(p, '#usOut')); }
  await T.done(o);
});
