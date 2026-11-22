// sb-port.test.js 의 요청 목록: seed = 목에만 먼저 넣는 가짜 자료 (복사 전) · steps = 양쪽에 같은 순서로 보내 비교
// 요청 자리에 함수를 쓰면 바로 앞 응답(c.last.a = 목, c.last.b = 새 서버)에서 ID 를 골라 [목 요청, 새 서버 요청] 으로 보낼 수 있어요.
var pick = function (list, f) { return list.filter(f)[0] || {}; };
module.exports = {
  seed: [
    ['adm', 'custs.save', { cust: { name: '가나상사', aliases: '가나, GANA', biz: '조일물류', start: '2026-01-01', end: '2026-12-31', memo: '메모' } }],
    ['adm', 'custs.save', { cust: { name: '다라물산', owner: '김' } }],
    ['adm', 'manual.save', { manual: { title: '반품 처리', cust: '가나상사', cat: '반품', steps: '1. 확인', memo: 'm' } }], ['adm', 'manual.save', { manual: { title: '공통 안내' } }],
    ['adm', 'notes.save', { note: { cust: '가나상사', month: '2026-04', kind: '유가연동', change: '+2.2%', memo: '유가' } }],
    ['adm', 'staff.save', { staff: [{ name: '김직원', biz: '조일물류', dept: '운영부', email: 'a@b.cd', weekly: true }, { name: '이직원', active: false }] }],
    ['adm', 'admin.saveCompanies', { companies: { '조일물류': { name: '조일', ceo: '대표', stamp: 'data:image/png;base64,AAAA' } } }]
  ],
  steps: [
    // 거래처
    ['stf', 'custs.list'], ['nq', 'custs.list', {}, '견적 권한 없음'], ['ptn', 'custs.list', {}, '협력사'],
    ['stf', 'custs.save', { cust: { name: '마바', start: '2026-02-30x' } }, '날짜 틀림'],
    ['stf', 'custs.save', { cust: { name: '마바', start: '2026-05-01', end: '2026-04-01' } }, '기간 거꾸로'],
    ['stf', 'custs.save', { cust: { name: '가나상사' } }, '같은 이름'],
    ['stf', 'custs.save', { cust: { name: '마바상회', aliases: ['마바', ' MB '], biz: '없는회사', phone: '010-0000-0000', start: '2026-03-01' } }],
    ['stf', 'custs.save', function (c) { return [{ id: pick(c.last.a.custs, function (x) { return x.name === '가나상사'; }).id, cust: { name: '가나상사', memo: '고침', payment: '월말' } }, { id: pick(c.last.b.custs, function (x) { return x.name === '가나상사'; }).id, cust: { name: '가나상사', memo: '고침', payment: '월말' } }]; }, '고치기'],
    ['stf', 'custs.save', { id: 'Knope', cust: { name: '없음' } }, '없는 거래처'],
    ['stf', 'custs.delete', function (c) { return [{ id: pick(c.last.a.custs, function (x) { return x.name === '다라물산'; }).id }, { id: pick(c.last.b.custs, function (x) { return x.name === '다라물산'; }).id }]; }, '지우기'],
    ['adm', 'custs.list', {}, '마지막'],
    // 매뉴얼
    ['stf', 'manual.list'], ['nq', 'manual.list', {}, '권한 없음'], ['stf', 'manual.save', { manual: { title: '' } }, '제목 없음'],
    ['stf', 'manual.save', { manual: { title: '입고 안내', cust: '다라물산', steps: 'a', issues: 'b' } }],
    ['stf', 'manual.save', function (c) { var f = function (l) { return { id: pick(l.manuals, function (x) { return x.title === '반품 처리'; }).id, manual: { title: '반품 처리', cust: '가나상사', cat: '반품', steps: '1. 확인\n2. 회수', memo: 'm' } }; }; return [f(c.last.a), f(c.last.b)]; }, '고치기 (이력)'],
    ['stf', 'manual.save', { id: 'Mnope', manual: { title: 'x' } }, '없는 것'],
    ['stf', 'manual.delete', function (c) { var f = function (l) { return { id: pick(l.manuals, function (x) { return x.title === '공통 안내'; }).id }; }; return [f(c.last.a), f(c.last.b)]; }, '지우기'],
    ['stf', 'manual.file', { fileId: 'nope' }, '없는 파일'],
    // 단가 변경 기록 (분석 권한)
    ['adm', 'notes.list'], ['stf', 'notes.list', {}, '분석 권한 없음'],
    ['adm', 'notes.save', { note: { cust: '다라물산', month: '2026-05', change: '-3%', target: '매입', basis: '메일' } }],
    ['adm', 'notes.save', { note: { cust: '', month: '2026-05' } }, '매출처 없음'], ['adm', 'notes.save', { note: { cust: 'x', month: '5월' } }, '월 틀림'],
    ['adm', 'notes.save', function (c) { var f = function (l) { return { id: pick(l.notes, function (x) { return x.cust === '가나상사'; }).id, note: { cust: '가나상사', month: '2026-04', change: '+3%', memo: '고침' } }; }; return [f(c.last.a), f(c.last.b)]; }, '고치기'],
    ['adm', 'notes.import', { rows: [{ cust: 'A', month: '2026-06', memo: '1' }, { cust: 'B', month: '2026-07', change: '+1%' }] }],
    ['adm', 'notes.import', { rows: [{ cust: 'A', month: '2026-06', memo: '1' }, { cust: '', month: '2026-07' }] }, '두 번째 줄 오류'],
    ['adm', 'notes.delete', function (c) { var f = function (l) { return { id: pick(l.notes, function (x) { return x.cust === 'B'; }).id }; }; return [f(c.last.a), f(c.last.b)]; }],
    // 주소 · 회사 · 직원
    ['stf', 'addr.list'], ['stf', 'companies'], ['stf', 'admin.saveCompanies', { companies: {} }, '관리자만'],
    ['adm', 'admin.saveCompanies', { companies: { '명일로지스': { name: '명일', stamp: 'data:image/png;base64,BBBB' } } }],
    ['adm', 'admin.saveCompanies', { companies: { '조일물류': { stamp: 'http://x' } } }, '직인 형식'],
    ['adm', 'staff.list'], ['stf', 'staff.list', {}, '관리자만'],
    ['adm', 'staff.save', { staff: [{ name: '김직원' }, { name: '김직원' }] }, '같은 이름'], ['adm', 'staff.save', { staff: [{ name: '박', email: 'x' }] }, '메일 틀림'],
    ['adm', 'staff.save', function (c) { var f = function (l) { var k = pick(l.staff, function (x) { return x.name === '김직원'; }); return { staff: [{ id: k.id, name: '김직원', biz: '명일로지스', dept: '영업', email: 'a@b.cd', weekly: true, team: '1팀' }, { name: '최신입', memo: '새로' }] }; }; return [f(c.last.a), f(c.last.b)]; }, '고치기·추가']
  ]
};
