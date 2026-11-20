// 서버 이전 도구(Code.js): 시험 복사 → Supabase(시험용 Postgres) → 새 서버가 같은 화면 데이터를 내는지 · 여러 번 눌러도 중복 없음 · 비교 도구가 다른 곳을 찾는지
// Apps Script 의 UrlFetchApp 를 가짜로 바꿔 Supabase RPC 요청을 모았다가 시험용 Postgres 에 그대로 실행해요.
var M = require('../lib/mock.js'), ok = M.ok, L = require('../sb/lib.js');
var D = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10), YM = D.slice(0, 7);
var sent = [], reply = {};
M.ctx.UrlFetchApp = { fetch: function (url, o) { var name = String(url).replace(/^.*\/rest\/v1\/rpc\//, ''), body = JSON.parse(o.payload || '{}'); sent.push({ name: name, body: body }); var r = reply[name]; return { getResponseCode: function () { return 200; }, getContentText: function () { return JSON.stringify(typeof r === 'function' ? r(body) : r === undefined ? { rows: 0 } : r); } }; } };
M.ctx.ScriptApp = { getService: function () { return { getUrl: function () { return 'https://script.google.com/macros/s/TEST/exec'; } }; }, getProjectTriggers: function () { return []; } };
require('vm').runInContext(require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'apps-script', 'Calc.js'), 'utf8'), M.ctx); // 공개 설정(joilMergeSettings)
M.props.SB_URL = 'https://test.supabase.co'; M.props.SB_KEY = 'sb_secret_test';
function norm(o) { return JSON.stringify(o, function (k, v) { return k === 'ms' || k === 'stamp' ? undefined : typeof v === 'string' ? v.replace(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}):\d{2}/g, '$1') : v; }); }
async function replay(S) { var list = sent.splice(0); for (var x of list) { var args = Object.keys(x.body).map(function (k) { return x.body[k]; }); await S.sql.unsafe('select public.' + x.name + '(' + args.map(function (_, i) { return '$' + (i + 1); }).join(',') + ') r', args); } return list.length; }
async function copyAll(S) { var st = { step: 0, from: 0 }, n = 0; while (n++ < 50) { var r = M.call('adm', 'admin.sbCopy', st); if (!r.ok) return r; await replay(S); if (r.done) return r; st = { step: r.step, from: r.from }; } return { ok: false, error: '안 끝남' }; }

(async function () {
  var S = await L.boot(); if (!S) { console.log('PASS (건너뜀) 시험용 Postgres 가 없어요'); return; }
  try {
    // 시트 쪽 가짜 데이터 (Code.js 로 만듦) — 계정은 비밀번호 해시째 옮겨서 같은 비밀번호로 로그인돼야 해요
    var us = M.ctx.SpreadsheetApp.getActive().insertSheet('계정'); us.d.push(M.ctx.USER_COLS.slice());
    us.d.push(['a', '관리', 'admin', '사용', M.ctx.hash_('test1234a', 'sa'), 'sa', 'N', '2026-01-01 09:00:00', '', 'quote,analysis', '']);
    us.d.push(['p', '협력A', 'partner', '사용', M.ctx.hash_('test1234p', 'sp'), 'sp', 'N', '2026-01-01 09:00:00', '', 'none', "'쿠팡부자재/평택"]);
    var o = function (fc, n) { return { fc: fc, bundle: String(n), item: '박스', addr: '경기 테스트시 ' + fc, from: '평택센터' }; };
    M.call('adm', 'dispatch.import', { cust: '쿠팡부자재', rows: [{ date: D, key: D + '|1', d: o('고양1', 3) }, { date: D, key: D + '|2', d: o('안성4', 5) }, { date: D, key: D + '|3', d: { fc: '이천', bundle: '30패키지' } }] });
    M.call('adm', 'dispatch.import', { cust: '쿠팡부자재/평택', rows: [{ date: D, key: D + '|P1', d: o('평택2', 4) }] });
    var day = M.call('adm', 'dispatch.day', { cust: '쿠팡부자재', date: D });
    var sv = M.call('adm', 'dispatch.save', { cust: '쿠팡부자재', date: D, orders: [{ id: day.orders[0].id, truck: 1, seq: 1 }, { id: day.orders[1].id, truck: 2, seq: 2 }], trucks: [{ no: 1, car: '12가3456', driver: '김기사', phone: '010-1111-2222', retCost: 10000 }, { no: 2, car: '34나5678', rev: 300000, cost: 250000 }] });
    var pd = M.call('adm', 'dispatch.day', { cust: '쿠팡부자재/평택', date: D });
    M.call('adm', 'dispatch.save', { cust: '쿠팡부자재/평택', date: D, patch: true, orders: [{ id: pd.orders[0].id, truck: 1, seq: 1 }], trucks: [{ no: 1, set: { car: '12가3456', join: sv.trucks[0].token } }] });
    M.call('adm', 'dispatch.tabsSave', { cust: '쿠팡부자재', tabs: [{ name: '부자재-인천', suf: '' }, { name: '부자재-평택', suf: '/평택' }] });
    M.call('adm', 'dispatch.priceSave', { cust: '쿠팡부자재', ym: YM, price: 12000 });
    M.call('adm', 'dispatch.codesSave', { cust: '쿠팡부자재', codes: { sale: 'S', buy: { '': 'B' }, jo: 'J' } });
    M.call('adm', 'dispatch.notesSave', { cust: '쿠팡부자재', list: [{ fc: '고양1', note: '14시부터', ptn: true, drv: true }] });
    M.props['DISP_MUST_삼다수'] = JSON.stringify(['인천백석']);
    M.call('adm', 'dispatch.ratesSave', { cust: '쿠팡부자재', mode: 'add', rows: [{ from: '평택센터', to: '고양', ton: '5톤', price: 150000 }] });
    M.call('adm', 'dispatch.mapSave', { fc: '고양1', dest: '고양' });
    M.call('adm', 'dest.save', { cust: '쿠팡부자재', rows: [{ code: 'X1', name: '고양1', addr: '경기 고양시 1', rateTo: '고양' }] });
    M.call('adm', 'loading.save', { cust: '쿠팡부자재', place: { name: '평택센터', addr: '경기 평택시 9' } });
    M.call('adm', 'drivers.save', { driver: { car: '77바7777', driver: '박기사', birth: '800101', black: true } });

    var r1 = await copyAll(S); ok('시험 복사 끝까지', r1.ok && r1.done, r1);
    var r2 = await copyAll(S); ok('두 번 눌러도 됨', r2.ok && r2.done, r2);
    var cnt = (await S.sql`select (select count(*) from disp_orders)::int o, (select count(*) from disp_trucks)::int t, (select count(*) from accounts)::int a, (select count(*) from drivers)::int d, (select count(*) from center_notes)::int n`)[0];
    ok('중복 없이 같은 줄 수 (오더 4 · 호차 3 · 계정 2)', cnt.o === 4 && cnt.t === 3 && cnt.a === 2 && cnt.n === 1, cnt);
    var gp = await S.sql`select key, value from props where key in ('GAS_URL','GAS_SECRET','PUBLIC_SETTINGS','DISP_MUST_삼다수')`; ok('구글 연결 주소·비밀값·공개 설정·예전 꼭 가야 하는 센터도 옮김', gp.length === 4, gp.map(function (x) { return x.key; }));
    ok('비밀값은 스크립트 속성과 같음', gp.filter(function (x) { return x.key === 'GAS_SECRET'; })[0].value === M.props.SB_GAS_SECRET);

    // 같은 비밀번호로 새 서버 로그인 → 시트에서 보던 것과 같은 화면 데이터
    var la = await S.call('', 'login', { id: 'a', password: 'test1234a' }), lp = await S.call('', 'login', { id: 'p', password: 'test1234p' });
    ok('옮긴 계정으로 같은 비밀번호 로그인 (관리자·협력사)', la.ok && lp.ok, [la.error, lp.error]);
    var same = async function (label, who, tok, action, req) { var a = M.call(who, action, req), b = await S.call(tok, action, req); ok('옮긴 뒤 같은 응답: ' + label, norm(a) === norm(b), norm(a).slice(0, 300) + '\n ≠ ' + norm(b).slice(0, 300)); };
    await same('배차 날짜', 'adm', la.token, 'dispatch.day', { cust: '쿠팡부자재', date: D });
    await same('합차 탭', 'adm', la.token, 'dispatch.day', { cust: '쿠팡부자재/평택', date: D });
    await same('월별', 'adm', la.token, 'dispatch.monthAll', { keys: ['쿠팡부자재', '쿠팡부자재/평택'], ym: YM });
    await same('탭', 'adm', la.token, 'dispatch.tabs', { cust: '쿠팡부자재' });
    await same('월별 단가', 'adm', la.token, 'dispatch.price', { cust: '쿠팡부자재' });
    await same('차도리 코드', 'adm', la.token, 'dispatch.codes', { cust: '쿠팡부자재' });
    await same('특이사항', 'adm', la.token, 'dispatch.notes', { cust: '쿠팡부자재' });
    await same('예전 꼭 가야 하는 센터 옮기기', 'adm', la.token, 'dispatch.notes', { cust: '삼다수' });
    await same('단가표', 'adm', la.token, 'dispatch.rates', {});
    await same('하차지', 'adm', la.token, 'dest.list', {});
    await same('상차지', 'adm', la.token, 'loading.list', {});
    await same('기사 풀', 'adm', la.token, 'drivers.list', {});
    await same('기사 링크', '', '', 'drv.get', { t: sv.trucks[0].token });
    var ptnTok = lp.token; M.ctx.requireSession_ = (function (f) { return function (t) { return t === 'ptn2' ? { id: 'p', name: '협력A', role: 'partner', perms: ['dispatch'], dispTabs: ['쿠팡부자재/평택'] } : f(t); }; })(M.ctx.requireSession_);
    await same('협력사 화면', 'ptn2', ptnTok, 'dispatch.day', { cust: '쿠팡부자재/평택', date: D });

    // 비교 도구: 같으면 같다고, Supabase 쪽 호차를 하나 지우면 그 날짜·금액을 짚어요
    reply.joil_summary = (await S.sql`select public.joil_summary(${YM}) r`)[0].r;
    var c1 = M.call('adm', 'admin.sbCompare', { ym: YM }); ok('비교: 같음', c1.ok && c1.same && c1.total.sheet.orders === 4, c1);
    await S.sql`delete from disp_trucks where cust = '쿠팡부자재' and no = 2`;
    reply.joil_summary = (await S.sql`select public.joil_summary(${YM}) r`)[0].r;
    var c2 = M.call('adm', 'admin.sbCompare', { ym: YM }), whats = (c2.diffs || []).map(function (x) { return x.what + ' ' + x.key; });
    ok('비교: 지운 호차의 날짜·매출·매입 차이를 짚음', !c2.same && whats.indexOf('호차 수 쿠팡부자재|' + D) !== -1 && whats.indexOf('매출 직접 입력 합계 쿠팡부자재') !== -1 && whats.indexOf('실제 매입 합계 쿠팡부자재') !== -1, whats);
    ok('비교: 번들 합계(패키지 줄 빼고)도 같음', !whats.some(function (x) { return /번들/.test(x); }), whats);

    // 전환 뒤(SB_LIVE)에는 시험 복사로 덮어쓰기 거부
    await S.sql`insert into props (key, value) values ('SB_LIVE', '1')`;
    var live = null; try { await S.sql.unsafe("select public.joil_copy('disp_orders', '[]'::json, true)"); } catch (e) { live = e.message; }
    ok('전환 뒤에는 시험 복사 덮어쓰기 거부', /전환/.test(live || ''), live);
    sent.length = 0; var nb = M.call('', 'int.geo', { secret: 'x', addrs: [] }); ok('내부 액션은 비밀값이 틀리면 거부', !nb.ok && /권한/.test(nb.error), nb);
  } finally { await S.stop(); }
})().catch(function (e) { ok('실행 오류', false, e.stack || String(e)); });
