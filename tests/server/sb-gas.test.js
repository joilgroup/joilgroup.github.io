// 서버 이전 4단계: Code.js 를 Supabase 에서 그대로 돌리는 실행기(supabase/functions/joil/gas.js)가 지금 서버(Code.js 목)와 같은 응답을 내는지.
// 목에서 가짜 자료를 만든 뒤 시트를 통째로 시험용 Postgres(sheet_rows)에 옮기고, 같은 요청을 양쪽에 보내 비교해요. 저장도 양쪽에 해서 다시 비교.
process.env.TZ = 'Asia/Seoul';
var M = require('../lib/mock.js'), ok = M.ok, L = require('../sb/lib.js'), path = require('path'), fs = require('fs');
var ROOT = path.join(__dirname, '..', '..'), SRC = ['Calc.js', 'Code.js'].map(function (f) { return fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8'); }).join('\n;\n');
require('vm').runInContext(fs.readFileSync(path.join(ROOT, 'apps-script', 'Calc.js'), 'utf8'), M.ctx);
var SESS = { adm: { id: 'a', name: '관리', role: 'admin', perms: ['quote', 'analysis'] }, stf: { id: 's', name: '직원', role: 'staff', perms: ['quote'] } };
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
    var us = M.ctx.SpreadsheetApp.getActive().insertSheet('계정'); us.d.push(M.ctx.USER_COLS.slice());
    us.d.push(['a', '관리', 'admin', '사용', 'h', 's', 'N', '2026-01-01 09:00:00', '', 'quote,analysis', '']); us.d.push(['s', '직원', 'staff', '사용', 'h', 's', 'N', '2026-01-01 09:00:00', '', 'quote', '']);
    await L.users(S, [{ id: 'a', name: '관리', role: 'admin', perms: 'quote,analysis' }, { id: 's', name: '직원', role: 'staff', perms: 'quote' }]);
    // 목에서 가짜 자료 만들기
    var seed = [['notice.save', { notice: { title: '공지1', body: '내용', pinned: true } }], ['manual.save', { manual: { title: '매뉴얼', cust: 'A' } }], ['inq.save', { inq: { cust: 'A', body: '문의' } }], ['custs.save', { cust: { name: '거래처A' } }], ['owners.save', { owner: { task: '업무', cust: 'A', main: '관리' } }], ['reqs.save', { req: { title: '견적요청', cust: 'A' } }], ['cal.eventSave', { event: { start: '2026-11-23', end: '2026-11-23', title: '회의', pub: true } }], ['work.op', { op: 'add', text: '할 일 하나' }]];
    seed.forEach(function (x) { M.call('adm', x[0], x[1]); });
    // 시트·속성 통째로 옮기기 (Code.js admin.sbCopyAll 과 같은 모양: 날짜 칸 = {$d})
    for (var name of Object.keys(M.sheets)) {
      if (name === '계정') continue; var rows = M.sheets[name].d.map(function (r) { return (r || []).map(enc); });
      await S.sql.unsafe('select public.joil_sheet_copy($1, 1, $2, true)', [name, rows]);
    }
    var props = Object.keys(M.props).filter(function (k) { return !/^(RT_|DST\|)/.test(k); }).map(function (k) { return { key: k, value: M.props[k] }; });
    await S.sql.unsafe('select public.joil_gas_props_copy($1, true)', [props]);
    var fflate = require(path.join(__dirname, '..', 'sb', 'node_modules', 'fflate'));
    var gasMod = await import(path.join(ROOT, 'supabase', 'functions', 'joil', 'gas.js'));
    var drive = {}, ops = [], mails = []; // 가짜 구글 드라이브·메일 (Code.js int.drive 대신)
    var gasFetch = async function (action, a) { ops.push(a.op); var x = a.arg || {};
      if (a.op === 'fmeta') return { result: { id: x.id, name: '폴더' } };
      if (a.op === 'create') { var id = 'F' + Object.keys(drive).length; drive[id] = { name: x.name, mime: x.mime, data: x.data }; return { result: { id: id, name: x.name, size: Buffer.from(x.data, 'base64').length } }; }
      if (a.op === 'get') { var f = drive[x.id]; return { result: { data: f.data, mime: f.mime, name: f.name } }; }
      if (a.op === 'mail') { mails.push(x); return { result: {} }; }
      if (a.op === 'trash') { delete drive[x.id]; return { result: {} }; }
      throw new Error('모르는 일: ' + a.op); };
    var G = gasMod.makeGas({ sql: S.sql, src: SRC, zip: fflate.zipSync, gasFetch: gasFetch, fetch: async function () { throw new Error('바깥 인터넷 없음(시험)'); } });
    var gcall = async function (who, action, req) { try { var out = await G.call(Object.assign({ action: action, token: who }, req || {}), SESS[who]); out = out || {}; out.ok = true; return out; } catch (e) { return { ok: false, error: e.message }; } };
    var step = 0, both = async function (who, action, req, label) {
      var a = M.call(who, action, req), b = await gcall(who, action, req), na = norm(a), nb = norm(b);
      ok('같은 응답 ' + (++step) + ' ' + (label || '') + ' ' + who + ' ' + action + (a.ok ? '' : ' (오류: ' + a.error + ')'), na === nb, diff(na, nb)); return [a, b];
    };
    for (var x of [['notice.list'], ['manual.list'], ['inq.list'], ['custs.list'], ['owners.list'], ['reqs.list'], ['notes.list'], ['rates.list'], ['addr.list'], ['companies'], ['analysis.index'], ['docs.list'], ['cal.all'], ['work.list'], ['admin.getSettings'], ['staff.list'], ['admin.getTariff']]) await both('adm', x[0], x[1] || {});
    await both('stf', 'cal.all', {}, '직원');
    await both('stf', 'admin.getSettings', {}, '직원 막힘');
    // 저장도 양쪽에 → 다시 읽어 비교
    await both('adm', 'notice.save', { notice: { title: '공지2', body: '둘째', pinned: false } });
    await both('adm', 'cal.eventSave', { event: { start: '2026-11-25', end: '2026-11-26', title: '출장', pub: true } });
    await both('adm', 'custs.save', { cust: { name: '거래처B', memo: '메모' } });
    await both('adm', 'inq.save', { inq: { cust: 'B', body: '두 번째 문의', state: '완료' } });
    await both('adm', 'notice.list', {}, '저장 뒤');
    await both('adm', 'cal.all', {}, '저장 뒤');
    await both('adm', 'custs.list', {}, '저장 뒤');
    var nl = M.call('adm', 'notice.list', {}), gid = (await gcall('adm', 'notice.list', {})).notices;
    var mid = nl.notices.filter(function (x) { return x.title === '공지2'; })[0].id, sid = gid.filter(function (x) { return x.title === '공지2'; })[0].id;
    var d1 = M.call('adm', 'notice.delete', { id: mid }), d2 = await gcall('adm', 'notice.delete', { id: sid }); ok('같은 응답: 공지 지우기', norm(d1) === norm(d2), diff(norm(d1), norm(d2)));
    var ss = await S.sql`select count(*)::int n from sheet_rows where sheet = '공지'`; ok('지운 줄이 DB 에서도 빠짐 (제목 줄 + 1)', ss[0].n === 2, ss);
    await both('adm', 'admin.saveSettings', { settings: Object.assign(M.ctx.joilDefaultSettings(), { maxKm: 700 }) }, '설정 저장(속성)');
    var pv = await S.sql`select value from gas_props where key = 'SETTINGS'`; ok('설정은 스크립트 속성 표(gas_props)에 저장', pv.length && JSON.parse(pv[0].value).maxKm === 700);
    await both('adm', 'admin.getSettings', {}, '저장 뒤');
    // 동시 저장: 두 요청이 같은 시트를 동시에 고쳐도 둘 다 남아요 (버전 확인 → 다시 돌리기)
    await Promise.all([gcall('adm', 'notice.save', { notice: { title: '동시A', body: '' } }), gcall('adm', 'notice.save', { notice: { title: '동시B', body: '' } })]);
    var t = (await gcall('adm', 'notice.list', {})).notices.map(function (x) { return x.title; });
    ok('동시에 저장해도 둘 다 남음', t.indexOf('동시A') !== -1 && t.indexOf('동시B') !== -1, t);
    // 견적 타리프: 저장 → 읽기 (양쪽 같게)
    var tf = M.ctx.joilDummyTariff(); tf.rows = tf.rows.slice(0, 50);
    await both('adm', 'admin.saveTariff', { tariff: tf }, '타리프 저장');
    await both('adm', 'admin.getTariff', {}, '타리프 읽기');
    // 서류함: 파일은 구글 드라이브(가짜)에, 목록은 시트에 · 내려받으면 같은 내용
    M.props.DOCS_FOLDER = 'FOLDER1'; await S.sql`insert into gas_props (key, value) values ('DOCS_FOLDER', 'FOLDER1') on conflict (key) do update set value = excluded.value`;
    var up = await gcall('adm', 'docs.upload', { name: '사업자등록증', cat: '기타', fileName: 'biz.pdf', mime: 'application/pdf', data: Buffer.from('PDF 내용').toString('base64') });
    ok('서류 올리기: 파일은 드라이브로(대행) · 목록에 들어감', up.ok && up.doc && up.doc.name === '사업자등록증' && Object.keys(drive).length === 1, up);
    var gd = await gcall('adm', 'docs.get', { id: up.doc && up.doc.id }); ok('서류 내려받기: 같은 내용', gd.ok && Buffer.from(gd.data, 'base64').toString() === 'PDF 내용', gd);
    var zp = await gcall('adm', 'docs.zip', { ids: [up.doc && up.doc.id] }); ok('서류 묶어 받기(zip)', zp.ok && Buffer.from(zp.data, 'base64').slice(0, 2).toString() === 'PK', zp.error);
    var bad = await gcall('adm', 'no.such', {}); ok('없는 액션은 같은 오류 문구', !bad.ok && /알 수 없는 요청/.test(bad.error), bad);
  } finally { await S.stop(); }
})().catch(function (e) { ok('실행 오류', false, e.stack || String(e)); });
