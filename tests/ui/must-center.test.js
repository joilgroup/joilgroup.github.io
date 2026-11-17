// 오늘 꼭 가야 하는 센터: 사이트에서 목록 저장 · 이름 표기가 달라도(띄어쓰기·FC·층) 빨간 표시 · 기사 공지 자동으로 안 만듦 · 문자에 안 나감 · 협력사도 표시
var T = require('../lib/browser.js'), ok = T.ok, api = T.api, DATE = '2026-11-13', K = '쿠팡부자재';
T.run(async function () {
  var o = await T.open(), p = o.page;
  await T.dispatch(p, DATE, '쿠팡부자재');
  await p.click('#dpMustMgr'); await p.waitForSelector('#dmList');
  await p.fill('#dmList', '가상1\n테스트30'); await p.click('#dmSave'); await p.waitForTimeout(800);
  ok('목록 저장 (서버)', JSON.stringify((await api(p, 'dispatch.must', { cust: '쿠팡부자재' })).list) === '["가상1","테스트30"]');
  ok('버튼에 개수', /꼭 가야 하는 센터 2/.test(await T.text(p, '#dpMustMgr')));

  var note = { 12: '13시이후 배차부탁드립니다.' };
  var rows = [T.orderRow(DATE, 1, '가상 1 FC - 2층', '', 3, note), T.orderRow(DATE, 2, '가상1FC', '', 2), T.orderRow(DATE, 3, '가상10', '', 2, note), T.orderRow(DATE, 4, '테스트3', '', 2)];
  await T.paste(p, rows.join('\n')); await p.waitForTimeout(1500);
  var d = await api(p, 'dispatch.day', { cust: K, date: DATE }), by = function (fc) { return d.orders.filter(function (x) { return x.d.fc === fc; })[0]; };
  ok('꼭 가야 하는 센터: 시간 안내는 내부 공지에만 (기사 공지 없음)', by('가상 1 FC - 2층').noteIn === '13시이후 배차부탁드립니다.' && !by('가상 1 FC - 2층').noteDrv, [by('가상 1 FC - 2층').noteIn, by('가상 1 FC - 2층').noteDrv]);
  ok('다른 센터(가상10)는 예전처럼 기사 공지', by('가상10').noteDrv === '13시 이후 상차가능', by('가상10').noteDrv);
  var marked = await p.$$eval('tr[data-o]', function (l) { return l.filter(function (r) { return r.querySelector('.dp-must'); }).map(function (r) { return r.querySelector('td.left b').innerText; }); });
  ok('표기가 달라도 표시 (가상 1 FC - 2층 · 가상1FC) · 가상10·테스트3은 아님', marked.sort().join(',') === '가상 1 FC - 2층,가상1FC', marked);
  ok('오늘 할 일에 🚩', ((await T.text(p, '.dp-todo')).match(/오늘 꼭 가야함/g) || []).length === 2);

  await api(p, 'dispatch.save', { cust: K, date: DATE, orders: [{ id: by('가상1FC').id, truck: 1, seq: 1 }], trucks: [{ no: 1 }] });
  await T.dispatch(p, '2026-11-14', '쿠팡부자재'); await T.dispatch(p, DATE, '쿠팡부자재'); await p.waitForTimeout(1500);
  ok('호차 표에도 표시', /오늘 꼭 가야함/.test(await T.text(p, '.dp-tt')));
  await p.evaluate(function () { document.querySelector('[data-preview="부자재-인천|1"]').click(); }); await p.waitForSelector('.dp-msg');
  ok('문자에는 안 나감', !/꼭 가야/.test(await p.$eval('.dp-msg', function (e) { return e.textContent; })));
  await p.click('.modal [data-close]').catch(function () {});

  var u = await api(p, 'admin.createUser', { id: 'ptnm', name: '협력엠', role: 'partner', dispTabs: [K] });
  await T.relog(p, 'ptnm', u.tempPassword); await p.waitForTimeout(600); await T.dispatch(p, DATE, '쿠팡부자재').catch(function () {}); await p.waitForTimeout(2000);
  ok('협력사: 호차 표에 표시 · 목록 고치기 버튼 없음', /오늘 꼭 가야함/.test(await T.text(p, '.dp-tt')) && !(await p.$('#dpMustMgr')));
  ok('협력사: 목록 저장은 막힘', !!(await api(p, 'dispatch.mustSave', { cust: '쿠팡부자재', list: [] })).error);
  await T.done(o);
});
