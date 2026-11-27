// 일반업체 기록(023): 시트 연결 키(관리자만 · 해시만 저장) · 날짜마다 통째로 덮어쓰기(두 번 안 쌓임) · 조회 기간·찾기 · 배차금액은 분석 권한자만 · 협력사 막힘 (가짜 데이터)
var L = require('../sb/lib.js'), ok = require('../lib/mock.js').ok;
(async function () {
  var S = await L.boot(); if (!S) { console.log('PASS (건너뜀) 시험용 Postgres 가 없어요'); return; }
  try {
    await L.users(S, [{ id: 'a', name: '관리', role: 'admin', perms: 'quote' }, { id: 's', name: '직원', role: 'staff', perms: 'quote' }, { id: 'n', name: '분석', role: 'staff', perms: 'quote,analysis' }, { id: 'p', name: '협력', role: 'partner', perms: 'none', tabs: ['애플'] }]);
    var tok = {}; for (var u of ['a', 's', 'n', 'p']) tok[u] = (await S.call('', 'login', { id: u, password: 'test1234' })).token;
    ok('키 없으면 거절', /시트 연결 키/.test((await S.call('', 'gen.sync', { days: [] })).error || ''));
    ok('직원은 키를 못 만듦', !(await S.call(tok.s, 'gen.key', {})).ok);
    var k = await S.call(tok.a, 'gen.key', {}); ok('관리자: 키 만들기', k.ok && /^[0-9a-f]{48}$/.test(k.key), k);
    var stored = (await S.sql.unsafe("select value from joil.props where key = 'GEN_KEY_HASH'"))[0].value;
    ok('키는 해시만 저장', stored && stored !== k.key && stored.length === 64);
    var row = function (c, a, b, amt, drv) { return [c, a, b, '1', amt, '00가0000', drv, '010-0000-0000', '', '']; };
    var r = await S.call('', 'gen.sync', { key: k.key, days: [{ date: '2026-11-29', origin: '11월29일', rows: [row('가상화주', '오창', '대전', '100000', '가짜기사'), row('다른화주', '대전', '청주', '50000', '가짜기사2')] }, { date: '2026-11-30', origin: '11월30일', rows: [row('가상화주', '구미', '대전', '80000', '가짜기사')] }] });
    ok('보내기: 2일 3줄', r.ok && r.dates === 2 && r.rows === 3, r);
    r = await S.call('', 'gen.sync', { key: k.key, days: [{ date: '2026-11-29', origin: '11월29일', rows: [row('가상화주', '오창', '대전', '120000', '가짜기사')] }] });
    var cnt = Number((await S.sql.unsafe("select count(*) n from joil.gen_rows where date = '2026-11-29'"))[0].n);
    ok('같은 날짜 다시 보내면 덮어씀(고친 건 반영 · 지운 줄 빠짐)', r.ok && cnt === 1, cnt);
    ok('틀린 키 거절', !(await S.call('', 'gen.sync', { key: 'x' + k.key.slice(1), days: [] })).ok);
    ok('이상한 날짜 거절', !(await S.call('', 'gen.sync', { key: k.key, days: [{ date: '11월29일', rows: [] }] })).ok);

    var s = await S.call(tok.s, 'gen.search', { from: '2026-11-01', to: '2026-11-30' });
    ok('직원: 조회 · 금액 칸 없음', s.ok && s.rows.length === 2 && s.rows.every(function (x) { return !('amount' in x); }) && s.money === false && s.rows[0].cust === '가상화주', s);
    var n = await S.call(tok.n, 'gen.search', { from: '2026-11-01', to: '2026-11-30' });
    ok('분석 권한: 금액 보임', n.ok && n.money && n.rows[0].amount === '120000', n.rows);
    ok('찾기: 발지·착지·기사', (await S.call(tok.s, 'gen.search', { from: '2026-11-01', to: '2026-11-30', q: '구미' })).rows.length === 1 && (await S.call(tok.s, 'gen.search', { from: '2026-11-01', to: '2026-11-30', q: '가짜 기사' })).rows.length === 2);
    ok('찾기 글자에 % 넣어도 전부 나오지 않음', (await S.call(tok.s, 'gen.search', { from: '2026-11-01', to: '2026-11-30', q: '%' })).rows.length === 0);
    ok('기간 1년 넘으면 거절', !(await S.call(tok.s, 'gen.search', { from: '2024-01-01', to: '2026-11-30' })).ok);
    ok('마지막 받은 날짜', s.lastDate === '2026-11-30' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s.last), s);
    ok('협력사 막힘', !(await S.call(tok.p, 'gen.search', { from: '2026-11-01', to: '2026-11-30' })).ok);
  } finally { await S.stop(); }
})().catch(function (e) { ok('실행 오류', false, e.stack || String(e)); });
