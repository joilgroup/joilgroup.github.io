// 로그인 유지: 세션 캐시(6시간)가 비어도 30일 보관한 토큰으로 되살리기
var M = require('../lib/mock.js'), ok = M.ok, ctx = M.ctx, sc = ctx.CacheService.getScriptCache();
ctx.cachedUser_ = function (id) { return id === 'u1' ? { name: '유저', role: 'admin', active: true, perms: '', tabs: '' } : null; };
var real = ctx.__realRequireSession, tok = 'tok-abc';
var err = function (t) { try { real(t); return ''; } catch (e) { return e.message; } };
var keeps = function () { return Object.keys(M.props).filter(function (x) { return x.indexOf('RT_') === 0; }); };

sc.put('S_' + tok, JSON.stringify({ id: 'u1' }), 100);
ok('캐시에 있으면 통과', real(tok).id === 'u1');
sc.remove('S_' + tok);
ok('유지 안 했으면 만료', /만료/.test(err(tok)));
ctx.keepPut_(tok, 'u1'); sc.remove('S_' + tok);
ok('유지했으면 캐시가 비어도 되살림', real(tok).id === 'u1');
ok('되살리면서 캐시도 다시 넣음', !!sc.get('S_' + tok));
var k = keeps();
ok('토큰은 해시로만 저장', k.length === 1 && k[0].indexOf(tok) === -1 && M.props[k[0]].indexOf(tok) === -1, k);
var v = JSON.parse(M.props[k[0]]); v.exp = Date.now() - 1; M.props[k[0]] = JSON.stringify(v); sc.remove('S_' + tok);
ok('30일 지나면 만료하고 지움', /만료/.test(err(tok)) && !keeps().length);
ctx.keepPut_(tok, 'u1'); ctx.keepDropUser_('u1'); sc.remove('S_' + tok);
ok('비밀번호를 바꾸면 다른 기기 유지도 풀림', /만료/.test(err(tok)));
ctx.keepPut_('tok-x', 'u2'); sc.remove('S_tok-x');
ok('사용중지 계정은 막고 지움', /중지/.test(err('tok-x')) && !keeps().length);
ctx.keepPut_('tok-y', 'u1');
var rs = ctx.requireSession_; ctx.requireSession_ = function () { return { id: 'u1', name: 'u', role: 'admin', perms: [] }; };
var r = M.call('tok-y', 'logout', {}); ctx.requireSession_ = rs;
ok('로그아웃하면 유지도 지움', !r.error && !keeps().length, r.error);
