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
    ['adm', 'admin.saveCompanies', { companies: { '조일물류': { name: '조일', ceo: '대표', stamp: 'data:image/png;base64,AAAA' } } }],
    ['adm', 'cal.eventSave', { event: { start: '2026-11-23', end: '2026-11-24', title: '회의', memo: 'm' } }], ['stf', 'cal.eventSave', { event: { start: '2026-11-25', title: '내 일정', private: true } }],
    ['adm', 'cal.taskSave', { task: { title: '마감', rule: { type: 'monthEnd' }, assignee: '관리' } }],
    ['adm', 'cal.leaveSave', { leave: { userId: 's', kind: '연차', start: '2026-11-26', end: '2026-11-27' } }], ['stf', 'cal.leaveSave', { leave: { kind: '야간근무', start: '2026-11-20', from: '18:00', to: '22:00', hours: 4 } }],
    ['adm', 'cal.grantsSave', { year: '2026', grants: { a: 15, s: 12 } }]
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
    ['adm', 'staff.save', function (c) { var f = function (l) { var k = pick(l.staff, function (x) { return x.name === '김직원'; }); return { staff: [{ id: k.id, name: '김직원', biz: '명일로지스', dept: '영업', email: 'a@b.cd', weekly: true, team: '1팀' }, { name: '최신입', memo: '새로' }] }; }; return [f(c.last.a), f(c.last.b)]; }, '고치기·추가'],
    // 일정
    ['stf', 'cal.all', {}, '직원(남의 비공개 안 보임)'], ['adm', 'cal.all'], ['nq', 'cal.all', {}, '견적 권한 없어도 됨'], ['ptn', 'cal.all', {}, '협력사 막힘'],
    ['stf', 'cal.eventSave', { event: { start: '2026-11-30', end: '2026-11-29', title: 'x' } }, '기간 거꾸로'], ['stf', 'cal.eventSave', { event: { start: '2026-11-30' } }, '제목 없음'],
    ['stf', 'cal.eventSave', { event: { start: '2026-12-01', title: '출장', memo: '부산' } }],
    ['stf', 'cal.eventSave', function (c) { var f = function (l) { return { id: pick(l.events, function (x) { return x.title === '회의'; }).id, event: { start: '2026-11-23', title: '회의 고침' } }; }; return [f(c.last.a), f(c.last.b)]; }, '남의 일정 고치기 막힘'],
    ['adm', 'cal.eventSave', function (c) { var f = function (l) { return { id: pick(l.events, function (x) { return x.title === '출장'; }).id, event: { start: '2026-12-02', end: '2026-12-03', title: '출장(변경)' } }; }; return [f(c.last.a), f(c.last.b)]; }, '관리자는 고침'],
    ['stf', 'cal.eventDelete', function (c) { var f = function (l) { return { id: pick(l.events, function (x) { return x.title === '출장(변경)'; }).id }; }; return [f(c.last.a), f(c.last.b)]; }],
    ['stf', 'cal.taskSave', { task: { title: '청구서', rule: { type: 'monthDay', day: 25 }, adjust: 'next', start: '2026-11-01' } }],
    ['stf', 'cal.taskSave', { task: { title: 'x', rule: { type: 'monthDay', day: 40 } } }, '규칙 틀림'], ['stf', 'cal.taskSave', { task: { title: 'w', rule: { type: 'weekly', dow: 2 }, start: '2026-11-02' } }],
    ['stf', 'cal.taskDone', function (c) { var f = function (l) { return { id: pick(l.tasks, function (x) { return x.title === '청구서'; }).id, date: '2026-11-25', memo: '완료' }; }; return [f(c.last.a), f(c.last.b)]; }],
    ['stf', 'cal.taskDone', function (c) { var f = function (l) { return { id: pick(l.tasks, function (x) { return x.title === '청구서'; }).id, date: '2026-11-25', undo: true }; }; return [f(c.last.a), f(c.last.b)]; }, '체크 해제'],
    ['stf', 'cal.taskDelete', function (c) { var f = function (l) { return { id: pick(l.tasks, function (x) { return x.title === 'w'; }).id }; }; return [f(c.last.a), f(c.last.b)]; }],
    ['stf', 'cal.leaveSave', { leave: { userId: 'a', kind: '연차', start: '2026-12-10' } }, '남의 휴가 막힘'], ['stf', 'cal.leaveSave', { leave: { kind: '오전반차', start: '2026-12-11', end: '2026-12-12' } }, '반차 별칭'],
    ['stf', 'cal.leaveSave', { leave: { kind: '없는종류', start: '2026-12-11' } }, '종류 틀림'],
    ['adm', 'cal.leaveSave', function (c) { var f = function (l) { return { id: pick(l.leaves, function (x) { return x.kind === '야간근무'; }).id, leave: { userId: 's', kind: '휴일근무', start: '2026-11-21', from: '9:00', to: '18:00', hours: 8 } }; }; return [f(c.last.a), f(c.last.b)]; }, '관리자 고침'],
    ['stf', 'cal.leaveDelete', function (c) { var f = function (l) { return { id: pick(l.leaves, function (x) { return x.kind === '오전 반차'; }).id }; }; return [f(c.last.a), f(c.last.b)]; }],
    ['adm', 'cal.grantsSave', { year: '2026', grants: { s: 13, x: 10, nope: 5 } }], ['adm', 'cal.grantsSave', { year: '26' }, '연도 틀림'], ['stf', 'cal.grantsSave', { year: '2026' }, '관리자만'],
    ['adm', 'cal.dutyRuleSave', { rule: { name: '주말 당직', members: ['관리', '직원'], start: '2026-11-18', mode: 'week', hours: 8 } }],
    ['adm', 'cal.dutyRuleSave', { rule: { name: 'x', members: ['없는사람'], start: '2026-11-18' } }, '없는 사람'],
    ['stf', 'cal.dutyOverride', function (c) { var f = function (l) { return { ruleId: l.dutyRules[0].id, week: '2026-11-25', userId: 'a', hours: 4, memo: '바꿈' }; }; return [f(c.last.a), f(c.last.b)]; }, '순번에 있는 직원'],
    ['stf', 'cal.dutyOverride', function (c) { var f = function (l) { return { ruleId: l.dutyRules[0].id, week: '2026-11-26', cancel: true }; }; return [f(c.last.a), f(c.last.b)]; }, '같은 주 다시 (취소)'],
    ['nq', 'cal.dutyOverride', function (c) { var f = function (l) { return { ruleId: l.dutyRules[0].id, week: '2026-11-26', clear: true }; }; return [f(c.last.a), f(c.last.b)]; }, '순번 밖 막힘'],
    ['adm', 'cal.dutyRuleDelete', function (c) { var f = function (l) { return { id: l.dutyRules[0].id }; }; return [f(c.last.a), f(c.last.b)]; }],
    ['adm', 'cal.companyHolidays', { list: [{ date: '2026-12-31', name: '종무식' }, { date: '2027-01-02' }] }], ['adm', 'cal.companyHolidays', { list: [{ date: '12/31' }] }, '날짜 틀림'],
    ['adm', 'cal.import', { leaves: [{ name: '김직원', kind: '연차', start: '2026-12-21' }, { name: '새사람', kind: '병가', start: '2026-12-22' }, { name: '김직원', kind: '연차', start: '2026-12-21' }], events: [{ title: '송년회', start: '2026-12-26' }, { title: '' }], grants: [{ year: '2027', name: '새사람', days: 11 }] }, '가져오기'],
    ['adm', 'cal.import', { leaves: [{ name: '', kind: '연차', start: '2026-12-21' }] }, '이름 없음'],
    ['adm', 'cal.all', {}, '마지막']
  ]
};
