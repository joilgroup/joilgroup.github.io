// 공용 화면: 태블릿 묶음 메뉴 · 창(모달) 끌다 밖에서 떼기 · 검색칸 한글 조합 입력
var T = require('../lib/browser.js'), ok = T.ok, api = T.api;
async function typeKo(p, cdp, steps) { // [['ㅊ','차','창'], ['ㅇ','우','워','원']] — 한글 입력기처럼 조합하며 치기
  for (var i = 0; i < steps.length; i++) {
    for (var j = 0; j < steps[i].length; j++) { await cdp.send('Input.imeSetComposition', { text: steps[i][j], selectionStart: steps[i][j].length, selectionEnd: steps[i][j].length }); await p.waitForTimeout(60); }
    if (i < steps.length - 1) { await cdp.send('Input.insertText', { text: steps[i][steps[i].length - 1] }); await p.waitForTimeout(60); }
  }
}
T.run(async function () {
  // 1) 태블릿: 묶음 메뉴는 눌러서 열고 닫기
  var o = await T.open({ touch: true, context: Object.assign({}, T.devices['Galaxy Tab S4'], { viewport: { width: 1180, height: 760 } }) }), p = o.page;
  var g = await p.$$('.nav-grp');
  await g[0].tap(); await p.waitForTimeout(1200); var open1 = !!(await p.$('.nav-pop'));
  await p.evaluate(function () { window.scrollBy(0, 10); }); await p.waitForTimeout(300);
  ok('태블릿: 메뉴를 누르면 열린 채로 (살짝 스크롤해도)', open1 && !!(await p.$('.nav-pop')));
  await (await p.$$('.nav-pop button'))[0].tap(); await p.waitForTimeout(800);
  ok('하위 메뉴를 누르면 이동하고 닫힘', !(await p.$('.nav-pop')));
  g = await p.$$('.nav-grp'); await g[0].tap(); await p.waitForTimeout(300); await g[0].tap(); await p.waitForTimeout(300);
  ok('다시 누르면 닫힘', !(await p.$('.nav-pop')));
  await g[0].tap(); await p.waitForTimeout(300); await p.tap('#main'); await p.waitForTimeout(300);
  ok('바깥을 누르면 닫힘', !(await p.$('.nav-pop')));
  await T.done(o);

  // 2) PC: 마우스 메뉴 · 창 · 검색칸
  o = await T.open(); p = o.page;
  await p.hover('.nav-grp'); await p.waitForTimeout(300); var h1 = !!(await p.$('.nav-pop'));
  await p.mouse.move(700, 600); await p.waitForTimeout(600);
  ok('마우스: 올리면 열리고 벗어나면 닫힘', h1 && !(await p.$('.nav-pop')));
  await T.dispatch(p, '2026-11-16', '쿠팡부자재');
  await api(p, 'dispatch.ratesSave', { cust: '쿠팡부자재', mode: 'add', rows: [{ from: '부산', to: '창원', ton: '5톤', price: 100000 }, { from: '부산', to: '김해', ton: '5톤', price: 90000 }, { from: '평택', to: '이천', ton: '5톤', price: 80000 }] });
  await api(p, 'dest.save', { cust: '쿠팡부자재', dest: { code: 'CW1', name: '창원1FC', addr: '가상도 창원시 1' } });
  await p.reload(); await p.waitForTimeout(800); await T.dispatch(p, '2026-11-16', '쿠팡부자재');
  await p.click('#dpRates'); await p.waitForSelector('#drQ');
  var b = await (await p.$('#drQ')).boundingBox();
  await p.mouse.move(b.x + 5, b.y + 5); await p.mouse.down(); await p.mouse.move(5, 5, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(300);
  ok('창: 칸 안에서 끌다 창 밖에서 떼도 안 닫힘', !!(await p.$('.modal')));
  var cdp = await o.ctx.newCDPSession(p); await p.click('#drQ');
  await typeKo(p, cdp, [['ㅊ', '차', '창'], ['ㅇ', '우', '워', '원']]);
  var v = await p.$eval('#drQ', function (e) { return e.value; }), rows = await p.$$eval('.std-tb tbody tr', function (l) { return l.map(function (x) { return x.innerText.replace(/\s+/g, ' '); }); });
  ok('단가표 검색칸: 한글이 끊기지 않고 "창원" · 목록도 바로 줄어듦', v === '창원' && rows.length === 1 && /창원/.test(rows[0]), [v, rows]);
  await cdp.send('Input.insertText', { text: '원' }); await p.click('#drNew'); await p.waitForTimeout(300);
  ok('검색 뒤에도 버튼 동작', !!(await p.$('[data-rf="from"]')));
  await p.mouse.click(5, 5); await p.waitForTimeout(300);
  ok('창: 바깥을 누르면 닫힘', !(await p.$('.modal')));
  await p.click('#dpDests'); await p.waitForSelector('#dbQ'); await p.click('#dbQ');
  await typeKo(p, cdp, [['ㅊ', '차', '창'], ['ㅇ', '우', '워', '원']]);
  ok('하차지 주소록 검색칸도 "창원"', (await p.$eval('#dbQ', function (e) { return e.value; })) === '창원');
  await T.done(o);
});
