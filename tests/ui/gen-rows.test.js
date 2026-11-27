// 일반업체 기록(023) 화면(데모): 업체·자료 메뉴 · 조회·찾기 · 금액은 분석 권한(관리자)만 · 금액 합계 · 관리자 시트 연결 키(한 번만 보임) · 권한 없는 직원은 금액 칸 없음 (가짜 데이터)
var T = require('../lib/browser.js'), ok = T.ok, api = T.api;
T.run(async function () {
  var o = await T.open(), p = o.page;
  await p.evaluate(function () { location.hash = '#/gen'; }); await p.waitForSelector('#gnBody table', { timeout: 10000 });
  var head = await T.text(p, '#gnBody thead'), info = await T.text(p, '#gnInfo');
  ok('관리자: 표에 배차금액 칸 · 3건 · 합계', /배차금액/.test(head) && /3건/.test(info) && /배차금액 합계 230,000원/.test(info) && /마지막으로 받은 때/.test(info), [head, info]);
  ok('메뉴: 업체·자료 아래 일반업체 기록', /일반업체 기록/.test(await T.text(p, '.nav')));
  await p.fill('#gnQ', '구미'); await p.press('#gnQ', 'Enter'); await p.waitForTimeout(500);
  ok('찾기', /1건/.test(await T.text(p, '#gnInfo')) && /구미/.test(await T.text(p, '#gnBody')));
  await p.click('#gnKey'); await p.waitForSelector('#gkNew');
  ok('시트 연결 키: 처음엔 안 보임', /한 번만/.test(await T.text(p, '#gkKey')));
  await p.click('#gkNew'); await p.waitForFunction(function () { return /^demo/.test(document.querySelector('#gkKey').textContent); }, null, { timeout: 5000 });
  ok('새로 만들면 키가 보임', true);
  await p.click('.modal [data-close]');
  var mk = await api(p, 'admin.createUser', { id: 'gen01', name: '일반직원', role: 'user', perms: ['quote'] });
  await p.evaluate(function () { var s = JSON.parse(localStorage.getItem('joil-demo')); s.users.forEach(function (u) { if (u.id === 'gen01') { u.pw = 'pw1234'; u.mustChange = false; } }); localStorage.setItem('joil-demo', JSON.stringify(s)); });
  await T.relog(p, 'gen01', 'pw1234'); await p.waitForTimeout(500);
  var r = await api(p, 'gen.search', { from: '2020-01-01', to: '2030-12-31' });
  ok('견적 권한 직원: 조회는 되고 금액은 서버가 지움', !mk.error && r.rows.length === 3 && r.rows.every(function (x) { return !('amount' in x); }) && !r.money, r);
  await p.evaluate(function () { location.hash = '#/gen'; }); await p.waitForSelector('#gnBody table', { timeout: 10000 });
  ok('직원 화면: 금액 칸·합계·키 버튼 없음', !/배차금액/.test(await T.text(p, '#gnBody thead')) && !/합계/.test(await T.text(p, '#gnInfo')) && !(await p.$('#gnKey')));
  ok('직원: 키 만들기 거절', !!(await api(p, 'gen.key', {})).error);
  await T.done(o);
});
