// 진짜 표로 옮기기 2단계 (013): 업무 기록 — 시트(sheet_rows) → 표(move_basic) → 새 서버(core.js)가 지금 서버(Code.js 목)와 같은 응답
// 옮긴 뒤에도 Code.js(gas.js)가 이 시트를 읽으면 새 표 내용이 보이는지(주간 요약 등) · 옮김 표시는 줄 수가 같을 때만 · 두 번 불러도 덮어쓰지 않음
process.env.TZ = 'Asia/Seoul';
var M = require('../lib/mock.js'), ok = M.ok, L = require('../sb/lib.js'), path = require('path'), fs = require('fs');
var ROOT = path.join(__dirname, '..', '..'), SRC = ['Calc.js', 'Code.js'].map(function (f) { return fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8'); }).join('\n;\n');
function norm(o) {
  var names = {}, n = 0, nm = function (s) { return names[s] || (names[s] = '#' + (++n)); };
  return JSON.stringify(o, function (k, v) {
    if (k === 'ms') return undefined;
    if (typeof v === 'string') { if (/^[A-Z]\d{12}[0-9a-f]{5}\d*$/.test(v) || /^[A-Z]yy\d{10}[0-9a-f]{5}\d*$/.test(v)) return nm(v); return v.replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?/g, 'TS'); }
    return v;
  });
}
function diff(a, b) { for (var i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return '…' + a.slice(Math.max(0, i - 100), i + 120) + '\n   ≠ …' + b.slice(Math.max(0, i - 100), i + 120); return ''; }
function enc(v) { return v instanceof Date ? { $d: v.toISOString() } : v; }
(async function () {
  var S = await L.boot(); if (!S) { console.log('PASS (건너뜀) 시험용 Postgres 가 없어요'); return; }
  try {
    await L.users(S, [{ id: 'a', name: '관리', role: 'admin', perms: 'quote,analysis' }, { id: 's', name: '직원', role: 'staff', perms: 'quote' }]);
    var tok = { adm: (await S.call('', 'login', { id: 'a', password: 'test1234' })).token, stf: (await S.call('', 'login', { id: 's', password: 'test1234' })).token };
    var us = M.ctx.SpreadsheetApp.getActive().insertSheet('계정'); us.d.push(M.ctx.USER_COLS.slice());
    us.d.push(['a', '관리', 'admin', '사용', 'h', 's', 'N', '2026-01-01 09:00:00', '', 'quote,analysis', '']); us.d.push(['s', '직원', 'staff', '사용', 'h', 's', 'N', '2026-01-01 09:00:00', '', 'quote', '']);
    ['메일 확인', '견적 보내기', '마감 정리'].forEach(function (t) { M.call('stf', 'work.op', { op: 'add', text: t }); });
    var l0 = M.call('stf', 'work.list').items; M.call('stf', 'work.op', { op: 'status', id: l0[0].id, st: '진행 중' });
    M.call('adm', 'work.op', { op: 'add', text: '관리자 일' });
    await S.sql.unsafe('select public.joil_sheet_copy($1, 1, $2, true)', ['업무기록', M.sheets['업무기록'].d.map(function (r) { return (r || []).map(enc); })]);
    var mv = (await S.sql`select joil.move_work() r`)[0].r; ok('옮기기: 4줄 → 옮김 표시', mv['업무기록'][0] === 4 && mv['업무기록'][1] === 4, mv);
    var step = 0, both = async function (who, action, req, label) {
      var a = M.call(who, action, req), b = await S.call(tok[who], action, req); delete a.stamp; delete b.stamp; var na = norm(a), nb = norm(b);
      ok('같은 응답 ' + (++step) + ' ' + (label || '') + ' ' + who + ' ' + action + ' ' + ((req && req.op) || '') + (a.ok ? '' : ' (오류: ' + a.error + ')'), na === nb, diff(na, nb)); return [a, b];
    };
    var b0 = await both('stf', 'work.list'); await both('adm', 'work.list', {}, '관리자(사람 목록)'); await both('adm', 'work.list', { uid: 's' }, '관리자가 직원 것 보기');
    await both('stf', 'work.list', { uid: 'a' }, '직원은 남의 것 못 봄'); await both('stf', 'work.list', { date: '11/20' }, '날짜 틀림');
    var idOf = function (r, t) { return r.items.filter(function (x) { return x.text === t; })[0].id; };
    var pair = async function (label, mk) { var a = M.call('stf', 'work.op', mk(b0[0])), b = await S.call(tok.stf, 'work.op', mk(b0[1])); delete a.stamp; delete b.stamp; ok('같은 응답 ' + label, norm(a) === norm(b), diff(norm(a), norm(b))); b0 = [a, b]; };
    await both('stf', 'work.op', { op: 'add', text: '' }, '내용 없음');
    b0 = await both('stf', 'work.op', { op: 'add', text: '새 일' });
    await pair('순서 바꾸기', function (r) { return { op: 'order', ids: [idOf(r, '새 일'), idOf(r, '마감 정리')] }; });
    await pair('진행 중', function (r) { return { op: 'status', id: idOf(r, '마감 정리'), st: '진행 중' }; });
    await pair('대기로', function (r) { return { op: 'status', id: idOf(r, '메일 확인'), st: '대기' }; });
    await pair('완료', function (r) { return { op: 'status', id: idOf(r, '견적 보내기'), st: '완료' }; });
    await pair('고치기', function (r) { return { op: 'edit', id: idOf(r, '새 일'), text: '새 일 고침' }; });
    await pair('지우기', function (r) { return { op: 'delete', id: idOf(r, '새 일 고침') }; });
    await both('stf', 'work.op', { op: 'delete', id: 'Knope123' }, '없는 것 지우기 = 목록');
    await both('stf', 'work.op', { op: 'edit', id: 'Knope123', text: 'x' }, '없는 것 고치기');
    await both('stf', 'work.op', { op: 'status', id: b0[0].items[0].id, st: '이상' }, '상태 틀림');
    await both('stf', 'work.list', {}, '마지막');
    var st = await S.call(tok.stf, 'work.stamp'); ok('바뀐 시각(work.stamp)', st.ok && /^\d{13}$/.test(st.stamp), st);
    var fflate = require(path.join(__dirname, '..', 'sb', 'node_modules', 'fflate')), gasMod = await import(path.join(ROOT, 'supabase', 'functions', 'joil', 'gas.js'));
    var G = gasMod.makeGas({ sql: S.sql, src: SRC, zip: fflate.zipSync, gasFetch: async function () { throw new Error('시험'); }, fetch: async function () { throw new Error('시험'); } });
    var gv = await G.call({ action: 'work.list', token: 'stf' }, { id: 's', name: '직원', role: 'staff', perms: ['quote'] }), cv = await S.call(tok.stf, 'work.list'); delete gv.stamp; delete cv.stamp; delete cv.ok; delete cv.ms;
    ok('gas.js 도 새 표를 시트처럼 읽음', norm(gv) === norm(cv), diff(norm(gv), norm(cv)));
  } finally { await S.stop(); }
})().catch(function (e) { ok('실행 오류', false, e.stack || String(e)); });
