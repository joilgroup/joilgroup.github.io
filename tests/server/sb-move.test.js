// 진짜 표로 옮기기 1단계 (012): 공지·문의 기록·업무 담당표 — 시트(sheet_rows) → 표(move_basic) → 새 서버(core.js)가 지금 서버(Code.js 목)와 같은 응답
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
    await L.users(S, [{ id: 'a', name: '관리', role: 'admin', perms: 'quote,analysis' }, { id: 's', name: '직원', role: 'staff', perms: 'quote' }, { id: 'p', name: '협력A', role: 'partner', perms: 'none', tabs: ['쿠팡부자재/평택'] }]);
    var tok = { adm: (await S.call('', 'login', { id: 'a', password: 'test1234' })).token, stf: (await S.call('', 'login', { id: 's', password: 'test1234' })).token, ptn: (await S.call('', 'login', { id: 'p', password: 'test1234' })).token };
    // 지금 서버(목)에 가짜 자료 → 시트를 시험용 DB 로 (Code.js 전체 복사와 같은 모양)
    [['notice.save', { notice: { title: '고정 공지', body: '내용1', pinned: true } }], ['notice.save', { notice: { title: '보통 공지', body: '내용2' } }],
      ['inq.save', { inq: { cust: '거래처A', who: '담당', body: '문의1', at: '2026-11-02 10:30' } }], ['inq.save', { inq: { cust: '거래처B', body: '문의2', status: '완료', faq: true } }],
      ['owners.save', { owner: { task: '마감', cust: '거래처A', main: '김', sub: '이' } }], ['owners.save', { owner: { task: '청구', main: '박' } }]].forEach(function (x) { M.call('adm', x[0], x[1]); });
    var ow = M.call('adm', 'owners.list').owners[0]; M.call('adm', 'owners.save', { id: ow.id, owner: { task: '마감', cust: '거래처A', main: '최', sub: '이' } });
    for (var name of ['공지', '문의기록', '업무담당', '담당변경기록']) await S.sql.unsafe('select public.joil_sheet_copy($1, 1, $2, true)', [name, M.sheets[name].d.map(function (r) { return (r || []).map(enc); })]);
    var mv = (await S.sql`select joil.move_basic() r`)[0].r;
    ok('옮기기: 줄 수 같음 → 옮김 표시', mv['공지'][0] === 2 && mv['공지'][1] === 2 && mv['문의기록'][1] === 2 && mv['업무담당'][1] === 2, mv);
    var fl = await S.sql`select key from props where key like 'MOVED_%' order by key`; ok('옮김 표시 3개', fl.length === 3, fl);
    await S.sql`insert into notices (id, title) values ('X1', '나중에 쓴 것')`;
    var again = (await S.sql`select joil.move_basic() r`)[0].r; ok('다시 불러도 덮어쓰지 않음', Object.keys(again).length === 0 && (await S.sql`select count(*)::int n from notices`)[0].n === 3, again);
    await S.sql`delete from notices where id = 'X1'`;
    var step = 0, both = async function (who, action, req, label) {
      var a = M.call(who, action, req), b = await S.call(tok[who], action, req), na = norm(a), nb = norm(b);
      ok('같은 응답 ' + (++step) + ' ' + (label || '') + ' ' + who + ' ' + action + (a.ok ? '' : ' (오류: ' + a.error + ')'), na === nb, diff(na, nb)); return [a, b];
    };
    await both('adm', 'notice.list'); await both('adm', 'inq.list'); await both('adm', 'owners.list');
    await both('stf', 'notice.list', {}, '직원'); await both('ptn', 'notice.list', {}, '협력사 막힘');
    var n = await both('stf', 'notice.save', { notice: { title: '직원 공지', body: 'x', pinned: true } }, '직원은 고정 못 함');
    var sid = [n[0].notices.filter(function (x) { return x.title === '직원 공지'; })[0].id, n[1].notices.filter(function (x) { return x.title === '직원 공지'; })[0].id];
    var adm1 = [M.call('adm', 'notice.list').notices[0].id, (await S.call(tok.adm, 'notice.list')).notices[0].id];
    var e1 = [M.call('stf', 'notice.save', { id: adm1[0], notice: { title: '남의 것' } }), await S.call(tok.stf, 'notice.save', { id: adm1[1], notice: { title: '남의 것' } })];
    ok('같은 응답: 남의 공지 고치기 막힘', norm(e1[0]) === norm(e1[1]) && !e1[0].ok, [e1[0].error, e1[1].error]);
    var e2 = [M.call('stf', 'notice.save', { id: sid[0], notice: { title: '고침', body: 'y', pinned: true } }), await S.call(tok.stf, 'notice.save', { id: sid[1], notice: { title: '고침', body: 'y', pinned: true } })];
    ok('같은 응답: 내 공지 고치기', norm(e2[0]) === norm(e2[1]), diff(norm(e2[0]), norm(e2[1])));
    var e3 = [M.call('adm', 'notice.delete', { id: sid[0] }), await S.call(tok.adm, 'notice.delete', { id: sid[1] })]; ok('같은 응답: 관리자가 지우기', norm(e3[0]) === norm(e3[1]), diff(norm(e3[0]), norm(e3[1])));
    await both('adm', 'notice.save', { notice: { title: '' } }, '제목 없음');
    await both('stf', 'inq.save', { inq: { cust: 'C', body: '직원 문의', at: '2026-11-20' } });
    await both('stf', 'inq.save', { inq: { body: '' } }, '내용 없음'); await both('stf', 'inq.save', { inq: { body: 'x', at: '11/20' } }, '일시 틀림');
    var iq = [M.call('adm', 'inq.list').inqs, (await S.call(tok.adm, 'inq.list')).inqs], pick = function (l) { return l.filter(function (x) { return x.body === '문의1'; })[0].id; };
    var u1 = [M.call('adm', 'inq.save', { id: pick(iq[0]), inq: { body: '문의1 고침', answer: '답', status: '완료', faq: true } }), await S.call(tok.adm, 'inq.save', { id: pick(iq[1]), inq: { body: '문의1 고침', answer: '답', status: '완료', faq: true } })];
    ok('같은 응답: 문의 고치기 (일시 그대로)', norm(u1[0]) === norm(u1[1]), diff(norm(u1[0]), norm(u1[1])));
    var mine = function (l) { return l.filter(function (x) { return x.body === '직원 문의'; })[0].id; }, adq = function (l) { return l.filter(function (x) { return x.body === '문의2'; })[0].id; };
    var d1 = [M.call('stf', 'inq.delete', { id: adq(u1[0].inqs) }), await S.call(tok.stf, 'inq.delete', { id: adq(u1[1].inqs) })]; ok('같은 응답: 남이 응대한 문의 지우기 막힘', norm(d1[0]) === norm(d1[1]) && !d1[0].ok);
    var d2 = [M.call('stf', 'inq.delete', { id: mine(u1[0].inqs) }), await S.call(tok.stf, 'inq.delete', { id: mine(u1[1].inqs) })]; ok('같은 응답: 내 문의 지우기', norm(d2[0]) === norm(d2[1]), diff(norm(d2[0]), norm(d2[1])));
    var o2 = [M.call('adm', 'owners.list').owners, (await S.call(tok.adm, 'owners.list')).owners], oid = function (l, t) { return l.filter(function (x) { return x.task === t; })[0].id; };
    var s1 = [M.call('stf', 'owners.save', { id: oid(o2[0], '청구'), owner: { task: '청구', main: '박', sub: '정', memo: '월말' } }), await S.call(tok.stf, 'owners.save', { id: oid(o2[1], '청구'), owner: { task: '청구', main: '박', sub: '정', memo: '월말' } })];
    ok('같은 응답: 담당 바꾸기 → 변경 기록', norm(s1[0]) === norm(s1[1]), diff(norm(s1[0]), norm(s1[1])));
    await both('stf', 'owners.save', { owner: { task: '새 업무', main: '한' } });
    var x1 = [M.call('adm', 'owners.delete', { id: oid(o2[0], '마감') }), await S.call(tok.adm, 'owners.delete', { id: oid(o2[1], '마감') })]; ok('같은 응답: 업무 지우기', norm(x1[0]) === norm(x1[1]), diff(norm(x1[0]), norm(x1[1])));
    await both('ptn', 'owners.list', {}, '협력사 막힘'); await both('adm', 'owners.delete', { id: 'nope' }, '없는 업무');
    // Code.js(gas.js)가 이 시트를 읽을 때 새 표에서
    var fflate = require(path.join(__dirname, '..', 'sb', 'node_modules', 'fflate')), gasMod = await import(path.join(ROOT, 'supabase', 'functions', 'joil', 'gas.js'));
    var G = gasMod.makeGas({ sql: S.sql, src: SRC, zip: fflate.zipSync, gasFetch: async function () { throw new Error('시험'); }, fetch: async function () { throw new Error('시험'); } });
    var gv = await G.call({ action: 'owners.list', token: 'adm' }, { id: 'a', name: '관리', role: 'admin', perms: ['quote', 'analysis'] }), cv = await S.call(tok.adm, 'owners.list');
    delete cv.ok; delete cv.ms; ok('gas.js 도 새 표 내용을 시트처럼 읽음 (주간 요약·홈의 담당 대신)', norm(gv) === norm(cv), diff(norm(gv), norm(cv)));
    var gn = await G.call({ action: 'notice.list', token: 'adm' }, { id: 'a', name: '관리', role: 'admin', perms: ['quote'] }), cn = await S.call(tok.adm, 'notice.list'); delete cn.ok; delete cn.ms;
    ok('gas.js 공지도 새 표', norm(gn) === norm(cn), diff(norm(gn), norm(cn)));
  } finally { await S.stop(); }
})().catch(function (e) { ok('실행 오류', false, e.stack || String(e)); });
