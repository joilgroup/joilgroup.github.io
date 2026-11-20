// 새 서버(Supabase · supabase/functions/joil/core.js)가 지금 서버(Code.js)와 같은 요청에 같은 응답을 내는지.
// 양쪽에 똑같은 순서로 요청을 보내고, 바뀌는 값(ID·링크코드·시각·ms)만 이름표로 바꿔 비교해요. 시험용 Postgres 를 잠깐 띄워요(없으면 건너뜀).
var M = require('../lib/mock.js'), ok = M.ok, L = require('../sb/lib.js');
function kst() { var k = new Date(Date.now() + 9 * 3600000); return k.toISOString().slice(0, 10); }
var D = kst(), D2 = (function () { var k = new Date(Date.now() + 9 * 3600000 + 86400000); return k.toISOString().slice(0, 10); })(), YM = D.slice(0, 7);
// 비교용으로 바뀌는 값 지우기: ID(D…·V…·L…·R…·P…) · 링크코드(20자리) · 일시 · 숫자 stamp · ms
function norm(o) {
  var names = {}, n = 0, nm = function (s) { return names[s] || (names[s] = '#' + (++n)); };
  var walk = function (v, k) {
    if (Array.isArray(v)) return v.map(function (x) { return walk(x, k); });
    if (v && typeof v === 'object') { var r = {}; Object.keys(v).filter(function (x) { return x !== 'ms'; }).sort().forEach(function (x) { var kk = /^[0-9a-f]{20}$/.test(x) || /^[DVLRP](yy|\d\d)\d{10}/.test(x) ? nm(x) : x; r[kk] = walk(v[x], x); }); return r; }
    if (typeof v === 'number' && (k === 'stamp' || (v > 1.6e12 && v < 2.5e12))) return 'N';
    if (typeof v === 'string') {
      if (/^[0-9a-f]{20}$/.test(v) || /^[DVLRP](yy|\d\d)\d{10}[0-9a-f]{5}\d*$/.test(v)) return nm(v);
      return v.replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?/g, 'TS').replace(/#재\d{10}/g, '#재N');
    }
    return v;
  };
  return JSON.stringify(walk(o));
}
function diff(a, b) { for (var i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return '…' + a.slice(Math.max(0, i - 80), i + 120) + '\n   ≠ …' + b.slice(Math.max(0, i - 80), i + 120); return ''; }

(async function () {
  var S = await L.boot(); if (!S) { console.log('PASS (건너뜀) 시험용 Postgres 가 없어요'); return; }
  try {
    await L.users(S, [{ id: 'a', name: '관리', role: 'admin', perms: 'quote,analysis' }, { id: 's', name: '직원', role: 'staff', perms: 'quote' }, { id: 'p', name: '협력A', role: 'partner', perms: 'none', tabs: ['쿠팡부자재/평택'] }]);
    var tok = {};
    for (var u of [['adm', 'a'], ['stf', 's'], ['ptn', 'p']]) { var lg = await S.call('', 'login', { id: u[1], password: 'test1234' }); tok[u[0]] = lg.token; ok('새 서버 로그인 ' + u[1], lg.ok && lg.token, lg); }
    var step = 0;
    async function both(who, action, req, label) {
      var a = M.call(who, action, req), b = await S.call(tok[who], action, req), na = norm(a), nb = norm(b);
      ok('같은 응답 ' + (++step) + ' ' + (label || '') + ' ' + who + ' ' + action, na === nb, diff(na, nb));
      return [a, b];
    }
    var o = function (fc, n, extra) { return Object.assign({ fc: fc, bundle: String(n), kg: String(n * 300), item: '박스', addr: '경기 평택시 테스트로 ' + n, from: '평택센터', m1: '010-0000-000' + n }, extra || {}); };
    await both('adm', 'dispatch.tabs', { cust: '쿠팡부자재' });
    await both('adm', 'dispatch.import', { cust: '쿠팡부자재', rows: [{ date: D, key: D + '|A|1', d: o('고양1', 3) }, { date: D, key: D + '|B|2', d: o('안성4', 5) }, { date: D, key: D + '|C|3', d: o('안성4', 2, { item: '롤' }) }] });
    await both('adm', 'dispatch.import', { cust: '쿠팡부자재', rows: [{ date: D, key: D + '|A|1', d: o('고양1', 3) }] }, '겹침');
    await both('adm', 'dispatch.import', { cust: '쿠팡부자재/평택', rows: [{ date: D, key: D + '|P|1', d: o('평택2', 4) }, { date: D, key: D + '|P|2', d: o('이천3', 6) }] });
    var day = await both('adm', 'dispatch.day', { cust: '쿠팡부자재', date: D });
    var ids = [day[0].orders.map(function (x) { return x.id; }), day[1].orders.map(function (x) { return x.id; })];
    // 전체 저장 (예전 방식): 호차 두 대 · 비용
    var full = function (k) { return { cust: '쿠팡부자재', date: D, orders: [{ id: ids[k][0], truck: 1, seq: 1 }, { id: ids[k][1], truck: 2, seq: 2 }, { id: ids[k][2], truck: 2, seq: 3 }], trucks: [{ no: 1, car: '12가3456', driver: '김기사', phone: '010-1111-2222', ton: '5톤', status: '배차완료', retCost: 10000 }, { no: 2, car: '34나5678', driver: '이기사', phone: '010-3333-4444', ton: '11톤', wait: '20,000', rev: '300000', cost: 250000 }] }; };
    var sv = [M.call('adm', 'dispatch.save', full(0)), await S.call(tok.adm, 'dispatch.save', full(1))];
    ok('같은 응답 전체 저장', norm(sv[0]) === norm(sv[1]), diff(norm(sv[0]), norm(sv[1])));
    var t1 = [sv[0].trucks[0].token, sv[1].trucks[0].token];
    await both('stf', 'dispatch.day', { cust: '쿠팡부자재', date: D }, '직원은 금액 없음');
    await both('ptn', 'dispatch.day', { cust: '쿠팡부자재', date: D }, '협력사 다른 탭');
    // 평택 탭: 바뀐 칸만 저장(patch) + 합차
    var pd = [M.call('adm', 'dispatch.day', { cust: '쿠팡부자재/평택', date: D }), await S.call(tok.adm, 'dispatch.day', { cust: '쿠팡부자재/평택', date: D })];
    var pp = function (k) { return { cust: '쿠팡부자재/평택', date: D, patch: true, orders: [{ id: pd[k].orders[0].id, truck: 1, seq: 1 }, { id: pd[k].orders[1].id, truck: 1, seq: 2 }], trucks: [{ no: 1, set: { car: '12가3456', driver: '김기사', join: t1[k] } }] }; };
    var ps = [M.call('adm', 'dispatch.save', pp(0)), await S.call(tok.adm, 'dispatch.save', pp(1))];
    ok('같은 응답 patch+합차 저장', norm(ps[0]) === norm(ps[1]), diff(norm(ps[0]), norm(ps[1])));
    var st = function (k) { return { cust: '쿠팡부자재', date: D, patch: true, trucks: [{ no: 1, token: t1[k], set: { status: '정보넘김', phone: '010-9999-8888' } }] }; };
    var ss = [M.call('adm', 'dispatch.save', st(0)), await S.call(tok.adm, 'dispatch.save', st(1))];
    ok('같은 응답 합차 전파 저장', norm(ss[0]) === norm(ss[1]), diff(norm(ss[0]), norm(ss[1])));
    await both('adm', 'dispatch.dayAll', { keys: ['쿠팡부자재', '쿠팡부자재/평택'], date: D });
    await both('ptn', 'dispatch.dayAll', { keys: ['쿠팡부자재/평택'], date: D }, '협력사');
    var pps = function (k) { return { cust: '쿠팡부자재/평택', date: D, trucks: [{ no: 1, car: '99하9999', status: '정보넘김', memo: '협력사 메모', retCost: 5 }] }; };
    var pr = [M.call('ptn', 'dispatch.save', pps(0)), await S.call(tok.ptn, 'dispatch.save', pps(1))];
    ok('같은 응답 협력사 저장(정보넘김 못 고름·메모 그대로)', norm(pr[0]) === norm(pr[1]), diff(norm(pr[0]), norm(pr[1])));
    await both('ptn', 'drivers.list', {}, '생년월일 빠짐');
    // 기사 링크
    var dg = [M.call('', 'drv.get', { t: t1[0] }), await S.call('', 'drv.get', { t: t1[1] })];
    ok('같은 응답 기사 링크(합차)', norm(dg[0]) === norm(dg[1]), diff(norm(dg[0]), norm(dg[1])));
    await both('adm', 'drv.get', { t: '0123456789abcdef0123' }, '없는 링크');
    // 오더 고치기·공지·옮기기·복사·지우기
    var ed = function (k) { return { cust: '쿠팡부자재', date: D, id: ids[k][0], patch: { bundle: '7', fc: '고양1 FC' } }; };
    var e = [M.call('adm', 'dispatch.editOrder', ed(0)), await S.call(tok.adm, 'dispatch.editOrder', ed(1))]; ok('같은 응답 오더 고치기', norm(e[0]) === norm(e[1]), diff(norm(e[0]), norm(e[1])));
    var nt = function (k) { return { cust: '쿠팡부자재', date: D, id: ids[k][1], noteIn: '내부', noteDrv: '13시 이후 상차가능' }; };
    e = [M.call('adm', 'dispatch.note', nt(0)), await S.call(tok.adm, 'dispatch.note', nt(1))]; ok('같은 응답 오더 공지', norm(e[0]) === norm(e[1]), diff(norm(e[0]), norm(e[1])));
    await both('ptn', 'dispatch.day', { cust: '쿠팡부자재/평택', date: D }, '협력사 내부공지 없음');
    var cp = function (k) { return { cust: '쿠팡부자재', date: D, toDate: D2, ids: [ids[k][0]] }; };
    e = [M.call('adm', 'dispatch.copyOrders', cp(0)), await S.call(tok.adm, 'dispatch.copyOrders', cp(1))]; ok('같은 응답 오더 복사', norm(e[0]) === norm(e[1]), diff(norm(e[0]), norm(e[1])));
    var mv = function (k) { return { cust: '쿠팡부자재', date: D, toDate: D2, ids: [ids[k][1], ids[k][2]], keepTruck: true }; };
    e = [M.call('adm', 'dispatch.moveOrders', mv(0)), await S.call(tok.adm, 'dispatch.moveOrders', mv(1))]; ok('같은 응답 오더 옮기기(호차째)', norm(e[0]) === norm(e[1]), diff(norm(e[0]), norm(e[1])));
    await both('adm', 'dispatch.day', { cust: '쿠팡부자재', date: D2 }, '옮긴 날짜');
    await both('adm', 'dispatch.month', { cust: '쿠팡부자재', ym: YM });
    await both('adm', 'dispatch.monthAll', { keys: ['쿠팡부자재', '쿠팡부자재/평택'], ym: YM });
    await both('stf', 'dispatch.month', { cust: '쿠팡부자재', ym: YM }, '직원');
    await both('ptn', 'dispatch.month', { cust: '쿠팡부자재', ym: YM }, '협력사 막힘');
    var dl = function (k) { return { cust: '쿠팡부자재', date: D, ids: [ids[k][0]] }; };
    e = [M.call('adm', 'dispatch.deleteOrders', dl(0)), await S.call(tok.adm, 'dispatch.deleteOrders', dl(1))]; ok('같은 응답 오더 지우기', norm(e[0]) === norm(e[1]), diff(norm(e[0]), norm(e[1])));
    // 탭·단가·코드·특이사항·단가표·센터도착
    await both('adm', 'dispatch.tabsSave', { cust: '쿠팡부자재', tabs: [{ name: '부자재-인천', suf: '', prefix: '부자재' }, { name: '부자재-평택', suf: '/평택', prefix: '부자재' }, { name: '부자재-대구', prefix: '부자재' }] });
    await both('adm', 'dispatch.tabs', { cust: '쿠팡부자재' });
    await both('ptn', 'dispatch.tabs', { cust: '쿠팡부자재' }, '협력사 자기 탭만');
    await both('adm', 'dispatch.priceSave', { cust: '쿠팡부자재', ym: YM, price: '12,500' });
    await both('adm', 'dispatch.price', { cust: '쿠팡부자재' });
    await both('stf', 'dispatch.price', { cust: '쿠팡부자재' }, '분석 권한 없음');
    await both('adm', 'dispatch.codesSave', { cust: '쿠팡부자재', codes: { sale: 'S1', buy: { '': 'B1', '/평택': 'B2' }, jo: 'J1' } });
    await both('adm', 'dispatch.codes', { cust: '쿠팡부자재' });
    await both('adm', 'dispatch.notesSave', { cust: '쿠팡부자재', list: [{ fc: '고양1', note: '14시부터 하차가능', ptn: true, drv: true }, { fc: '안성 4 FC', note: '오늘 꼭 가야함', lock: true }, { fc: '고양 1 FC', note: '14시부터 하차가능' }] });
    await both('adm', 'dispatch.notes', { cust: '쿠팡부자재' });
    await both('ptn', 'dispatch.notes', { cust: '쿠팡부자재' }, '협력사');
    await both('adm', 'dispatch.must', { cust: '쿠팡부자재' });
    await both('adm', 'dispatch.ratesSave', { cust: '쿠팡부자재', mode: 'add', rows: [{ from: '평택센터', to: '고양', ton: '5', price: '150,000' }, { from: '평택센터', to: '고양', ton: '5t', price: 160000, start: '2026.01.01' }, { from: '평택센터', to: '안성', ton: '11톤', price: 200000, start: '2099-01-01' }] });
    await both('adm', 'dispatch.ratesSave', { cust: '삼다수', mode: 'replace', rows: [{ from: '대우', to: '인천', ton: '18톤', price: 300000 }] });
    await both('adm', 'dispatch.mapSave', { fc: '고양1', dest: '고양' });
    await both('adm', 'dispatch.map', {});
    await both('stf', 'dispatch.rates', {}, '분석 권한 없음');
    await both('adm', 'dest.save', { cust: '쿠팡부자재', rows: [{ kind: '일반(FC도크)', code: 'X1', name: '고양1', addr: '경기 고양시 테스트로 1', rateTo: '고양' }, { code: 'X2', name: '이천3', addr: '경기 이천시 테스트로 3', rateTo: '이천' }] });
    await both('adm', 'dest.list', {});
    await both('ptn', 'dispatch.rates', {}, '협력사 자기 업체 단가');
    await both('adm', 'loading.save', { cust: '쿠팡부자재', place: { name: '평택센터', addr: '경기 평택시 테스트로 9', time: '08~17시', contact: '010-0000-0009', manager: '담당' } });
    await both('adm', 'loading.bulk', { cust: '쿠팡부자재', rows: [{ name: '평택센터', addr: '경기 평택시 테스트로 10' }, { name: '안성센터', addr: '경기 안성시 테스트로 1' }, { name: '안성센터', addr: '경기 안성시 테스트로 2' }] });
    await both('ptn', 'loading.list', {}, '협력사');
    var dr = [M.call('adm', 'drivers.save', { driver: { car: '77바7777', driver: '박기사', phone: '010-5555-6666', birth: '800101', black: true } }), await S.call(tok.adm, 'drivers.save', { driver: { car: '77바7777', driver: '박기사', phone: '010-5555-6666', birth: '800101', black: true } })];
    ok('같은 응답 기사 저장', norm(dr[0]) === norm(dr[1]), diff(norm(dr[0]), norm(dr[1])));
    await both('adm', 'drivers.save', { driver: { car: '77바7777', driver: '다른' } }, '같은 기사');
    await both('adm', 'drivers.bulk', { rows: [{ car: '77바7777', driver: '박기사', phone: '010-5555-6666', org: '협력A', black: '블랙' }, { car: '', driver: '최기사', phone: '010-7777-8888' }] });
    await both('ptn', 'drivers.save', { driver: { car: '55사5555', driver: '협력기사', birth: '700101' } }, '협력사 기사 추가');
    var dd = [M.call('adm', 'drivers.list', {}), await S.call(tok.adm, 'drivers.list', {})];
    var did = [dd[0].drivers.filter(function (x) { return x.driver === '최기사'; })[0].id, dd[1].drivers.filter(function (x) { return x.driver === '최기사'; })[0].id];
    e = [M.call('adm', 'drivers.delete', { id: did[0] }), await S.call(tok.adm, 'drivers.delete', { id: did[1] })]; ok('같은 응답 기사 지우기', norm(e[0]) === norm(e[1]), diff(norm(e[0]), norm(e[1])));
    var dg2 = [M.call('', 'drv.get', { t: t1[0] }), await S.call('', 'drv.get', { t: t1[1] })];
    ok('같은 응답 기사 링크(상차지·특이사항 붙은 뒤)', norm(dg2[0]) === norm(dg2[1]), diff(norm(dg2[0]), norm(dg2[1])));
    await both('adm', 'dispatch.stamp', { keys: ['쿠팡부자재', '없는탭'], date: D });
    await both('ptn', 'dispatch.stamp', { keys: ['쿠팡부자재'], date: D }, '협력사 남의 탭');
    await both('ptn', 'quotes.list', {}, '협력사 견적 막힘');
    await both('stf', 'admin.listUsers', {}, '관리자만');
  } finally { await S.stop(); }
})().catch(function (e) { ok('실행 오류', false, e.stack || String(e)); });
