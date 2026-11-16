// 오더 붙여넣기: 같은 줄 여러 개 · 차량정보 칸의 안내 문구 → 공지 · 문자에 짧은 공지
var T = require('../lib/browser.js'), ok = T.ok, api = T.api, DATE = '2026-11-11';
T.run(async function () {
  var o = await T.open(), p = o.page;
  await T.dispatch(p, DATE, '쿠팡부자재');
  var a = T.orderRow(DATE, 1, '센터A', '', 5), b = T.orderRow(DATE, 2, '센터B', '', 3);
  var info = await T.paste(p, [a, a, a, b].join('\n'));
  var d = await api(p, 'dispatch.day', { cust: '쿠팡부자재', date: DATE });
  ok('같은 줄 3개도 각각 들어감', /4줄/.test(info) && d.orders.length === 4, [info, d.orders.length]);
  await T.paste(p, [a, b].join('\n')); d = await api(p, 'dispatch.day', { cust: '쿠팡부자재', date: DATE });
  ok('다시 붙여넣으면 건너뜀', d.orders.length === 4, d.orders.length);
  await T.paste(p, [a, a, a, a].join('\n')); d = await api(p, 'dispatch.day', { cust: '쿠팡부자재', date: DATE });
  ok('늘어난 한 줄만 추가', d.orders.length === 5, d.orders.length);

  // 운전원 칸(13번째)에 안내 문구 · 입차시간 칸(15번째)의 시간은 그대로
  var n1 = T.orderRow(DATE, 11, '공지센터', '', 10, { 12: '13시이후 배차부탁드립니다.' });
  var n2 = T.orderRow(DATE, 12, '이름센터', '', 4, { 12: '홍길동', 14: '오후 2시' });
  var n3 = T.orderRow(DATE, 13, '하차센터', '', 2, { 12: '14시 이후 하차 가능합니다' });
  info = await T.paste(p, [n1, n2, n3].join('\n')); await p.waitForTimeout(1500);
  ok('미리보기에 안내 문구 2건', /안내 문구 2건/.test(info), info);
  d = await api(p, 'dispatch.day', { cust: '쿠팡부자재', date: DATE });
  var by = function (fc) { return d.orders.filter(function (x) { return x.d.fc === fc; })[0]; }, x1 = by('공지센터'), x2 = by('이름센터'), x3 = by('하차센터');
  ok('상차 시간 안내: 칸 비우고 내부 공지(원문)·기사 공지(짧게)', x1.d.driver === '' && x1.noteIn === '13시이후 배차부탁드립니다.' && x1.noteDrv === '13시 이후 상차가능', [x1.d.driver, x1.noteIn, x1.noteDrv]);
  ok('기사 이름·입차시간은 그대로', x2.d.driver === '홍길동' && x2.d.time === '오후 2시' && !x2.noteIn, [x2.d.driver, x2.d.time, x2.noteIn]);
  ok('하차 시간 안내는 상차로 바꾸지 않고 원문 그대로', x3.noteDrv === '14시 이후 하차 가능합니다', x3.noteDrv);

  // 한 호차로 묶어 문자 보기
  await api(p, 'dispatch.save', { cust: '쿠팡부자재', date: DATE, orders: [{ id: x2.id, truck: 1, seq: 1 }, { id: x1.id, truck: 1, seq: 2 }], trucks: [{ no: 1 }] });
  await T.dispatch(p, '2026-11-12', '쿠팡부자재'); await T.dispatch(p, DATE, '쿠팡부자재'); await p.waitForTimeout(1500);
  await p.evaluate(function () { document.querySelector('[data-preview="부자재-인천|1"]').click(); }); await p.waitForSelector('.dp-msg');
  var msg = await p.$eval('.dp-msg', function (e) { return e.textContent; });
  ok('문자에 짧은 공지 한 줄 (하차지 이름 없이)', /\n⚠️ 13시 이후 상차가능\n/.test(msg) && (msg.match(/⚠️/g) || []).length === 1, msg.split('\n').slice(0, 5));
  await T.done(o);
});
