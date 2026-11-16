// 날짜 이동: 앞뒤 날짜 미리 받기 · 받아 둔 화면 먼저 · 뒤에서 최신으로 합치기 / 오더 날짜 변경: 화면 먼저 (서버 1.5초 지연)
var T = require('../lib/browser.js'), ok = T.ok, api = T.api, D1 = '2026-11-03', D2 = '2026-11-04', C = '쿠팡부자재';
function has(p, txt) { return p.evaluate(function (t) { return document.body.innerText.indexOf(t) !== -1; }, txt); }
function waitText(p, txt, gone) { return p.waitForFunction(function (a) { return (document.body.innerText.indexOf(a[0]) !== -1) !== a[1]; }, [txt, !!gone], { timeout: 8000 }); }
T.run(async function () {
  var o = await T.open(), p = o.page;
  await api(p, 'dispatch.import', { cust: C, rows: [{ date: D1, key: 'k1', d: { fc: '삼일센터', bundle: '3', date: D1, from: '테스트출발' } }, { date: D1, key: 'k2', d: { fc: '이동센터', bundle: '2', date: D1, from: '테스트출발' } }, { date: D2, key: 'k3', d: { fc: '사일센터', bundle: '4', date: D2, from: '테스트출발' } }] });
  await T.slow(p, 1500);
  await T.dispatch(p, D1, C); await waitText(p, '삼일센터'); await p.waitForTimeout(4000); // 앞뒤 날짜를 미리 받을 시간
  var t0 = Date.now(); await p.click('#dpNext'); await waitText(p, '사일센터');
  ok('다음 날로 이동: 1초 안 (서버는 1.5초)', Date.now() - t0 < 1000, Date.now() - t0);
  await p.waitForTimeout(3500);
  t0 = Date.now(); await p.click('#dpPrev'); await waitText(p, '삼일센터');
  ok('돌아오기: 1초 안', Date.now() - t0 < 1000, Date.now() - t0);
  // 다른 사람이 그사이 오더를 추가 → 뒤에서 받아 합쳐짐
  await p.click('#dpNext'); await p.waitForTimeout(400);
  await api(p, 'dispatch.import', { cust: C, rows: [{ date: D1, key: 'k9', d: { fc: '새로온센터', bundle: '1', date: D1, from: '테스트출발' } }] });
  await p.click('#dpPrev'); await waitText(p, '삼일센터'); await waitText(p, '새로온센터');
  ok('다른 사람이 넣은 오더도 뒤에서 합쳐짐', await has(p, '새로온센터'));
  // 오더 날짜 변경: 화면에서 바로 빠지고 서버는 뒤에서
  var d = await api(p, 'dispatch.day', { cust: C, date: D1 }), mv = d.orders.filter(function (x) { return x.d.fc === '이동센터'; })[0];
  await p.check('[data-sel="' + mv.id + '"]'); await p.click('#dpMove'); await p.waitForSelector('#mvDate'); await p.fill('#mvDate', D2);
  t0 = Date.now(); await p.click('#mvGo'); await waitText(p, '이동센터', true);
  ok('날짜 변경: 화면에서 바로 빠짐 (1초 안)', Date.now() - t0 < 1000, Date.now() - t0);
  await p.waitForTimeout(5000);
  var a = await api(p, 'dispatch.day', { cust: C, date: D1 }), b = await api(p, 'dispatch.day', { cust: C, date: D2 }), fc = function (x) { return x.d.fc; };
  ok('서버: 원래 날짜에서 빠지고 옮긴 날짜에 들어감', a.orders.map(fc).indexOf('이동센터') === -1 && b.orders.map(fc).indexOf('이동센터') !== -1 && a.orders.length === 2, [a.orders.map(fc), b.orders.map(fc)]);
  await p.click('#dpNext'); await waitText(p, '이동센터');
  ok('옮긴 날짜 화면에 보임', await has(p, '사일센터'));
  // 호차째로 옮기기: 차량정보가 따라가고 원래 날짜의 호차 줄이 '지운 호차'로 저장되지 않음
  var d2 = await api(p, 'dispatch.day', { cust: C, date: D2 }), sa = d2.orders.filter(function (x) { return x.d.fc === '사일센터'; })[0];
  await api(p, 'dispatch.save', { cust: C, date: D2, orders: [{ id: sa.id, truck: 1, seq: 1 }], trucks: [{ no: 1, car: '77가7777' }] });
  await p.click('#dpPrev'); await p.waitForTimeout(500); await p.click('#dpNext'); await p.waitForSelector('select[data-st]', { timeout: 10000 }); await p.waitForTimeout(2500);
  await p.check('[data-sel="' + sa.id + '"]'); await p.click('#dpMove'); await p.waitForSelector('#mvDate'); await p.fill('#mvDate', '2026-11-05'); await p.click('#mvGo'); await p.waitForTimeout(6500);
  var c = await api(p, 'dispatch.day', { cust: C, date: '2026-11-05' }), c4 = await api(p, 'dispatch.day', { cust: C, date: D2 });
  ok('호차째로 옮기면 차량정보 그대로', c.orders.length === 1 && c.orders[0].truck === 1 && c.trucks.some(function (t) { return t.car === '77가7777'; }), [c.orders.map(function (x) { return x.truck; }), c.trucks.map(function (t) { return t.car; })]);
  ok('원래 날짜에 그 호차 줄이 남지 않음', !c4.trucks.some(function (t) { return t.car === '77가7777'; }), c4.trucks);
  await T.done(o);
});
