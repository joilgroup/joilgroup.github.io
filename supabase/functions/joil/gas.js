// Code.js 를 Supabase 에서 그대로 돌리는 실행기 (배차·계정 밖의 모든 메뉴: 견적·일정·분석·공지·업무·매뉴얼 …).
// 구글 시트·스크립트 속성·캐시·잠금·UrlFetch·Utilities 를 흉내 내요. 시트 = 시트마다 칸 있는 표 joil.gs_…(014, sheet_read·sheet_write·sheet_cut) · 아직 안 옮긴 시트는 joil.sheet_rows(줄 값 배열).
// Apps Script 는 '바로 답이 오는'(동기) 함수인데 DB·인터넷은 기다려야 해서(비동기): 필요한 시트·요청을 만나면 적어 두고
// 그것들을 받아 온 뒤 액션을 처음부터 다시 돌려요(쓰기는 끝까지 모아 두었다가 마지막에 한 번에 저장 → 다시 돌려도 안전).
// 저장: 읽어 온 시트의 버전이 그사이 바뀌었으면(다른 사람이 저장) 다시 읽어 처음부터 → 두 사람 저장이 서로 덮어쓰지 않아요.
// 드라이브(파일)·메일은 구글 쪽 Code.js 'int.drive'·'int.mail' 에 맡겨요.
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

var TZ_MS = 9 * 3600000;
/** 배차·계정 시트는 새 표(joil.disp_* · accounts)가 원본 — 여기서는 '계정'만 읽기 전용으로 보여 줘요 */
var VIRTUAL = { '계정': 1 };
export var DISPATCH_SHEETS = ['배차오더', '배차호차', '상차지', '상차지사진', '하차지주소록', '기사풀', '배차단가표', '배차단가', '센터도착', '도착지특이사항', '인수증', '계정'];
/** 진짜 표로 옮긴 시트(012~, props MOVED_시트): Code.js 가 읽을 때(주간 요약 등) 새 표에서 시트 모양으로 만들어 줘요 · 읽기 전용 */
var MOVED_VIEWS = {
  '공지': { head: ['ID', '제목', '내용', '고정', '작성자ID', '작성자', '작성일시', '수정일시'], q: 'select * from notices order by ord', row: function (r) { return [r.id, r.title, r.body, r.pinned ? 'Y' : '', r.owner_id, r.owner, r.created_at, r.updated_at]; } },
  '문의기록': { head: ['ID', '일시', '거래처', '문의자', '내용', '처리', '상태', '응대자ID', '응대자', '자주묻는질문', '수정일시'], q: 'select * from inquiries order by ord', row: function (r) { return [r.id, "'" + r.at, r.cust, r.who, r.body, r.answer, r.status, r.by_id, r.by_name, r.faq ? 'Y' : '', r.updated_at]; } },
  '업무담당': { head: ['ID', '업무', '거래처', '주담당', '부담당', '메모', '수정자', '수정일시'], q: 'select * from owners order by ord', row: function (r) { return [r.id, r.task, r.cust, r.main, r.sub, r.memo, r.by_name, r.at]; } },
  '업무기록': { head: ['ID', '내용', '상태', '대기순서', '등록시간', '시작시간', '완료시간', '작성자'], q: 'select * from work_items order by r', row: function (r) { return [r.id, "'" + r.text, r.st, Number(r.ord), "'" + r.at, r.start ? "'" + r.start : '', r.done ? "'" + r.done : '', "'" + r.uid]; } },
  '담당변경기록': { flag: '업무담당', head: ['일시', '업무', '내용', '수정자'], q: 'select * from owner_log order by id', row: function (r) { return [r.at, r.task, r.text, r.by_name]; } }
};
var USER_COLS = ['아이디', '이름', '권한', '사용여부', '비밀번호해시', '솔트', '비밀번호변경필요', '생성일', '마지막로그인', '메뉴권한', '배차탭'];

function Need(kind, key, arg) { this.kind = kind; this.key = key; this.arg = arg; }
function p2(n) { return ('0' + n).slice(-2); }
function kst(d) { return new Date(d.getTime() + TZ_MS); }
function formatDate(d, tz, f) {
  if (!(d instanceof Date)) d = new Date(d);
  var k = kst(d), Y = String(k.getUTCFullYear());
  var map = { yyyy: Y, yy: Y.slice(2), MM: p2(k.getUTCMonth() + 1), dd: p2(k.getUTCDate()), HH: p2(k.getUTCHours()), mm: p2(k.getUTCMinutes()), ss: p2(k.getUTCSeconds()), E: ['일', '월', '화', '수', '목', '금', '토'][k.getUTCDay()], u: String(k.getUTCDay() || 7) };
  return String(f).replace(/yyyy|yy|MM|dd|HH|mm|ss|E|u/g, function (t) { return map[t]; });
}
/** 구글 시트가 글자를 저장할 때 하는 자동 변환 흉내: 숫자 글자 → 숫자, 날짜 글자 → 날짜 (앞에 ' 가 있으면 그대로) */
function sheetValue(v) {
  if (typeof v !== 'string' || v === '' || v.charAt(0) === "'") return v;
  var t = v.trim();
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t) && t.length < 16) return Number(t);
  var m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) - TZ_MS);
  return v;
}
function readValue(v) { return v == null ? '' : typeof v === 'string' ? v.replace(/^'/, '') : v; }
function enc(v) { return v instanceof Date ? { $d: v.toISOString() } : v; }
function dec(v) { return v && typeof v === 'object' && v.$d ? new Date(v.$d) : v; }
function display(v) { v = readValue(v); return v instanceof Date ? formatDate(v, '', 'yyyy-MM-dd') : String(v); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

/* ── 바이트·Blob (Apps Script 바이트 = -128~127 숫자 배열) ── */
function toU8(b) { return b instanceof Uint8Array ? b : Uint8Array.from(b || [], function (x) { return x & 255; }); }
function signed(u8) { return Array.from(u8, function (x) { return x > 127 ? x - 256 : x; }); }
function utf8(s) { return new TextEncoder().encode(String(s)); }
function Blob(bytes, type, name) { this.u = typeof bytes === 'string' ? utf8(bytes) : toU8(bytes); this.type = type || ''; this.name = name || ''; }
Blob.prototype = {
  getBytes: function () { return signed(this.u); }, getDataAsString: function () { return new TextDecoder().decode(this.u); },
  setName: function (n) { this.name = String(n); return this; }, getName: function () { return this.name; },
  getContentType: function () { return this.type; }, setContentType: function (t) { this.type = t; return this; }, copyBlob: function () { return new Blob(this.u.slice(), this.type, this.name); }, getBlob: function () { return this; }
};
function b64(u8) { var s = ''; for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(s) { var bin = atob(String(s).replace(/[\r\n\s]/g, '').replace(/-/g, '+').replace(/_/g, '/')), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }

/**
 * opts: { sql, src (Code.js + Calc.js 글자), gasFetch(구글 Code.js 부르기: (action, payload) => Promise), zip(files{name:Uint8Array}) => Uint8Array, fetch }
 * call(req, session) → Code.js handle_ 결과 (+ ok·ms 는 index 에서)
 */
export function makeGas(opts) {
  var sql = opts.sql, warm = {}; // warm[action] = 지난번에 필요했던 시트 이름들 (처음부터 한 번에 받으려고)
  var Q = function (db, text, params) { return db.unsafe(text, params || []); };

  async function loadSheets(db, names, st) {
    names = names.filter(function (n) { return !(n in st.sheets); }); if (!names.length) return;
    var mv = names.filter(function (n) { return MOVED_VIEWS[n]; });
    if (mv.length) {
      var on = {}; (await Q(db, 'select key from props where key = any($1)', [mv.map(function (n) { return 'MOVED_' + (MOVED_VIEWS[n].flag || n); })])).forEach(function (r) { on[r.key] = 1; });
      for (var n0 of mv) { var V = MOVED_VIEWS[n0]; if (!on['MOVED_' + (V.flag || n0)]) continue;
        st.sheets[n0] = { ver: -1, virtual: true, rows: [V.head.slice()].concat((await Q(db, V.q)).map(function (r) { return V.row(r).map(function (x) { return sheetValue(x == null ? '' : x); }); })) }; }
      names = names.filter(function (n) { return !(n in st.sheets); }); if (!names.length) return;
    }
    var meta = {}; (await Q(db, 'select name, ver from sheet_meta where name = any($1)', [names])).forEach(function (r) { meta[r.name] = Number(r.ver); });
    var rows = await Q(db, 'select sheet, r, v from sheet_read($1)', [names.filter(function (n) { return n in meta; })]);
    names.forEach(function (n) { st.sheets[n] = n in meta ? { ver: meta[n], rows: [] } : null; });
    rows.forEach(function (x) { var s = st.sheets[x.sheet]; s.rows[x.r - 1] = (x.v || []).map(dec); });
    names.forEach(function (n) { var s = st.sheets[n]; if (s) for (var i = 0; i < s.rows.length; i++) if (!s.rows[i]) s.rows[i] = []; });
  }
  async function loadAccounts(db, st) {
    var a = await Q(db, 'select * from accounts order by ord');
    st.sheets['계정'] = { ver: -1, virtual: true, rows: [USER_COLS.slice()].concat(a.map(function (u) { return [u.id, u.name, u.role, u.status, u.pw_hash, u.salt, u.must_change, sheetValue(u.created_at), sheetValue(u.last_login), u.perms == null ? '' : u.perms, u.disp_tabs]; })) };
  }
  async function loadProps(db, st) {
    st.props = {}; (await Q(db, 'select key, value from gas_props')).forEach(function (r) { st.props[r.key] = r.value; });
    st.props0 = Object.assign({}, st.props);
    st.propsVer = Number(((await Q(db, "select ver from sheet_meta where name = '__props'"))[0] || {}).ver || 0);
  }

  /* ── 한 번 돌리기: 서비스 흉내를 만들고 Code.js 를 새로 읽어 handle_ 실행 ── */
  function runOnce(st, req, session, fnName) {
    var needs = [], seen = {};
    var need = function (kind, key, arg) { var k = kind + '|' + key; if (!seen[k]) { seen[k] = 1; needs.push(new Need(kind, key, arg)); } throw new Need(kind, key, arg); };
    var work = {}; // 이번 실행에서 쓰는 시트 사본 (저장 전까지 여기서만 바뀜)
    var sheetOf = function (name) {
      if (name in work) return work[name];
      if (!(name in st.sheets)) need('sheet', name);
      var s = st.sheets[name]; if (!s) return work[name] = null;
      return work[name] = new Sheet(name, s.rows.map(function (r) { return r.slice(); }), s);
    };
    function Sheet(name, d, src) { this.n = name; this.d = d; this.src = src; this.dirty = false; this.created = !src; }
    Sheet.prototype = {
      getName: function () { return this.n; }, getSheetName: function () { return this.n; }, getParent: function () { return SS; },
      getLastRow: function () { var n = this.d.length; while (n > 0 && (this.d[n - 1] || []).every(function (v) { return v === '' || v == null; })) n--; return n; },
      getLastColumn: function () { var m = 0; this.d.forEach(function (r) { for (var i = (r || []).length; i > 0; i--) if (r[i - 1] !== '' && r[i - 1] != null) { m = Math.max(m, i); break; } }); return m; },
      getMaxRows: function () { return Math.max(1000, this.d.length); }, getMaxColumns: function () { return Math.max(26, this.getLastColumn()); },
      getDataRange: function () { return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); },
      getRange: function (r, c, nr, nc) { if (typeof r === 'string') throw new Error('A1 표기는 지원 안 함: ' + r); return new Range(this, r, c || 1, nr || 1, nc || 1); },
      appendRow: function (row) { this.touch(); this.d.splice(this.getLastRow(), 0, row.map(sheetValue)); return this; },
      deleteRow: function (i) { this.touch(); this.d.splice(i - 1, 1); }, deleteRows: function (i, n) { this.touch(); this.d.splice(i - 1, n); },
      insertRowBefore: function (i) { this.touch(); this.d.splice(i - 1, 0, []); }, insertRowsAfter: function (i, n) { this.touch(); for (var k = 0; k < n; k++) this.d.splice(i, 0, []); },
      clear: function () { this.touch(); this.d.length = 0; return this; }, clearContents: function () { this.touch(); this.d.length = 0; return this; },
      setFrozenRows: function () {}, setColumnWidth: function () {}, autoResizeColumns: function () {}, hideSheet: function () {}, showSheet: function () {}, setTabColor: function () {},
      createTextFinder: function (s) { return this.getDataRange().createTextFinder(s); },
      touch: function () { if (this.src && this.src.virtual) return; this.dirty = true; }
    };
    function Range(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
    Range.prototype = {
      getRow: function () { return this.r; }, getColumn: function () { return this.c; }, getNumRows: function () { return this.nr; }, getNumColumns: function () { return this.nc; }, getSheet: function () { return this.sh; },
      getValues: function () { var o = []; for (var i = 0; i < this.nr; i++) { var t = this.sh.d[this.r + i - 1] || [], x = []; for (var j = 0; j < this.nc; j++) x.push(readValue(t[this.c + j - 1])); o.push(x); } return o; },
      getDisplayValues: function () { return this.getValues().map(function (r) { return r.map(display); }); },
      getValue: function () { return this.getValues()[0][0]; },
      setValues: function (v) {
        if (v.length !== this.nr) throw new Error('범위의 행 수와 데이터 행 수가 다릅니다. (' + v.length + ' / ' + this.nr + ')');
        this.sh.touch(); var sh = this.sh, r = this.r, c = this.c, nc = this.nc;
        v.forEach(function (row, i) {
          if (row.length !== nc) throw new Error('범위의 열 수와 데이터 열 수가 다릅니다. (' + row.length + ' / ' + nc + ')');
          while (sh.d.length < r + i) sh.d.push([]);
          var t = sh.d[r + i - 1] = sh.d[r + i - 1] || []; while (t.length < c - 1) t.push('');
          for (var j = 0; j < nc; j++) t[c + j - 1] = sheetValue(row[j]);
        });
        return this;
      },
      setValue: function (v) { var a = []; for (var i = 0; i < this.nr; i++) { var row = []; for (var j = 0; j < this.nc; j++) row.push(v); a.push(row); } return this.setValues(a); },
      clearContent: function () { this.sh.touch(); for (var i = 0; i < this.nr; i++) { var t = this.sh.d[this.r + i - 1]; if (t) for (var j = 0; j < this.nc; j++) if (this.c + j - 1 < t.length) t[this.c + j - 1] = ''; } return this; },
      clear: function () { return this.clearContent(); },
      setFontWeight: function () { return this; }, setNumberFormat: function () { return this; }, setNumberFormats: function () { return this; }, setBackground: function () { return this; }, setFontColor: function () { return this; }, setHorizontalAlignment: function () { return this; }, setWrap: function () { return this; }, setNote: function () { return this; },
      createTextFinder: function (s) {
        var rg = this, whole = false, mc = false; s = String(s);
        var hits = function () { var o = []; for (var i = 0; i < rg.nr; i++) { var t = rg.sh.d[rg.r + i - 1] || []; for (var j = 0; j < rg.nc; j++) { var v = display(t[rg.c + j - 1]); if (whole ? (mc ? v === s : v.toLowerCase() === s.toLowerCase()) : (mc ? v.indexOf(s) !== -1 : v.toLowerCase().indexOf(s.toLowerCase()) !== -1)) o.push(new Range(rg.sh, rg.r + i, rg.c + j, 1, 1)); } } return o; };
        var tf = { matchEntireCell: function (b) { whole = b !== false; return tf; }, matchCase: function (b) { mc = b !== false; return tf; }, useRegularExpression: function () { return tf; },
          findNext: function () { return hits()[0] || null; }, findAll: function () { return hits(); } };
        return tf;
      }
    };
    var SS = {
      getSheetByName: function (n) { return sheetOf(String(n)); },
      insertSheet: function (n) { n = String(n); if (sheetOf(n)) throw new Error('이미 있는 시트: ' + n); var s = new Sheet(n, [], null); s.dirty = true; work[n] = s; return s; },
      getSheets: function () { if (!st.allNames) need('names', '*'); return st.allNames.map(sheetOf).filter(Boolean); },
      deleteSheet: function (s) { s.d.length = 0; s.dirty = true; s.deleted = true; },
      getId: function () { return 'supabase'; }, getUrl: function () { return ''; }, getName: function () { return '조일 (Supabase)'; }, toast: function () {}
    };
    var cache = st.cache; // 요청 하나 안에서만 (인스턴스가 여러 개라 오래 두면 다른 곳 수정이 안 보여요)
    var props = st.props;
    var dirtyProps = false;
    var P = { getProperty: function (k) { return k in props ? props[k] : null; }, setProperty: function (k, v) { props[k] = String(v); dirtyProps = true; return P; }, setProperties: function (o, del) { if (del) Object.keys(props).forEach(function (k) { delete props[k]; }); Object.keys(o).forEach(function (k) { props[k] = String(o[k]); }); dirtyProps = true; return P; },
      getProperties: function () { return Object.assign({}, props); }, deleteProperty: function (k) { delete props[k]; dirtyProps = true; return P; }, deleteAllProperties: function () { Object.keys(props).forEach(function (k) { delete props[k]; }); dirtyProps = true; return P; }, getKeys: function () { return Object.keys(props); } };
    var C = { get: function (k) { return k in cache ? cache[k] : null; }, put: function (k, v) { cache[k] = String(v); }, remove: function (k) { delete cache[k]; }, getAll: function (ks) { var o = {}; ks.forEach(function (k) { if (k in cache) o[k] = cache[k]; }); return o; }, putAll: function (o) { Object.keys(o).forEach(function (k) { cache[k] = String(o[k]); }); }, removeAll: function (ks) { ks.forEach(function (k) { delete cache[k]; }); } };
    var lock = { waitLock: function () {}, tryLock: function () { return true; }, releaseLock: function () {}, hasLock: function () { return true; } };
    // 바깥 요청: 같은 요청은 한 번만 실제로 보내고 결과를 다시 써요
    var fetchKey = function (url, o) { o = o || {}; return JSON.stringify([String(url), String(o.method || 'get').toLowerCase(), o.headers || null, o.payload == null ? null : (typeof o.payload === 'string' ? o.payload : JSON.stringify(o.payload)), o.contentType || null]); };
    var Resp = function (x, mute, url) { if (!mute && x.code >= 400) throw new Error('Request failed for ' + String(url).replace(/\?.*$/, '') + ' returned code ' + x.code + '. Truncated server response: ' + String(x.text).slice(0, 200)); return { getResponseCode: function () { return x.code; }, getContentText: function () { return x.text; }, getHeaders: function () { return x.headers || {}; }, getAllHeaders: function () { return x.headers || {}; }, getBlob: function () { return new Blob(unb64(x.b64 || ''), (x.headers || {})['content-type'] || ''); }, getContent: function () { return signed(unb64(x.b64 || '')); } }; };
    var fetchOne = function (url, o) { var k = fetchKey(url, o); if (!(k in st.fetched)) need('fetch', k, { url: String(url), o: o || {} }); return Resp(st.fetched[k], o && o.muteHttpExceptions, url); };
    var gasOp = function (op, arg) { var k = JSON.stringify([op, arg]); if (!(k in st.gas)) need('gas', k, { op: op, arg: arg }); var r = st.gas[k]; if (r && r.error) throw new Error(r.error); return r; };
    var File = function (id, meta) { this.id = id; this.m = meta || null; };
    File.prototype = {
      getId: function () { return this.id; }, meta: function () { return this.m || (this.m = gasOp('meta', { id: this.id })); },
      getName: function () { return this.meta().name; }, getSize: function () { return this.meta().size; }, getMimeType: function () { return this.meta().mime; }, getUrl: function () { return this.meta().url; },
      getBlob: function () { var r = gasOp('get', { id: this.id }); return new Blob(unb64(r.data), r.mime, r.name); },
      setTrashed: function (b) { gasOp('trash', { id: this.id, on: b !== false }); return this; }, setName: function (n) { gasOp('rename', { id: this.id, name: String(n) }); return this; }
    };
    var Folder = function (id) { this.id = id; };
    Folder.prototype = {
      getId: function () { return this.id; }, getName: function () { return gasOp('fmeta', { id: this.id }).name; },
      createFile: function (blob) { var r = gasOp('create', { folder: this.id, name: blob.name, mime: blob.type, data: b64(blob.u) }); return new File(r.id, r); },
      createFolder: function (n) { return new Folder(gasOp('mkdir', { parent: this.id, name: String(n) }).id); }
    };
    var Drive = { getFolderById: function (id) { gasOp('fmeta', { id: String(id) }); return new Folder(String(id)); }, getFileById: function (id) { return new File(String(id)); }, createFolder: function (n) { return new Folder(gasOp('mkdir', { parent: '', name: String(n) }).id); }, getRootFolder: function () { return new Folder(''); } };
    var Utilities = {
      DigestAlgorithm: { MD5: 'md5', SHA_1: 'sha1', SHA_256: 'sha256', SHA_512: 'sha512' }, Charset: { UTF_8: 'utf8', US_ASCII: 'ascii' }, MacAlgorithm: { HMAC_SHA_256: 'sha256' },
      computeDigest: function (alg, v) { return signed(createHash(alg).update(typeof v === 'string' ? utf8(v) : toU8(v)).digest()); },
      getUuid: function () { return crypto.randomUUID(); }, formatDate: formatDate, sleep: function () {},
      base64Encode: function (v) { return b64(typeof v === 'string' ? utf8(v) : toU8(v)); }, base64EncodeWebSafe: function (v) { return Utilities.base64Encode(v).replace(/\+/g, '-').replace(/\//g, '_'); },
      base64Decode: function (s) { return signed(unb64(s)); }, base64DecodeWebSafe: function (s) { return signed(unb64(s)); },
      newBlob: function (data, type, name) { return new Blob(data, type, name); },
      gzip: function (blob, name) { return new Blob(gzipSync(blob.u), 'application/x-gzip', name || (blob.name ? blob.name + '.gz' : 'archive.gz')); },
      ungzip: function (blob) { return new Blob(gunzipSync(blob.u), '', ''); },
      zip: function (blobs, name) { var files = {}; blobs.forEach(function (b, i) { var n = b.name || 'file' + i; while (files[n]) n = '_' + n; files[n] = b.u; }); return new Blob(opts.zip(files), 'application/zip', name || 'archive.zip'); }
    };
    var Mail = { sendEmail: function (o) { if (typeof o !== 'object') o = { to: arguments[0], subject: arguments[1], body: arguments[2] }; gasOp('mail', o); }, getRemainingDailyQuota: function () { return 100; } };
    var notAvail = function (n) { return function () { throw new Error(n + ' 는 Supabase 서버에서 쓸 수 없어요.'); }; };
    var G = {
      SpreadsheetApp: { getActive: function () { return SS; }, getActiveSpreadsheet: function () { return SS; }, openById: notAvail('SpreadsheetApp.openById'), create: notAvail('SpreadsheetApp.create'), flush: function () {}, getUi: notAvail('getUi') },
      PropertiesService: { getScriptProperties: function () { return P; }, getUserProperties: function () { return P; }, getDocumentProperties: function () { return P; } },
      CacheService: { getScriptCache: function () { return C; }, getUserCache: function () { return C; }, getDocumentCache: function () { return C; } },
      LockService: { getScriptLock: function () { return lock; }, getUserLock: function () { return lock; }, getDocumentLock: function () { return lock; } },
      UrlFetchApp: { fetch: fetchOne, fetchAll: function (list) { var ks = list.map(function (x) { return typeof x === 'string' ? { url: x } : x; }); var miss = ks.filter(function (x) { return !(fetchKey(x.url, x) in st.fetched); }); miss.forEach(function (x) { var k = fetchKey(x.url, x); if (!seen['fetch|' + k]) { seen['fetch|' + k] = 1; needs.push(new Need('fetch', k, { url: x.url, o: x })); } }); if (miss.length) throw new Need('fetch', 'batch'); return ks.map(function (x) { return Resp(st.fetched[fetchKey(x.url, x)], x.muteHttpExceptions, x.url); }); } },
      Utilities: Utilities, DriveApp: Drive, MailApp: Mail, GmailApp: Mail,
      CalendarApp: { getCalendarById: notAvail('CalendarApp'), subscribeToCalendar: notAvail('CalendarApp') },
      ScriptApp: { getService: function () { return { getUrl: function () { return props.GAS_URL_SELF || ''; } }; }, getProjectTriggers: function () { return []; }, newTrigger: notAvail('ScriptApp.newTrigger'), deleteTrigger: function () {} },
      ContentService: { MimeType: { JSON: 1, TEXT: 2 }, createTextOutput: function (s) { return { s: s, setMimeType: function () { return this; } }; } },
      Session: { getScriptTimeZone: function () { return 'Asia/Seoul'; }, getActiveUser: function () { return { getEmail: function () { return ''; } }; }, getEffectiveUser: function () { return { getEmail: function () { return ''; } }; } },
      Logger: { log: function () {} }, console: { log: function () { try { console.log.apply(console, arguments); } catch (e) {} }, error: function () { try { console.error.apply(console, arguments); } catch (e) {} }, warn: function () {}, info: function () {} }
    };
    var names = Object.keys(G);
    var factory = new Function(names.join(','), opts.src + '\n;return function (fn, a) { return eval(fn).apply(null, a); };');
    var callFn = factory.apply(null, names.map(function (n) { return G[n]; }));
    // 로그인은 Supabase 세션(core.js)이 이미 확인함 → Code.js 의 requireSession_ 대신 그 결과를 써요
    callFn('(function(s){ requireSession_ = function () { return JSON.parse(JSON.stringify(s)); }; sbAllOn_ = function () { return false; }; sbWho_ = function () { return null; }; })', [session || null]); // 여기서는 늘 직접 실행 (구글로 다시 넘기지 않게)
    var out, err = null;
    try { out = fnName ? callFn(fnName, req || []) : callFn('handle_', [req]); }
    catch (e) { if (e instanceof Need) err = null; else err = e; }
    return { needs: needs, out: out, err: err, work: work, props: dirtyProps ? props : null };
  }

  async function resolve(st, needs) {
    var sheets = [], jobs = [];
    needs.forEach(function (n) {
      if (n.kind === 'sheet') sheets.push(n.key);
      else if (n.kind === 'names') jobs.push(Q(sql, 'select name from sheet_meta where name <> $1 order by name', ['__props']).then(function (r) { st.allNames = r.map(function (x) { return x.name; }).filter(function (x) { return DISPATCH_SHEETS.indexOf(x) === -1 || x === '계정'; }); }));
      else if (n.kind === 'fetch') jobs.push(doFetch(n.arg).then(function (x) { st.fetched[n.key] = x; }, function (e) { st.fetched[n.key] = { code: 599, text: String(e && e.message || e) }; }));
      else if (n.kind === 'gas') jobs.push(opts.gasFetch('int.drive', n.arg).then(function (x) { st.gas[n.key] = x.result; }, function (e) { st.gas[n.key] = { error: String(e && e.message || e) }; }));
    });
    if (sheets.indexOf('계정') !== -1 && !('계정' in st.sheets)) { await loadAccounts(sql, st); sheets = sheets.filter(function (x) { return x !== '계정'; }); }
    if (sheets.length) await loadSheets(sql, sheets, st);
    await Promise.all(jobs);
  }
  async function doFetch(a) {
    var o = a.o || {}, h = Object.assign({}, o.headers || {}), body;
    if (o.payload != null) { if (typeof o.payload === 'string') body = o.payload; else if (o.contentType && /json/.test(o.contentType)) body = JSON.stringify(o.payload); else { body = new URLSearchParams(o.payload).toString(); h['Content-Type'] = h['Content-Type'] || 'application/x-www-form-urlencoded'; } if (o.contentType) h['Content-Type'] = o.contentType; }
    var r = await (opts.fetch || fetch)(a.url, { method: String(o.method || (body != null ? 'post' : 'get')).toUpperCase(), headers: h, body: body, redirect: o.followRedirects === false ? 'manual' : 'follow' });
    var u8 = new Uint8Array(await r.arrayBuffer()), hd = {}; r.headers.forEach(function (v, k) { hd[k] = v; });
    return { code: r.status, text: new TextDecoder().decode(u8), b64: u8.length < 4 * 1024 * 1024 ? b64(u8) : '', headers: hd };
  }

  /** 바뀐 시트·속성 저장 (읽은 뒤 다른 사람이 바꿨으면 false → 처음부터 다시) */
  async function commit(st, res) {
    var dirty = Object.keys(res.work).filter(function (n) { var s = res.work[n]; return s && s.dirty && !(s.src && s.src.virtual); });
    if (!dirty.length && !res.props) return true;
    return sql.begin(async function (tx) {
      var names = dirty.concat(res.props ? ['__props'] : []);
      await Q(tx, "insert into sheet_meta (name, ver) select unnest($1::text[]), 0 on conflict (name) do nothing", [names]);
      var cur = {}; (await Q(tx, 'select name, ver from sheet_meta where name = any($1) order by name for update', [names])).forEach(function (r) { cur[r.name] = Number(r.ver); });
      for (var n of dirty) { var s0 = st.sheets[n]; if ((s0 ? s0.ver : 0) !== cur[n]) { delete st.sheets[n]; return false; } }
      if (res.props && st.propsVer !== cur.__props) { await loadProps(tx, st); return false; }
      for (var n2 of dirty) {
        var s = res.work[n2], old = (st.sheets[n2] || { rows: [] }).rows, rows = s.d;
        var last = s.getLastRow(); rows = rows.slice(0, last).map(function (r) { var t = (r || []).slice(); while (t.length && (t[t.length - 1] === '' || t[t.length - 1] == null)) t.pop(); return t; });
        var o2 = old.map(function (r) { var t = (r || []).slice(); while (t.length && (t[t.length - 1] === '' || t[t.length - 1] == null)) t.pop(); return t; });
        var ch = [], i;
        for (i = 0; i < rows.length; i++) if (i >= o2.length || !same(rows[i], o2[i])) ch.push(i);
        if (o2.length > rows.length) await Q(tx, 'select sheet_cut($1, $2)', [n2, rows.length]);
        for (var k = 0; k < ch.length; k += 500) {
          var part = ch.slice(k, k + 500);
          await Q(tx, 'select sheet_write($1, $2::text::jsonb)', [n2, JSON.stringify(part.map(function (j) { return { r: j + 1, v: rows[j].map(enc) }; }))]);
        }
        await Q(tx, 'update sheet_meta set ver = ver + 1 where name = $1', [n2]);
      }
      if (res.props) {
        var p = res.props, p0 = st.props0, del = Object.keys(p0).filter(function (k) { return !(k in p); }), up = Object.keys(p).filter(function (k) { return p0[k] !== p[k]; });
        if (del.length) await Q(tx, 'delete from gas_props where key = any($1)', [del]);
        for (var j2 = 0; j2 < up.length; j2 += 500) await Q(tx, 'insert into gas_props (key, value) select x.k, x.v from json_to_recordset($1::text::json) as x(k text, v text) on conflict (key) do update set value = excluded.value', [JSON.stringify(up.slice(j2, j2 + 500).map(function (k) { return { k: k, v: p[k] }; }))]);
        await Q(tx, "update sheet_meta set ver = ver + 1 where name = '__props'");
      }
      return true;
    });
  }

  /** req: Code.js 요청 · session: core.js 가 확인한 로그인 (없으면 null) · fnName: 요청 대신 Code.js 함수 하나 실행(예약 작업) */
  async function call(req, session, fnName, args) {
    var st = { sheets: {}, fetched: {}, gas: {}, cache: {}, allNames: null }, key = fnName || String(req && req.action || '');
    await loadProps(sql, st);
    var pre = (warm[key] || []).filter(function (n) { return n !== '계정'; }); if (pre.length) await loadSheets(sql, pre, st);
    if ((warm[key] || []).indexOf('계정') !== -1) await loadAccounts(sql, st);
    for (var round = 0; round < 40; round++) {
      st.cache = {}; st.props = Object.assign({}, st.props0); // 매번 DB 에서 읽은 그대로부터 (앞 실행에서 바꾼 값은 버림)
      var res = runOnce(st, fnName ? args : req, session, fnName);
      if (res.needs.length) { await resolve(st, res.needs); continue; }
      warm[key] = Object.keys(st.sheets).filter(function (n) { return st.sheets[n]; });
      if (res.err) throw res.err;
      if (await commit(st, res)) return res.out;
    }
    throw new Error('서버가 바빠서 처리하지 못했어요. 잠시 후 다시 해 주세요.');
  }
  return { call: call };
}

/** 새 서버(port.js)도 Code.js 와 같은 값으로 읽고 쓰게 같이 써요 */
export { sheetValue, readValue, enc, dec, display, formatDate };
