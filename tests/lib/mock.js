// Apps Script 목(mock): SpreadsheetApp·LockService·PropertiesService 등을 흉내 내서 apps-script/Code.js를 node에서 돌려요.
// 시트에 쓸 때 줄 너비가 다르면 오류(실제 Sheets와 같게) · 가짜 데이터만 써요.
var fs = require('fs'), vm = require('vm');
var SRC = process.env.CODE_JS || require('path').join(__dirname, '..', '..', 'apps-script', 'Code.js');
var errors = [];
function Sheet(name) { this.name = name; this.d = []; }
Sheet.prototype = {
  getLastRow: function () { var n = this.d.length; while (n > 0 && this.d[n - 1].every(function (v) { return v === '' || v == null; })) n--; return n; },
  getLastColumn: function () { var m = 0; this.d.forEach(function (r) { for (var i = r.length; i > 0; i--) if (r[i - 1] !== '' && r[i - 1] != null) { m = Math.max(m, i); break; } }); return m; },
  getRange: function (r, c, nr, nc) {
    var sh = this; nr = nr || 1; nc = nc || 1;
    var R = {
      setValues: function (v) {
        if (v.length !== nr) throw new Error('row count ' + v.length + '!=' + nr + ' in ' + sh.name);
        v.forEach(function (row, i) {
          if (row.length !== nc) { var m = 'WIDTH MISMATCH ' + sh.name + ' got ' + row.length + ' expect ' + nc; errors.push(m); throw new Error(m); }
          while (sh.d.length < r + i) sh.d.push([]);
          var t = sh.d[r + i - 1]; for (var j = 0; j < nc; j++) t[c + j - 1] = row[j];
        });
        return R;
      },
      setValue: function (v) { return R.setValues([[v]]); },
      getValues: function () { var o = []; for (var i = 0; i < nr; i++) { var t = sh.d[r + i - 1] || [], x = []; for (var j = 0; j < nc; j++) { var v = t[c + j - 1]; x.push(v == null ? '' : (typeof v === 'string' ? v.replace(/^'/, '') : v)); } o.push(x); } return o; },
      clearContent: function () { for (var i = 0; i < nr; i++) { var t = sh.d[r + i - 1]; if (t) for (var j = 0; j < nc; j++) t[c + j - 1] = ''; } return R; },
      setFontWeight: function () { return R; }, setNumberFormat: function () { return R; },
      createTextFinder: function (s) { return { matchEntireCell: function () { return this; }, findNext: function () { for (var i = 0; i < nr; i++) { var t = sh.d[r + i - 1] || []; if (String(t[c - 1]).replace(/^'/, '') === s) return { getRow: function () { return r + i; } }; } return null; } }; }
    };
    return R;
  },
  appendRow: function (row) { var hw = (this.d[0] || []).filter(function (v) { return v !== ''; }).length; if (row.length !== hw) { var m = 'APPEND WIDTH ' + this.name + ' got ' + row.length + ' header ' + hw; errors.push(m); throw new Error(m); } this.d.splice(this.getLastRow(), 0, row.slice()); },
  deleteRow: function (i) { this.d.splice(i - 1, 1); }, deleteRows: function (i, n) { this.d.splice(i - 1, n); }, setFrozenRows: function () {}, getName: function () { return this.name; }
};
var sheets = {};
var SS = { getSheetByName: function (n) { return sheets[n] || null; }, insertSheet: function (n) { return sheets[n] = new Sheet(n); }, getSheets: function () { return Object.values(sheets); } };
var props = {}, cache = {};
var p2 = function (n) { return ('0' + n).slice(-2); };
var ctx = { console: console, JSON: JSON, Math: Math, Date: Date,
  SpreadsheetApp: { flush: function () {}, getActive: function () { return SS; }, getActiveSpreadsheet: function () { return SS; }, openById: function () { return SS; } },
  LockService: { getScriptLock: function () { return { waitLock: function () {}, tryLock: function () { return true; }, releaseLock: function () {}, hasLock: function () { return true; } }; } },
  PropertiesService: { getScriptProperties: function () { return { getProperty: function (k) { return k in props ? props[k] : null; }, setProperty: function (k, v) { props[k] = String(v); }, getProperties: function () { return Object.assign({}, props); }, deleteProperty: function (k) { delete props[k]; } }; } },
  CacheService: { getScriptCache: function () { return { get: function (k) { return cache[k] || null; }, put: function (k, v) { cache[k] = v; }, remove: function (k) { delete cache[k]; }, putAll: function () {}, getAll: function () { return {}; }, removeAll: function () {} }; } },
  Utilities: { DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 },
    computeDigest: function (alg, str) { return Array.from(require('crypto').createHash('sha256').update(String(str)).digest()).map(function (b) { return b > 127 ? b - 256 : b; }); },
    formatDate: function (d, tz, f) { return f.replace('yyyy', d.getFullYear()).replace('MM', p2(d.getMonth() + 1)).replace('dd', p2(d.getDate())).replace('HH', p2(d.getHours())).replace('mm', p2(d.getMinutes())).replace('ss', p2(d.getSeconds())); },
    getUuid: function () { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function () { return (Math.random() * 16 | 0).toString(16); }); } },
  ContentService: { MimeType: { JSON: 1 }, createTextOutput: function (s) { return { s: s, setMimeType: function () { return this; } }; } },
  Session: { getScriptTimeZone: function () { return 'Asia/Seoul'; } } };
vm.createContext(ctx); vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx);
var SESS = { adm: { id: 'a', name: '관리', role: 'admin', perms: ['quote', 'analysis'] }, stf: { id: 's', name: '직원', role: 'staff', perms: ['quote'] }, ptn: { id: 'p', name: '협력A', role: 'partner', perms: [], dispTabs: ['쿠팡부자재/평택'] } };
ctx.__realRequireSession = ctx.requireSession_;
ctx.requireSession_ = function (t) { var s = SESS[t]; if (!s) throw new Error('no sess'); return JSON.parse(JSON.stringify(s)); };
ctx.placePhotos_ = function () { return []; };
function call(tok, action, req) { req = Object.assign({ action: action, token: tok }, req || {}); return JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(req) } }).s); }
var fails = 0;
function ok(name, cond, info) { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined && !cond ? ' :: ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); }
process.on('exit', function () { if (errors.length) { console.log('FAIL 시트 줄 너비 오류 :: ' + errors.join(' / ')); fails++; } if (fails) process.exitCode = 1; });
module.exports = { call: call, sheets: sheets, props: props, cache: cache, errors: errors, ctx: ctx, Sheet: Sheet, ok: ok };
