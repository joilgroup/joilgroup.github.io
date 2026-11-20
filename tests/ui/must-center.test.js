// 도착지 특이사항: 사이트에서 센터마다 멘트 저장 · 이름 표기가 달라도(띄어쓰기·FC·층) 공지 칸·호차 표·오늘 할 일에 📌 · '시간·날짜 변경 불가'면 기사 공지 자동으로 안 만듦
// '기사에게도'만 문자에 나감 · 협력사는 '협력사에도'·'기사에게도'만 · 쉼표로 여러 센터 한 번에
var T = require('../lib/browser.js'), ok = T.ok, api = T.api, DATE = '2026-11-13', K = '쿠팡부자재';
T.run(async function () {
  var o = await T.open(), p = o.page;
  await T.dispatch(p, DATE, '쿠팡부자재');
  await p.click('#dpMustMgr'); await p.waitForSelector('#cnAdd');
  var row = async function (fc, note, ks) {
    await p.click('#cnAdd'); var i = (await p.$$('[data-k="fc"]')).length - 1;
    await p.fill('[data-cn="' + i + '"][data-k="fc"]', fc); await p.fill('[data-cn="' + i + '"][data-k="note"]', note);
    for (var j = 0; j < ks.length; j++) await p.check('[data-cn="' + i + '"][data-k="' + ks[j] + '"]');
  };
  await row('가상1', '오늘 꼭 가야함', ['ptn', 'lock']);
  await row('가상1', '14시부터 하차가능', ['drv']);
  await row('테스트30, 테스트31', '카고차량 배차가능', []);
  await p.click('#cnSave'); await p.waitForTimeout(800);
  var saved = (await api(p, 'dispatch.notes', { cust: '쿠팡부자재' })).list;
  ok('저장 (쉼표로 쓴 센터는 각각)', saved.length === 4 && saved.filter(function (x) { return x.note === '카고차량 배차가능'; }).length === 2, saved);
  ok('버튼에 개수', /도착지 특이사항 4/.test(await T.text(p, '#dpMustMgr')));

  var note = { 12: '13시이후 배차부탁드립니다.' };
  var rows = [T.orderRow(DATE, 1, '가상 1 FC - 2층', '', 3, note), T.orderRow(DATE, 2, '가상1FC', '', 2), T.orderRow(DATE, 3, '가상10', '', 2, note), T.orderRow(DATE, 4, '테스트31', '', 2)];
  await T.paste(p, rows.join('\n')); await p.waitForTimeout(1500);
  var d = await api(p, 'dispatch.day', { cust: K, date: DATE }), by = function (fc) { return d.orders.filter(function (x) { return x.d.fc === fc; })[0]; };
  ok('시간·날짜 변경 불가 센터: 시간 안내는 내부 공지에만 (기사 공지 없음)', by('가상 1 FC - 2층').noteIn === '13시이후 배차부탁드립니다.' && !by('가상 1 FC - 2층').noteDrv, [by('가상 1 FC - 2층').noteIn, by('가상 1 FC - 2층').noteDrv]);
  ok('다른 센터(가상10)는 예전처럼 기사 공지', by('가상10').noteDrv === '13시 이후 상차가능', by('가상10').noteDrv);
  var cells = await p.$$eval('tr[data-o]', function (l) { return l.map(function (r) { return r.querySelector('td.left b').innerText + '=' + [].map.call(r.querySelectorAll('.nt.cn'), function (x) { return x.innerText; }).join('/'); }); });
  ok('공지 칸에 📌 (표기가 달라도) · 가상10은 없음', cells.indexOf('가상 1 FC - 2층=📌 오늘 꼭 가야함/📌 14시부터 하차가능') !== -1 && cells.indexOf('가상1FC=📌 오늘 꼭 가야함/📌 14시부터 하차가능') !== -1 && cells.indexOf('가상10=') !== -1 && cells.indexOf('테스트31=📌 카고차량 배차가능') !== -1, cells);
  ok('오늘 할 일에 📌', ((await T.text(p, '.dp-todo')).match(/📌/g) || []).length === 3, await T.text(p, '.dp-todo'));

  await api(p, 'dispatch.save', { cust: K, date: DATE, orders: [{ id: by('가상1FC').id, truck: 1, seq: 1 }], trucks: [{ no: 1 }] });
  await T.dispatch(p, '2026-11-14', '쿠팡부자재'); await T.dispatch(p, DATE, '쿠팡부자재'); await p.waitForTimeout(1500);
  ok('호차 표에도 📌', /📌 오늘 꼭 가야함/.test(await T.text(p, '.dp-tt')) && /📌 14시부터 하차가능/.test(await T.text(p, '.dp-tt')));
  await p.evaluate(function () { document.querySelector('[data-preview="부자재-인천|1"]').click(); }); await p.waitForSelector('.dp-msg');
  var msg = await p.$eval('.dp-msg', function (e) { return e.textContent; });
  ok('문자에는 기사에게도 멘트만', /⚠️ 14시부터 하차가능/.test(msg) && !/꼭 가야/.test(msg), msg.split('\n').slice(0, 5));
  await p.click('.modal [data-close]').catch(function () {});

  var u = await api(p, 'admin.createUser', { id: 'ptnm', name: '협력엠', role: 'partner', dispTabs: [K] });
  await T.relog(p, 'ptnm', u.tempPassword); await p.waitForTimeout(600); await T.dispatch(p, DATE, '쿠팡부자재').catch(function () {}); await p.waitForTimeout(2000);
  var tt = await T.text(p, '.dp-tt');
  ok('협력사: 협력사에도·기사에게도 멘트만 보임 · 고치기 버튼 없음', /📌 오늘 꼭 가야함/.test(tt) && /📌 14시부터 하차가능/.test(tt) && !(await p.$('#dpMustMgr')), tt);
  ok('협력사: 저장은 막힘', !!(await api(p, 'dispatch.notesSave', { cust: '쿠팡부자재', list: [] })).error);
  await T.done(o);
});
