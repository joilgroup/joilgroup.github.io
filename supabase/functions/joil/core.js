// 조일 서버 (Supabase 판) — apps-script/Code.js 의 로그인·계정·배차 액션을 같은 약속으로 옮긴 것.
// 요청 { action, token, ... } → 응답 { ok, ... } 이 Code.js 와 같게 (tests/sb/parity.test.js 가 양쪽을 같은 요청으로 비교해요).
// 데이터: Postgres 스키마 joil (supabase/migrations/004·005). 사진 파일·주소 좌표(카카오)는 아직 구글 쪽(Code.js 'int.*' 액션)에 맡겨요.
// Deno(Supabase 함수)와 node(테스트) 둘 다에서 돌도록 바깥 의존 없이 씀: sql = postgres.js 연결 (sql.unsafe·sql.begin).
// 코드 규칙은 Code.js 와 맞춰요: 함수 이름은 Code.js 이름에서 끝의 _ 만 뺌 → 고칠 때 양쪽을 나란히 보기 쉽게.

import { AsyncLocalStorage } from 'node:async_hooks';
import { makePort, portActions } from './port.js';
import { makeUrgent } from './urgent.js';
var TZ_MS = 9 * 3600000; // 한국 시간 (서머타임 없음)
var SESSION_SECONDS = 6 * 60 * 60, KEEP_DAYS = 30, LOGIN_MAX_FAIL = 5, HASH_ROUNDS = 300;
var PERMS = ['quote', 'analysis', 'search', 'track'];
var DISP_CUST0 = '쿠팡부자재';
var DISP_STATUS = ['배차전', '배차완료', '정보넘김', '회차', '정보변경', '조일배차'];
var DISP_TRK_FIELDS = ['car', 'driver', 'phone', 'time', 'ton', 'memo'];
var DISP_JOIN_KEYS = ['car', 'driver', 'phone', 'time', 'ton', 'status'];
var DISP_PATCH_KEYS = DISP_TRK_FIELDS.concat(['status', 'retCost', 'wait', 'support', 'join', 'rev', 'cost']);
var DISP_EDIT_KEYS = ['bundle', 'kg', 'item', 'fc', 'addr', 'hours', 'dock', 'm1', 'm2', 'm3', 'rsv', 'rsvCode'];
var DISP_RATE_TONS = ['1톤', '2.5톤', '3.5톤', '5톤', '8톤', '11톤', '14톤', '18톤'];
var PLACE_PHOTO_MAX = 2;
var PARTNER_ACTIONS = ['me', 'logout', 'changePassword', 'publicSettings', 'dispatch.search', 'dispatch.tabs', 'dispatch.day', 'dispatch.dayAll', 'dispatch.save', 'dispatch.stamp', 'dispatch.geo', 'dispatch.receipt', 'dispatch.rates', 'dispatch.must', 'dispatch.notes', 'loading.list', 'loading.photo', 'drivers.list', 'drivers.save'];
/** 이 서버가 맡는 액션 (화면 갈림길 SB_ACTIONS 와 같은 목록 · 나머지는 아직 Apps Script) */
export var ACTIONS = ['login', 'me', 'logout', 'changePassword', 'publicSettings', 'drv.get', 'drv.upload', 'drv.photo',
  'admin.listUsers', 'admin.createUser', 'admin.updateUser', 'admin.resetPassword',
  'dispatch.day', 'dispatch.month', 'dispatch.dayAll', 'dispatch.monthAll', 'dispatch.stamp', 'dispatch.tabs', 'dispatch.tabsSave', 'dispatch.import', 'dispatch.save', 'dispatch.deleteOrders', 'dispatch.note', 'dispatch.copyOrders', 'dispatch.moveOrders', 'dispatch.editOrder',
  'dispatch.rates', 'dispatch.ratesSave', 'dispatch.mapSave', 'dispatch.map', 'dispatch.price', 'dispatch.priceSave', 'dispatch.codes', 'dispatch.codesSave', 'dispatch.must', 'dispatch.mustSave', 'dispatch.notes', 'dispatch.notesSave', 'dispatch.geo', 'dispatch.receipt',
  'loading.list', 'loading.save', 'loading.delete', 'loading.photo', 'loading.photoAdd', 'loading.photoCap', 'loading.photoDelete', 'drivers.list', 'drivers.save', 'drivers.delete', 'dest.list', 'dest.save', 'loading.bulk', 'drivers.bulk', 'dispatch.history', 'admin.audit', 'dispatch.search',
  'notice.list', 'notice.save', 'notice.delete', 'inq.list', 'inq.save', 'inq.delete', 'owners.list', 'owners.save', 'owners.delete', 'work.list', 'work.stamp', 'work.op', 'admin.usage', 'admin.routes', 'admin.routeRefetch'].concat(portActions());
/** 진짜 표로 옮긴 영역 (012): 액션 앞부분 → 시트 이름. props 'MOVED_시트'가 있을 때만 이 서버가 맡아요(없으면 gas.js 가 시트 그대로) */
export var MOVED = { 'notice.': '공지', 'inq.': '문의기록', 'owners.': '업무담당', 'work.': '업무기록' };
// 화면이 아무 설정도 안 옮겼을 때 쓰는 기본 공개 설정 (Calc.js joilDefaultSettings 에서 뽑은 것 · 옮기기 도구가 실제 값을 props.PUBLIC_SETTINGS 에 넣어요)
var PUBLIC_DEFAULT = { tons: ['1톤', '1.4톤', '2.5톤', '3.5톤', '5톤', '8톤', '11톤', '14톤', '25톤'], fuelMode: 'manual', manualPrice: 1500, baseTon: '5톤', roundTrip: false, maxRows: 1000, retentionDays: 90, quoteFooter: '※ 부가세 별도 / 대기·수작업 발생 시 별도 협의', maxKm: 600, priceRounding: { unit: 1000, mode: 'round' }, specials: [] };

/* ───────────── 도구 ───────────── */
function p2(n) { return ('0' + n).slice(-2); }
function kst(d) { return new Date((d ? d.getTime() : Date.now()) + TZ_MS); }
function ymd(d) { var k = kst(d); return k.getUTCFullYear() + '-' + p2(k.getUTCMonth() + 1) + '-' + p2(k.getUTCDate()); }
function nowTxt() { var k = kst(); return ymd() + ' ' + p2(k.getUTCHours()) + ':' + p2(k.getUTCMinutes()) + ':' + p2(k.getUTCSeconds()); }
function stampTxt(f) { var k = kst(), y = String(k.getUTCFullYear()); return f === 'MMddHHmmss' ? p2(k.getUTCMonth() + 1) + p2(k.getUTCDate()) + p2(k.getUTCHours()) + p2(k.getUTCMinutes()) + p2(k.getUTCSeconds()) : f === 'HHmmss' ? p2(k.getUTCHours()) + p2(k.getUTCMinutes()) + p2(k.getUTCSeconds()) : y.slice(2) + p2(k.getUTCMonth() + 1) + p2(k.getUTCDate()) + p2(k.getUTCHours()) + p2(k.getUTCMinutes()) + p2(k.getUTCSeconds()); }
/** 시트의 일시 칸: 구글 시트는 'yyyy-MM-dd HH:mm:ss' 글자를 날짜로 바꿔 저장해서 Code.js fmt_ 는 'yyyy-MM-dd HH:mm' 로 돌려줘요 → 같게 */
function fmt(v) { v = String(v == null ? '' : v); return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v) ? v.slice(0, 16) : v; }
function uuid() { return crypto.randomUUID(); }
function newId(prefix) { return prefix + stampTxt() + uuid().replace(/-/g, '').slice(0, 5); }
function parseJson(v, d) { try { return v ? (typeof v === 'string' ? JSON.parse(v) : v) : d; } catch (e) { return d; } }
async function sha256hex(s) { var b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s))); return Array.from(new Uint8Array(b)).map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
async function hash(pw, salt) { var h = String(salt) + ':' + String(pw); for (var i = 0; i < HASH_ROUNDS; i++) h = await sha256hex(h + String(salt)); return h; }
async function randomPassword() {
  var chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', out = '';
  var b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(uuid())));
  for (var i = 0; i < 10; i++) out += chars.charAt(b[i] % chars.length);
  return out + '7';
}
function txt(v) { return String(v == null ? '' : v).replace(/^'/, ''); }
function err(m) { return new Error(m); }

/** 서버 하나 만들기: sql = postgres.js 연결 (search_path 에 joil 스키마), opts.fetch = 구글 쪽 호출(테스트에서 바꿔 끼움) */
export function makeServer(sql, opts) {
  opts = opts || {};
  var gasFetch = opts.fetch || (typeof fetch !== 'undefined' ? fetch : null);
  // 변경 이력(DB 트리거)이 '누가'를 알게: 요청마다 이름을 들고 있다가(ctx) 쓰기 문장 앞에 set_config('joil.who') — 트랜잭션 안에서만 유효해서 다른 요청과 안 섞여요
  var ctxStore = new AsyncLocalStorage();
  function ctxWho() { var c = ctxStore.getStore(); return (c && c.who) || ''; }
  var Q = function (db, text, params) {
    var who = ctxWho();
    if (who && db === sql && /^\s*(insert|update|delete)\b/i.test(text) && !/^\s*\S+\s+(into\s+|from\s+)?(sessions|login_fails|disp_stamps)\b/i.test(text)) {
      return sql.begin(async function (tx) { await tx.unsafe("select set_config('joil.who', $1, true)", [who]); return tx.unsafe(text, params || []); });
    }
    return db.unsafe(text, params || []);
  };

  /* ── 구글 쪽(Code.js int.* 액션)에 맡기는 일: 사진 파일(드라이브)·주소 좌표(카카오+주소캐시) ── */
  async function gas(action, payload) {
    var p = await propsGet(sql, ['GAS_URL', 'GAS_SECRET']);
    if (!p.GAS_URL || !p.GAS_SECRET || !gasFetch) throw err('구글 서버 연결(GAS_URL)이 아직 없어요. 관리자 → 서버 이전 → 시험 복사를 한 번 눌러 주세요.');
    var res = await gasFetch(p.GAS_URL, { method: 'POST', body: JSON.stringify(Object.assign({ action: action, secret: p.GAS_SECRET }, payload || {})), redirect: 'follow' });
    var j = JSON.parse(await res.text()); if (!j.ok) throw err(j.error || '구글 서버 오류'); return j;
  }
  async function propsGet(db, keys) { var o = {}; (await Q(db, 'select key, value from props where key = any($1)', [keys])).forEach(function (r) { o[r.key] = r.value; }); return o; }
  async function propSet(db, k, v) { await Q(db, 'insert into props (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value', [k, String(v)]); }
  async function propDel(db, k) { await Q(db, 'delete from props where key = $1', [k]); }

  /** 저장 잠금: Code.js dispLock_ 처럼 30초 기다려도 차례가 안 오면 BUSY (아무것도 안 썼으니 화면이 다시 보내요) · 같은 업체·날짜끼리만 줄 세워요 */
  async function locked(name, fn, busy) {
    try {
      return await sql.begin(async function (tx) {
        await Q(tx, "set local lock_timeout = '30s'");
        await Q(tx, 'select pg_advisory_xact_lock(hashtext($1))', [name]);
        await Q(tx, "set local lock_timeout = '0'");
        if (ctxWho()) await Q(tx, "select set_config('joil.who', $1, true)", [ctxWho()]);
        return fn(tx);
      });
    } catch (e) {
      if (e && e.code === '55P03') throw err(busy ? 'BUSY|다른 저장이 몰려 차례를 기다리다 시간이 지났어요. 잠시 후 다시 저장해 주세요.' : '다른 저장이 끝나지 않았어요. 잠시 후 다시 해 주세요.');
      throw e;
    }
  }

  /* ───────────── 로그인 / 세션 ───────────── */
  function permsOf(role, raw) {
    if (role === 'admin') return ['quote', 'analysis', 'search', 'track', 'admin'];
    if (role === 'partner') return ['dispatch'];
    if (raw == null || raw === '') return ['quote'];
    return String(raw).split(',').map(function (x) { return x.trim(); }).filter(function (x) { return PERMS.indexOf(x) !== -1; });
  }
  function tabsOf(raw) { return String(raw || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean); }
  function permsToCell(list) { var p = (list || []).filter(function (x) { return PERMS.indexOf(x) !== -1; }); return p.length ? p.join(',') : 'none'; }
  function canCost(s) { return !!s && (s.role === 'admin' || (s.perms || []).indexOf('analysis') !== -1); }
  function requirePerm(session, perm) { if (session.perms.indexOf(perm) === -1) throw err({ analysis: '분석 메뉴 권한이 없습니다. 관리자에게 요청하세요.', search: '배차검색 권한이 없습니다. 관리자에게 요청하세요.', track: '차량 위치 권한이 없습니다. 관리자에게 요청하세요.' }[perm] || '견적 메뉴 권한이 없습니다. 관리자에게 요청하세요.'); }
  async function findUser(id) { var r = await Q(sql, 'select * from accounts where id = $1', [String(id)]); return r[0] || null; }
  async function publicSettings() { var p = await propsGet(sql, ['PUBLIC_SETTINGS']); return parseJson(p.PUBLIC_SETTINGS, null) || JSON.parse(JSON.stringify(PUBLIC_DEFAULT)); }
  function sessOf(u) { return { id: u.id, name: u.name, role: u.role, mustChange: u.must_change === 'Y', perms: permsOf(u.role, u.perms == null ? '' : u.perms), dispTabs: tabsOf(u.disp_tabs) }; }

  async function login(id, password, keep) {
    id = String(id || '').trim();
    if (!id || !password) throw err('아이디와 비밀번호를 입력하세요.');
    var f = (await Q(sql, 'select n from login_fails where user_id = $1 and until > now()', [id]))[0], fails = f ? f.n : 0;
    if (fails >= LOGIN_MAX_FAIL) throw err('로그인 실패가 많아 10분간 잠겼습니다.');
    var u = await findUser(id);
    if (!u || u.status !== '사용' || await hash(password, u.salt) !== u.pw_hash) {
      await Q(sql, "insert into login_fails (user_id, n, until) values ($1, $2, now() + interval '10 minutes') on conflict (user_id) do update set n = excluded.n, until = excluded.until", [id, fails + 1]);
      throw err('아이디 또는 비밀번호가 올바르지 않습니다.');
    }
    await Q(sql, 'delete from login_fails where user_id = $1', [id]);
    await Q(sql, 'update accounts set last_login = $2 where id = $1', [id, nowTxt()]);
    var token = uuid() + uuid().replace(/-/g, '');
    await Q(sql, 'insert into sessions (token_hash, user_id, keep, expires_at) values ($1, $2, $3, now() + $4::int * interval \'1 second\')', [await sha256hex(token), id, !!keep, keep ? KEEP_DAYS * 86400 : SESSION_SECONDS]);
    if (Math.random() < 0.05) { await Q(sql, 'delete from sessions where expires_at < now()'); await Q(sql, "delete from audit where at < now() - interval '400 days'").catch(function () {}); } // 가끔 지난 세션·1년 넘은 변경 이력 정리
    return { token: token, user: sessOf(u), settings: await publicSettings(), keep: !!keep };
  }
  /** 매 요청마다 계정을 다시 확인 → 사용중지하면 바로 차단 · 쓰는 동안 만료 연장 (6시간 / 로그인 유지 30일) */
  async function requireSession(token) {
    if (!token) throw err('로그인이 필요합니다.');
    var th = await sha256hex(token), s = (await Q(sql, 'select * from sessions where token_hash = $1 and expires_at > now()', [th]))[0];
    if (!s) throw err('로그인이 만료되었습니다. 다시 로그인하세요.');
    var u = await findUser(s.user_id);
    if (!u || u.status !== '사용') { await Q(sql, 'delete from sessions where token_hash = $1', [th]); throw err('사용이 중지된 계정입니다.'); }
    var life = s.keep ? KEEP_DAYS * 86400 : SESSION_SECONDS; // 연장은 5분(유지는 하루)에 한 번만 써요
    await Q(sql, 'update sessions set expires_at = now() + $2::int * interval \'1 second\' where token_hash = $1 and expires_at < now() + ($2::int - $3::int) * interval \'1 second\'', [th, life, s.keep ? 86400 : 300]);
    var o = sessOf(u); o.tokenHash = th; return o;
  }
  function pub(s) { return { id: s.id, name: s.name, role: s.role, mustChange: s.mustChange, perms: s.perms, dispTabs: s.dispTabs }; }
  async function logout(token) { if (token) await Q(sql, 'delete from sessions where token_hash = $1', [await sha256hex(token)]); return {}; }
  function checkPasswordRule(pw) {
    pw = String(pw || '');
    if (pw.length < 8) throw err('비밀번호는 8자 이상이어야 합니다.');
    if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) throw err('비밀번호에 영문과 숫자를 모두 넣어 주세요.');
  }
  async function setPassword(id, pw, mustChange) { var salt = uuid(); await Q(sql, 'update accounts set salt = $2, pw_hash = $3, must_change = $4 where id = $1', [id, salt, await hash(pw, salt), mustChange ? 'Y' : 'N']); }
  /** 비밀번호를 바꾸면 다른 기기의 로그인 유지도 풀어요 (Code.js keepDropUser_ 와 같게: 이 기기는 6시간 세션으로 남음) */
  async function keepDropUser(id, exceptHash) {
    await Q(sql, 'delete from sessions where user_id = $1 and keep and token_hash <> $2', [id, exceptHash || '']);
    if (exceptHash) await Q(sql, 'update sessions set keep = false, expires_at = least(expires_at, now() + $2::int * interval \'1 second\') where token_hash = $1', [exceptHash, SESSION_SECONDS]);
  }
  async function changePassword(session, current, next) {
    var u = await findUser(session.id);
    if (await hash(current || '', u.salt) !== u.pw_hash) throw err('현재 비밀번호가 올바르지 않습니다.');
    checkPasswordRule(next);
    await setPassword(session.id, next, false);
    await keepDropUser(session.id, session.tokenHash);
    return {};
  }

  /* ───────────── 계정 (관리자) ───────────── */
  async function listUsers() {
    return (await Q(sql, 'select * from accounts order by ord')).map(function (r) {
      return { id: r.id, name: r.name, role: r.role, active: r.status === '사용', mustChange: r.must_change === 'Y', createdAt: fmt(r.created_at), lastLogin: fmt(r.last_login), perms: permsOf(r.role, r.perms == null ? '' : r.perms), dispTabs: tabsOf(r.disp_tabs) };
    });
  }
  async function createUser(id, name, role, perms, dispTabs) {
    id = String(id || '').trim(); name = String(name || '').trim();
    if (!/^[A-Za-z0-9_.-]{3,30}$/.test(id)) throw err('아이디는 영문/숫자 3~30자로 입력하세요.');
    if (!name) throw err('이름을 입력하세요.');
    if (await findUser(id)) throw err('이미 있는 아이디입니다.');
    var temp = await randomPassword(), salt = uuid();
    role = role === 'admin' || role === 'partner' ? role : 'user';
    await Q(sql, "insert into accounts (id, name, role, status, pw_hash, salt, must_change, created_at, last_login, perms, disp_tabs) values ($1, $2, $3, '사용', $4, $5, 'Y', $6, '', $7, $8)",
      [id, name, role, await hash(temp, salt), salt, nowTxt(), role === 'partner' ? 'none' : permsToCell(perms || ['quote']), role === 'partner' ? (dispTabs || []).map(String).join('\n') : '']);
    return { tempPassword: temp };
  }
  async function updateUser(session, id, patch) {
    var u = await findUser(id); if (!u) throw err('계정을 찾을 수 없습니다.');
    if (id === session.id && (patch.active === false || patch.role === 'user')) throw err('본인 계정은 중지하거나 권한을 낮출 수 없습니다.');
    if (Object.prototype.hasOwnProperty.call(patch, 'active')) await Q(sql, 'update accounts set status = $2 where id = $1', [id, patch.active ? '사용' : '중지']);
    if (patch.role) await Q(sql, 'update accounts set role = $2 where id = $1', [id, patch.role === 'admin' || patch.role === 'partner' ? patch.role : 'user']);
    if (Array.isArray(patch.dispTabs)) await Q(sql, 'update accounts set disp_tabs = $2 where id = $1', [id, patch.dispTabs.map(String).join('\n')]);
    if (patch.name != null) { // 직원 목록(일정) 이름 연결은 일정이 아직 구글 쪽이라 Code.js 가 해요 — docs/서버이전.md '아직 안 옮긴 것'
      var nm = String(patch.name).trim().slice(0, 30); if (!nm) throw err('이름을 넣으세요.');
      await Q(sql, 'update accounts set name = $2 where id = $1', [id, nm]);
    }
    if (Array.isArray(patch.perms)) await Q(sql, 'update accounts set perms = $2 where id = $1', [id, permsToCell(patch.perms)]);
    if (patch.active === false) await Q(sql, 'delete from sessions where user_id = $1', [id]);
    return {};
  }
  async function resetPassword(id) {
    var u = await findUser(id); if (!u) throw err('계정을 찾을 수 없습니다.');
    var temp = await randomPassword(); await setPassword(id, temp, true); await keepDropUser(id, '');
    return { tempPassword: temp };
  }

  /* ───────────── 배차: 읽기 ───────────── */
  function dispStatus(v) { v = txt(v); return v === '배차중' ? '' : v === '차량변경' ? '정보변경' : v; }
  function custOfRow(v) { return txt(v).trim() || DISP_CUST0; }
  function custReq(c) { return String(c || '').trim().slice(0, 50) || DISP_CUST0; }
  function dispCust(c) { c = String(c || '').trim(); if (!c) throw err('업체를 고르세요.'); return c.slice(0, 50); }
  function dispDate(d) { d = String(d || '').trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw err('날짜 형식은 YYYY-MM-DD 입니다: ' + d); return d; }
  function dispCo(key) { return String(key || '').replace(/\/.*$/, ''); }
  function ordRow(r) { return { id: r.id, cust: r.cust, date: r.date, key: r.key, d: parseJson(r.data, {}) || {}, truck: r.truck == null ? '' : Number(r.truck), seq: Number(r.seq) || 0, by: r.by_name || '', at: fmt(r.at), noteIn: r.note_in || '', noteDrv: r.note_drv || '' }; }
  function trkRow(r) { return { cust: r.cust, date: r.date, no: Number(r.no), car: r.car, driver: r.driver, phone: r.phone, time: r.time, ton: r.ton, memo: r.memo, by: r.by_name || '', at: fmt(r.at), token: r.token || '', status: dispStatus(r.status), retCost: Number(r.ret_cost) || 0, wait: Number(r.wait) || 0, support: Number(r.support) || 0, join: r.join_tk || '', rev: r.rev == null ? null : Number(r.rev), cost: r.cost == null ? null : Number(r.cost) }; }
  var ORD_SORT = ' order by date, seq, ord', TRK_SORT = ' order by date, no, uid';
  async function dispOrdersDay(db, cust, date) { return (await Q(db, 'select * from disp_orders where cust = $1 and date = $2' + ORD_SORT, [cust, date])).map(ordRow); }
  async function dispTrucksDay(db, cust, date) { return (await Q(db, 'select * from disp_trucks where cust = $1 and date = $2' + TRK_SORT, [cust, date])).map(trkRow); }
  async function dispDay(cust, date, db) {
    db = db || sql; cust = dispCust(cust); date = dispDate(date);
    var since = ymd(new Date(Date.now() - 120 * 86400000)), days = {};
    (await Q(db, 'select date, count(*)::int n from disp_orders where cust = $1 and date >= $2 group by date order by date', [cust, since])).forEach(function (r) { days[r.date] = r.n; });
    return { orders: await dispOrdersDay(db, cust, date), trucks: await dispJoinMark(db, cust, await dispTrucksDay(db, cust, date)), days: days, receipts: await dispReceipts(db, cust, date) };
  }
  async function dispMonth(cust, ym) {
    cust = dispCust(cust); ym = String(ym || ''); if (!/^\d{4}-\d{2}$/.test(ym)) throw err('월을 확인하세요.');
    var lo = ym + '-00', hi = ym + '-99';
    return { orders: (await Q(sql, 'select * from disp_orders where cust = $1 and date > $2 and date < $3' + ORD_SORT, [cust, lo, hi])).map(ordRow),
      trucks: await dispJoinMark(sql, cust, (await Q(sql, 'select * from disp_trucks where cust = $1 and date > $2 and date < $3' + TRK_SORT, [cust, lo, hi])).map(trkRow)) };
  }
  async function dispMulti(keys, fn) { keys = (keys || []).map(String).filter(Boolean).slice(0, 40); var out = {}; for (var k of keys) out[k] = await fn(k); return { byKey: out }; }
  /** 같은 날짜·같은 업체의 호차 (합차 계산용) */
  async function coTrucks(db, co, dates) { return (await Q(db, "select * from disp_trucks where date = any($1) and (cust = $2 or cust like $3)" + TRK_SORT, [dates, co, co.replace(/[\\%_]/g, '\\$&') + '/%'])).map(trkRow); }
  function dispJoinGroup(all, t) {
    var base = t.join || t.token; if (!base) return [];
    var g = all.filter(function (x) { return x.date === t.date && dispCo(x.cust) === dispCo(t.cust) && x.token && (x.token === base || x.join === base); });
    if (g.length < 2 || !g.some(function (x) { return x.token === base; })) return [];
    return g.sort(function (a, b) { return (a.token === base ? 0 : 1) - (b.token === base ? 0 : 1); });
  }
  async function dispJoinMark(db, cust, trucks) {
    var co = dispCo(cust), ds = {}; trucks.forEach(function (t) { ds[t.date] = 1; }); if (!trucks.length) return trucks;
    var all = await coTrucks(db, co, Object.keys(ds));
    if (!all.some(function (r) { return r.join; })) return trucks;
    var tabs = await dispTabs(co, db), name = function (k) { var suf = String(k).slice(co.length), t = tabs.filter(function (x) { return x.suf === suf; })[0]; return t ? t.name : k; };
    trucks.forEach(function (t) {
      var g = dispJoinGroup(all, t), base = t.join || t.token; if (!g.length) return;
      t.jn = g.filter(function (x) { return !(x.cust === t.cust && x.no === t.no); }).map(function (x) { return { tab: name(x.cust), no: x.no, base: x.token === base }; });
    });
    return trucks;
  }
  function dispScrub(out, session) {
    var partner = session.role === 'partner', cost = canCost(session) || partner;
    var one = function (r) {
      if (!r) return r;
      if (!cost) (r.trucks || []).forEach(function (t) { delete t.retCost; delete t.wait; delete t.support; });
      if (!canCost(session)) (r.trucks || []).forEach(function (t) { delete t.rev; delete t.cost; });
      if (partner) (r.orders || []).forEach(function (o) { o.noteIn = ''; });
      if (partner) (r.trucks || []).forEach(function (t) { t.join = ''; });
      return r;
    };
    if (out && out.byKey) Object.keys(out.byKey).forEach(function (k) { one(out.byKey[k]); }); else one(out);
    return out;
  }
  function dispTabsDefault(cust) {
    if (cust === '삼다수') return [{ name: '삼다수-대우', suf: '', prefix: '삼다수' }, { name: '삼다수-경인항', suf: '/경인항', prefix: '삼다수' }, { name: '삼다수-인천항', suf: '/인천항', prefix: '삼다수' }, { name: '삼다수-진해', suf: '/진해', prefix: '삼다수' }, { name: '삼다수-삼천포', suf: '/삼천포', prefix: '삼다수' }];
    return [{ name: '부자재-인천', suf: '', prefix: '부자재' }, { name: '부자재-평택', suf: '/평택', prefix: '부자재' }, { name: '부자재-부산', suf: '/부산', prefix: '부자재' }];
  }
  async function dispTabs(cust, db) {
    cust = dispCust(cust); var r = (await Q(db || sql, 'select tabs from disp_tabs where cust = $1', [cust]))[0];
    var list = r ? parseJson(r.tabs, null) : null; return Array.isArray(list) && list.length ? list : dispTabsDefault(cust);
  }
  async function dispTabsSave(req) {
    var cust = dispCust(req.cust), old = await dispTabs(cust), names = {}, sufs = {};
    var list = (req.tabs || []).map(function (t) {
      var name = String(t.name || '').trim().slice(0, 30); if (!name) throw err('탭 이름을 넣으세요.');
      if (names[name]) throw err('"' + name + '" 탭이 두 개예요.'); names[name] = 1;
      var suf = t.suf != null && old.some(function (o) { return o.suf === t.suf; }) ? String(t.suf) : '/' + name.replace(/[|]/g, '');
      if (sufs[suf]) suf = suf + '_' + Object.keys(sufs).length; sufs[suf] = 1;
      return { name: name, suf: suf, prefix: String(t.prefix || '').trim().slice(0, 20), hidden: !!t.hidden };
    });
    if (!list.some(function (t) { return !t.hidden; })) throw err('보이는 탭이 하나는 있어야 해요.');
    old.forEach(function (o) { if (!list.some(function (t) { return t.suf === o.suf; })) list.push(Object.assign({}, o, { hidden: true })); });
    await Q(sql, 'insert into disp_tabs (cust, tabs) values ($1, $2::text::json) on conflict (cust) do update set tabs = excluded.tabs', [cust, JSON.stringify(list)]);
    return { tabs: list };
  }
  async function dispPrices(cust) { var r = (await Q(sql, 'select prices from disp_prices where cust = $1', [dispCust(cust)]))[0]; return (r && parseJson(r.prices, {})) || {}; }
  async function dispPriceSave(req) {
    var cust = dispCust(req.cust), ym = String(req.ym || ''); if (!/^\d{4}-\d{2}$/.test(ym)) throw err('월을 확인하세요.');
    return locked('price|' + cust, async function (tx) {
      var r = (await Q(tx, 'select prices from disp_prices where cust = $1', [cust]))[0], p = (r && parseJson(r.prices, {})) || {}, v = Math.round(Number(String(req.price == null ? '' : req.price).replace(/[^0-9.]/g, ''))) || 0;
      if (v > 0) p[ym] = Math.min(v, 10000000); else delete p[ym];
      await Q(tx, 'insert into disp_prices (cust, prices) values ($1, $2::text::json) on conflict (cust) do update set prices = excluded.prices', [cust, JSON.stringify(p)]); return p;
    });
  }
  async function dispCodes(cust) { var r = (await Q(sql, 'select codes from disp_codes where cust = $1', [dispCust(cust)]))[0]; return (r && parseJson(r.codes, {})) || {}; }
  async function dispCodesSave(req) {
    var c = req.codes || {}, t = function (v) { return String(v == null ? '' : v).trim().slice(0, 30); }, buy = {};
    Object.keys(c.buy || {}).slice(0, 40).forEach(function (k) { buy[String(k).slice(0, 60)] = t(c.buy[k]); });
    var o = { sale: t(c.sale), buy: buy, jo: t(c.jo) };
    await Q(sql, 'insert into disp_codes (cust, codes) values ($1, $2::text::json) on conflict (cust) do update set codes = excluded.codes', [dispCust(req.cust), JSON.stringify(o)]); return o;
  }
  /* 도착지 특이사항 */
  function dispCnKey(v) {
    var s = String(v || '').replace(/\([^)]*\)/g, ' ').split(/\s*[-–—~]\s*/)[0];
    return s.replace(/(^|\s)(지하\s*)?B?\d+\s*(층|F)(?=\s|$)/gi, ' ').replace(/\s+/g, '').replace(/(FC|센터)/gi, '').toUpperCase();
  }
  async function dispNotes(cust, db) {
    db = db || sql; cust = dispCust(cust);
    var yn = function (v) { return String(v) === 'Y'; };
    var list = (await Q(db, 'select * from center_notes where cust = $1 order by uid', [cust])).map(function (r) { return { fc: r.fc, note: r.note, ptn: yn(r.ptn), drv: yn(r.drv), lock: yn(r.lock) }; });
    if (!list.length) { // 예전 '오늘 꼭 가야 하는 센터' 목록(스크립트 속성 DISP_MUST_업체)은 한 번 옮겨요
      var old = parseJson((await propsGet(db, ['DISP_MUST_' + cust]))['DISP_MUST_' + cust], null);
      if (old && old.length) { list = old.map(function (fc) { return { fc: String(fc), note: '오늘 꼭 가야함', ptn: true, drv: false, lock: true }; }); await dispNotesWrite(db, cust, list, '옮김'); await propDel(db, 'DISP_MUST_' + cust); }
    }
    return list;
  }
  async function dispNotesWrite(db, cust, list, by) {
    var yn = function (v) { return v ? 'Y' : 'N'; }, at = nowTxt();
    await Q(db, 'delete from center_notes where cust = $1', [cust]);
    for (var x of list) await Q(db, 'insert into center_notes (cust, fc, note, ptn, drv, lock, by_name, at) values ($1,$2,$3,$4,$5,$6,$7,$8)', [cust, x.fc, x.note, yn(x.ptn), yn(x.drv), yn(x.lock), by, at]);
  }
  async function dispNotesSave(session, req) {
    var cust = dispCust(req.cust), t = function (v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n); }, seen = {};
    var list = (req.list || []).slice(0, 300).map(function (x) { return { fc: t(x.fc, 40), note: t(x.note, 100), ptn: !!x.ptn, drv: !!x.drv, lock: !!x.lock }; })
      .filter(function (x) { var k = dispCnKey(x.fc) + '|' + x.note; if (!x.fc || !x.note || seen[k]) return false; seen[k] = 1; return true; });
    await locked('notes|' + cust, function (tx) { return dispNotesWrite(tx, cust, list, session.name); }, true);
    return dispNotes(cust);
  }
  async function dispMust(cust) { return (await dispNotes(cust)).filter(function (x) { return x.lock; }).map(function (x) { return x.fc; }); }
  /* 바뀐 시각 (화면이 15초마다 · 화면은 RPC joil_stamps 로 직접 읽어요 — 함수 호출 수를 아끼려고) */
  async function dispTouch(cust, date, db) {
    var n = Date.now(); try { await Q(db || sql, 'insert into disp_stamps (cust, date, stamp) values ($1, $2, $3) on conflict (cust, date) do update set stamp = greatest(disp_stamps.stamp + 1, excluded.stamp)', [String(cust || ''), String(date || ''), n]); } catch (e) { return 0; }
    var r = (await Q(db || sql, 'select stamp from disp_stamps where cust = $1 and date = $2', [String(cust || ''), String(date || '')]))[0]; return r ? Number(r.stamp) : n;
  }
  async function dispStamps(keys, date) {
    date = dispDate(date); var ks = (keys || []).slice(0, 20).map(String), o = {}, m = {};
    (await Q(sql, 'select cust, stamp from disp_stamps where date = $1 and cust = any($2)', [date, ks])).forEach(function (r) { m[r.cust] = Number(r.stamp); });
    ks.forEach(function (k) { o[k] = m[k] || 0; }); return o;
  }
  async function dispTouched(req, out) { await dispTouch(req.cust, req.date); return out; }

  /* ───────────── 배차: 저장 ───────────── */
  function dispKeyNorm(k) { var p = String(k || '').split('|'); if (p.length === 8) p.splice(1, 1); return p.join('|'); }
  var ORD_COLS = '(id, cust, date, key, data, truck, seq, by_name, at, note_in, note_drv)';
  async function insOrders(db, rows) { for (var r of rows) await Q(db, 'insert into disp_orders ' + ORD_COLS + ' values ($1,$2,$3,$4,$5::text::json,$6,$7,$8,$9,$10,$11)', r); }
  async function dispImport(session, req) {
    var cust = dispCust(req.cust), rows = (req.rows || []).slice(0, 2000);
    return locked('imp|' + cust, async function (tx) {
      var have = {}, maxSeq = {}, now = nowTxt(), out = [], dates = {}, skipped = 0;
      (await Q(tx, 'select key, date, seq from disp_orders where cust = $1', [cust])).forEach(function (r) { have[dispKeyNorm(r.key)] = 1; maxSeq[r.date] = Math.max(maxSeq[r.date] || 0, Number(r.seq) || 0); });
      rows.forEach(function (x, i) {
        var date = dispDate(x.date), key = String(x.key || '').slice(0, 300), nk = dispKeyNorm(key);
        if (!key) throw err((i + 1) + '번째 줄: 구분할 키가 없습니다.');
        if (have[nk]) { skipped++; return; }
        have[nk] = 1; maxSeq[date] = (maxSeq[date] || 0) + 1; dates[date] = (dates[date] || 0) + 1;
        var data = JSON.stringify(x.d || {}); if (data.length > 20000) throw err((i + 1) + '번째 줄이 너무 깁니다.');
        out.push([newId('D') + i, cust, date, key, data, null, maxSeq[date], session.name, now, '', '']);
      });
      await insOrders(tx, out);
      return { added: out.length, skipped: skipped, dates: dates };
    });
  }
  /** 바뀐 칸만 보낸 저장(patch)을 지금 서버의 호차들과 합쳐 전체 목록으로 (Code.js dispMerge_) */
  function dispMerge(cur, req) {
    var list = cur.slice(), used = [];
    var byTok = function (tok) { return tok ? list.filter(function (t) { return t.token === tok; })[0] : null; };
    var byNo = function (no) { return list.filter(function (t) { return t.no === no && used.indexOf(t) === -1; })[0]; };
    (req.drop || []).forEach(function (d) { var x = byTok(d.token) || (d.token ? null : byNo(Number(d.no))); if (x) list.splice(list.indexOf(x), 1); });
    var pt = (req.trucks || []).slice().sort(function (a, b) { return (a.token ? 0 : 1) - (b.token ? 0 : 1); });
    pt.forEach(function (p) {
      var x = byTok(p.token) || byNo(Number(p.from != null ? p.from : p.no));
      if (!x) { x = { no: Number(p.no), token: '', car: '', driver: '', phone: '', time: '', ton: '', memo: '', status: '', retCost: 0, wait: 0, support: 0, join: '', rev: null, cost: null }; list.push(x); }
      used.push(x); x.no = Math.max(1, Math.round(Number(p.no)) || 1);
      var set = p.set || {}; DISP_PATCH_KEYS.forEach(function (k) { if (set[k] !== undefined) x[k] = set[k]; });
    });
    return list;
  }
  var TRK_COLS = '(cust, date, no, car, driver, phone, time, ton, memo, by_name, at, token, status, ret_cost, wait, support, join_tk, rev, cost)';
  async function dispSave(session, req0) {
    var cust = dispCust(req0.cust), date = dispDate(req0.date), drvCh = false, co = dispCo(cust);
    var touched = await locked('disp|' + co + '|' + date, async function (tx) { // 합차가 같은 업체 다른 탭까지 고쳐서 업체(탭 앞부분)·날짜로 줄 세워요
      var req = req0, isPatch = !!req.patch, pset = isPatch ? req.trucks || [] : [];
      var curRows = await Q(tx, 'select * from disp_trucks where cust = $1 and date = $2 order by uid', [cust, date]), cur = curRows.map(trkRow);
      if (req.patch) req = { orders: req.orders, trucks: dispMerge(cur.map(function (t) { return Object.assign({}, t); }), req) };
      var want = {};
      if (session.role !== 'partner') (req.orders || []).forEach(function (o) { want[String(o.id)] = o; });
      if (Object.keys(want).length) {
        for (var r of await Q(tx, 'select id, truck, seq from disp_orders where cust = $1 and date = $2', [cust, date])) {
          var o = want[r.id]; if (!o) continue;
          var t = o.truck === '' || o.truck == null ? null : Math.max(1, Math.min(999, Math.round(Number(o.truck)) || 1)), sq = Number(o.seq) || 0;
          if ((r.truck == null ? null : Number(r.truck)) !== t || Number(r.seq) !== sq) await Q(tx, 'update disp_orders set truck = $2, seq = $3 where id = $1', [r.id, t, sq]);
        }
      }
      var tokens = {}, olds = {}, cost = canCost(session), partner = session.role === 'partner';
      cur.forEach(function (x) { if (x.token) tokens[x.no] = x.token; olds[x.no] = x; });
      var trucks = req.trucks || [];
      if (partner) { var given = {}; trucks.forEach(function (t) { given[Number(t.no)] = t; }); trucks = Object.keys(olds).map(function (n) { var o = olds[n], g = given[n] || {}; return { no: o.no, car: g.car != null ? g.car : o.car, driver: g.driver != null ? g.driver : o.driver, phone: g.phone != null ? g.phone : o.phone, time: g.time != null ? g.time : o.time, ton: g.ton != null ? g.ton : o.ton, memo: o.memo, join: o.join, status: g.status != null && ((g.status !== '정보넘김' && g.status !== '조일배차') || o.status === g.status) ? g.status : o.status }; }); }
      var byTok = {}; Object.keys(olds).forEach(function (n) { if (olds[n].token) byTok[olds[n].token] = olds[n]; });
      var claimed = {}; trucks.forEach(function (t) { if (t.token && byTok[t.token]) claimed[t.token] = 1; });
      var moved = {};
      var money = function (v) { var n = Math.round(Number(String(v == null ? '' : v).replace(/[^0-9.-]/g, ''))); return isFinite(n) && n > 0 ? Math.min(n, 100000000) : 0; };
      var now = nowTxt();
      var add = trucks.map(function (t) {
        var no = Math.max(1, Math.round(Number(t.no)) || 1), mine = t.token && byTok[t.token] ? byTok[t.token] : null;
        var tok = mine ? t.token : tokens[no] && !claimed[tokens[no]] ? tokens[no] : uuid().replace(/-/g, '').slice(0, 20), o = mine || (byTok[tok] || {});
        claimed[tok] = 1; if (mine && mine.no !== no) moved[mine.no] = no;
        var stt = DISP_STATUS.indexOf(dispStatus(t.status)) !== -1 ? dispStatus(t.status) : ''; if (stt === '배차전') stt = '';
        var c3 = cost ? [money(t.retCost), money(t.wait), money(t.support)] : [o.retCost || 0, o.wait || 0, o.support || 0];
        var jn = String(t.join !== undefined ? t.join || '' : o.join || ''); if (!/^[0-9a-f]{20}$/.test(jn) || jn === tok) jn = '';
        var fix = function (k) { return cost && t[k] !== undefined ? (t[k] === '' || t[k] == null ? null : Math.max(0, Math.min(Math.round(Number(String(t[k]).replace(/[^0-9.]/g, ''))) || 0, 100000000))) : (o[k] == null ? null : o[k]); };
        return [cust, date, no].concat(DISP_TRK_FIELDS.map(function (k) { return String(t[k] || '').slice(0, 300); })).concat([session.name, now, tok, stt]).concat(c3).concat([jn, fix('rev'), fix('cost')]);
      });
      await Q(tx, 'delete from disp_trucks where cust = $1 and date = $2', [cust, date]);
      for (var a of add) await Q(tx, 'insert into disp_trucks ' + TRK_COLS + ' values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)', a);
      if (Object.keys(moved).length) {
        for (var rc of await Q(tx, 'select id, no from receipts where cust = $1 and date = $2', [cust, date])) if (moved[Number(rc.no)] != null) await Q(tx, 'update receipts set no = $2 where id = $1', [rc.id, moved[Number(rc.no)]]);
      }
      var tch = await dispJoinSync(tx, cust, date, pset.map(function (p) { return { token: p.token, keys: DISP_JOIN_KEYS.filter(function (k) { return p.set && p.set[k] !== undefined; }) }; }).filter(function (c) { return c.token && c.keys.length; }));
      drvCh = !isPatch || pset.some(function (p) { return p.set && ['car', 'driver', 'phone', 'ton'].some(function (k) { return p.set[k] !== undefined; }); });
      if (drvCh) { try { await Q(tx, 'savepoint drv'); await driverCollect(tx, session, date, trucks); await Q(tx, 'release savepoint drv'); } catch (e) { await Q(tx, 'rollback to savepoint drv'); } } // 기사 풀 실패는 배차 저장에 영향 없음
      return tch;
    }, true);
    for (var k of touched) await dispTouch(k, date);
    var stamp = await dispTouch(cust, date), out = await dispDay(cust, date); if (drvCh) out.drivers = await driverList(); out.stamp = stamp; return out;
  }
  /** 합차: 바뀐 차량정보·상태를 같은 차로 묶인 다른 탭 호차에도 (돌려주는 값 = 고친 다른 탭 키 목록) */
  async function dispJoinSync(tx, cust, date, chg) {
    if (!chg.length) return [];
    var co = dispCo(cust), touched = {};
    var all = (await Q(tx, "select * from disp_trucks where date = $1 and (cust = $2 or cust like $3) order by no, uid", [date, co, co.replace(/[\\%_]/g, '\\$&') + '/%'])).map(function (r) { var t = trkRow(r); t.uid = r.uid; t.raw = r; return t; });
    for (var c of chg) {
      var me = all.filter(function (x) { return x.cust === cust && x.date === date && x.token === c.token; })[0]; if (!me) continue;
      for (var x of dispJoinGroup(all, me)) {
        if (x.cust === cust) continue;
        for (var k of c.keys) { var col = k === 'status' ? 'status' : k, val = String(me.raw[col]); if (String(x.raw[col]) === val) continue; x.raw[col] = val; await Q(tx, 'update disp_trucks set ' + col + ' = $2 where uid = $1', [x.uid, val]); touched[x.cust] = 1; }
      }
    }
    return Object.keys(touched);
  }
  /* 기사 풀: 호차에 넣은 차량정보가 자동으로 쌓여요 (횟수·마지막 배차일) */
  function driverBlack(v) { return /^(o|ㅇ|1|y|yes|예|네|블랙|black|true|v|✓|✔|●|금지|출입금지)$/i.test(txt(v).trim()); }
  function driverScrub(d) { var o = Object.assign({}, d); delete o.birth; return o; }
  function driverKey(car, driver, phone) { var c = String(car || '').replace(/\s/g, ''); return c ? 'c:' + c : 'd:' + String(driver || '').replace(/\s/g, '') + '|' + String(phone || '').replace(/[^0-9]/g, ''); }
  var DRV_COLS = ['id', 'car', 'driver', 'phone', 'ton', 'memo', 'pin', 'n', 'last', 'by_name', 'at', 'birth', 'org', 'black'];
  function drvArr(r) { return DRV_COLS.map(function (c) { return c === 'n' ? Number(r.n) || 0 : r[c]; }); }
  async function drvIns(db, v) { await Q(db, 'insert into drivers (' + DRV_COLS.join(',') + ') values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)', v); }
  async function drvUpd(db, v) { await Q(db, 'update drivers set ' + DRV_COLS.slice(1).map(function (c, i) { return c + ' = $' + (i + 2); }).join(', ') + ' where id = $1', v); }
  async function driverList(db) {
    return (await Q(db || sql, 'select * from drivers order by ord')).map(function (r) { return { id: r.id, car: r.car, driver: r.driver, phone: r.phone, ton: r.ton, memo: r.memo, pin: r.pin === 'Y', n: Number(r.n) || 0, last: r.last, birth: r.birth, org: r.org, black: driverBlack(r.black) }; })
      .sort(function (a, b) { return (b.pin - a.pin) || (b.n - a.n) || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0); });
  }
  async function driverCollect(tx, session, date, trucks) {
    var rows = (await Q(tx, 'select * from drivers order by ord')).map(drvArr), idx = {};
    rows.forEach(function (r, i) { idx[driverKey(r[1], r[2], r[3])] = i; });
    var q = function (v) { return String(v || '').trim().slice(0, 100); };
    for (var t of trucks) {
      var car = String(t.car || '').trim(), drv = String(t.driver || '').trim(), ph = String(t.phone || '').trim(), ton = String(t.ton || '').trim();
      if (!car && !(drv && ph)) continue;
      var k = driverKey(car, drv, ph), i = idx[k];
      if (i == null) { var nv = [newId('V'), q(car), q(drv), q(ph), q(ton), '', 'N', 1, date, session.name, nowTxt(), '', session.role === 'partner' ? q(session.name) : '', '']; await drvIns(tx, nv); idx[k] = rows.length; rows.push(nv); continue; }
      var v = rows[i].slice(), n = Number(v[7]) || 0, last = v[8];
      var sig = function (x) { return [1, 2, 3, 4, 5].map(function (j) { return txt(x[j]); }).concat([Number(x[7]) || 0, txt(x[8])]).join('|'); }, was = sig(v);
      var keep = function (oldV, newV) { oldV = txt(oldV); return newV && !(oldV.length > newV.length && oldV.indexOf(newV) === 0) ? newV : oldV; };
      v[2] = q(keep(v[2], drv)); v[3] = q(keep(v[3], ph)); if (ton) v[4] = q(ton); else v[4] = q(txt(v[4]));
      v[1] = q(txt(v[1]) || car); v[5] = q(txt(v[5]));
      if (last !== date) { v[7] = n + 1; if (!last || date > last) v[8] = date; else v[8] = last; }
      if (sig(v) !== was) { await drvUpd(tx, v); rows[i] = v; }
    }
  }
  /** 회차 오더 다시 배차: 고른 오더를 다른(또는 같은) 날짜에 호차 미배정으로 복사 */
  async function dispCopyOrders(session, req) {
    var cust = dispCust(req.cust), date = dispDate(req.date), to = dispDate(req.toDate), ids = {}; (req.ids || []).forEach(function (x) { ids[String(x)] = 1; });
    return locked('imp|' + cust, async function (tx) {
      var src = (await dispOrdersDay(tx, cust, date)).filter(function (o) { return ids[o.id]; });
      if (!src.length) throw err('복사할 오더를 찾을 수 없어요.');
      var maxSeq = 0; (await dispOrdersDay(tx, cust, to)).forEach(function (o) { maxSeq = Math.max(maxSeq, o.seq); });
      var now = nowTxt(), stamp = stampTxt('MMddHHmmss');
      await insOrders(tx, src.map(function (o, i) {
        var d = JSON.parse(JSON.stringify(o.d || {})); d.date = to; d.reFrom = date + ' ' + (o.truck === '' ? '' : o.truck + '호차');
        return [newId('D') + i, cust, to, String(o.key).slice(0, 260) + '#재' + stamp + i, JSON.stringify(d), null, maxSeq + i + 1, session.name, now, '', ''];
      }));
      return { copied: src.length, toDate: to };
    });
  }
  /** 오더 날짜 옮기기 (호차의 오더를 모두 옮기면 keepTruck 으로 호차째로) */
  async function dispMoveOrders(session, req) {
    var cust = dispCust(req.cust), date = dispDate(req.date), to = dispDate(req.toDate), ids = {}; (req.ids || []).forEach(function (x) { ids[String(x)] = 1; });
    if (to === date) throw err('지금과 같은 날짜예요.');
    return locked('disp|' + dispCo(cust) + '|' + date, async function (tx) {
      var v = await Q(tx, 'select * from disp_orders where cust = $1 and (date = $2 or date = $3) order by ord', [cust, date, to]), maxSeq = 0, hit = [], total = {}, picked = {}, maxNo = 0;
      v.forEach(function (r, i) {
        var d0 = r.date, sq = Number(r.seq) || 0, tk = r.truck == null ? '' : String(r.truck);
        if (d0 === to) { if (sq < 100000) maxSeq = Math.max(maxSeq, sq); if (tk !== '') maxNo = Math.max(maxNo, Number(tk) || 0); }
        if (d0 === date && tk !== '') total[tk] = (total[tk] || 0) + 1;
        if (d0 === date && ids[r.id]) { hit.push(i); if (tk !== '') picked[tk] = (picked[tk] || 0) + 1; }
      });
      if (!hit.length) throw err('옮길 오더를 찾을 수 없어요.');
      hit.sort(function (a, b) { return (Number(v[a].seq) || 0) - (Number(v[b].seq) || 0); });
      var tv = await Q(tx, 'select uid, date, no from disp_trucks where cust = $1 and (date = $2 or date = $3) order by uid', [cust, date, to]), map = {};
      tv.forEach(function (r) { if (r.date === to) maxNo = Math.max(maxNo, Number(r.no) || 0); });
      if (req.keepTruck) Object.keys(picked).sort(function (a, b) { return a - b; }).forEach(function (no) { if (picked[no] === total[no]) map[no] = ++maxNo; });
      for (var k = 0; k < hit.length; k++) {
        var r = v[hit[k]], d = parseJson(r.data, {}) || {}, key = String(r.key), sq = Number(r.seq) || 0, tk = r.truck == null ? '' : String(r.truck); d.date = to; d.movedFrom = date; d.movedBy = session.name;
        if (key.indexOf(date + '|') === 0) key = to + key.slice(date.length);
        await Q(tx, 'update disp_orders set date = $2, key = $3, data = $4::text::json, truck = $5, seq = $6 where id = $1', [r.id, to, key, JSON.stringify(d), map[tk] || null, map[tk] && sq > 100000 ? sq : maxSeq + k + 1]);
      }
      for (var t of tv) if (t.date === date && map[t.no]) await Q(tx, 'update disp_trucks set date = $2, no = $3 where uid = $1', [t.uid, to, map[t.no]]);
      return { moved: hit.length, toDate: to, kept: Object.keys(map).length, trucks: map };
    });
  }
  async function findOrder(cust, date, id) { var r = (await Q(sql, 'select * from disp_orders where id = $1', [String(id || '')]))[0]; if (!r || r.cust !== cust || r.date !== date) throw err('오더를 찾을 수 없어요.'); return r; }
  async function dispEditOrder(session, req) {
    var cust = dispCust(req.cust), date = dispDate(req.date), patch = req.patch || {}, r = await findOrder(cust, date, req.id), d = parseJson(r.data, {}) || {};
    DISP_EDIT_KEYS.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(patch, k)) d[k] = String(patch[k] == null ? '' : patch[k]).trim().slice(0, 300); });
    if (!d.fc) throw err('센터명은 비울 수 없어요.');
    d.editedBy = session.name; d.editedAt = nowTxt();
    await Q(sql, 'update disp_orders set data = $2::text::json where id = $1', [r.id, JSON.stringify(d)]);
    await dispTouch(cust, date);
    return { ok: true };
  }
  async function dispNote(req) {
    var cust = dispCust(req.cust), date = dispDate(req.date), r = await findOrder(cust, date, req.id);
    await Q(sql, 'update disp_orders set note_in = $2, note_drv = $3 where id = $1', [r.id, String(req.noteIn || '').trim().slice(0, 300), String(req.noteDrv || '').trim().slice(0, 300)]);
    return dispDay(cust, date);
  }
  async function dispDeleteOrders(session, req) {
    var cust = dispCust(req.cust), date = dispDate(req.date), ids = (req.ids || []).map(String);
    await Q(sql, 'delete from disp_orders where cust = $1 and date = $2 and id = any($3)', [cust, date, ids]);
    return dispDay(cust, date);
  }

  /* ───────────── 매입 단가표 · 센터도착 (분석 권한) ───────────── */
  function dispNeedCost(session) { if (!canCost(session)) throw err('매입 단가는 분석 권한자만 볼 수 있습니다.'); }
  async function dispMap(db) { var o = {}; (await Q(db || sql, 'select fc, dest from center_map order by ord')).forEach(function (r) { o[r.fc] = r.dest || ''; }); return o; }
  function rateTon(v) { var t = String(v == null ? '' : v).replace(/\s/g, '').replace(/^'/, '').replace(/(t|T|ton|TON|Ton)$/, '톤'); return /^\d+(\.\d+)?$/.test(t) ? t + '톤' : t; }
  function rateStart(v) { var t = txt(v).trim(); if (!t) return ''; var m = t.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/); if (!m) throw err('적용시작일은 2026-11-01처럼 넣어 주세요: ' + t); return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2); }
  async function dispRateRows(db) {
    return (await Q(db || sql, 'select * from disp_rates order by uid')).map(function (r) { return { cust: custOfRow(r.cust), from: txt(r.from).trim(), to: txt(r.to).trim(), ton: rateTon(r.ton), price: Number(r.price) || 0, start: txt(r.start).trim(), memo: r.memo, dist: Number(r.dist) || 0 }; })
      .filter(function (x) { return x.from && x.to && x.ton && x.price > 0; });
  }
  async function dispRatesRead(custs) {
    var rows = await dispRateRows(); if (custs) rows = rows.filter(function (x) { return custs.indexOf(x.cust) !== -1; });
    var today = ymd(), by = {}, rates = [];
    rows.forEach(function (x) {
      if (x.start && x.start > today) return;
      var k = x.from + '|' + x.to, g = by[k]; if (!g) { g = by[k] = { from: x.from, to: x.to, dist: x.dist, p: {}, s: {} }; rates.push(g); }
      if (!(x.ton in g.s) || x.start >= g.s[x.ton]) { g.p[x.ton] = x.price; g.s[x.ton] = x.start; }
    });
    rates.forEach(function (g) { delete g.s; });
    return { rows: rows, rates: rates, map: await dispMap(), tons: DISP_RATE_TONS };
  }
  async function dispRates(session) { dispNeedCost(session); return dispRatesRead(); }
  async function dispRatesSave(session, req) {
    dispNeedCost(session);
    var add = [], custs = {};
    if (req.rows) {
      var cust = custReq(req.cust); custs[cust] = 1;
      add = req.rows.slice(0, 20000).map(function (x, i) {
        var f = String(x.from || '').trim(), t = String(x.to || '').trim(), ton = rateTon(x.ton), v = Number(String(x.price == null ? '' : x.price).replace(/[,\s원]/g, ''));
        if (!f || !t || !ton) throw err((i + 1) + '번째 줄: 출발·도착·톤수가 비어 있어요.');
        if (!(v > 0)) throw err((i + 1) + '번째 줄: 단가가 숫자가 아니에요.');
        return { cust: cust, from: f.slice(0, 60), to: t.slice(0, 60), ton: ton.slice(0, 20), price: v, start: rateStart(x.start), memo: String(x.memo || '').trim().slice(0, 200), dist: Number(x.dist) || '' };
      });
    } else {
      (req.rates || []).slice(0, 5000).forEach(function (x) {
        var f = String(x.from || '').trim(), t = String(x.to || '').trim(); if (!f || !t) return;
        DISP_RATE_TONS.forEach(function (ton) { var v = Number(String((x.p || {})[ton] == null ? '' : x.p[ton]).replace(/[,\s원]/g, '')); if (v > 0) { var c = ton === '18톤' ? '삼다수' : DISP_CUST0; custs[c] = 1; add.push({ cust: c, from: f, to: t, ton: ton, price: v, start: '', memo: '', dist: Number(x.dist) || '' }); } });
      });
      req.mode = 'replace';
    }
    if (!add.length) throw err('올릴 단가가 없어요.');
    var key = function (x) { return [x.cust, x.from, x.to, x.ton, x.start].join('|'); };
    await locked('rates', async function (tx) {
      var cur = await dispRateRows(tx), nk = {}; add.forEach(function (x) { nk[key(x)] = 1; });
      var keep = cur.filter(function (x) { return req.mode === 'add' ? !nk[key(x)] : !custs[x.cust]; }), now = nowTxt();
      await Q(tx, 'delete from disp_rates where true');
      for (var x of keep.concat(add)) await Q(tx, 'insert into disp_rates (cust, "from", "to", ton, price, start, memo, dist, by_name, at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [x.cust, x.from, x.to, x.ton, x.price, x.start || '', x.memo || '', x.dist || null, session.name, now]);
    });
    var out = await dispRates(session); out.saved = add.length; return out;
  }
  async function dispMapSave(session, req) {
    dispNeedCost(session);
    var fc = String(req.fc || '').trim().slice(0, 100), dest = String(req.dest || '').trim().slice(0, 60); if (!fc) throw err('센터명이 없어요.');
    if (!dest) await Q(sql, 'delete from center_map where fc = $1', [fc]);
    else await Q(sql, 'insert into center_map (fc, dest, by_name, at) values ($1,$2,$3,$4) on conflict (fc) do update set dest = excluded.dest, by_name = excluded.by_name, at = excluded.at', [fc, dest, session.name, nowTxt()]);
    return dispRates(session);
  }
  async function partnerRates(session) {
    var cs = partnerCusts(session), out = await dispRatesRead(cs);
    (await destList()).forEach(function (d) { if (cs.indexOf(d.cust) !== -1 && d.rateTo && d.name && !(d.name in out.map)) out.map[d.name] = d.rateTo; });
    return out;
  }
  function partnerCusts(session) { var o = []; (session.dispTabs || []).forEach(function (k) { var c = String(k).replace(/\/.*$/, ''); if (o.indexOf(c) === -1) o.push(c); }); return o; }

  /* ───────────── 하차지 주소록 · 상차지 · 사진 · 인수증 ───────────── */
  function destKindTxt(v) { v = txt(v).trim(); return v === 'glove' ? '장갑' : v === 'fc' || !v ? '일반(FC도크)' : v; }
  function destObj(r) { return { cust: custOfRow(r.cust), kind: destKindTxt(r.kind), code: r.code, name: r.name, addr: r.addr, manager: r.manager, tel: r.tel, hours: r.hours, rateTo: r.rate_to, memo: r.memo }; }
  async function destList(db) { return (await Q(db || sql, 'select * from dest_book order by uid')).map(destObj).filter(function (x) { return x.code || x.name; }); }
  async function destSave(session, req) {
    var cust = custReq(req.cust), oldKind = req.cust ? '' : (req.kind === 'glove' ? '장갑' : '일반(FC도크)');
    var q = function (v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n); };
    var row = function (x, by, at) { return [q(destKindTxt(x.kind), 30), q(x.code, 60), q(x.name, 100), q(x.addr, 300), by, at, q(x.cust, 50), q(x.manager, 60), q(x.tel, 100), q(x.hours, 200), q(x.rateTo, 60), q(x.memo, 300)]; };
    var now = nowTxt(), rows = (req.rows || []).slice(0, 5000).filter(function (x) { return x && (String(x.code || '').trim() || String(x.name || '').trim()); }).map(function (x) { return row(Object.assign({}, x, { cust: cust, kind: oldKind || x.kind }), session.name, now); });
    await locked('dest', async function (tx) {
      var keep = (await Q(tx, 'select * from dest_book order by uid')).filter(function (r) { return custOfRow(r.cust) !== cust || (oldKind && destKindTxt(r.kind) !== oldKind); })
        .map(function (r) { return row({ kind: r.kind, code: r.code, name: r.name, addr: r.addr, cust: custOfRow(r.cust), manager: r.manager, tel: r.tel, hours: r.hours, rateTo: r.rate_to, memo: r.memo }, r.by_name, r.at); });
      await Q(tx, 'delete from dest_book where true');
      for (var v of keep.concat(rows)) await Q(tx, 'insert into dest_book (kind, code, name, addr, by_name, at, cust, manager, tel, hours, rate_to, memo) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', v);
    });
    return { dests: await destList(), saved: rows.length };
  }
  async function placePhotos(db) { return (await Q(db || sql, 'select * from place_photos order by ord')).map(function (r) { return { id: r.id, place: r.place_id, file: r.file_id, cap: r.cap }; }); }
  async function loadingList(db) {
    var ph = await placePhotos(db);
    return (await Q(db || sql, 'select * from loading_places order by ord')).map(function (r) { var id = r.id; return { id: id, cust: custOfRow(r.cust), name: r.name, addr: r.addr, time: r.time, contact: r.contact, memo: r.memo, rateFrom: r.rate_from, manager: r.manager, photos: ph.filter(function (x) { return x.place === id; }).map(function (x) { return { id: x.id, cap: x.cap }; }) }; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
  }
  async function loadingFind(cust, name) {
    var n = function (v) { return String(v || '').replace(/\s|\(주\)|㈜/g, ''); }, ln = function (v) { return n(v).replace(/[()（）\[\]_\-·.]/g, ''); }, all = await loadingList();
    var pick = function (f) { var l = all.filter(f); return l.filter(function (p) { return p.cust === cust; })[0] || l[0] || null; };
    if (!n(name)) return null;
    return pick(function (p) { return n(p.name) === n(name); }) || pick(function (p) { return ln(p.name) === ln(name); }) || pick(function (p) { return p.rateFrom && ln(p.rateFrom) === ln(name); });
  }
  function loadingRow(session, x, cust) { var q = function (v, n) { return String(v == null ? '' : v).trim().slice(0, n); }; return [q(x.name, 60), q(x.addr, 300), q(x.time, 300), q(x.contact, 1000), q(x.memo, 500), session.name, nowTxt(), q(x.rateFrom, 30), q(cust, 50), q(x.manager, 100)]; }
  var LD_SET = 'name = $2, addr = $3, time = $4, contact = $5, memo = $6, by_name = $7, at = $8, rate_from = $9, cust = $10, manager = $11';
  var LD_INS = 'insert into loading_places (id, name, addr, time, contact, memo, by_name, at, rate_from, cust, manager) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)';
  async function loadingSave(session, req) {
    var x = req.place || {}, name = String(x.name || '').trim().slice(0, 60); if (!name) throw err('상차지명을 넣으세요.');
    var f = req.id ? (await Q(sql, 'select * from loading_places where id = $1', [String(req.id)]))[0] : null; if (req.id && !f) throw err('상차지를 찾을 수 없습니다.');
    var cust = req.cust ? custReq(req.cust) : f ? custOfRow(f.cust) : DISP_CUST0;
    if (x.manager === undefined && f) x = Object.assign({}, x, { manager: f.manager });
    if ((await loadingList()).some(function (p) { return p.cust === cust && p.name === name && p.id !== req.id; })) throw err('"' + name + '" 상차지가 이미 있어요.');
    var row = loadingRow(session, Object.assign({}, x, { name: name }), cust);
    if (f) await Q(sql, 'update loading_places set ' + LD_SET + ' where id = $1', [f.id].concat(row));
    else await Q(sql, LD_INS, [newId('L')].concat(row));
    return { places: await loadingList() };
  }
  async function loadingBulk(session, req) {
    var cust = custReq(req.cust), list = (req.rows || []).slice(0, 2000).filter(function (x) { return x && String(x.name || '').trim(); });
    if (!list.length) throw err('올릴 상차지가 없어요.');
    var added = 0, updated = 0;
    await locked('loading', async function (tx) {
      var at = {}, fresh = [];
      (await Q(tx, 'select id, name, cust from loading_places order by ord')).forEach(function (r) { if (custOfRow(r.cust) === cust) at[txt(r.name).trim()] = r.id; });
      for (var x of list) {
        var name = String(x.name).trim().slice(0, 60), row = loadingRow(session, Object.assign({}, x, { name: name }), cust), i = at[name];
        if (typeof i === 'number') fresh[i] = [fresh[i][0]].concat(row);
        else if (i != null) { await Q(tx, 'update loading_places set ' + LD_SET + ' where id = $1', [i].concat(row)); updated++; }
        else { at[name] = fresh.length; fresh.push([newId('L')].concat(row)); added++; }
      }
      for (var v of fresh) await Q(tx, LD_INS, v);
    });
    return { places: await loadingList(), added: added, updated: updated };
  }
  async function loadingDelete(id) {
    var f = (await Q(sql, 'select id from loading_places where id = $1', [String(id || '')]))[0]; if (!f) throw err('상차지를 찾을 수 없습니다.');
    for (var p of (await placePhotos()).filter(function (x) { return x.place === String(id); })) await placePhotoDelete(p.id);
    await Q(sql, 'delete from loading_places where id = $1', [f.id]); return { places: await loadingList() };
  }
  async function placePhoto(id) {
    var x = (await placePhotos()).filter(function (p) { return p.id === String(id); })[0]; if (!x) throw err('사진을 찾을 수 없어요.');
    var r = await gas('int.fileGet', { fileId: x.file }); return { data: r.data, mime: 'image/jpeg' };
  }
  async function placePhotoAdd(session, req) {
    var f = (await Q(sql, 'select * from loading_places where id = $1', [String(req.placeId || '')]))[0]; if (!f) throw err('상차지를 먼저 저장하세요.');
    var id = String(req.placeId);
    if ((await placePhotos()).filter(function (x) { return x.place === id; }).length >= PLACE_PHOTO_MAX) throw err('상차지 한 곳에 사진은 ' + PLACE_PHOTO_MAX + '장까지예요. 지우고 다시 올려 주세요.');
    if (!String(req.data || '')) throw err('사진이 비어 있어요.'); if (String(req.data).length > 8.2 * 1024 * 1024) throw err('사진이 너무 커요.');
    var name = (String(f.name) + '_' + ymd().replace(/-/g, '') + '_' + stampTxt('HHmmss')).replace(/[\\/:*?"<>|]/g, '_') + '.jpg';
    var r = await gas('int.filePut', { folder: 'place', name: name, data: req.data });
    await Q(sql, 'insert into place_photos (id, place_id, file_id, cap, by_name, at) values ($1,$2,$3,$4,$5,$6)', [newId('P'), id, r.fileId, String(req.cap || '').trim().slice(0, 200), session.name, nowTxt()]);
    return { places: await loadingList() };
  }
  async function placePhotoCap(req) {
    var r = await Q(sql, 'update place_photos set cap = $2 where id = $1 returning id', [String(req.id || ''), String(req.cap || '').trim().slice(0, 200)]); if (!r.length) throw err('사진을 찾을 수 없어요.');
    return { places: await loadingList() };
  }
  async function placePhotoDelete(id) {
    var f = (await Q(sql, 'select * from place_photos where id = $1', [String(id || '')]))[0]; if (!f) throw err('사진을 찾을 수 없어요.');
    try { await gas('int.fileTrash', { fileId: f.file_id }); } catch (e) { /* 이미 없음 · 구글 연결 전 */ }
    await Q(sql, 'delete from place_photos where id = $1', [f.id]); return { places: await loadingList() };
  }
  async function dispReceipts(db, cust, date) {
    return (await Q(db || sql, 'select * from receipts where cust = $1 and date = $2 order by ord', [cust, date])).map(function (r) { return { id: r.id, no: Number(r.no), fc: r.fc, at: fmt(r.at), size: Number(r.size) || 0 }; });
  }
  async function receiptRow(id) { return (await Q(sql, 'select * from receipts where id = $1', [String(id || '')]))[0] || null; }
  async function dispReceipt(id) { var f = await receiptRow(id); if (!f) throw err('사진을 찾을 수 없습니다.'); var r = await gas('int.fileGet', { fileId: f.file_id }); return { data: r.data, mime: 'image/jpeg' }; }
  async function dispGeo(addrs) { var r = await gas('int.geo', { addrs: addrs || [] }); return r.coords || {}; }

  /* ───────────── 기사 링크 (drv.*) ───────────── */
  async function drvFind(t) {
    t = String(t || ''); if (!/^[0-9a-f]{20}$/.test(t)) throw err('잘못된 링크예요.');
    var r = (await Q(sql, 'select * from disp_trucks where token = $1 order by uid limit 1', [t]))[0];
    if (!r) throw err('링크를 찾을 수 없어요. 배차 담당자에게 문의하세요.');
    return trkRow(r);
  }
  async function drvGroup(tr) {
    if (!tr.join && !tr.token) return [tr];
    var g = dispJoinGroup(await coTrucks(sql, dispCo(tr.cust), [tr.date]), tr);
    return g.length ? g : [tr];
  }
  async function drvGet(t) {
    var tr = await drvFind(t), grp = await drvGroup(tr), many = grp.length > 1, orders = [];
    for (var g of grp) (await dispOrdersDay(sql, g.cust, tr.date)).forEach(function (o) { if (o.truck === g.no) { o.g = g; orders.push(o); } });
    if (many && orders.every(function (o) { return o.seq > 100000; })) orders.sort(function (a, b) { return a.seq - b.seq; });
    var stops = [], by = {};
    orders.forEach(function (o) {
      var d = o.d || {}, k = (many ? o.g.token + '|' : '') + (d.fc || '-') + '|' + String([d.m1, d.m2, d.m3].filter(function (x) { x = String(x == null ? '' : x).trim(); return x && x !== '0'; }).join('/') || d.tel || '').replace(/\s/g, ''), v0 = function (x) { x = String(x == null ? '' : x).trim(); return x === '0' ? '' : x; };
      var s = by[k] || (by[k] = { fc: d.fc || '-', tk: o.g.token, addr: v0(d.addr), hours: v0(d.hours), dock: v0(d.dock), mgr: [d.m1, d.m2, d.m3].concat(d.m1 || d.m2 || d.m3 ? [] : String(d.tel || '').split(' / ')).map(v0).filter(Boolean), items: {}, bundle: 0, kg: 0, bl: [] });
      if (!stops.some(function (x) { return x === s; })) stops.push(s);
      var pm = String(d.bundle || '').match(/(\d+(?:\.\d+)?)\s*패키지/), it = d.item || '-';
      if (pm) { s.pkg = (s.pkg || 0) + Number(pm[1]); s.pkgItems = s.pkgItems || {}; s.pkgItems[it] = (s.pkgItems[it] || 0) + Number(pm[1]); }
      else { var n = Number(String(d.bundle || '').replace(/[,\s]/g, '')) || 0; s.bundle += n; s.items[it] = (s.items[it] || 0) + n; }
      s.kg += Number(String(d.kg || '').replace(/[,\s]/g, '')) || 0; if (d.bl && s.bl.indexOf(d.bl) === -1) s.bl.push(d.bl);
    });
    if (many) {
      var ak = function (s) { var t = String(s.addr || s.fc).replace(/\([^)]*\)/g, ' ').replace(/,/g, ' ').split(/\s+/).filter(Boolean); return t.slice(0, 1).join('').slice(0, 2) + '|' + t.slice(2).filter(function (x) { return !/(층|호)$|^\d+F$|^B\d+$/i.test(x); }).join(''); }, ks = [];
      stops.forEach(function (s) { var k = ak(s); if (ks.indexOf(k) === -1) ks.push(k); });
      stops = stops.map(function (s, i) { return { s: s, i: i, k: ks.indexOf(ak(s)) }; }).sort(function (a, b) { return a.k - b.k || a.i - b.i; }).map(function (x) { return x.s; });
    }
    stops.forEach(function (s) { if (!s.pkg) return; s.bundle += Math.ceil(s.pkg / 24); Object.keys(s.pkgItems).forEach(function (it) { s.items[it + ' ' + s.pkgItems[it] + '패키지'] = Math.ceil(s.pkgItems[it] / 24); }); delete s.pkgItems; });
    var co = tr.cust.replace(/\/.*$/, ''), from = orders[0] && orders[0].d.from, place = await loadingFind(co, from), froms = [from];
    var more = []; for (var o of orders) { var f = o.d.from; if (!f || froms.indexOf(f) !== -1) continue; froms.push(f); var p = await loadingFind(co, f); more.push(p ? p : { name: f }); }
    var gk = function (a) { return String(a || '').replace(/\s+/g, ' ').trim(); };
    var geo = {}; try { geo = await dispGeo(stops.map(function (s) { return s.addr; }).concat(place && place.addr ? [place.addr] : []).concat(more.map(function (p) { return p.addr; }).filter(Boolean))); } catch (e) { /* 지도 없이 */ }
    stops.forEach(function (s) { var g = geo[gk(s.addr)]; if (g) { s.lat = g.lat; s.lng = g.lng; } });
    var rc = [], notes = [], seen = {};
    for (var g2 of grp) (await dispReceipts(sql, g2.cust, tr.date)).forEach(function (x) { if (x.no === g2.no) rc.push({ fc: x.fc, at: x.at, tk: g2.token }); });
    orders.forEach(function (o) { var k = (o.d.fc || '') + '|' + o.noteDrv; if (o.noteDrv && !seen[k]) { seen[k] = 1; notes.push({ fc: o.d.fc || '', text: o.noteDrv }); } });
    try { var cn = (await dispNotes(co)).filter(function (x) { return x.drv; }); orders.forEach(function (o) { var k = dispCnKey(o.d.fc); cn.forEach(function (x) { if (k && dispCnKey(x.fc) === k && !seen['|' + x.note]) { seen['|' + x.note] = 1; notes.push({ fc: o.d.fc || '', text: x.note }); } }); }); } catch (e) { /* 특이사항 없이 */ }
    var pl = function (p) { return { name: p.name, addr: p.addr || '', time: p.time || '', contact: [p.manager, p.contact].filter(Boolean).join(' / '), photos: p.photos || [], lat: (geo[gk(p.addr)] || {}).lat, lng: (geo[gk(p.addr)] || {}).lng }; };
    var b = grp[0];
    return { notes: notes, date: tr.date, no: b.no, cust: co, car: b.car, driver: b.driver, from: from || '', place: place ? pl(place) : null, more: more.map(pl), stops: stops, receipts: rc };
  }
  async function drvUpload(req) {
    var tr0 = await drvFind(req.t), fc = String(req.fc || ''), tr = null, orders = [];
    if (tr0.date < ymd(new Date(Date.now() - 60 * 86400000))) throw err('배차일로부터 60일이 지나 사진을 올릴 수 없어요. 배차 담당자에게 보내 주세요.');
    for (var g of await drvGroup(tr0)) {
      if (req.tk && g.token !== String(req.tk)) continue;
      orders = (await dispOrdersDay(sql, g.cust, tr0.date)).filter(function (o) { return o.truck === g.no && (o.d.fc || '-') === fc; });
      if (orders.length) { tr = g; break; }
    }
    if (!tr) throw err('이 호차의 착지가 아니에요.');
    if ((await dispReceipts(sql, tr.cust, tr.date)).filter(function (x) { return x.no === tr.no && x.fc === fc; }).length >= 10) throw err('한 착지에 10장까지 올릴 수 있어요.');
    var data = String(req.data || ''); if (!data) throw err('사진이 비어 있어요.'); if (data.length > 8.2 * 1024 * 1024) throw err('사진이 너무 커요.');
    var name = (tr.date + '_' + tr.cust.replace(/\//g, '-') + '_' + tr.no + '호차_' + fc + '_' + stampTxt('HHmmss')).replace(/[\\/:*?"<>|]/g, '_') + '.jpg';
    var r = await gas('int.filePut', { folder: 'receipt', name: name, data: data });
    await Q(sql, 'insert into receipts (id, cust, date, no, fc, file_id, at, size) values ($1,$2,$3,$4,$5,$6,$7,$8)', [newId('R'), tr.cust, tr.date, tr.no, fc, r.fileId, nowTxt(), Number(r.size) || 0]);
    await dispTouch(tr.cust, tr.date);
    return drvGet(req.t);
  }
  async function drvPhoto(req) {
    var d = await drvGet(req.t), ok = [d.place].concat(d.more || []).some(function (p) { return p && (p.photos || []).some(function (x) { return x.id === String(req.id); }); });
    if (!ok) throw err('사진을 찾을 수 없어요.');
    return placePhoto(req.id);
  }

  /* ───────────── 요청 처리 (Code.js handle_ 와 같은 순서·같은 오류 문구) ───────────── */
  async function handle(req) {
    var action = String(req.action || '');
    if (action === 'login') return login(req.id, req.password, req.keep);
    if (/^drv\./.test(action)) { var cd = ctxStore.getStore(); if (cd) cd.who = '기사 링크'; }
    if (action === 'drv.get') return drvGet(req.t);
    if (action === 'drv.upload') return drvUpload(req);
    if (action === 'drv.photo') return drvPhoto(req);
    var session = await requireSession(req.token), cx = ctxStore.getStore(); if (cx) cx.who = session.name || session.id;
    if (session.mustChange && ['me', 'logout', 'changePassword', 'publicSettings'].indexOf(action) === -1) throw err('임시 비밀번호입니다. 비밀번호를 먼저 변경하세요.');
    if (session.role === 'partner') return partnerHandle(session, action, req);
    switch (action) {
      case 'me': return { user: pub(session), settings: await publicSettings() };
      case 'logout': return logout(req.token);
      case 'changePassword': return changePassword(session, req.current, req.next);
      case 'publicSettings': return { settings: await publicSettings() };
    }
    switch (action) { // 팀 공지는 모든 직원 (Code.js 처럼 견적 권한 확인 전)
      case 'notice.list': return { notices: await noticesList() };
      case 'notice.save': return noticeSave(session, req);
      case 'notice.delete': return noticeDelete(session, req.id);
      case 'work.list': return workList(session, req);
      case 'work.stamp': return { stamp: await workStamp(workWho(session, req.uid)) };
      case 'work.op': return workOp(session, req);
    }
    if (port.has(action)) return port.handle(action, session, req); // 옮긴 Code.js 영역 (port.js · 권한 확인도 거기서)
    if (/^dispatch\.|^loading\.|^drivers\.|^dest\.|^inq\.|^owners\./.test(action)) requirePerm(session, 'quote'); // Code.js QUOTE_ACTIONS 안의 배차 액션들 · 문의·업무담당
    switch (action) {
      case 'dispatch.day': return dispScrub(await dispDay(req.cust, req.date), session);
      case 'dispatch.month': return dispScrub(await dispMonth(req.cust, req.ym), session);
      case 'dispatch.dayAll': return dispScrub(await dispMulti(req.keys, function (k) { return dispDay(k, req.date); }), session);
      case 'dispatch.monthAll': return dispScrub(await dispMulti(req.keys, function (k) { return dispMonth(k, req.ym); }), session);
      case 'dispatch.tabs': return { tabs: await dispTabs(req.cust) };
      case 'dispatch.tabsSave': return dispTabsSave(req);
      case 'dispatch.import': var imr = await dispImport(session, req); for (var d of Object.keys(imr.dates || {})) await dispTouch(req.cust, d); return imr;
      case 'dispatch.save': return dispScrub(await dispSave(session, req), session);
      case 'dispatch.stamp': return { stamps: await dispStamps(req.keys, req.date) };
      case 'dispatch.deleteOrders': return dispTouched(req, await dispDeleteOrders(session, req));
      case 'dispatch.note': return dispTouched(req, await dispNote(req));
      case 'dispatch.copyOrders': var cpr = await dispCopyOrders(session, req); await dispTouch(req.cust, req.toDate); return dispTouched(req, cpr);
      case 'dispatch.moveOrders': var mvr = await dispMoveOrders(session, req); await dispTouch(req.cust, req.toDate); return dispTouched(req, mvr);
      case 'dispatch.editOrder': return dispTouched(req, await dispEditOrder(session, req));
      case 'dispatch.rates': return dispRates(session);
      case 'dispatch.ratesSave': return dispRatesSave(session, req);
      case 'dispatch.mapSave': return dispMapSave(session, req);
      case 'dispatch.price': dispNeedCost(session); return { prices: await dispPrices(req.cust) };
      case 'dispatch.priceSave': dispNeedCost(session); return { prices: await dispPriceSave(req) };
      case 'dispatch.codes': dispNeedCost(session); return { codes: await dispCodes(req.cust) };
      case 'dispatch.codesSave': dispNeedCost(session); return { codes: await dispCodesSave(req) };
      case 'dispatch.notes': return { list: await dispNotes(req.cust) };
      case 'dispatch.notesSave': return { list: await dispNotesSave(session, req) };
      case 'dispatch.must': return { list: await dispMust(req.cust) };
      case 'dispatch.mustSave': throw err('사이트를 새로고침해 주세요. (도착지 특이사항으로 바뀌었어요)');
      case 'dispatch.map': return { map: await dispMap() };
      case 'dispatch.geo': return { coords: await dispGeo(req.addrs) };
      case 'dispatch.receipt': return dispReceipt(req.id);
      case 'dispatch.history': return dispHistory(session, req);
      case 'inq.list': return inqList();
      case 'inq.save': return inqSave(session, req);
      case 'inq.delete': return inqDelete(session, req.id);
      case 'owners.list': return ownersList();
      case 'owners.save': return ownerSave(session, req);
      case 'owners.delete': return ownerDelete(session, req.id);
      case 'dispatch.search': return dispSearch(session, req);
      case 'loading.list': return { places: await loadingList() };
      case 'drivers.list': return { drivers: await driverList() };
      case 'drivers.save': return driverSave(session, req);
      case 'drivers.delete': return driverDelete(req.id);
      case 'loading.save': return loadingSave(session, req);
      case 'dest.list': return { dests: await destList() };
      case 'dest.save': return destSave(session, req);
      case 'loading.bulk': return loadingBulk(session, req);
      case 'drivers.bulk': return driverBulk(session, req);
      case 'loading.delete': return loadingDelete(req.id);
      case 'loading.photo': return placePhoto(req.id);
      case 'loading.photoAdd': return placePhotoAdd(session, req);
      case 'loading.photoCap': return placePhotoCap(req);
      case 'loading.photoDelete': return placePhotoDelete(req.id);
    }
    if (session.role !== 'admin') throw err('관리자만 사용할 수 있습니다.');
    switch (action) {
      case 'admin.listUsers': return { users: await listUsers() };
      case 'admin.createUser': return createUser(req.id, req.name, req.role, req.perms, req.dispTabs);
      case 'admin.updateUser': return updateUser(session, req.id, req.patch || {});
      case 'admin.resetPassword': return resetPassword(req.id);
      case 'admin.audit': return auditList(session, req);
      case 'admin.usage': return adminUsage();
      case 'admin.routes': return urgent.routeList(); // 긴급 알림 이동시간 표 (018)
      case 'admin.routeRefetch': return urgent.routeRefetch(req.from, req.to);
    }
    throw err('알 수 없는 요청입니다: ' + action);
  }
  async function partnerHandle(session, action, req) {
    if (PARTNER_ACTIONS.indexOf(action) === -1) throw err('협력사 계정은 배차시트만 쓸 수 있어요.');
    var ok = function (k) { if (session.dispTabs.indexOf(String(k)) === -1) throw err('볼 수 없는 탭이에요.'); return String(k); };
    switch (action) {
      case 'me': return { user: pub(session), settings: await publicSettings() };
      case 'logout': return logout(req.token);
      case 'changePassword': return changePassword(session, req.current, req.next);
      case 'publicSettings': return { settings: await publicSettings() };
      case 'dispatch.tabs': return { tabs: (await dispTabs(req.cust)).filter(function (t) { return !t.hidden && session.dispTabs.indexOf(dispCust(req.cust) + t.suf) !== -1; }) };
      case 'dispatch.day': return dispScrub(await dispDay(ok(req.cust), req.date), session);
      case 'dispatch.dayAll': (req.keys || []).forEach(ok); return dispScrub(await dispMulti(req.keys, function (k) { return dispDay(k, req.date); }), session);
      case 'dispatch.save': ok(req.cust); return dispScrub(await dispSave(session, req), session);
      case 'dispatch.stamp': (req.keys || []).forEach(ok); return { stamps: await dispStamps(req.keys, req.date) };
      case 'dispatch.geo': return { coords: await dispGeo(req.addrs) };
      case 'dispatch.must': if (partnerCusts(session).indexOf(dispCust(req.cust)) === -1) throw err('볼 수 없는 업체예요.'); return { list: await dispMust(req.cust) };
      case 'dispatch.notes': if (partnerCusts(session).indexOf(dispCust(req.cust)) === -1) throw err('볼 수 없는 업체예요.'); return { list: (await dispNotes(req.cust)).filter(function (x) { return x.ptn || x.drv; }) };
      case 'dispatch.rates': return partnerRates(session);
      case 'dispatch.search': return dispSearch(session, req);
      case 'dispatch.receipt': var rf = await receiptRow(req.id); if (!rf) throw err('사진을 찾을 수 없습니다.'); ok(rf.cust); return dispReceipt(req.id);
      case 'loading.list': var pcs = partnerCusts(session); return { places: (await loadingList()).filter(function (x) { return pcs.indexOf(x.cust) !== -1; }) };
      case 'loading.photo': return placePhoto(req.id);
      case 'drivers.list': return { drivers: (await driverList()).map(driverScrub) };
      case 'drivers.save': return { drivers: (await driverSave(session, req)).drivers.map(driverScrub) };
    }
    throw err('협력사 계정은 배차시트만 쓸 수 있어요.');
  }

  /* 기사 풀 직접 고치기 */
  async function driverSave(session, req) {
    var x = req.driver || {}, car = String(x.car || '').trim(), drv = String(x.driver || '').trim();
    if (!car && !drv) throw err('차량정보나 운전원을 넣으세요.');
    var q = function (v) { return String(v || '').trim().slice(0, 100); }, partner = session.role === 'partner';
    var k = driverKey(car, drv, x.phone), dup = (await driverList()).filter(function (d) { return d.id !== req.id && driverKey(d.car, d.driver, d.phone) === k; })[0];
    if (dup) throw err('같은 기사가 이미 있어요' + (dup.car ? ' (' + dup.car + ')' : '') + '.');
    if (req.id) {
      var f = (await Q(sql, 'select id from drivers where id = $1', [String(req.id)]))[0]; if (!f) throw err('기사를 찾을 수 없어요.');
      await Q(sql, 'update drivers set car = $2, driver = $3, phone = $4, ton = $5, memo = $6, pin = $7, by_name = $8, at = $9 where id = $1', [f.id, q(car), q(drv), q(x.phone), q(x.ton), q(x.memo), x.pin ? 'Y' : 'N', session.name, nowTxt()]);
      if (x.birth !== undefined && !partner) await Q(sql, 'update drivers set birth = $2 where id = $1', [f.id, q(x.birth)]);
      if (x.org !== undefined && !partner) await Q(sql, 'update drivers set org = $2 where id = $1', [f.id, q(x.org)]);
      if (x.black !== undefined && !partner) await Q(sql, 'update drivers set black = $2 where id = $1', [f.id, x.black ? 'Y' : '']);
    } else await drvIns(sql, [newId('V'), q(car), q(drv), q(x.phone), q(x.ton), q(x.memo), x.pin ? 'Y' : 'N', 0, '', session.name, nowTxt(), partner ? '' : q(x.birth), partner ? q(session.name) : q(x.org), x.black && !partner ? 'Y' : '']);
    return { drivers: await driverList() };
  }
  async function driverBulk(session, req) {
    var q = function (v) { return String(v == null ? '' : v).trim().slice(0, 100); };
    var list = (req.rows || []).slice(0, 3000).filter(function (x) { return x && (String(x.car || '').trim() || String(x.driver || '').trim()); });
    if (!list.length) throw err('올릴 기사가 없어요.');
    var added = 0, updated = 0;
    await locked('drivers', async function (tx) {
      var cur = (await Q(tx, 'select * from drivers order by ord')).map(drvArr), idx = {}, fresh = [];
      cur.forEach(function (r, i) { idx[driverKey(r[1], r[2], r[3])] = i; });
      for (var x of list) {
        var k = driverKey(x.car, x.driver, x.phone), i = idx[k], bl = x.black === true || driverBlack(x.black) ? 'Y' : '';
        if (i != null && i >= 0) {
          var v = cur[i].slice(); v[1] = q(x.car); v[2] = q(x.driver); v[3] = q(x.phone); v[4] = q(x.ton); v[5] = q(x.memo); v[9] = session.name; v[10] = nowTxt(); v[11] = q(x.birth); v[12] = q(x.org); v[13] = bl; v[6] = String(v[6] || 'N');
          await drvUpd(tx, v); updated++;
        } else if (i == null) { idx[k] = -1; fresh.push([newId('V'), q(x.car), q(x.driver), q(x.phone), q(x.ton), q(x.memo), 'N', 0, '', session.name, nowTxt(), q(x.birth), q(x.org), bl]); added++; }
      }
      for (var v2 of fresh) await drvIns(tx, v2);
    });
    return { drivers: await driverList(), added: added, updated: updated };
  }
  async function driverDelete(id) { var r = await Q(sql, 'delete from drivers where id = $1 returning id', [String(id || '')]); if (!r.length) throw err('기사를 찾을 수 없어요.'); return { drivers: await driverList() }; }

  /* ───────────── 팀 공지 · 문의 기록 · 업무 담당표 (012 · Code.js noticesList_ … ownerDelete_ 와 같은 규칙·문구) ───────────── */
  async function noticesList() {
    return (await Q(sql, 'select * from notices order by ord')).map(function (r) { return { id: r.id, title: r.title, body: r.body || '', pinned: !!r.pinned, ownerId: r.owner_id, owner: r.owner, at: fmt(r.created_at), updated: fmt(r.updated_at) }; })
      .sort(function (a, b) { return (b.pinned - a.pinned) || (a.at < b.at ? 1 : -1); });
  }
  async function noticeSave(session, req) {
    var n = req.notice || {}, title = String(n.title || '').trim().slice(0, 100);
    if (!title) throw err('공지 제목을 넣으세요.');
    var body = String(n.body || '').slice(0, 5000), adm = session.role === 'admin';
    if (req.id) {
      var f = (await Q(sql, 'select * from notices where id = $1', [String(req.id)]))[0]; if (!f) throw err('공지를 찾을 수 없습니다.');
      if (f.owner_id !== session.id && !adm) throw err('쓴 사람이나 관리자만 고칠 수 있습니다.');
      await Q(sql, 'update notices set title = $2, body = $3, pinned = $4, updated_at = $5 where id = $1', [f.id, title, body, adm ? !!n.pinned : f.pinned, nowTxt()]);
    } else await Q(sql, 'insert into notices (id, title, body, pinned, owner_id, owner, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8)', [newId('G'), title, body, adm && !!n.pinned, session.id, session.name, nowTxt(), '']);
    return { notices: await noticesList() };
  }
  async function noticeDelete(session, id) {
    var f = (await Q(sql, 'select * from notices where id = $1', [String(id || '')]))[0]; if (!f) throw err('공지를 찾을 수 없습니다.');
    if (f.owner_id !== session.id && session.role !== 'admin') throw err('쓴 사람이나 관리자만 지울 수 있습니다.');
    await Q(sql, 'delete from notices where id = $1', [f.id]); return { notices: await noticesList() };
  }
  function inqRow(r) { return { id: r.id, at: r.at, cust: r.cust || '', who: r.who || '', body: r.body || '', answer: r.answer || '', status: r.status || '처리 중', byId: r.by_id || '', by: r.by_name || '', faq: !!r.faq, upd: fmt(r.updated_at) }; }
  async function inqList() { return { inqs: (await Q(sql, 'select * from inquiries order by ord')).map(inqRow).sort(function (a, b) { return a.at < b.at ? 1 : -1; }) }; }
  async function inqSave(session, req) {
    var q = req.inq || {}, body = String(q.body || '').trim(); if (!body) throw err('문의 내용을 넣으세요.');
    var at = String(q.at || '').trim(); if (at && !/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?/.test(at)) throw err('일시를 확인하세요.');
    var status = q.status === '완료' ? '완료' : '처리 중';
    var vals = [String(q.cust || '').trim().slice(0, 100), String(q.who || '').trim().slice(0, 60), body.slice(0, 5000), String(q.answer || '').slice(0, 5000), status];
    if (req.id) {
      var f = (await Q(sql, 'select * from inquiries where id = $1', [String(req.id)]))[0]; if (!f) throw err('문의 기록을 찾을 수 없습니다.');
      await Q(sql, 'update inquiries set at = $2, cust = $3, who = $4, body = $5, answer = $6, status = $7, faq = $8, updated_at = $9 where id = $1', [f.id, at || f.at].concat(vals).concat([!!q.faq, nowTxt()]));
    } else await Q(sql, 'insert into inquiries (id, at, cust, who, body, answer, status, by_id, by_name, faq, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [newId('Q'), at || nowTxt().slice(0, 16)].concat(vals).concat([session.id, session.name, !!q.faq, nowTxt()]));
    return inqList();
  }
  async function inqDelete(session, id) {
    var f = (await Q(sql, 'select * from inquiries where id = $1', [String(id || '')]))[0]; if (!f) throw err('문의 기록을 찾을 수 없습니다.');
    if (f.by_id !== session.id && session.role !== 'admin') throw err('응대한 사람이나 관리자만 지울 수 있습니다.');
    await Q(sql, 'delete from inquiries where id = $1', [f.id]); return inqList();
  }
  async function ownersList() {
    var list = (await Q(sql, 'select * from owners order by ord')).map(function (r) { return { id: r.id, task: r.task, cust: r.cust || '', main: r.main || '', sub: r.sub || '', memo: r.memo || '', by: r.by_name || '', at: fmt(r.at) }; });
    var log = (await Q(sql, 'select * from (select * from owner_log order by id desc limit 80) x order by id desc')).map(function (r) { return { at: fmt(r.at), task: r.task, text: r.text, by: r.by_name }; });
    return { owners: list, log: log };
  }
  async function ownerLog(task, text, by) { await Q(sql, 'insert into owner_log (at, task, text, by_name) values ($1,$2,$3,$4)', [nowTxt(), task, text, by]); }
  async function ownerSave(session, req) {
    var o = req.owner || {}, task = String(o.task || '').trim().slice(0, 100); if (!task) throw err('업무 이름을 넣으세요.');
    var row = [task, String(o.cust || '').trim().slice(0, 100), String(o.main || '').trim().slice(0, 30), String(o.sub || '').trim().slice(0, 30), String(o.memo || '').slice(0, 500), session.name, nowTxt()];
    if (req.id) {
      var f = (await Q(sql, 'select * from owners where id = $1', [String(req.id)]))[0]; if (!f) throw err('업무를 찾을 수 없습니다.');
      var ch = [];
      if (f.main !== row[2]) ch.push('주담당 ' + (f.main || '없음') + ' → ' + (row[2] || '없음'));
      if (f.sub !== row[3]) ch.push('부담당 ' + (f.sub || '없음') + ' → ' + (row[3] || '없음'));
      if (ch.length) await ownerLog(task, ch.join(' · '), session.name);
      await Q(sql, 'update owners set task = $2, cust = $3, main = $4, sub = $5, memo = $6, by_name = $7, at = $8 where id = $1', [f.id].concat(row));
    } else { await Q(sql, 'insert into owners (id, task, cust, main, sub, memo, by_name, at) values ($1,$2,$3,$4,$5,$6,$7,$8)', [newId('W')].concat(row)); await ownerLog(task, '추가 (주담당 ' + (row[2] || '없음') + ', 부담당 ' + (row[3] || '없음') + ')', session.name); }
    return ownersList();
  }
  async function ownerDelete(session, id) {
    var f = (await Q(sql, 'select * from owners where id = $1', [String(id || '')]))[0]; if (!f) throw err('업무를 찾을 수 없습니다.');
    await ownerLog(f.task, '삭제', session.name); await Q(sql, 'delete from owners where id = $1', [f.id]); return ownersList();
  }

  /** 관리자: 무료 한도 사용량 (DB 용량 500MB 중 · 큰 표 · 변경 이력·알림·위치 기록 줄 수) — 금액 없음 */
  async function adminUsage() {
    var db = (await Q(sql, 'select pg_database_size(current_database())::bigint b'))[0];
    var tabs = (await Q(sql, "select n.nspname || '.' || c.relname t, pg_total_relation_size(c.oid)::bigint b, greatest(c.reltuples, 0)::bigint n from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind = 'r' and n.nspname in ('joil', 'public') order by 2 desc limit 12"));
    var cnt = async function (q) { try { return Number((await Q(sql, q))[0].n) || 0; } catch (e) { return null; } };
    return { db: Number(db.b), limit: 500 * 1024 * 1024, tables: tabs.map(function (r) { return { t: r.t, bytes: Number(r.b), rows: Number(r.n) }; }),
      counts: { audit: await cnt('select count(*) n from audit'), alerts: await cnt('select count(*) n from alerts where resolved_at is null'), positions: await cnt('select count(*) n from public.positions'), sessions: await cnt('select count(*) n from sessions where expires_at > now()') } };
  }
  var port = makePort({ sql: sql, fetch: opts.netFetch, zip: opts.zip, calcSrc: opts.calcSrc, err: err, nowTxt: nowTxt, newId: newId, requirePerm: requirePerm, who: ctxWho, gas: function (a, p) { return gas(a, p); }, noticesList: function () { return noticesList(); }, ownersList: function () { return ownersList(); }, listUsers: function () { return listUsers(); } });
  /* ───────────── 업무 기록 (013 · Code.js workList_·workOp_ 와 같은 규칙) ───────────── */
  function workWho(session, uid) {
    uid = String(uid || '');
    if (!uid || uid === session.id) return session.id;
    if (session.role !== 'admin') throw err('다른 사람의 업무 기록은 볼 수 없습니다.');
    return uid;
  }
  async function workStamp(uid, db) { var r = (await Q(db || sql, 'select stamp from work_stamps where uid = $1', [uid]))[0]; return r ? r.stamp : ''; }
  async function workRows(uid, db) { return (await Q(db || sql, 'select * from work_items where uid = $1 order by r', [uid])).map(function (r) { return { id: r.id, text: r.text, st: r.st, ord: Number(r.ord) || 0, at: r.at, start: r.start, done: r.done }; }); }
  async function workList(session, req) {
    var uid = workWho(session, req.uid), date = req.date ? String(req.date).trim().replace(/^'/, '') : ymd();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw err('날짜를 YYYY-MM-DD 형식으로 넣으세요.');
    var items = (await workRows(uid)).filter(function (x) { return x.st !== '완료' || x.done.slice(0, 10) === date; });
    var out = { items: items, date: date, uid: uid, stamp: await workStamp(uid) };
    if (session.role === 'admin') out.users = (await listUsers()).filter(function (u) { return u.role !== 'partner' && u.active; }).map(function (u) { return { id: String(u.id), name: String(u.name) }; });
    return out;
  }
  async function workOp(session, req) {
    var uid = session.id, op = String(req.op || ''), now = nowTxt(), gone = false;
    await locked('work|' + uid, async function (tx) {
      var items = await workRows(uid, tx), ch = [];
      var find = function (id) { return items.filter(function (x) { return x.id === String(id || ''); })[0]; };
      var waits = function () { return items.filter(function (x) { return x.st === '대기'; }); };
      var minOrd = function () { return waits().reduce(function (m, x) { return Math.min(m, x.ord); }, 1) - 1; };
      var mark = function (x) { if (ch.indexOf(x) === -1) ch.push(x); };
      if (op === 'add') {
        var text = String(req.text || '').trim().slice(0, 500); if (!text) throw err('내용을 넣으세요.');
        var id = /^K[0-9a-z]{6,24}$/.test(String(req.id || '')) && !find(req.id) ? String(req.id) : newId('K');
        var ord = waits().reduce(function (m, x) { return Math.max(m, x.ord); }, 0) + 1;
        await Q(tx, "insert into work_items (id, text, st, ord, at, start, done, uid) values ($1, $2, '대기', $3, $4, '', '', $5)", [id, text, ord, now, uid]);
      } else if (op === 'order') {
        var ids = (req.ids || []).map(String), rest = waits().filter(function (x) { return ids.indexOf(x.id) === -1; });
        ids.map(find).filter(function (x) { return x && x.st === '대기'; }).concat(rest).forEach(function (x, i) { if (x.ord !== i + 1) { x.ord = i + 1; mark(x); } });
      } else {
        var it = find(req.id);
        if (!it) { if (op === 'delete') { gone = true; return; } throw err('항목을 찾을 수 없습니다. 새로고침해 보세요.'); }
        if (op === 'edit') {
          var t = String(req.text || '').trim().slice(0, 500); if (!t) throw err('내용을 넣으세요.');
          it.text = t; mark(it);
        } else if (op === 'status') {
          var to = String(req.st || '');
          if (to === '진행 중') {
            if (it.st !== to) { it.ord = items.filter(function (x) { return x.st === to; }).reduce(function (m, x) { return Math.min(m, x.ord); }, 1) - 1; it.st = to; it.start = it.start || now; it.done = ''; mark(it); }
          } else if (to === '대기') { if (it.st !== '대기') { it.ord = minOrd(); it.st = to; it.done = ''; mark(it); } }
          else if (to === '완료') { it.st = to; it.done = now; mark(it); }
          else throw err('상태를 확인하세요.');
        } else if (op === 'delete') await Q(tx, 'delete from work_items where id = $1 and uid = $2', [it.id, uid]);
        else throw err('알 수 없는 요청입니다: work.' + op);
      }
      for (var x of ch) await Q(tx, 'update work_items set text = $2, st = $3, ord = $4, at = $5, start = $6, done = $7 where id = $1 and uid = $8', [x.id, x.text, x.st, x.ord, x.at, x.start || '', x.done || '', uid]);
      await Q(tx, 'insert into work_stamps (uid, stamp) values ($1, $2) on conflict (uid) do update set stamp = excluded.stamp', [uid, String(Date.now())]);
    });
    return workList(session, req);
  }

  /* ───────────── 배차 이력 찾기 (차량번호·기사·연락처·센터·오더 키·주소 …) · 금액은 안 보냄 · 협력사는 배정된 탭만 ───────────── */
  /** { q, co(업체), from, to } → { list: [운행 한 건 = 날짜·탭·호차·차량·센터들], drivers: 기사별, centers: 센터별, more } */
  var TRK_FIND = "(car || ' ' || replace(car, ' ', '') || ' ' || driver || ' ' || regexp_replace(phone, '[^0-9]', '', 'g'))"; // 010 색인과 같은 식이어야 색인을 써요
  async function dispSearch(session, req) {
    var q = String(req.q || '').trim().slice(0, 50); if (q.replace(/\s/g, '').length < 2) throw err('두 글자 이상 넣어 주세요.');
    var co = dispCust(req.co), to = req.to ? dispDate(req.to) : '9999-12-31', from = req.from ? dispDate(req.from) : '0000-00-00';
    var tabs = session.role === 'partner' ? session.dispTabs.filter(function (k) { return dispCo(k) === co; }) : null;
    if (tabs && !tabs.length) throw err('볼 수 없는 업체예요.');
    var like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%', tight = '%' + q.replace(/\s/g, '').replace(/[\\%_]/g, '\\$&') + '%', dg = q.replace(/[^0-9]/g, ''), digits = dg.length >= 3 ? '%' + dg + '%' : '';
    var scope = '(cust = $1 or cust like $2) and date between $3 and $4' + (tabs ? ' and cust = any($8)' : '');
    var P = [co, co.replace(/[\\%_]/g, '\\$&') + '/%', from, to, like, tight, digits].concat(tabs ? [tabs] : []);
    var hits = await Q(sql, 'select cust, date, no from disp_trucks where ' + scope + " and (" + TRK_FIND + " ilike $5 or " + TRK_FIND + " ilike $6 or ($7 <> '' and " + TRK_FIND + " like $7))" +
      ' union select cust, date, truck from disp_orders where ' + scope + ' and (key ilike $5 or (data::text ilike $5 and exists (select 1 from json_each_text(data) e where e.value ilike $5)) or note_in ilike $5 or note_drv ilike $5) order by 2 desc, 1, 3 limit 401', P);
    var more = hits.length > 400; hits = hits.slice(0, 400);
    var pairs = {}; hits.forEach(function (h) { pairs[h.cust + '|' + h.date] = 1; });
    var pk = Object.keys(pairs), tr = {}, od = {};
    if (pk.length) {
      (await Q(sql, "select * from disp_trucks where cust || '|' || date = any($1)", [pk])).forEach(function (r) { tr[r.cust + '|' + r.date + '|' + r.no] = r; });
      (await Q(sql, "select cust, date, truck, data from disp_orders where cust || '|' || date = any($1) order by seq, ord", [pk])).forEach(function (r) { var k = r.cust + '|' + r.date + '|' + (r.truck == null ? '' : r.truck); (od[k] = od[k] || []).push(parseJson(r.data, {}) || {}); });
    }
    var num = function (v) { var n = Number(String(v == null ? '' : v).replace(/[^0-9.]/g, '')); return isFinite(n) ? n : 0; };
    var list = hits.map(function (h) {
      var k = h.cust + '|' + h.date + '|' + (h.no == null ? '' : h.no), t = tr[k] || {}, os = od[k] || [], fcs = [];
      os.forEach(function (d) { if (d.fc && fcs.indexOf(d.fc) === -1) fcs.push(String(d.fc)); });
      return { date: h.date, cust: h.cust, no: h.no == null ? null : Number(h.no), car: t.car || '', driver: t.driver || '', phone: t.phone || '', ton: t.ton || '', status: dispStatus(t.status || ''), fcs: fcs, from: (os[0] && os[0].from) || '',
        bundle: os.reduce(function (a, d) { return a + num(d.bundle); }, 0), kg: os.reduce(function (a, d) { return a + num(d.kg); }, 0), n: os.length };
    });
    var dmap = {}, cmap = {};
    list.forEach(function (x) {
      if (x.car || x.driver) { var dk = (x.car || '').replace(/\s/g, '') + '|' + x.driver, d = dmap[dk] = dmap[dk] || { car: x.car, driver: x.driver, phone: x.phone, n: 0, last: '', first: x.date }; d.n++; if (x.date > d.last) { d.last = x.date; d.phone = x.phone || d.phone; } if (x.date < d.first) d.first = x.date; }
      x.fcs.forEach(function (fc) { var c = cmap[fc] = cmap[fc] || { fc: fc, n: 0, last: '', first: x.date }; c.n++; if (x.date > c.last) c.last = x.date; if (x.date < c.first) c.first = x.date; });
    });
    var byN = function (a, b) { return b.n - a.n || (a.last < b.last ? 1 : -1); };
    return { list: list, drivers: Object.keys(dmap).map(function (k) { return dmap[k]; }).sort(byN), centers: Object.keys(cmap).map(function (k) { return cmap[k]; }).sort(byN), more: more };
  }

  /* ───────────── 변경 이력 (DB 트리거가 남긴 joil.audit · 금액이 든 것은 분석 권한자만) ───────────── */
  var AUD_MONEY = ['rev', 'cost', 'ret_cost', 'wait', 'support'];
  var AUD_SEL = "select id, to_char(at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') at, who, tbl, op, cust, date, ref, no, chg, money from audit";
  function audRow(r, cost) {
    var c = parseJson(r.chg, {}) || {};
    if (!cost && r.money) {
      if (['rate', 'price', 'code'].indexOf(r.tbl) !== -1) return null;
      c = Object.assign({}, c); AUD_MONEY.forEach(function (k) { delete c[k]; }); if (!Object.keys(c).length) return null;
    }
    return { id: Number(r.id), at: r.at, who: r.who, tbl: r.tbl, op: r.op, cust: r.cust, date: r.date, ref: r.ref, no: r.no == null ? null : Number(r.no), chg: c };
  }
  /** 호차·오더 이력: { cust, date, tk?(호차 링크코드 · token 은 로그인 토큰이라 다른 이름), ids? } → 그 날짜(탭)의 호차·오더 변경 (최근 것부터 300개) */
  async function dispHistory(session, req) {
    var cust = dispCust(req.cust), date = dispDate(req.date), refs = (req.ids || []).map(String).slice(0, 200);
    if (req.tk) refs.push(String(req.tk));
    var rows = await Q(sql, AUD_SEL + " where cust = $1 and date = $2 and tbl in ('truck', 'order')" + (refs.length ? ' and ref = any($3)' : '') + ' order by id desc limit 300', refs.length ? [cust, date, refs] : [cust, date]);
    var cost = canCost(session); return { list: rows.map(function (r) { return audRow(r, cost); }).filter(Boolean) };
  }
  /** 관리자: 계정·권한·단가표·특이사항·월별 단가·코드·탭·센터도착 이력 { tbl?, days?, q? } */
  async function auditList(session, req) {
    var tbls = (req.tbl ? [String(req.tbl)] : ['account', 'rate', 'note', 'price', 'code', 'tab', 'map']), days = Math.max(1, Math.min(400, Number(req.days) || 30)), q = String(req.q || '').trim().slice(0, 50);
    var rows = await Q(sql, AUD_SEL + " where tbl = any($1) and at > now() - $2::int * interval '1 day'" + (q ? " and (who ilike $3 or ref ilike $3 or cust ilike $3 or chg::text ilike $3)" : '') + ' order by id desc limit 500', q ? [tbls, days, '%' + q.replace(/[\\%_]/g, '\\$&') + '%'] : [tbls, days]);
    var cost = canCost(session); return { list: rows.map(function (r) { return audRow(r, cost); }).filter(Boolean) };
  }

  /** 응답 봉투: Code.js doPost 와 같게 { ok, ..., ms } */
  async function call(req) {
    var t0 = Date.now(), out;
    try { out = await ctxStore.run({}, function () { return handle(req || {}); }); out = out && typeof out === 'object' ? out : {}; out.ok = true; }
    catch (e) { out = { ok: false, error: (e && e.message) || String(e) }; if (e && !e.message) console.error(e); else if (e && e.code) console.error('DB 오류', req && req.action, e.code, e.message); }
    out.ms = Date.now() - t0; if (out.ms > 3000) console.log('느린 요청 ' + (req && req.action) + ' ' + out.ms + 'ms');
    return out;
  }
  var urgent = makeUrgent({ sql: sql, geocode: function (a) { return port.geo(a); }, kakao: function (u) { return port.kakao(u); } });
  return { port: port, urgent: urgent, call: call, handle: handle, requireSession: requireSession, pub: pub, gas: gas, _t: { hash: hash, sha256hex: sha256hex, dispCnKey: dispCnKey, rateTon: rateTon } };
}
