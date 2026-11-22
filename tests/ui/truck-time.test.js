// 호차 칸: '3호차'만 + 작은 글씨 걸리는 시간(긴급 알림과 같은 계산 dispatch.times) · 저장된 길은 바로, 처음 가는 길은 [⏱ 시간 계산하기] 때만 · 마감 코드 복사는 ⋯ 메뉴 · 협력사도 보기만 (데모 모드)
var T = require('../lib/browser.js'), ok = T.ok, api = T.api, K = '쿠팡부자재/평택', DATE = '2026-12-03';
T.run(async function () {
  var o = await T.open(), p = o.page;
  await api(p, 'loading.save', { place: { name: '시간상차', addr: '가상시 상차로 1', time: '08:00~17:00' } });
  // 1호차: 하차지 2곳(주소 다름) · 2호차: 하차지 1곳
  await api(p, 'dispatch.import', { cust: K, rows: [
    { date: DATE, key: 'tt1', d: { fc: '시간센터1', bundle: '2', kg: '200', date: DATE, from: '시간상차', addr: '가상시 가상로 1', hours: '09:00~14:00' } },
    { date: DATE, key: 'tt2', d: { fc: '시간센터2', bundle: '2', kg: '200', date: DATE, from: '시간상차', addr: '가상시 가상로 2', hours: '09:00~16:00' } },
    { date: DATE, key: 'tt3', d: { fc: '시간센터3', bundle: '2', kg: '200', date: DATE, from: '시간상차', addr: '가상시 가상로 3', hours: '' } }] });
  var d = await api(p, 'dispatch.day', { cust: K, date: DATE }), id = function (k) { return d.orders.filter(function (x) { return x.key === k; })[0].id; };
  await api(p, 'dispatch.save', { cust: K, date: DATE, orders: [{ id: id('tt1'), truck: 1, seq: 1 }, { id: id('tt2'), truck: 1, seq: 2 }, { id: id('tt3'), truck: 2, seq: 3 }], trucks: [{ no: 1, car: '' }, { no: 2, car: '' }] });
  // 화면을 열 때는 조회 안 함 → 아직 아무 길도 저장 안 됐으니 '시간 모름'
  var r0 = await api(p, 'dispatch.times', { keys: [K], date: DATE });
  ok('열 때는 카카오 조회 없음 (저장된 길만)', r0.fetched === 0 && r0.times.length === 2 && r0.times.every(function (x) { return x.min == null; }), r0);
  await p.reload(); await p.waitForTimeout(800); await T.dispatch(p, DATE, '쿠팡부자재'); await T.tab(p, '부자재-평택'); await p.waitForTimeout(2500);
  var cell = await T.text(p, '.dp-tt tbody .tt-no');
  ok('호차 칸: 탭 이름·마감 코드·인수증 글자는 숨김', /1호차/.test(cell) && !/부자재-평택/.test(cell) && !/2026-12-03/.test(cell) && !/인수증/.test(cell), cell);
  ok('처음 가는 길은 시간 모름', /시간 모름/.test(cell), cell);
  var tip = await p.$eval('.dp-tt tbody .tt-no', function (x) { return x.title; });
  ok('마우스 올리면 탭·마감 코드·인수증', /부자재-평택/.test(tip) && /마감 코드 2026-12-03/.test(tip) && /인수증 0\/2/.test(tip), tip);
  ok('⋯ 메뉴에 마감 코드 복사', !!(await p.$('.dp-tt tbody .tt-hide [data-code]')));
  // 버튼 → 처음 가는 길 조회(데모 = 구간마다 72분) · 1호차 = 72 + 30 + 72 = 174분 = 2시간 54분 · 경유 1 · 출발 마감 = 14시 − 72분 = 12:48
  await p.click('#dpTimes'); await p.waitForTimeout(1200);
  cell = await T.text(p, '.dp-tt tbody .tt-no');
  ok('버튼 → 이동 시간 · 경유 · 출발 마감', /이동 2시간 54분 · 경유 1/.test(cell) && /12:48 전 출발/.test(cell), cell);
  var c2 = await p.$$eval('.dp-tt tbody .tt-no', function (l) { return l[1] ? l[1].textContent : ''; });
  ok('하차시간 없는 호차: 이동 시간 + 상차 마감', /이동 1시간 12분/.test(c2) && !/경유/.test(c2) && /상차 17시까지/.test(c2), c2);
  ok('토스트', /걸리는 시간을 계산했어요 \(2대 · 새 길 3개\)/.test(await T.text(p, 'body')));
  var r1 = await api(p, 'dispatch.times', { keys: [K], date: DATE });
  ok('한 번 찾은 길은 저장 → 다음엔 조회 없이 바로', r1.fetched === 0 && r1.times.every(function (x) { return x.min != null; }), r1);
  ok('화면 오류 없음', !p.errs.length, p.errs);
  // 협력사: 보기만 (fetch 를 보내도 조회 안 함) · 버튼 없음
  var u = await api(p, 'admin.createUser', { id: 'ptt', name: '협력시간', role: 'partner', dispTabs: [K] });
  await T.relog(p, 'ptt', u.tempPassword); await p.waitForTimeout(600); await T.dispatch(p, DATE, '쿠팡부자재').catch(function () {}); await p.waitForTimeout(2500);
  cell = await T.text(p, '.dp-tt tbody .tt-no');
  ok('협력사: 시간 보임 · 계산 버튼 없음', /이동 2시간 54분/.test(cell) && !(await p.$('#dpTimes')), cell);
  ok('협력사 화면 오류 없음', !p.errs.length, p.errs);
  await T.done(o);
});
