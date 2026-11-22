// 새 서버로 옮긴 Code.js 영역(supabase/functions/joil/port.js)이 지금 서버(Code.js 목)와 같은 요청에 같은 응답을 내는지.
// 목에 가짜 자료를 넣고 → 시트를 시험용 DB 로 복사 → 시트마다 칸 있는 표로(014) → 양쪽에 같은 요청(읽기·저장·오류)을 차례로 보내 비교.
process.env.TZ = 'Asia/Seoul';
var M = require('../lib/mock.js'), ok = M.ok, L = require('../sb/lib.js');
function norm(o) {
  var names = {}, n = 0, nm = function (s) { return names[s] || (names[s] = '#' + (++n)); };
  return JSON.stringify(o, function (k, v) {
    if (k === 'ms') return undefined;
    if (typeof v === 'string') { if (/^S[0-9a-f]{10}$/.test(v) || /^R[0-9a-f]{8}$/.test(v) || /^[A-Z]{1,2}\d{12}[0-9a-f]{5}\d*$/.test(v) || /^[A-Z]{1,2}yy\d{10}[0-9a-f]{5}\d*$/.test(v)) return nm(v); return v.replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?/g, 'TS'); }
    return v;
  });
}
function diff(a, b) { for (var i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return '…' + a.slice(Math.max(0, i - 100), i + 120) + '\n   ≠ …' + b.slice(Math.max(0, i - 100), i + 120); return ''; }
function enc(v) { return v instanceof Date ? { $d: v.toISOString() } : v; }
var STEPS = require('./sb-port.steps.js');
(async function () {
  // 새 서버의 가짜 구글 쪽(int.drive): 목(M.drive)과 같은 규칙으로 파일 ID F0, F1 …
  var fdrive = { n: 0, f: 0, files: {} };
  var gasFake = async function (url, o) {
    var b = JSON.parse(o.body), a = b.arg || {}, r;
    if (b.action !== 'int.drive') throw new Error('모르는 일 ' + b.action);
    if (b.op === 'mkdir') r = { id: 'D' + (fdrive.n++) }; else if (b.op === 'fmeta') r = { id: a.id, name: '폴더' };
    else if (b.op === 'create') { var id = 'F' + (fdrive.f++); fdrive.files[id] = a; r = { id: id, name: a.name, size: Buffer.from(a.data, 'base64').length }; }
    else if (b.op === 'get') { var f = fdrive.files[a.id]; if (!f) return { text: async function () { return JSON.stringify({ ok: false, error: '파일 없음' }); } }; r = { data: f.data, mime: f.mime, name: f.name }; }
    else if (b.op === 'trash') { delete fdrive.files[a.id]; r = {}; } else throw new Error('모르는 op ' + b.op);
    return { text: async function () { return JSON.stringify({ ok: true, result: r }); } };
  };
  var S = await L.boot({ fetch: gasFake, zip: function (files) { return Uint8Array.from(Buffer.from(JSON.stringify(Object.keys(files)))); }, netFetch: async function () { throw new Error('시험: 바깥 인터넷 없음'); } }); if (!S) { console.log('PASS (건너뜀) 시험용 Postgres 가 없어요'); return; }
  try {
    var us = M.ctx.SpreadsheetApp.getActive().insertSheet('계정'); us.d.push(M.ctx.USER_COLS.slice());
    us.d.push(['a', '관리', 'admin', '사용', 'h', 's', 'N', '2026-01-01 09:00:00', '', 'quote,analysis', '']); us.d.push(['s', '직원', 'staff', '사용', 'h', 's', 'N', '2026-01-01 09:00:00', '', 'quote', '']); us.d.push(['x', '견적없음', 'staff', '사용', 'h', 's', 'N', '2026-01-01 09:00:00', '', 'track', '']); us.d.push(['p', '협력A', 'partner', '사용', 'h', 's', 'N', '2026-01-01 09:00:00', 'none', '쿠팡부자재/평택']);
    await L.users(S, [{ id: 'a', name: '관리', role: 'admin', perms: 'quote,analysis' }, { id: 's', name: '직원', role: 'staff', perms: 'quote' }, { id: 'x', name: '견적없음', role: 'staff', perms: 'track' }, { id: 'p', name: '협력A', role: 'partner', perms: 'none', tabs: ['쿠팡부자재/평택'] }]);
    var tok = {}; for (var u of [['adm', 'a'], ['stf', 's'], ['nq', 'x'], ['ptn', 'p']]) tok[u[0]] = (await S.call('', 'login', { id: u[1], password: 'test1234' })).token;
    M.SESS.nq = { id: 'x', name: '견적없음', role: 'staff', perms: ['track'] };
    STEPS.seed.forEach(function (x) { M.call(x[0], x[1], x[2]); });
    for (var name of Object.keys(M.sheets)) {
      if (name === '계정') continue;
      await S.sql.unsafe('select public.joil_sheet_copy($1, 1, $2, true)', [name, M.sheets[name].d.map(function (r) { return (r || []).map(enc); })]);
    }
    await S.sql.unsafe('select public.joil_gas_props_copy($1, true)', [Object.keys(M.props).filter(function (k) { return !/^(RT_|DST\|)/.test(k); }).map(function (k) { return { key: k, value: M.props[k] }; })]);
    await S.sql`insert into props (key, value) values ('GAS_URL', 'http://fake'), ('GAS_SECRET', 'x')`;
    var tb = (await S.sql`select joil.sheet_tabulate_all() r`)[0].r;
    ok('시트를 모두 칸 있는 표로', Object.keys(tb).every(function (k) { return tb[k].rows != null; }), tb);
    var step = 0, ctx = { M: M, S: S, tok: tok, last: {} };
    var both = async function (who, action, req, label) {
      req = typeof req === 'function' ? req(ctx) : req;
      var a = M.call(who, action, Array.isArray(req) ? req[0] : req), b = await S.call(tok[who], action, Array.isArray(req) ? req[1] : req), na = norm(a), nb = norm(b);
      if (a.ok && b.ok) ctx.last = { a: a, b: b };
      if (a.ok && b.ok && a.req && b.req) ctx.lastReq = [{ id: a.req.id }, { id: b.req.id }]; // 파일 받기 뒤 다시 그 건으로 // 다음 요청이 ID 를 고를 때는 마지막 성공 응답에서
      ok('같은 응답 ' + (++step) + ' ' + (label || '') + ' ' + who + ' ' + action + (a.ok ? '' : ' (오류: ' + a.error + ')'), na === nb, diff(na, nb)); return [a, b];
    };
    for (var x of STEPS.steps) await both(x[0], x[1], x[2], x[3]);
  } finally { await S.stop(); }
})().catch(function (e) { ok('실행 오류', false, e.stack || String(e)); });
