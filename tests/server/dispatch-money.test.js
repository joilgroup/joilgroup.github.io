// 배차 금액 칸(매출·실제 매입)·조일배차 상태·월별 단가·차도리 코드: 저장과 권한
var M = require('../lib/mock.js'), ok = M.ok, call = M.call, S = M.sheets, r;
var C = '쿠팡부자재/평택', D = '2026-10-01';
r = call('adm', 'dispatch.save', { cust: C, date: D, orders: [], trucks: [{ no: 1, car: '11가' }, { no: 2, car: '22나' }] });
var head = S['배차호차'].d[0];
ok('배차호차 헤더에 매출·매입 칸', head.indexOf('매출') !== -1 && head.indexOf('매입') === head.length - 1, head.join(','));
ok('처음엔 비어 있음', r.trucks.every(function (t) { return t.rev === null && t.cost === null; }));
var tk = r.trucks[0].token;
r = call('adm', 'dispatch.save', { cust: C, date: D, patch: 1, orders: [], drop: [], trucks: [{ token: tk, no: 1, set: { rev: '110,000' } }] });
ok('매출 패치', r.trucks[0].rev === 110000, r.error);
r = call('adm', 'dispatch.save', { cust: C, date: D, patch: 1, orders: [], drop: [], trucks: [{ token: '', no: 3, set: { car: '33다', status: '조일배차', cost: '240,000', wait: 30000 } }] });
var t3 = r.trucks.filter(function (t) { return t.no === 3; })[0];
ok('새 호차: 조일배차·실제 매입·대기료', t3 && t3.status === '조일배차' && t3.cost === 240000 && t3.wait === 30000, r.error || t3);
ok('줄 너비가 헤더와 같음', S['배차호차'].d.every(function (x) { return x.length === head.length; }));
r = call('stf', 'dispatch.day', { cust: C, date: D });
ok('분석 권한 없는 직원: 매출·매입 안 옴', r.trucks.every(function (t) { return !('cost' in t) && !('rev' in t); }));
call('stf', 'dispatch.save', { cust: C, date: D, patch: 1, orders: [], drop: [], trucks: [{ token: t3.token, no: 3, set: { cost: 1, rev: 1, car: '33다다' } }] });
r = call('adm', 'dispatch.day', { cust: C, date: D }); var x = r.trucks.filter(function (t) { return t.no === 3; })[0];
ok('직원 저장: 차량정보만 바뀌고 금액은 그대로', x.cost === 240000 && x.rev === null && x.car === '33다다', x);
r = call('ptn', 'dispatch.day', { cust: C, date: D });
ok('협력사: 매출·매입 안 옴 (운송비 칸은 옴)', r.trucks.every(function (t) { return !('cost' in t) && !('rev' in t) && 'wait' in t; }));
call('ptn', 'dispatch.save', { cust: C, date: D, orders: [], trucks: [{ no: 1, status: '조일배차', driver: '기사' }, { no: 3, status: '배차완료' }] });
r = call('adm', 'dispatch.day', { cust: C, date: D });
ok('협력사는 조일배차로 못 바꿈 · 금액 유지', r.trucks[0].status === '' && r.trucks[0].driver === '기사' && r.trucks[0].rev === 110000 && r.trucks.filter(function (t) { return t.no === 3; })[0].cost === 240000, r.trucks);
r = call('adm', 'dispatch.save', { cust: C, date: D, patch: 1, orders: [], drop: [], trucks: [{ token: t3.token, no: 3, set: { cost: '' } }] });
ok('실제 매입 지우기', r.trucks.filter(function (t) { return t.no === 3; })[0].cost === null);
// 협력사는 월별 기록 못 봄
ok('협력사 월별 조회 거절', !!call('ptn', 'dispatch.monthAll', { keys: [C], ym: '2026-10' }).error && !!call('ptn', 'dispatch.month', { cust: C, ym: '2026-10' }).error);
ok('협력사 날짜별은 됨', call('ptn', 'dispatch.day', { cust: C, date: D }).trucks.length === 3);
// 월별 번들 단가
r = call('adm', 'dispatch.priceSave', { cust: '쿠팡부자재', ym: '2026-10', price: '12,345' });
ok('단가 저장·읽기', r.prices['2026-10'] === 12345 && call('adm', 'dispatch.price', { cust: '쿠팡부자재' }).prices['2026-10'] === 12345, r.error);
ok('직원·협력사 단가 거절', !!call('stf', 'dispatch.price', { cust: '쿠팡부자재' }).error && !!call('ptn', 'dispatch.price', { cust: '쿠팡부자재' }).error);
ok('단가 지우기', !('2026-10' in call('adm', 'dispatch.priceSave', { cust: '쿠팡부자재', ym: '2026-10', price: '' }).prices));
// 차도리 거래처 코드
r = call('adm', 'dispatch.codesSave', { cust: '쿠팡부자재', codes: { sale: ' S1 ', buy: { '': 'B1', '/평택': 'B2' }, jo: 'J1' } });
ok('차도리 코드 저장·읽기', r.codes.sale === 'S1' && call('adm', 'dispatch.codes', { cust: '쿠팡부자재' }).codes.buy['/평택'] === 'B2', r.error);
ok('직원·협력사 코드 거절', !!call('stf', 'dispatch.codes', { cust: '쿠팡부자재' }).error && !!call('ptn', 'dispatch.codes', { cust: '쿠팡부자재' }).error);
