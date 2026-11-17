// 달력: 칩을 날짜로 끌어다 놓기 · 기록을 다른 날로 끌어 옮기기 · 눌러서 고치기 · 칩 누르고 날짜 누르기 · 쉬는 날 막기
var T = require('../lib/browser.js'), ok = T.ok, api = T.api;
async function center(p, sel) { var b = await (await p.waitForSelector(sel)).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
async function drag(p, from, to) {
  var a = await center(p, from), b = await center(p, to);
  await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(a.x + 10, a.y + 10, { steps: 3 }); await p.mouse.move(b.x, b.y, { steps: 8 });
  var mid = await p.evaluate(function () { return { ghost: !!document.querySelector('.cal-ghost'), drop: [].map.call(document.querySelectorAll('.cal-cell.cdrop'), function (x) { return x.dataset.d; }) }; });
  await p.mouse.up(); await p.waitForTimeout(700); return mid;
}
T.run(async function () {
  var o = await T.open(), p = o.page;
  await p.evaluate(function () { location.hash = '#/cal'; }); await p.waitForSelector('.cal-pal', { timeout: 10000 });
  // 이번 달의 평일(쉬는 날 아님) 셋과 일요일 하나
  var days = await p.$$eval('.cal-cell:not(.out)', function (l) { return { wk: l.filter(function (x) { return !/sun|sat/.test(x.className); }).map(function (x) { return x.dataset.d; }), sun: l.filter(function (x) { return /sun/.test(x.className); })[0].dataset.d }; });
  var d1 = days.wk[3], d2 = days.wk[6], d3 = days.wk[8], cell = function (d) { return '.cal-cell[data-d="' + d + '"]'; };
  var leaves = async function () { return (await api(p, 'cal.all', {})).leaves; }, n0 = (await leaves()).length;
  ok('칩 모음: 연차·반차·근무·당직·일정', (await p.$$eval('.cal-chip b', function (l) { return l.map(function (x) { return x.innerText; }).join(','); })) === '연차,오전 반차,오후 반차,야간근무,휴일근무,당직,일정 · 공지');

  var mid = await drag(p, '.cal-chip[data-chip="오후 반차"]', cell(d1));
  ok('끄는 동안: 따라오는 그림자 · 놓을 날짜 강조', mid.ghost && mid.drop.length === 1 && mid.drop[0] === d1, mid);
  var l = await leaves(), mine = l.filter(function (x) { return x.kind === '오후 반차' && x.start === d1; });
  ok('오후 반차를 날짜에 놓으면 그 날짜에 저장', l.length === n0 + 1 && mine.length === 1, l.slice(-2));
  ok('달력에 바로 표시', /오후 반차/.test(await T.text(p, '.cal-bar.mv')), await T.text(p, '.cal-weeks'));

  mid = await drag(p, '.cal-bar.mv', cell(d2));
  l = await leaves();
  ok('기록을 다른 날로 끌면 날짜가 바뀜', l.length === n0 + 1 && l.some(function (x) { return x.kind === '오후 반차' && x.start === d2 && x.end === d2; }) && mid.drop[0] === d2, l.slice(-1));

  await drag(p, '.cal-chip[data-chip="연차"]', cell(days.sun));
  ok('쉬는 날에는 연차를 못 넣음', (await leaves()).length === n0 + 1);

  await p.click('.cal-bar.mv'); await p.waitForSelector('#lvSave', { timeout: 5000 });
  ok('기록을 누르면 수정 창 (삭제 버튼)', !!(await p.$('#lvDel'))); await p.click('.modal [data-close]'); await p.waitForTimeout(300);

  await p.click('.cal-chip[data-chip="당직"]'); ok('칩을 누르면 고른 상태', !!(await p.$('.cal-chip.armed')) && !!(await p.$('.cal-grid2.arming')));
  await p.click(cell(d3), { position: { x: 8, y: 60 } }); await p.waitForTimeout(700);
  l = await leaves();
  ok('고른 뒤 날짜를 누르면 저장 · 고른 상태 풀림', l.some(function (x) { return x.kind === '당직' && x.start === d3; }) && !(await p.$('.cal-chip.armed')), l.slice(-1));

  await drag(p, '.cal-chip[data-chip="야간근무"]', cell(d3)); await p.waitForSelector('#cqF', { timeout: 5000 });
  await p.fill('#cqF', '18:00'); await p.fill('#cqT', '21:00'); await p.dispatchEvent('#cqT', 'change'); await p.click('#cqOk'); await p.waitForTimeout(700);
  l = await leaves();
  ok('야간근무: 시각을 묻고 시간 자동 계산', l.some(function (x) { return x.kind === '야간근무' && x.start === d3 && x.hours === 3; }), l.slice(-1));

  await drag(p, '.cal-chip[data-chip="event"]', cell(d1)); await p.waitForSelector('#cqT', { timeout: 5000 });
  await p.fill('#cqT', '테스트 공지'); await p.keyboard.press('Enter'); await p.waitForTimeout(700);
  var ev = (await api(p, 'cal.all', {})).events;
  ok('일정 · 공지: 제목을 묻고 저장', ev.some(function (x) { return x.title === '테스트 공지' && x.start === d1; }), ev.slice(-1));
  await p.click('#cmNext'); await p.waitForTimeout(400);
  ok('다음 달로 넘기기', !(await p.$(cell(d1) + ':not(.out)')) && !!(await p.$('.cal-weeks.slide-l')));
  await T.done(o);
});
