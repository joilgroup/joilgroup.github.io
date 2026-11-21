// 업무 매뉴얼 '여러 개 붙여넣기': ##### 로 나눈 글을 제목·업체별 매뉴얼로 · ■ 단락을 칸으로 · 목차 덩어리(제목 줄 없음)도 · 같은 제목은 덮어쓰기 (가짜 내용)
var T = require('../lib/browser.js'), ok = T.ok, api = T.api;
var TEXT = [
  '가상회사 일반팀 업무 매뉴얼 (인수인계용)',
  '작성: 테스트',
  '',
  '==================================================',
  '[사이트 AI 등록 안내]',
  '==================================================',
  '- 파일 첫 줄의 "제목:"을 매뉴얼 제목으로 써 주세요.',
  '',
  '==================================================',
  '[목차]',
  '==================================================',
  '01 팀 구성',
  '02 가상업체',
  '',
  '############################################################',
  '',
  '제목: 팀 구성·하루 흐름',
  '업체: 공통',
  '',
  '■ 팀 구성',
  '| 이름 | 담당 |',
  '| 가 | 나 |',
  '',
  '■ 연락처 (내부)',
  '- 가상 이사님 (번호 기입)',
  '',
  '############################################################',
  '',
  '제목: 가상업체 배차',
  '업체: 가상물류',
  '',
  '■ 개요',
  '- 월 약 10건',
  '',
  '■ 자주 생기는 문제와 대처',
  '- 늦으면 연락',
  '',
  '■ 원칙',
  '- 혼적 금지',
  '',
  '■ 자료 위치',
  '- 가상 시트',
  '',
  '■ 연락처',
  '- 가상 담당 (번호 기입)'
].join('\n');
T.run(async function () {
  var o = await T.open(), p = o.page;
  await api(p, 'manual.save', { id: '', manual: { title: '가상업체 배차', cust: '가상물류', steps: '예전 내용' } });
  await p.evaluate(function () { location.hash = '#/manual'; }); await p.waitForSelector('#mnImp', { timeout: 10000 });
  await p.click('#mnImp'); await p.waitForSelector('#miIn');
  await p.fill('#miIn', TEXT); await p.dispatchEvent('#miIn', 'input'); await p.waitForTimeout(600);
  ok('미리보기: 3개 · 덮어쓰기 1개', /매뉴얼 3개 · 덮어쓰기 1개/.test(await T.text(p, '#miInfo')), await T.text(p, '#miInfo'));
  await p.click('#miSave'); await p.waitForTimeout(1500);
  var l = (await api(p, 'manual.list', {})).manuals, by = function (t) { return l.filter(function (m) { return m.title === t; }); };
  var idx = by('가상회사 일반팀 업무 매뉴얼 (인수인계용)')[0], team = by('팀 구성·하루 흐름')[0], co = by('가상업체 배차');
  ok('목차 덩어리: 첫 줄이 제목 · AI 등록 안내는 빠지고 목차는 남음', idx && /\[목차\]/.test(idx.steps) && /02 가상업체/.test(idx.steps) && !/AI 등록 안내/.test(idx.steps) && !/"제목:"을/.test(idx.steps), idx && idx.steps);
  ok('업체: 공통 → 공통(빈 칸) · 연락처 단락은 연락처 칸', team && team.cust === '' && /■ 팀 구성/.test(team.steps) && /■ 연락처 \(내부\)/.test(team.contacts) && !/연락처/.test(team.steps), team);
  ok('같은 제목은 덮어씀(하나만)', co.length === 1 && !/예전 내용/.test(co[0].steps) && co[0].cust === '가상물류', co);
  var c = co[0] || {};
  ok('단락 나누기: 개요→처리 순서 · 문제→문제와 대처 · 원칙→주의사항 · 자료 위치→메모 · 분류 인수인계', /■ 개요/.test(c.steps) && /■ 자주 생기는 문제와 대처/.test(c.issues) && /■ 원칙/.test(c.cautions) && /■ 자료 위치/.test(c.memo) && /■ 연락처/.test(c.contacts) && c.cat === '인수인계', c);
  await T.done(o);
});
