// sb-port.test.js 의 요청 목록: seed = 목에만 먼저 넣는 가짜 자료 (복사 전) · steps = 양쪽에 같은 순서로 보내 비교
// 요청 자리에 함수를 쓰면 바로 앞 응답(c.last.a = 목, c.last.b = 새 서버)에서 ID 를 골라 [목 요청, 새 서버 요청] 으로 보낼 수 있어요.
var pick = function (list, f) { return list.filter(f)[0] || {}; };
// 견적 계산용: 타리프 + 주소·경로 캐시(가짜 좌표) → 카카오 호출 없이 계산
var GEO = { '테스트시 가동 1': [37.1, 127.1, '테스트시'], '시험도 나동 2': [36.2, 127.6, '시험도'], '서울 가상구 3': [37.5, 127.0, '서울'] };
function prep(M) {
  var ss = M.ctx.SpreadsheetApp.getActive(), t = M.ctx.joilDummyTariff(), ts = ss.insertSheet('타리프');
  ts.d.push(['km'].concat(t.tons)); t.rows.forEach(function (r, i) { ts.d.push([i + 1].concat(r)); });
  ss.insertSheet('조회기록').d.push(['일시', '아이디', '이름', '상차지', '하차지', '거리(km)', '비고', '기록ID', '종류', '건수']);
  var g = ss.insertSheet('주소캐시'), r = ss.insertSheet('경로캐시'), names = Object.keys(GEO);
  g.d.push(['주소(입력)', '위도', '경도', '시도', '찾은 주소', '저장일']); r.d.push(['경로키', '거리(km)', '통행료', '저장일']);
  names.forEach(function (n) { g.d.push([n, GEO[n][0], GEO[n][1], GEO[n][2], n + ' (찾음)', '2026-11-01 09:00:00']); });
  names.forEach(function (a, i) { names.forEach(function (b, j) { if (a === b) return; var k = GEO[a][1].toFixed(6) + ',' + GEO[a][0].toFixed(6) + '>' + GEO[b][1].toFixed(6) + ',' + GEO[b][0].toFixed(6) + '#3'; r.d.push([k, 80 + 37 * i + 11 * j, 5000 + 300 * j, '2026-11-01 09:00:00']); }); });
}
// 가짜 인터넷 (양쪽이 같은 걸 받게 · 시각은 한 번만 정함)
var PUB = new Date(Date.now() - 3600000).toUTCString(), OLD = new Date(Date.now() - 10 * 86400000).toUTCString();
function rss(kw) {
  var it = function (t, src, url, d) { return '<item><title><![CDATA[' + t + ' - ' + src + ']]></title><link>https://n.example/' + encodeURIComponent(t) + '</link><pubDate>' + d + '</pubDate><source url="' + url + '">' + src + '</source></item>'; };
  return '<rss><channel>' + it(kw + ' 관련 소식 &amp; 정리', '가상일보', 'https://ga.example.kr', PUB) + it('공통 기사 제목', 'Newsis', 'https://www.newsis.com', PUB) + it(kw + ' 교통사고 소식', '가상일보', 'https://ga.example.kr', PUB) +
    it('foreign title', 'Foreign Times', 'https://ft.example.com', PUB) + it(kw + ' 지난 소식', '나쁜신문', 'https://bad.example.kr', OLD) + it(kw + ' 차단 매체', '나쁜신문', 'https://bad.example.kr', PUB) + '</channel></rss>';
}
function net(url) {
  var j = function (o) { return { code: 200, text: JSON.stringify(o) }; }, m;
  if (/news\.google\.com/.test(url)) return { code: 200, text: rss(decodeURIComponent(/q=([^&]+)/.exec(url)[1]).replace(/"|\s*when:7d/g, '')) };
  if (/open-meteo/.test(url)) return j([1, 2, 3, 4, 5].map(function (i) { return { current: { temperature_2m: i, weather_code: 3, wind_speed_10m: 2 }, daily: { time: ['2026-11-22', '2026-11-23'], weather_code: [1, 61], temperature_2m_max: [9, 8], temperature_2m_min: [-1, i], precipitation_probability_max: [10, 80], precipitation_sum: [0, 3.5], snowfall_sum: [0, 0], wind_speed_10m_max: [5, 9] } }; }));
  if ((m = /realtime\/(domestic|worldstock)\/stock\/(.+)$/.exec(url))) { var c = decodeURIComponent(m[2]); if (c === '999999') return { code: 500, text: '' }; return j({ datas: [{ stockName: '가상' + c, closePrice: '71,200', compareToPreviousClosePrice: '300', compareToPreviousPrice: { name: 'FALLING' }, fluctuationsRatio: '0.42', currencyType: { code: 'USD' }, openPrice: '70,000', highPrice: '72,000', lowPrice: '69,000', accumulatedTradingVolume: '1,234', marketStatus: 'OPEN', localTradedAt: '2026-11-21T15:30:00+09:00' }] }); }
  if (/ac\.stock\.naver/.test(url)) return j({ items: [{ code: '005930', name: '가상전자', typeName: '코스피', nationCode: 'KOR' }, { code: 'AB', name: '이상코드', nationCode: 'KOR' }, { code: 'AAPL', reutersCode: 'AAPL.O', name: '가상애플', typeName: '나스닥', nationName: '미국', nationCode: 'USA' }] });
  if (/fchart/.test(url)) return { code: 200, text: '<item data="20261120|1|2|3|100|5" /><item data="20261121|1|2|3|101|5" />' };
  if (/api\.stock\.naver\.com\/chart/.test(url)) return j([{ localDate: '20261120', closePrice: '230.5' }, { localDate: '20261121', closePrice: '231' }]);
  if (/opinet/.test(url)) return j({ RESULT: { OIL: [{ DATE: '20261120', PRODCD: 'D047', PRICE: '1555.12' }, { DATE: '20261121', PRODCD: 'D047', PRICE: '1561.3' }, { DATE: '20261121', PRODCD: 'B027', PRICE: '1700' }] } });
  if (/dapi\.kakao\.com\/v2\/local\/search\/address/.test(url)) return j({ documents: [{ x: '126.97', y: '37.56', address_name: '가상 주소 찾음', address: { region_1depth_name: '서울' } }] });
  return { code: 404, text: '' };
}
// 분석 자료 (가짜 · 화면처럼 JSON → gzip → base64)
var gz = function (o) { return require('zlib').gzipSync(Buffer.from(JSON.stringify(o))).toString('base64'); };
var AN1 = [['2026-10-01', '가나', '테스트시', '시험도', '5톤', 120000, 90000], ['2026-10-02', '다라', '테스트시', '서울', '1톤', 50000, 41000]];
var seed = 7, rnd = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed; };
var AN2 = []; for (var i = 0; i < 1500; i++) AN2.push(['2026-09-' + String(1 + i % 28).padStart(2, '0'), '거래처' + (rnd() % 97), 'x' + rnd().toString(36), 'y' + rnd().toString(36), (1 + i % 5) + '톤', 1000 * (rnd() % 300), 1000 * (rnd() % 250)]);
var AN_BIG = gz(AN2);
var A = '테스트시 가동 1', B = '시험도 나동 2', C = '서울 가상구 3';
var rec = function (f) { return function (c) { return [f(c.last.a), f(c.last.b)]; }; };
module.exports = {
  prep: prep, net: net,
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
    ['adm', 'cal.grantsSave', { year: '2026', grants: { a: 15, s: 12 } }],
    ['adm', 'reqs.save', { req: { cust: '가나상사', title: '11월 견적 요청', body: '본문 내용', received: '2026-11-10', due: '2026-11-15', owner: '관리' } }],
    ['stf', 'reqs.save', { req: { cust: '다라물산', title: '단가 문의', received: '2026-11-12' } }]
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
    ['adm', 'cal.all', {}, '마지막'],
    // 견적 접수
    ['stf', 'reqs.list'], ['nq', 'reqs.list', {}, '권한 없음'],
    ['stf', 'reqs.save', { req: { title: 'x' } }, '거래처 없음'], ['stf', 'reqs.save', { req: { cust: 'a', title: 'x', due: '11/15' } }, '날짜 틀림'],
    ['stf', 'reqs.save', { req: { cust: 'a', title: 'x', quoteId: 'Enope' } }, '없는 견적모음'],
    ['stf', 'reqs.save', function (c) { var f = function (l) { return { req: { cust: '가나상사', title: '수정 요청 건', received: '2026-11-16', prevId: pick(l.reqs, function (x) { return x.title === '11월 견적 요청'; }).id, linkType: '수정 요청', contact: '박과장' } }; }; return [f(c.last.a), f(c.last.b)]; }, '이전 건 연결'],
    ['stf', 'reqs.list', {}, '다시'],
    ['stf', 'reqs.get', function (c) { var f = function (l) { return { id: pick(l.reqs, function (x) { return x.title === '11월 견적 요청'; }).id }; }; return [f(c.last.a), f(c.last.b)]; }, '다음 건 보임'],
    ['stf', 'reqs.save', function (c) { var f = function (l) { var r = l.req; return { id: r.id, req: { cust: r.cust, title: r.title, body: r.body, received: r.received, due: r.due, status: '검토중', summary: '5톤 15만', submitted: '2026-11-14' } }; }; return [f(c.last.a), f(c.last.b)]; }, '상태·요약 바꾸기 (기록)'],
    ['stf', 'reqs.stepSave', function (c) { var f = function (l) { return { reqId: l.req.id, step: { date: '2026-11-14', kind: '제출', text: '견적서 보냄', amount: '150,000', cost: 120000, partner: '협력1' } }; }; return [f(c.last.a), f(c.last.b)]; }, '제출 단계 (직원: 매입 금액 안 씀)'],
    ['adm', 'reqs.get', function (c) { var f = function (l) { return { id: l.req.id }; }; return [f(c.last.a), f(c.last.b)]; }, '관리자는 매입 보임'],
    ['adm', 'reqs.stepSave', function (c) { var f = function (l) { return { reqId: l.req.id, step: { date: '2026-11-17', kind: '할인 요청', text: '10% 할인', cost: '110000' } }; }; return [f(c.last.a), f(c.last.b)]; }, '할인 요청 → 검토중'],
    ['adm', 'reqs.stepSave', function (c) { var f = function (l) { var st = pick(l.req.steps, function (x) { return x.kind === '제출'; }); return { reqId: l.req.id, id: st.id, step: { date: '2026-11-14', kind: '제출', text: '견적서 보냄(고침)', amount: 140000, cost: 115000 } }; }; return [f(c.last.a), f(c.last.b)]; }, '단계 고치기'],
    ['adm', 'reqs.stepSave', function (c) { var f = function (l) { return { reqId: l.req.id, step: { date: '2026-11-20', kind: '수주' } }; }; return [f(c.last.a), f(c.last.b)]; }, '수주'],
    ['adm', 'reqs.stepSave', function (c) { var f = function (l) { return { reqId: l.req.id, step: { kind: '메모', amount: '-5' } }; }; return [f(c.last.a), f(c.last.b)]; }, '금액 틀림'],
    ['adm', 'reqs.stepDelete', function (c) { var f = function (l) { return { id: pick(l.req.steps, function (x) { return x.kind === '할인 요청'; }).id }; }; return [f(c.last.a), f(c.last.b)]; }, '단계 지우기'],
    ['stf', 'reqs.file', { fileId: 'nope' }, '없는 파일'], ['stf', 'reqs.zip', function (c) { var f = function (l) { return { id: l.req.id }; }; return [f(c.last.a), f(c.last.b)]; }, '파일 없음'],
    ['adm', 'reqs.import', { source: '노션', items: [{ key: 'k1', title: '가져온 건', cust: '마바상회', received: '2026-10-01', steps: [{ date: '2026-10-03', kind: '제출', amount: 90000 }] }, { key: 'k2', title: '이어진 건', received: '2026-10-05', prev: 'k1', prevType: '재계약' }, { title: '11월 견적 요청', received: '2026-11-10' }] }, '가져오기'],
    ['adm', 'reqs.import', { items: [{ title: '' }] }, '제목 없음'],
    ['stf', 'reqs.list', {}, '가져온 뒤'],
    ['stf', 'reqs.delete', function (c) { var f = function (l) { return { id: pick(l.reqs, function (x) { return x.title === '가져온 건'; }).id }; }; return [f(c.last.a), f(c.last.b)]; }, '남이 등록한 건 삭제 막힘'],
    ['stf', 'reqs.delete', function (c) { var f = function (l) { return { id: pick(l.reqs, function (x) { return x.title === '단가 문의'; }).id }; }; return [f(c.last.a), f(c.last.b)]; }, '내 건 삭제'],
    ['adm', 'reqs.list', {}, '마지막'],
    // 파일 (가짜 드라이브): 매뉴얼 첨부 · 견적 접수 파일 · 서류함
    ['stf', 'manual.upload', function (c) { return [{ id: 'nope', data: 'aGVsbG8gam9pbA==', fileName: 'a.pdf' }, { id: 'nope', data: 'aGVsbG8gam9pbA==', fileName: 'a.pdf' }]; }, '없는 매뉴얼'],
    ['stf', 'manual.list', {}, '첨부 전'],
    ['stf', 'manual.upload', function (c) { var f = function (l) { return { id: pick(l.manuals, function (x) { return x.title === '입고 안내'; }).id, data: 'aGVsbG8gam9pbA==', fileName: '안내/1.pdf', mime: 'application/pdf' }; }; return [f(c.last.a), f(c.last.b)]; }, '첨부'],
    ['stf', 'manual.file', function (c) { var f = function (l) { return { fileId: pick(l.manuals, function (x) { return x.title === '입고 안내'; }).files[0].id }; }; return [f(c.last.a), f(c.last.b)]; }, '첨부 받기'],
    ['stf', 'manual.list', {}, '첨부 뒤'],
    ['stf', 'manual.fileDelete', function (c) { var f = function (l) { return { fileId: pick(l.manuals, function (x) { return x.title === '입고 안내'; }).files[0].id }; }; return [f(c.last.a), f(c.last.b)]; }, '첨부 지우기'],
    ['stf', 'reqs.list', {}, '파일 전'],
    ['stf', 'reqs.upload', function (c) { var f = function (l) { return { id: pick(l.reqs, function (x) { return x.title === '11월 견적 요청'; }).id, data: 'aGVsbG8gam9pbA==', fileName: '요청.xlsx', kind: '받은' }; }; return [f(c.last.a), f(c.last.b)]; }, '받은 파일'],
    ['stf', 'reqs.upload', function (c) { var f = function (l) { return { id: l.req.id, data: 'aGVsbG8gam9pbA==', fileName: '제출.pdf', kind: '제출' }; }; return [f(c.last.a), f(c.last.b)]; }, '제출 파일'],
    ['stf', 'reqs.upload', function (c) { var f = function (l) { return { id: l.req.id, data: '', fileName: 'x' }; }; return [f(c.last.a), f(c.last.b)]; }, '빈 파일'],
    ['stf', 'reqs.zip', function (c) { var f = function (l) { return { id: l.req.id }; }; return [f(c.last.a), f(c.last.b)]; }, '묶어 받기'],
    ['stf', 'reqs.get', function (c) { return c.lastReq; }, '다시'],
    ['stf', 'reqs.list', {}, '파일 수'],
    ['stf', 'reqs.get', function (c) { var f = function (l) { return { id: pick(l.reqs, function (x) { return x.title === '11월 견적 요청'; }).id }; }; return [f(c.last.a), f(c.last.b)]; }],
    ['stf', 'reqs.file', function (c) { var f = function (l) { return { fileId: l.req.files[0].id }; }; return [f(c.last.a), f(c.last.b)]; }, '파일 받기'],
    ['stf', 'reqs.get', function (c) { return c.lastReq; }, '다시'],
    ['stf', 'reqs.fileDelete', function (c) { var f = function (l) { return { fileId: l.req.files[0].id }; }; return [f(c.last.a), f(c.last.b)]; }, '파일 지우기'],
    ['stf', 'docs.list'], ['nq', 'docs.list', {}, '권한 없음'],
    ['stf', 'docs.upload', { name: '', data: 'aGVsbG8gam9pbA==' }, '서류명 없음'], ['stf', 'docs.upload', { name: '등본', data: '' }, '빈 파일'], ['stf', 'docs.upload', { name: '등본', data: 'aGVsbG8gam9pbA==', issued: '1/1' }, '날짜 틀림'],
    ['stf', 'docs.upload', { name: '사업자등록증', biz: '조일물류', cat: '등록증', data: 'aGVsbG8gam9pbA==', fileName: '등록증.pdf', mime: 'application/pdf', issued: '2026-01-02', expires: '2027-01-01', memo: 'm' }],
    ['stf', 'docs.upload', { name: '통장사본', data: 'aGVsbG8gam9pbA==', fileName: '통장.jpg' }],
    ['stf', 'docs.list', {}, '올린 뒤'],
    ['stf', 'docs.update', function (c) { var f = function (l) { return { id: pick(l.docs, function (x) { return x.name === '통장사본'; }).id, patch: { cat: '통장', expires: '2028-12-31' } }; }; return [f(c.last.a), f(c.last.b)]; }, '고치기'],
    ['stf', 'docs.list', {}, '고친 뒤'],
    ['stf', 'docs.get', function (c) { var f = function (l) { return { id: l.docs[0].id }; }; return [f(c.last.a), f(c.last.b)]; }, '받기'],
    ['stf', 'docs.list', {}, '다시'],
    ['stf', 'docs.zip', function (c) { var f = function (l) { return { ids: l.docs.map(function (x) { return x.id; }).concat(['nope']) }; }; return [f(c.last.a), f(c.last.b)]; }, '묶어 받기'],
    ['stf', 'docs.zip', { ids: [] }, '안 고름'],
    ['stf', 'docs.list', {}, '다시'],
    ['stf', 'docs.delete', function (c) { var f = function (l) { return { id: l.docs[0].id }; }; return [f(c.last.a), f(c.last.b)]; }, '지우기'],
    ['stf', 'docs.delete', { id: 'nope' }, '없는 서류'],
    ['stf', 'docs.list', {}, '마지막'],
    // 주간 요약 (사이트 · 메일)
    ['stf', 'weekly.get'], ['adm', 'weekly.get', { week: '2026-11-25' }, '지정 주'], ['nq', 'weekly.get', {}, '견적 권한 없음 → 견적 빼고'], ['stf', 'weekly.get', { week: '11/25' }, '날짜 틀림'],
    ['stf', 'weekly.send', {}, '관리자만'],
    ['adm', 'weekly.send', { onlyMe: true }, '나에게 (메일 없음)'],
    ['adm', 'staff.save', { staff: [{ name: '김직원', email: 'a@b.cd', weekly: true }, { name: '관리', account: 'a', email: 'adm@b.cd' }] }],
    ['adm', 'weekly.send', { onlyMe: true }, '나에게'], ['adm', 'weekly.send', { week: '2026-11-23' }, '받기 체크한 직원 모두'],
    // 견적 계산 · 조회기록 · 견적모음 · 업체단가
    ['nq', 'quote', { origin: A, dest: B }, '권한 없음'], ['stf', 'quote', { origin: '', dest: B }, '빈 주소'],
    ['stf', 'quote', { origin: A, dest: '없는 주소 9' }, '캐시에 없는 주소 (카카오 키 없음)'],
    ['stf', 'dieselPrice'], ['stf', 'diesel.recent'],
    ['stf', 'quote', { origin: A, dest: B }],
    ['stf', 'quote', { origin: '  ' + C + ' ', dest: A, baseTon: '11톤' }, '다른 톤수 (경로 캐시 없음)'],
    ['stf', 'quote', { origin: C, dest: A, dieselMode: 'manual', dieselPrice: 1777, specials: ['sp1', 'sp3'] }, '경유 직접 · 특수'],
    ['stf', 'quoteBatch', { pairs: [], batch: {} }, '빈 대량'],
    ['stf', 'quoteBatch', { pairs: [{ no: 1, origin: A, dest: B }, { no: 2, origin: B, dest: C }, { no: 3, origin: C, dest: B }], batch: { id: 'BATCH0001', index: 0, count: 3 } }, '대량'],
    ['adm', 'history.list', {}, '관리자'], ['stf', 'history.list', { type: '단건', q: '테스트' }, '찾기'], ['adm', 'history.list', { userId: 'a' }, '남의 것'],
    ['stf', 'history.get', { recordId: 'BATCH0001' }, '대량 기록'], ['stf', 'history.get', { recordId: 'nope' }, '없는 기록'],
    ['stf', 'history.list'],
    ['stf', 'history.get', rec(function (l) { return { recordId: l.logs[l.logs.length - 1].recordId }; }), '단건 기록'],
    ['adm', 'quotes.save', { recordId: 'BATCH0001', name: '' }, '견적명 없음'],
    ['adm', 'quotes.save', { recordId: 'BATCH0001', name: '11월 견적', client: '가나상사', memo: 'm', status: '제출', adj: { rows: { '1': 1000 }, cols: {}, cells: { '2|5톤': -500 } }, adjNote: '첫 조정' }, '대량 저장'],
    ['stf', 'quotes.save', { recordId: 'BATCH0001', name: '남의 것' }, '남의 기록'],
    ['stf', 'quotes.list'], ['adm', 'quotes.list', { q: '11월' }],
    ['adm', 'quotes.get', rec(function (l) { return { id: l.quotes[0].id }; })],
    ['adm', 'quotes.update', rec(function (l) { return { id: l.quote.id, patch: { name: '11월 견적 (수정)', status: '수주', adj: { rows: { '2': 2000 } }, adjNote: '두 번째', link: { cust: '가나상사', from: A, to: B, since: '2026-11', price: 120000, ton: '5톤' } } }; }), '고치기'],
    ['adm', 'quotes.get', rec(function (l) { return { id: l.quote.id }; }), '고친 뒤'],
    ['adm', 'quotes.addRoutes', rec(function (l) { return { id: l.quote.id, pairs: [{ origin: C, dest: B }, { origin: B, dest: A }] }; }), '구간 추가'],
    ['adm', 'quotes.addRoutes', rec(function (l) { return { id: l.quote.id, pairs: [] }; }), '빈 추가'],
    ['adm', 'quotes.list'],
    ['stf', 'quotes.get', rec(function (l) { return { id: l.quotes[0].id }; }), '남의 견적'],
    ['adm', 'quotes.list'],
    ['adm', 'quotes.delete', rec(function (l) { return { id: l.quotes[0].id }; }), '지우기'],
    ['adm', 'quotes.list', {}, '지운 뒤'],
    ['stf', 'rates.upload', { cust: '', rows: [] }, '업체 없음'], ['stf', 'rates.upload', { cust: '가나상사', rows: [[A, B, '7톤', 1000]] }, '모르는 톤수'],
    ['stf', 'rates.upload', { cust: '가나상사', rows: [[A, B, '5톤', 150000, '2026-11-01', '비고'], [A, C, '11톤', 300000]], specials: { sp1: { mode: 'percent', values: { '5톤': 10 } }, zz: {} } }],
    ['stf', 'rates.upload', { cust: '가나상사', mode: 'append', rows: [[B, C, '1톤', 50000]] }, '덧붙이기'],
    ['stf', 'rates.upload', { cust: '다라물산', rows: [[B, A, '25톤', 700000]] }],
    ['stf', 'rates.list'], ['stf', 'rates.get', { cust: '가나상사' }],
    ['stf', 'quote', { origin: A, dest: B, cust: '가나상사', specials: ['sp1'] }, '업체 특수운임'],
    ['stf', 'rates.saveSpecials', { cust: '다라물산', specials: { sp2: { values: { '1톤': 3000.555 } } } }],
    ['stf', 'rates.delete', { cust: '가나상사' }, '권한 없음'], ['adm', 'rates.delete', { cust: '가나상사' }],
    ['stf', 'rates.list', {}, '지운 뒤'], ['stf', 'rates.get', { cust: '다라물산' }],
    // 관리자 · 분석 · 정보 (가짜 인터넷 켬)
    ['@net'],
    ['stf', 'admin.getSettings', {}, '관리자만'], ['adm', 'admin.getSettings'],
    ['adm', 'admin.saveSettings', { settings: { tons: 'x' } }, '형식 틀림'],
    ['adm', 'admin.saveSettings', function (c) { var f = function () { var st = JSON.parse(JSON.stringify(c.last.a.settings)); st.fuel = { mode: 'auto', manualPrice: 1600 }; st.specials[0].values = { '5톤': 30000, '1톤': -1 }; st.specials.push({ id: 'sp1', name: '중복 id' }); return { settings: st }; }; return [f(), f()]; }, '음수 금액'],
    ['adm', 'admin.saveSettings', function (c) { return [0, 0].map(function () { var st = JSON.parse(JSON.stringify(c.M.call('adm', 'admin.getSettings', {}).settings)); st.fuel = { mode: 'auto', manualPrice: 1600 }; st.specials[0].values = { '5톤': 30000.555 }; st.quoteFooter = '가상 안내'; return { settings: st }; }); }],
    ['stf', 'publicSettings'],
    ['adm', 'admin.saveKeys', { kakao: ' k-test ', opinet: '' }], ['adm', 'admin.saveKeys', { opinet: 'o-test' }],
    ['adm', 'admin.saveTariff', { tariff: { rows: [[1, 2]] } }, '타리프 틀림'],
    ['adm', 'admin.saveTariff', function (c) { return [0, 0].map(function () { var t = c.M.ctx.joilDummyTariff(); t.rows[0][0] = 0; t.rows[1][2] = 12345; return { tariff: JSON.parse(JSON.stringify(t)) }; }); }],
    ['adm', 'admin.getTariff'], ['adm', 'admin.bootstrap'], ['adm', 'admin.getLogs', { limit: 3 }],
    ['adm', 'admin.cacheInfo'], ['adm', 'admin.testKakao'], ['adm', 'admin.cacheInfo', {}, '카카오 뒤'], ['adm', 'admin.clearCache'], ['adm', 'admin.cacheInfo', {}, '비운 뒤'],
    ['stf', 'quote', { origin: A, dest: B }, '캐시 비운 뒤 (경로 없음)'],
    ['adm', 'admin.dieselHistory'], ['adm', 'admin.dieselImport', { rows: [] }, '빈 가져오기'],
    ['adm', 'admin.dieselImport', { rows: [['2026-11-01', 1500.555], ['bad', 1], ['2026-11-02', '1510'], ['2026-11-03', 20000]] }],
    ['adm', 'admin.dieselRecordNow'], ['stf', 'dieselPrice', {}, '자동 경유가'], ['stf', 'info.diesel'], ['stf', 'diesel.recent'],
    ['stf', 'info.weather'], ['stf', 'info.weather', {}, '캐시'],
    ['stf', 'info.news'], ['adm', 'admin.saveNews', { rules: { include: [' '], watch: [] } }, '키워드 없음'],
    ['adm', 'admin.saveNews', { rules: { include: ['화물', '화물', ' 운송 '], exclude: ['사고'], watch: ['가상물류'], blockSources: ['나쁜신문'] } }],
    ['stf', 'info.news', {}, '새 규칙'], ['adm', 'info.news', { force: true }, '새로 받기'],
    ['stf', 'stock.quotes', { codes: ['005930', 'AAPL.O', '999999', 'bad code!', '000660', '035720', '068270'] }],
    ['stf', 'stock.search', { q: '' }], ['stf', 'stock.search', { q: '005930' }], ['stf', 'stock.search', { q: '가상' }],
    ['stf', 'stock.chart', { code: '005930' }], ['stf', 'stock.chart', { code: 'AAPL.O' }], ['stf', 'stock.chart', { code: '!!' }, '코드 틀림'],
    ['stf', 'analysis.index', {}, '분석 권한 없음'], ['adm', 'analysis.index', {}, '처음'], ['adm', 'analysis.load', { keys: [] }],
    ['adm', 'analysis.upload', { biz: '없는회사', month: '2026-10', data: gz(AN1) }, '사업자 틀림'], ['adm', 'analysis.upload', { biz: '조일물류', month: '2026-1', data: gz(AN1) }, '월 틀림'],
    ['adm', 'analysis.upload', { biz: '조일물류', month: '2026-10', data: '' }, '빈 자료'], ['adm', 'analysis.upload', { biz: '조일물류', month: '2026-09', data: gz(AN1) }, '다른 달'],
    ['adm', 'analysis.upload', { biz: '조일물류', month: '2026-10', data: gz(AN1), count: 3 }, '건수 틀림'],
    ['adm', 'analysis.upload', { biz: '조일물류', month: '2026-10', data: gz(AN1), count: 2, fileName: '10월.xlsx' }],
    ['adm', 'analysis.upload', { biz: '명일로지스', month: '2026-09', data: AN_BIG, count: AN2.length, fileName: '9월.xlsx' }, '큰 자료 (여러 칸)'],
    ['adm', 'analysis.upload', { biz: '조일물류', month: '2026-10', data: gz(AN1.slice(0, 1)), fileName: '10월 다시.xlsx' }, '덮어쓰기'],
    ['adm', 'analysis.index'], ['adm', 'analysis.load', { keys: ['조일물류|2026-10', '명일로지스|2026-09', '없음|2026-01'] }],
    ['adm', 'analysis.saveMap', { map: 'x' }, '형식 틀림'], ['adm', 'analysis.saveMap', { map: [{ raw: '가나', display: ' 가나상사 ', hidden: false }, { raw: '다라', hidden: true }, { raw: '' }] }],
    ['adm', 'analysis.saveMap', { map: [{ raw: '마바', display: '마바상회' }] }, '줄 줄이기'],
    ['adm', 'analysis.saveRules', { rules: [{ word: '', field: 'cust' }] }, '빈 단어'], ['adm', 'analysis.saveRules', { rules: [{ word: 'x', field: 'nope' }] }, '칸 틀림'],
    ['adm', 'analysis.saveRules', { rules: [{ word: '가나', field: 'cust', action: 'class' }] }, '분류 이름 없음'],
    ['adm', 'analysis.saveRules', { rules: [{ word: ' 가나 ', field: 'cust', mode: 'eq', biz: '조일물류', action: 'class', cat: '주요' }, { word: '다라', field: 'any', mode: 'zz', on: false, memo: 'm' }] }],
    ['adm', 'analysis.index', {}, '규칙·매출처 뒤'], ['adm', 'analysis.accessLog'], ['stf', 'analysis.upload', { biz: '조일물류' }, '관리자만'],
    ['adm', 'analysis.delete', { key: '' }, '키 없음'], ['adm', 'analysis.delete', { key: '조일물류|2026-10' }], ['adm', 'analysis.index', {}, '지운 뒤'], ['adm', 'analysis.load', { keys: ['조일물류|2026-10', '명일로지스|2026-09'] }, '지운 뒤']
  ]
};
