// 월별 기록 대시보드 · 번들 단가 · 매출/실제 매입 고치기(화면 먼저) · 날짜별 실제 배차금액 · 조일배차 · 권한
var T = require('../lib/browser.js'), ok = T.ok, api = T.api;
var DATE = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), YM = DATE.slice(0, 7), K = '쿠팡부자재/평택';
T.run(async function () {
  var o = await T.open(), p = o.page;
  // 준비: 단가표(자동 톤수 어느 것이든 100,000) · 상차지 · 오더 2줄 → 호차 2대
  await api(p, 'dispatch.ratesSave', { cust: '쿠팡부자재', mode: 'add', rows: ['1톤', '2.5톤', '3.5톤', '5톤'].map(function (t) { return { from: '테스트출발', to: '가상시', ton: t, price: 100000 }; }) });
  await api(p, 'dispatch.mapSave', { fc: '센터1', dest: '가상시' }); await api(p, 'dispatch.mapSave', { fc: '센터2', dest: '가상시' });
  await api(p, 'loading.save', { cust: '쿠팡부자재', place: { name: '테스트출발', addr: '가상도 가상시 출발로 1' } });
  await api(p, 'dispatch.import', { cust: K, rows: [{ date: DATE, key: 'm1', d: { fc: '센터1', bundle: '5', kg: '500', date: DATE, from: '테스트출발', addr: '가상도 가상시 1' } }, { date: DATE, key: 'm2', d: { fc: '센터2', bundle: '4', kg: '400', date: DATE, from: '테스트출발', addr: '가상도 가상시 2' } }] });
  var d = await api(p, 'dispatch.day', { cust: K, date: DATE });
  await api(p, 'dispatch.save', { cust: K, date: DATE, orders: d.orders.map(function (x, i) { return { id: x.id, truck: i + 1, seq: 1 }; }), trucks: [{ no: 1 }, { no: 2 }] });
  await p.reload(); await p.waitForTimeout(800); await T.dispatch(p, DATE, '쿠팡부자재');
  await p.click('#dpView [data-v="month"]'); await p.waitForSelector('.dp-dash', { timeout: 10000 });
  ok('대시보드: 단가를 넣으라는 안내', /단가를 넣고/.test(await T.text(p, '.dp-dash')));
  await p.fill('#dpPrice', '10,000'); await p.click('#dpPriceSave'); await p.waitForTimeout(1500);
  var dash = await T.text(p, '.dp-dash');
  ok('단가 저장 → 매출 9번들 × 10,000 · 매입 20만 · 이익', /매출 90,000원/.test(dash) && /매입 200,000원/.test(dash) && /-110,000원/.test(dash), dash);

  // 금액 고치기: 서버가 느려도 화면은 바로
  await T.slow(p, 1500);
  await (await p.$$('[data-rev]'))[0].click(); await p.waitForSelector('#dpRv'); await p.fill('#dpRv', '110000');
  var t0 = Date.now(); await p.click('#dpRvOk'); await p.waitForFunction(function () { return /직접 고친 매출 110,000원/.test(document.querySelector('.dp-dash').innerText); }, null, { timeout: 8000 });
  ok('매출 직접 고치기: 화면에 바로 (1초 안)', Date.now() - t0 < 1000, Date.now() - t0);
  ok('손익분기 = (매입 − 고친 매출) ÷ 나머지 번들', /손익분기 번들 단가 22,500원/.test(await T.text(p, '.dp-dash')), await T.text(p, '.dp-dash'));
  await (await p.$$('[data-cost]'))[1].click(); await p.waitForSelector('#dpRv'); await p.fill('#dpRv', '250000'); await p.click('#dpRvOk');
  await p.waitForFunction(function () { return /매입 350,000원/.test(document.querySelector('.dp-dash').innerText.replace(/\s+/g, ' ')); }, null, { timeout: 8000 });
  ok('실제 매입 넣기: 그 금액만 매입으로 · 표에 "실제"', /실제/.test(await T.text(p, '.dp-mtab')));
  await p.waitForTimeout(4000);
  d = await api(p, 'dispatch.day', { cust: K, date: DATE });
  ok('서버에도 저장', d.trucks[0].rev === 110000 && d.trucks[1].cost === 250000, d.trucks.map(function (t) { return [t.rev, t.cost]; }));

  // 날짜별 화면: 조일배차를 고르면 실제 배차금액 창 (관리자)
  await p.click('#dpView [data-v="day"]'); await T.tab(p, '부자재-평택'); await p.waitForSelector('select[data-st="부자재-평택|1"]', { timeout: 10000 });
  await p.selectOption('select[data-st="부자재-평택|1"]', '조일배차'); await p.waitForSelector('.modal [data-fv="cost"]', { timeout: 8000 });
  ok('조일배차 → 실제 배차금액 창', /실제 배차금액 \(조일배차\)/.test(await T.text(p, '.modal')));
  await p.fill('.modal [data-fv="cost"]', '240,000'); await p.click('#fareSave'); await p.waitForTimeout(5000);
  ok('운송비 칸에 실제 금액', /실제 240,000/.test(await T.text(p, '.dp-tt')), await T.text(p, '.dp-tt tbody .tt-cv'));
  d = await api(p, 'dispatch.day', { cust: K, date: DATE });
  ok('서버: 조일배차·실제 매입 · 고친 매출은 그대로', d.trucks[0].status === '조일배차' && d.trucks[0].cost === 240000 && d.trucks[0].rev === 110000, d.trucks[0]);

  // 권한
  var u1 = await api(p, 'admin.createUser', { id: 'stf1', name: '직원일', role: 'user', perms: ['quote'] }), u2 = await api(p, 'admin.createUser', { id: 'anl1', name: '분석일', role: 'user', perms: ['quote', 'analysis'] }), u3 = await api(p, 'admin.createUser', { id: 'ptn1', name: '협력일', role: 'partner', dispTabs: [K] });
  await T.relog(p, 'stf1', u1.tempPassword); await T.dispatch(p, DATE, '쿠팡부자재'); await p.click('#dpView [data-v="month"]'); await p.waitForSelector('.dp-mtab', { timeout: 10000 });
  ok('분석 권한 없는 직원: 대시보드·매출 칸 없음', !(await p.$('.dp-dash')) && !(await p.$('[data-rev]')));
  ok('직원: 서버가 매출·매입을 안 보냄', (await api(p, 'dispatch.day', { cust: K, date: DATE })).trucks.every(function (t) { return !('rev' in t) && !('cost' in t); }));
  await T.relog(p, 'anl1', u2.tempPassword); await T.dispatch(p, DATE, '쿠팡부자재'); await T.tab(p, '부자재-평택'); await p.waitForSelector('[data-fare="부자재-평택|2"]', { state: 'attached', timeout: 10000 });
  await p.evaluate(function () { document.querySelector('[data-fare="부자재-평택|2"]').click(); }); await p.waitForSelector('.modal');
  ok('분석 직원(관리자 아님): 날짜별 운임 창에 실제 배차금액 칸 없음', !(await p.$('.modal [data-fv="cost"]')));
  await T.relog(p, 'ptn1', u3.tempPassword); await p.waitForTimeout(600); await T.dispatch(p, DATE, '쿠팡부자재').catch(function () {}); await p.waitForTimeout(1500);
  ok('협력사: 월별 기록 버튼 없음', !(await p.$('#dpView')));
  ok('협력사: 월별 조회 거절', !!(await api(p, 'dispatch.monthAll', { keys: [K], ym: YM })).error);
  ok('협력사: 매출·매입 안 옴', (await api(p, 'dispatch.day', { cust: K, date: DATE })).trucks.every(function (t) { return !('rev' in t) && !('cost' in t); }));
  await T.done(o);
});
