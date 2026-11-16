// 차도리 엑셀 줄 만들기(chadoriRows): 매출은 착지마다, 매입은 호차 첫 줄에만 통째로
// (엑셀 라이브러리는 테스트 환경에서 막혀 있어서 줄을 만드는 함수만 app.js에서 꺼내 확인해요)
var fs = require('fs'), path = require('path'), ok = require('../lib/mock.js').ok;
var src = fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'app.js'), 'utf8');
var CHA_HEAD, truckStops = function (D) { return D.orders.map(function (o) { return { fc: o.fc, b: o.b, d: { from: '출발' } }; }); };
eval(src.match(/var CHA_HEAD = \[[\s\S]*?\];/)[0].replace('var CHA_HEAD', 'CHA_HEAD')); eval(src.match(/function chadoriRows\(rows, MT, codes, price\) \{[\s\S]*?\n  \}/)[0]);
var C = function (n) { return CHA_HEAD.indexOf(n); }, MT = [['부자재-인천', ''], ['부자재-평택', '/평택']], codes = { sale: 'S1', buy: { '': 'B1', '/평택': 'B2' }, jo: 'J1' };
var rows = [
  { tab: '부자재-인천', date: '2026-10-01', no: 1, t: { car: '11가', driver: '기사', phone: '010', ton: '5톤', status: '정보넘김' }, os: [{ fc: 'A', b: 5 }, { fc: 'B', b: 3 }, { fc: 'C', b: 2 }], amt: 200000, rv: null },
  { tab: '부자재-평택', date: '2026-10-01', no: 2, t: { car: '22나', status: '조일배차' }, os: [{ fc: 'D', b: 4 }, { fc: 'E', b: 6 }], amt: 240000, rv: 220000 },
  { tab: '부자재-평택', date: '2026-10-02', no: 1, t: { car: '33다', status: '' }, os: [{ fc: 'F', b: 1 }], amt: null, rv: null }
];
var R = chadoriRows(rows, MT, codes, { v: 10000 }), x = R.rows, col = function (n) { return x.map(function (r) { return r[C(n)]; }); };
ok('착지마다 한 줄 (6줄)', x.length === 6, x.length);
ok('매입은 호차 첫 줄에만 통째로, 나머지 착지는 빈칸', JSON.stringify(col('매입후불')) === JSON.stringify([200000, '', '', 240000, '', '']), col('매입후불'));
ok('매출은 착지마다 번들 × 단가 · 직접 고친 매출은 번들 비율', JSON.stringify(col('매출후불')) === JSON.stringify([50000, 30000, 20000, 88000, 132000, 10000]), col('매출후불'));
ok('매입코드: 탭별 · 조일배차 호차는 조일배차 코드', JSON.stringify(col('매입코드')) === JSON.stringify(['B1', 'B1', 'B1', 'J1', 'J1', 'B2']), col('매입코드'));
ok('비고에 번들 · 중량에 톤수 숫자', x[0][C('비고')] === 5 && x[0][C('중량')] === 5 && x[0][C('매출코드')] === 'S1');
ok('운송비 없는 호차는 확인 목록에', R.warn.some(function (w) { return /운송비 없음/.test(w); }), R.warn);
