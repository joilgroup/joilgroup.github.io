// 새 서버(Supabase) 로그인·계정·권한: 잠금·로그인 유지·임시 비밀번호·비밀번호 변경·관리자 계정 관리·사용중지 · 15초 확인 RPC(공개 키) · 브라우저 공개 키로 표 못 읽음
var L = require('../sb/lib.js'), ok = require('../lib/mock.js').ok;
(async function () {
  var S = await L.boot(); if (!S) { console.log('PASS (건너뜀) 시험용 Postgres 가 없어요'); return; }
  try {
    await L.users(S, [{ id: 'a', name: '관리', role: 'admin', perms: null }, { id: 'u', name: '직원', role: 'user', perms: 'quote', pw: 'pass1234' }, { id: 'p', name: '협력A', role: 'partner', perms: 'none', tabs: ['쿠팡부자재/평택'] }]);
    var bad; for (var i = 0; i < 5; i++) bad = await S.call('', 'login', { id: 'u', password: 'wrong' });
    ok('틀린 비밀번호', !bad.ok && /올바르지 않습니다/.test(bad.error), bad);
    var lock = await S.call('', 'login', { id: 'u', password: 'pass1234' }); ok('5번 틀리면 10분 잠김 (맞는 비밀번호도)', !lock.ok && /10분간 잠겼/.test(lock.error), lock);
    await S.sql`update login_fails set until = now() - interval '1 second'`;
    var lu = await S.call('', 'login', { id: 'u', password: 'pass1234', keep: true }); ok('10분 지나면 로그인 · 로그인 유지', lu.ok && lu.keep && lu.token.length === 68 && lu.user.perms.join() === 'quote', lu);
    var ses = await S.sql`select keep, expires_at > now() + interval '29 days' long from sessions where user_id = 'u'`; ok('로그인 유지 = 30일 세션 · 토큰은 해시만 저장', ses.length === 1 && ses[0].keep && ses[0].long, ses);
    var raw = await S.sql`select count(*)::int n from sessions where token_hash = ${lu.token}`; ok('토큰 원문은 DB에 없음', raw[0].n === 0);
    var me = await S.call(lu.token, 'me'); ok('me', me.ok && me.user.id === 'u' && me.settings && me.settings.tons, me);
    var la = await S.call('', 'login', { id: 'a', password: 'test1234' }), A = la.token;
    ok('관리자 권한 전부 (예전 계정 perms 빈 칸이어도)', la.ok && la.user.perms.indexOf('admin') !== -1, la);
    var cu = await S.call(A, 'admin.createUser', { id: 'new1', name: '새직원', role: 'user', perms: ['quote', 'track', 'xx'] }); ok('계정 만들기 → 임시 비밀번호', cu.ok && /^[A-Za-z0-9]{10}7$/.test(cu.tempPassword), cu);
    var dup = await S.call(A, 'admin.createUser', { id: 'new1', name: 'x' }); ok('같은 아이디 거부', !dup.ok && /이미 있는/.test(dup.error));
    var ln = await S.call('', 'login', { id: 'new1', password: cu.tempPassword }); ok('임시 비밀번호 로그인 → 비밀번호 변경 필요', ln.ok && ln.user.mustChange && ln.user.perms.join() === 'quote,track', ln);
    var blk = await S.call(ln.token, 'dispatch.tabs', { cust: '쿠팡부자재' }); ok('바꾸기 전엔 다른 기능 막힘', !blk.ok && /임시 비밀번호/.test(blk.error), blk);
    var weak = await S.call(ln.token, 'changePassword', { current: cu.tempPassword, next: 'abcdefgh' }); ok('비밀번호 규칙 (영문+숫자)', !weak.ok && /영문과 숫자/.test(weak.error));
    var cp = await S.call(ln.token, 'changePassword', { current: cu.tempPassword, next: 'newpass123' }); ok('비밀번호 변경', cp.ok, cp);
    var after = await S.call(ln.token, 'dispatch.tabs', { cust: '쿠팡부자재' }); ok('바꾼 뒤 배차 쓰기 가능', after.ok && after.tabs.length === 3, after);
    var lu2 = await S.call('', 'login', { id: 'u', password: 'pass1234', keep: true });
    await S.call(lu.token, 'changePassword', { current: 'pass1234', next: 'pass5678x' });
    var other = await S.call(lu2.token, 'me'); ok('비밀번호를 바꾸면 다른 기기의 로그인 유지가 풀림', !other.ok && /만료/.test(other.error), other);
    var mine = await S.call(lu.token, 'me'); ok('바꾼 기기는 계속 (6시간 세션)', mine.ok, mine);
    var list = await S.call(A, 'admin.listUsers'); ok('계정 목록 (시트 순서)', list.ok && list.users.map(function (x) { return x.id; }).join() === 'a,u,p,new1', list.users && list.users.map(function (x) { return x.id; }));
    var self = await S.call(A, 'admin.updateUser', { id: 'a', patch: { active: false } }); ok('본인 계정 중지 거부', !self.ok && /본인 계정/.test(self.error));
    await S.call(A, 'admin.updateUser', { id: 'u', patch: { active: false } });
    var off = await S.call(lu.token, 'me'); ok('사용중지하면 바로 막힘', !off.ok && /사용이 중지|만료/.test(off.error), off);
    var nolog = await S.call('', 'login', { id: 'u', password: 'pass5678x' }); ok('사용중지 계정 로그인 불가', !nolog.ok);
    await S.call(A, 'admin.updateUser', { id: 'u', patch: { active: true, perms: ['analysis'], name: '직원2' } });
    var rp = await S.call(A, 'admin.resetPassword', { id: 'u' }); var lr = await S.call('', 'login', { id: 'u', password: rp.tempPassword });
    ok('비밀번호 초기화 → 임시 비밀번호로 · 이름·권한 바뀜', lr.ok && lr.user.mustChange && lr.user.name === '직원2' && lr.user.perms.join() === 'analysis', lr);
    var nu = await S.call(lr.token, 'admin.listUsers'); ok('직원은 관리자 기능 못 씀', !nu.ok);
    var lo = await S.call(A, 'logout'); var gone = await S.call(A, 'me'); ok('로그아웃하면 토큰 끝', lo.ok && !gone.ok);
    var lp = await S.call('', 'login', { id: 'p', password: 'test1234' });
    // 15초 확인: 공개 키(anon)로 RPC — 함수 호출 수에 안 들어가요
    var D = '2026-11-20'; await S.sql`insert into disp_stamps (cust, date, stamp) values ('쿠팡부자재/평택', ${D}, 123), ('쿠팡부자재', ${D}, 456)`;
    var rpc = async function (tok, keys) { return S.sql.begin(async function (tx) { await tx.unsafe('set local role anon'); return (await tx.unsafe('select public.joil_stamps($1, $2, $3) r', [tok, keys, D]))[0].r; }).catch(function (e) { return { err: e.message }; }); };
    var r1 = await rpc(lp.token, ['쿠팡부자재/평택']); ok('RPC: 협력사 자기 탭 바뀐 시각', r1.ok && r1.stamps['쿠팡부자재/평택'] === 123, r1);
    ok('RPC: 실시간 채널 이름(비밀값 해시) 같이', /^j[0-9a-f]{32}$/.test((r1.topics || {})['쿠팡부자재/평택'] || '') && JSON.stringify(r1).indexOf('RT_SECRET') === -1, r1);
    var r2 = await rpc(lp.token, ['쿠팡부자재']); ok('RPC: 협력사는 다른 탭 못 봄', /볼 수 없는 탭/.test(r2.err || ''), r2);
    var r3 = await rpc('nope', ['쿠팡부자재']); ok('RPC: 토큰이 틀리면 거부', /만료/.test(r3.err || ''), r3);
    var r4 = await rpc(lr.token, ['쿠팡부자재', '없음']); ok('RPC: 직원은 여러 탭 · 없는 탭은 0', r4.ok && r4.stamps['쿠팡부자재'] === 456 && r4.stamps['없음'] === 0, r4);
    var anonRead = await S.sql.begin(async function (tx) { await tx.unsafe('set local role anon'); return tx.unsafe('select count(*) from joil.accounts'); }).catch(function (e) { return e.message; });
    ok('공개 키(anon)로 계정 표 직접 못 읽음', typeof anonRead === 'string' && /permission denied/.test(anonRead), anonRead);
    var anonWho = await S.sql.begin(async function (tx) { await tx.unsafe('set local role anon'); return tx.unsafe("select public.joil_whoami('x')"); }).catch(function (e) { return e.message; });
    ok('공개 키로 joil_whoami·복사 함수 못 부름', typeof anonWho === 'string' && /permission denied/.test(anonWho), anonWho);
    var who = (await S.sql.unsafe('select public.joil_whoami($1) r', [lp.token]))[0].r; ok('구글 쪽 토큰 확인(joil_whoami): 협력사 탭까지', who && who.id === 'p' && who.role === 'partner' && who.tabs === '쿠팡부자재/평택', who);
  } finally { await S.stop(); }
})().catch(function (e) { ok('실행 오류', false, e.stack || String(e)); });
