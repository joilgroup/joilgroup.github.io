// 새 서버로 옮긴 Code.js 영역 (거래처·매뉴얼·일정·견적·분석 …) — Code.js 의 같은 이름 함수(끝 _ 뺌)를 시트 표(014 joil.gs_…)에 바로 읽고 쓰게 옮긴 것.
// 같은 표를 Code.js(gas.js)도 같이 쓰니까 값은 Code.js 와 똑같이(앞 ' · 날짜 글자 → 날짜) 쓰고, 쓸 때마다 시트 버전을 올려요(joil.sheet_touch).
// 요청 → 응답은 Code.js 와 같게: tests/server/sb-port.test.js 가 목(Code.js)과 같은 요청을 보내 비교해요.
// 꺼짐 스위치: props 'PORT_OFF' = 'custs,manual' 처럼 액션 앞부분을 쉼표로 → 그 영역은 다시 gas.js(Code.js 그대로)가 맡아요(index.ts).
import { sheetValue, readValue, enc, dec, display, formatDate } from './gas.js';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { Buffer } from 'node:buffer'; // Deno(Supabase 함수)에는 Buffer 가 기본으로 없어요

/** 이 파일이 맡는 액션 목록 (core.js ACTIONS 에 더해요) */
export function portActions() { return makePort({}).ACTIONS; }

export function makePort(o) {
  var sql = o.sql, err = o.err, nowTxt = o.nowTxt, newId = o.newId;
  var Q = function (db, t, p) { return db.unsafe(t, p || []); };

  /* ───────────── 도구 (Code.js fmt_·textDate_·parseJson_·checkDate_ 와 같게) ───────────── */
  function fmtV(v) { return v instanceof Date ? formatDate(v, '', 'yyyy-MM-dd HH:mm') : String(v || ''); }
  function textDate(v) { return v instanceof Date ? formatDate(v, '', 'yyyy-MM-dd') : String(v || '').replace(/^'/, ''); }
  function parseJson(v, d) { try { return v ? JSON.parse(String(v)) : d; } catch (e) { return d; } }
  function checkDate(v, label) { v = String(v || '').trim().replace(/^'/, ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw err((label || '날짜') + '를 YYYY-MM-DD 형식으로 넣으세요.'); return v; }

  /* ───────────── 시트 표 읽기·쓰기 ───────────── */
  /** 시트 전체 (1번 = 제목 줄) · 값은 저장된 그대로(앞 ' 포함) */
  async function readAll(name, db) {
    var out = []; (await Q(db || sql, 'select r, v from sheet_read($1) order by r', [[name]])).forEach(function (x) { out[x.r - 1] = (x.v || []).map(dec); });
    for (var i = 0; i < out.length; i++) if (!out[i]) out[i] = [];
    return out;
  }
  /** Code.js rowsOf_: 2번 줄부터 · 제목 칸 수만큼 · 첫 칸이 빈 줄은 빼고 · 읽을 때 앞 ' 는 뗌 (줄 번호는 ._r) */
  async function rowsOf(name, header, db) {
    var all = await readAll(name, db), out = [];
    for (var i = 1; i < all.length; i++) { var r = header.map(function (h, j) { return readValue(all[i][j] == null ? '' : all[i][j]); }); r._r = i + 1; if (r[0] !== '') out.push(r); }
    return out;
  }
  /** Code.js findRow_: 첫 칸이 id 인 줄 → { row, raw } */
  async function findRow(name, header, id, db) {
    if (!id) return null;
    var hit = (await rowsOf(name, header, db)).filter(function (r) { return display(r[0]) === String(id); })[0];
    return hit ? { row: hit._r, raw: hit } : null;
  }
  async function putRow(db, name, r, vals) { await Q(db, 'select sheet_write($1, $2::text::jsonb)', [name, JSON.stringify([{ r: r, v: vals.map(enc) }])]); }
  /** 쓰기 묶음: 시트를 잠그고(Code.js 저장과 차례) fn(W) 안에서 append·set·del → 끝나면 버전 올림 */
  async function edit(names, fn) {
    return sql.begin(async function (tx) {
      if (o.who && o.who()) await Q(tx, "select set_config('joil.who', $1, true)", [o.who()]);
      await Q(tx, 'insert into sheet_meta (name, ver) select unnest($1::text[]), 0 on conflict (name) do nothing', [names]);
      await Q(tx, 'select name from sheet_meta where name = any($1) order by name for update', [names]);
      var W = {
        tx: tx,
        /** appendRow (시트가 없으면 제목 줄부터) → 새 줄 번호 */
        append: async function (name, header, row) {
          var n = Number((await Q(tx, 'select sheet_maxr($1) n', [name]))[0].n) || 0;
          if (n < 1) { await putRow(tx, name, 1, header.map(sheetValue)); n = 1; }
          await putRow(tx, name, n + 1, row.map(sheetValue)); return n + 1;
        },
        /** getRange(r, c, 1, n).setValues([vals]) */
        set: async function (name, r, c, vals) {
          var cur = ((await Q(tx, 'select sheet_getrow($1, $2) v', [name, r]))[0].v || []).map(dec);
          while (cur.length < c - 1) cur.push('');
          vals.forEach(function (v, j) { cur[c - 1 + j] = sheetValue(v); });
          await putRow(tx, name, r, cur);
        },
        /** getRange(r, 1, rows.length, n).setValues(rows) — 여러 줄 한 번에 */
        putRows: async function (name, r, rows) { await Q(tx, 'select sheet_write($1, $2::text::jsonb)', [name, JSON.stringify(rows.map(function (v, i) { return { r: r + i, v: v.map(sheetValue).map(enc) }; }))]); },
        lastRow: async function (name) { return Number((await Q(tx, 'select sheet_maxr($1) n', [name]))[0].n) || 0; },
        /** getRange(r, 1, n, nc).clearContent() — 줄은 남기고 값만 비움 */
        clearRows: async function (name, r, n, nc) { var rows = []; for (var i = 0; i < n; i++) { var cur = ((await Q(tx, 'select sheet_getrow($1, $2) v', [name, r + i]))[0].v || []).map(dec); for (var j = 0; j < nc; j++) cur[j] = ''; rows.push(cur); } if (rows.length) await Q(tx, 'select sheet_write($1, $2::text::jsonb)', [name, JSON.stringify(rows.map(function (v, i) { return { r: r + i, v: v.map(enc) }; }))]); },
        /** deleteRow(r) */
        del: async function (name, r) { await Q(tx, 'select sheet_delrow($1, $2)', [name, r]); },
        rowsOf: function (name, header) { return rowsOf(name, header, tx); },
        findRow: function (name, header, id) { return findRow(name, header, id, tx); }
      };
      var out = await fn(W);
      await Q(tx, 'select sheet_touch($1)', [names]);
      return out;
    });
  }

  /* ── 스크립트 속성(joil.gas_props · Code.js PropertiesService 와 같은 곳) ── */
  async function propGet(k, db) { var r = (await Q(db || sql, 'select value from gas_props where key = $1', [k]))[0]; return r ? r.value : null; }
  async function propSet(db, k, v) { await Q(db, 'insert into gas_props (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value', [k, String(v)]); await Q(db, "select sheet_touch(array['__props'])"); }
  /* ── 캐시 (016 joil.kv_cache · Code.js CacheService 대신, 초 단위) ── */
  async function cacheGet(k) { var r = (await Q(sql, 'select value from kv_cache where key = $1 and expires_at > now()', [k]))[0]; return r ? r.value : null; }
  async function cachePut(k, v, sec) { await Q(sql, "insert into kv_cache (key, value, expires_at) values ($1, $2, now() + $3::int * interval '1 second') on conflict (key) do update set value = excluded.value, expires_at = excluded.expires_at", [k, String(v), sec]); }
  async function cacheDel(k) { await Q(sql, 'delete from kv_cache where key = $1', [k]); }
  var netFetch = o.fetch || (typeof fetch !== 'undefined' ? fetch : null);
  function ymdNow(d) { return formatDate(d || new Date(), '', 'yyyy-MM-dd'); }
  /* ── 구글 드라이브 (Code.js int.drive 에 맡김 — gas.js 와 같은 일) ── */
  async function drive(op, arg) { return (await o.gas('int.drive', { op: op, arg: arg })).result; }
  async function docsFolder(db) {
    var id = await propGet('DOCS_FOLDER', db);
    if (id) { try { await drive('fmeta', { id: String(id) }); return String(id); } catch (e) { /* 지워졌으면 새로 */ } }
    var nid = (await drive('mkdir', { parent: '', name: '조일그룹 서류함' })).id; await propSet(db || sql, 'DOCS_FOLDER', nid); return nid;
  }
  function b64len(s) { s = String(s || '').replace(/[\r\n\s]/g, ''); return Math.floor(s.length * 3 / 4) - (/==$/.test(s) ? 2 : /=$/.test(s) ? 1 : 0); }
  var DOC_MAX_BYTES = 20 * 1024 * 1024;

  /* ───────────── 거래처 카드 (Code.js custsList_ · custSave_ · custDelete_) ───────────── */
  var SHEET_CUSTS = '거래처';
  var CUST_HEADER = ['ID', '이름', '별칭', '사업자', '담당직원', '담당자', '연락처', '이메일', '계약시작', '계약만료', '결제조건', '메모', '수정자', '수정일시'];
  var BIZ_LIST = ['조일물류', '명일로지스', '조일로지스'];
  async function custsList() {
    return { custs: (await rowsOf(SHEET_CUSTS, CUST_HEADER)).map(function (r) {
      return { id: String(r[0]), name: String(r[1]), aliases: String(r[2] || '').split(/\s*,\s*/).filter(Boolean), biz: String(r[3] || ''), owner: String(r[4] || ''), contact: String(r[5] || ''), phone: String(r[6] || ''), email: String(r[7] || ''),
        start: textDate(r[8]), end: textDate(r[9]), payment: String(r[10] || ''), memo: String(r[11] || ''), by: String(r[12] || ''), at: fmtV(r[13]) };
    }).sort(function (a, b) { return a.name.localeCompare(b.name); }) };
  }
  async function custSave(session, req) {
    var c = req.cust || {}, name = String(c.name || '').trim().slice(0, 100); if (!name) throw err('거래처 이름을 넣으세요.');
    var d = function (v, label) { v = String(v || '').trim(); return v ? checkDate(v, label) : ''; };
    var start = d(c.start, '계약 시작일'), end = d(c.end, '계약 만료일');
    if (start && end && end < start) throw err('계약 만료일이 시작일보다 빠릅니다.');
    var aliases = (Array.isArray(c.aliases) ? c.aliases : String(c.aliases || '').split(',')).map(function (x) { return String(x).trim(); }).filter(Boolean).join(', ').slice(0, 500);
    var dup = (await custsList()).custs.filter(function (x) { return x.id !== req.id && x.name === name; })[0]; if (dup) throw err('같은 이름의 거래처가 이미 있어요.');
    var row = [name, aliases, BIZ_LIST.indexOf(c.biz) !== -1 ? c.biz : '', String(c.owner || '').slice(0, 30), String(c.contact || '').slice(0, 60), String(c.phone || '').slice(0, 60), String(c.email || '').slice(0, 100),
      start ? "'" + start : '', end ? "'" + end : '', String(c.payment || '').slice(0, 200), String(c.memo || '').slice(0, 3000), session.name, nowTxt()];
    var id = req.id;
    await edit([SHEET_CUSTS], async function (W) {
      if (id) { var f = await W.findRow(SHEET_CUSTS, CUST_HEADER, id); if (!f) throw err('거래처를 찾을 수 없습니다.'); await W.set(SHEET_CUSTS, f.row, 2, row); }
      else { id = newId('K'); await W.append(SHEET_CUSTS, CUST_HEADER, [id].concat(row)); }
    });
    var out = await custsList(); out.id = id; return out;
  }
  async function custDelete(id) {
    await edit([SHEET_CUSTS], async function (W) { var f = await W.findRow(SHEET_CUSTS, CUST_HEADER, id); if (!f) throw err('거래처를 찾을 수 없습니다.'); await W.del(SHEET_CUSTS, f.row); });
    return custsList();
  }

  /* ───────────── 업무 매뉴얼 (Code.js manualList_ … manualFileDelete_) ───────────── */
  var SHEET_MANUAL = '매뉴얼';
  var MANUAL_HEADER = ['ID', '거래처', '제목', '분류', '처리순서', '연락처', '문제와대처', '주의사항', '메모', '첨부', '작성자', '작성일시', '수정자', '수정일시', '이력'];
  var MANUAL_FIELDS = ['steps', 'contacts', 'issues', 'cautions', 'memo'];
  function manualRow(r) {
    return { id: String(r[0]), cust: String(r[1] || ''), title: String(r[2]), cat: String(r[3] || ''), steps: String(r[4] || ''), contacts: String(r[5] || ''), issues: String(r[6] || ''), cautions: String(r[7] || ''), memo: String(r[8] || ''),
      files: parseJson(r[9], []), by: String(r[10] || ''), at: fmtV(r[11]), updBy: String(r[12] || ''), updAt: fmtV(r[13]), log: parseJson(r[14], []) };
  }
  async function manualList() { return { manuals: (await rowsOf(SHEET_MANUAL, MANUAL_HEADER)).map(manualRow).sort(function (a, b) { return (a.cust ? 0 : 1) - (b.cust ? 0 : 1) || a.cust.localeCompare(b.cust) || a.title.localeCompare(b.title); }) }; }
  async function manualSave(session, req) {
    var m = req.manual || {}, title = String(m.title || '').trim().slice(0, 100); if (!title) throw err('매뉴얼 제목을 넣으세요.');
    var vals = MANUAL_FIELDS.map(function (k) { var v = String(m[k] || ''); if (v.length > 40000) throw err('내용이 너무 길어요 (칸마다 4만 자까지).'); return v; });
    var head = [String(m.cust || '').trim().slice(0, 100), title, String(m.cat || '').trim().slice(0, 30)].concat(vals);
    var id = req.id, now = nowTxt();
    await edit([SHEET_MANUAL], async function (W) {
      if (id) {
        var f = await W.findRow(SHEET_MANUAL, MANUAL_HEADER, id); if (!f) throw err('매뉴얼을 찾을 수 없습니다.');
        var old = manualRow(f.raw), changed = [];
        [['title', '제목'], ['cust', '업체'], ['cat', '분류'], ['steps', '처리 순서'], ['contacts', '연락처'], ['issues', '문제와 대처'], ['cautions', '주의사항'], ['memo', '메모']].forEach(function (x) {
          var nv = x[0] === 'title' ? title : x[0] === 'cust' ? head[0] : x[0] === 'cat' ? head[2] : vals[MANUAL_FIELDS.indexOf(x[0])];
          if (String(old[x[0]]) !== nv) changed.push(x[1]);
        });
        var log = old.log; if (changed.length) log.push({ at: now, by: session.name, what: changed.join(', ') + ' 수정' }); if (log.length > 60) log = log.slice(-60);
        await W.set(SHEET_MANUAL, f.row, 2, head);
        await W.set(SHEET_MANUAL, f.row, 13, [session.name, now, JSON.stringify(log)]);
      } else {
        id = newId('M');
        await W.append(SHEET_MANUAL, MANUAL_HEADER, [id].concat(head).concat(['[]', session.name, now, session.name, now, JSON.stringify([{ at: now, by: session.name, what: '작성' }])]));
      }
    });
    var out = await manualList(); out.id = id; return out;
  }
  async function manualDelete(session, id) {
    var files = [];
    await edit([SHEET_MANUAL], async function (W) { var f = await W.findRow(SHEET_MANUAL, MANUAL_HEADER, id); if (!f) throw err('매뉴얼을 찾을 수 없습니다.'); files = parseJson(f.raw[9], []); await W.del(SHEET_MANUAL, f.row); });
    for (var x of files) { try { await drive('trash', { id: x.id, on: true }); } catch (e) { /* 무시 */ } }
    return manualList();
  }
  async function manualUpload(session, req) {
    var data = String(req.data || ''), size = b64len(data); if (!size) throw err('파일이 비어 있습니다.');
    if (size > DOC_MAX_BYTES) throw err('파일은 20MB까지 올릴 수 있습니다.');
    if (!(await findRow(SHEET_MANUAL, MANUAL_HEADER, req.id))) throw err('매뉴얼을 찾을 수 없습니다.');
    var name = String(req.fileName || '파일').replace(/[\\/:*?"<>|]/g, '_').slice(0, 150), mime = String(req.mime || 'application/octet-stream');
    var file = await drive('create', { folder: await docsFolder(), name: name, mime: mime, data: data });
    await edit([SHEET_MANUAL], async function (W) {
      var f = await W.findRow(SHEET_MANUAL, MANUAL_HEADER, req.id); if (!f) throw err('매뉴얼을 찾을 수 없습니다.');
      var files = parseJson(f.raw[9], []); files.push({ id: file.id, name: name, mime: mime, size: size, by: session.name, at: nowTxt() });
      var log = parseJson(f.raw[14], []); log.push({ at: nowTxt(), by: session.name, what: '첨부 추가: ' + name });
      await W.set(SHEET_MANUAL, f.row, 10, [JSON.stringify(files)]); await W.set(SHEET_MANUAL, f.row, 15, [JSON.stringify(log.slice(-60))]);
    });
    return manualList();
  }
  async function manualFileFind(fileId, db) {
    var hit = null; (await rowsOf(SHEET_MANUAL, MANUAL_HEADER, db)).some(function (r) { var x = parseJson(r[9], []).filter(function (y) { return y.id === fileId; })[0]; if (x) hit = { m: String(r[0]), f: x }; return !!x; });
    if (!hit) throw err('파일을 찾을 수 없습니다.'); return hit;
  }
  async function manualFile(fileId) { var h = await manualFileFind(fileId), r = await drive('get', { id: h.f.id }); return { data: r.data, fileName: h.f.name, mime: h.f.mime }; }
  async function manualFileDelete(session, fileId) {
    var h = await manualFileFind(fileId);
    try { await drive('trash', { id: fileId, on: true }); } catch (e) { /* 무시 */ }
    await edit([SHEET_MANUAL], async function (W) {
      var f = await W.findRow(SHEET_MANUAL, MANUAL_HEADER, h.m);
      var files = parseJson(f.raw[9], []).filter(function (y) { return y.id !== fileId; }), log = parseJson(f.raw[14], []); log.push({ at: nowTxt(), by: session.name, what: '첨부 삭제: ' + h.f.name });
      await W.set(SHEET_MANUAL, f.row, 10, [JSON.stringify(files)]); await W.set(SHEET_MANUAL, f.row, 15, [JSON.stringify(log.slice(-60))]);
    });
    return manualList();
  }

  /* ───────────── 단가 변경 기록 (분석 비고 · Code.js notesList_ …) ───────────── */
  var SHEET_NOTES = '단가변경';
  var NOTE_HEADER = ['ID', '매출처', '적용월', '구분', '대상', '변동', '근거', '내용', '발지', '착지', '중량', '작성자', '작성일시', '수정일시'];
  var NOTE_KINDS = ['유가연동', '재계약', '신규', '인하', '기사 운임', '기타'];
  function noteChange(v) { if (typeof v === 'number') { var p = Math.round(v * 10000) / 100; return (p > 0 ? '+' : '') + p + '%'; } return String(v).replace(/^'/, ''); }
  function noteRowToObj(r) {
    return { id: String(r[0]), cust: String(r[1]), month: String(r[2]).replace(/^'/, '').slice(0, 7), kind: String(r[3]), target: String(r[4]), change: noteChange(r[5]), basis: String(r[6]),
      memo: String(r[7]), from: String(r[8] || ''), to: String(r[9] || ''), weight: String(r[10] || ''), by: String(r[11]), at: fmtV(r[12]), updated: fmtV(r[13]) };
  }
  async function notesList(db) {
    var all = await readAll(SHEET_NOTES, db); if (all.length < 2) return [];
    return all.slice(1).map(function (r) { return NOTE_HEADER.map(function (h, j) { return readValue(r[j] == null ? '' : r[j]); }); }).filter(function (r) { return r[0]; }).map(noteRowToObj)
      .sort(function (a, b) { return a.month < b.month ? 1 : a.month > b.month ? -1 : 0; });
  }
  function checkNote(n) {
    n = n || {};
    var month = String(n.month || '').replace(/^'/, '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw err('적용 시작 월을 YYYY-MM 형식으로 넣으세요.');
    var cust = String(n.cust || '').trim();
    if (!cust) throw err('매출처를 고르세요. (모든 매출처라면 "(전체)")');
    var memo = String(n.memo || '').trim(), change = String(n.change || '').trim();
    if (!memo && !change) throw err('변동 내용이나 메모를 입력하세요.');
    var cut = function (v, k) { return String(v || '').trim().slice(0, k); };
    return { cust: cut(cust, 100), month: month, kind: NOTE_KINDS.indexOf(n.kind) !== -1 ? n.kind : '기타', target: ['매출', '매입', '매출·매입'].indexOf(n.target) !== -1 ? n.target : '매출',
      change: cut(change, 100), basis: ['계약서', '메일', '구두', '내부'].indexOf(n.basis) !== -1 ? n.basis : '', memo: cut(memo, 1000), from: cut(n.from, 100), to: cut(n.to, 100), weight: cut(n.weight, 30) };
  }
  function noteRow(id, n, by, at, upd) { return [id, n.cust, "'" + n.month, n.kind, n.target, "'" + n.change, n.basis, n.memo, n.from, n.to, n.weight, by, at, upd]; }
  async function notesSave(session, req) {
    var n = checkNote(req.note), now = nowTxt(), who = session.name + ' (' + session.id + ')';
    await edit([SHEET_NOTES], async function (W) {
      if (req.id) {
        var f = await W.findRow(SHEET_NOTES, NOTE_HEADER, req.id); if (!f) throw err('기록을 찾을 수 없습니다.');
        var old = ((await Q(W.tx, 'select sheet_getrow($1, $2) v', [SHEET_NOTES, f.row]))[0].v || []).map(dec).map(function (x) { return readValue(x == null ? '' : x); });
        await W.set(SHEET_NOTES, f.row, 1, noteRow(String(req.id), n, old[11], old[12], now + ' · ' + session.name));
      } else await W.append(SHEET_NOTES, NOTE_HEADER, noteRow(newId('N'), n, who, now, ''));
    });
    return { notes: await notesList() };
  }
  async function notesImport(session, rows) {
    if (!Array.isArray(rows) || !rows.length) throw err('올릴 기록이 없습니다.');
    if (rows.length > 2000) throw err('한 번에 2,000줄까지 올릴 수 있습니다.');
    var now = nowTxt(), who = session.name + ' (' + session.id + ')';
    var out = rows.map(function (r, i) { try { return noteRow(newId('N') + i, checkNote(r), who, now, ''); } catch (e) { throw err((i + 1) + '번째 줄: ' + e.message); } });
    await edit([SHEET_NOTES], async function (W) { var n = await W.lastRow(SHEET_NOTES); if (n < 1) { await W.putRows(SHEET_NOTES, 1, [NOTE_HEADER]); n = 1; } await W.putRows(SHEET_NOTES, n + 1, out); });
    return { count: out.length, notes: await notesList() };
  }
  async function notesDelete(id) {
    await edit([SHEET_NOTES], async function (W) { var f = await W.findRow(SHEET_NOTES, NOTE_HEADER, id); if (!f) throw err('기록을 찾을 수 없습니다.'); await W.del(SHEET_NOTES, f.row); });
    return { notes: await notesList() };
  }

  /* ───────────── 주소 자동완성 · 회사 정보 (Code.js addrList_ · companies_ · saveCompanies_) ───────────── */
  async function addrList() {
    var all = await readAll('주소캐시'); if (all.length < 2) return { list: [] };
    var n = all.length - 1, vals = all.slice(Math.max(1, all.length - 3000)).reverse(), seen = {}, out = [];
    vals.forEach(function (r) { var q = String(readValue(r[0] == null ? '' : r[0])); if (q && !seen[q]) { seen[q] = true; out.push([q, String(readValue(r[4] == null ? '' : r[4]) || '')]); } });
    return { list: out, total: n };
  }
  var COMPANY_FIELDS = ['name', 'ceo', 'bizNo', 'addr', 'tel', 'fax', 'email', 'manager', 'bank'], AN_BUSINESSES = ['조일물류', '명일로지스', '조일로지스'], CELL_LIMIT = 45000;
  async function companies() {
    var raw = await propGet('COMPANIES'), list = raw ? JSON.parse(raw) : {};
    var all = await readAll('회사직인'); all.slice(1).forEach(function (r) { var k = readValue(r[0] == null ? '' : r[0]); if (list[k]) list[k].stamp = String(readValue(r[1] == null ? '' : r[1]) || ''); });
    return list;
  }
  async function saveCompanies(cs) {
    if (!cs || typeof cs !== 'object') throw err('회사 정보 형식이 올바르지 않습니다.');
    var meta = {}, stamps = [];
    AN_BUSINESSES.forEach(function (biz) {
      var c = cs[biz] || {}; meta[biz] = {};
      COMPANY_FIELDS.forEach(function (k) { meta[biz][k] = String(c[k] || '').slice(0, 200); });
      var stamp = String(c.stamp || '');
      if (stamp && (!/^data:image\/(png|jpeg|webp);base64,/.test(stamp) || stamp.length > CELL_LIMIT)) throw err(biz + ' 직인 이미지가 너무 크거나 형식이 맞지 않습니다.');
      stamps.push([biz, stamp]);
    });
    await edit(['회사직인'], async function (W) {
      await propSet(W.tx, 'COMPANIES', JSON.stringify(meta));
      var n = await W.lastRow('회사직인'); if (n < 1) { await W.putRows('회사직인', 1, [['사업자', '직인(이미지)']]); n = 1; }
      if (n > 1) await W.clearRows('회사직인', 2, n - 1, 2);
      await W.putRows('회사직인', 2, stamps);
    });
    return { companies: await companies() };
  }

  /* ───────────── 직원 목록 (Code.js calStaff_ · staffSave_) ───────────── */
  var SHEET_STAFF = '직원';
  var STAFF_HEADER = ['ID', '이름', '사업자', '부서', '이메일', '계정아이디', '재직', '주간요약', '메모', '팀'];
  function staffRowOut(x) { return [x.id, x.name, x.biz || '', x.dept || '', x.email || '', x.account || '', x.active === false ? 'N' : 'Y', x.weekly ? 'Y' : '', x.memo || '', x.team || '']; }
  async function staffWrite(W, list) {
    var n = await W.lastRow(SHEET_STAFF); if (n < 1) { await W.putRows(SHEET_STAFF, 1, [STAFF_HEADER]); n = 1; }
    if (n > 1) await W.clearRows(SHEET_STAFF, 2, n - 1, STAFF_HEADER.length);
    if (list.length) await W.putRows(SHEET_STAFF, 2, list.map(staffRowOut));
  }
  async function calStaff(db) {
    var rows = await rowsOf(SHEET_STAFF, STAFF_HEADER, db);
    if (!rows.length) { // 예전 "계정 없는 직원" 명단 옮기기
      var old = parseJson(await propGet('CAL_STAFF', db), []);
      if (old.length) { await edit([SHEET_STAFF], function (W) { return staffWrite(W, old.map(function (x) { return { id: x.id, name: x.name, active: true }; })); }); rows = await rowsOf(SHEET_STAFF, STAFF_HEADER, db); }
    }
    return rows.map(function (r) { return { id: String(r[0]), name: String(r[1]), biz: String(r[2] || ''), dept: String(r[3] || ''), email: String(r[4] || ''), account: String(r[5] || ''), active: String(r[6]) !== 'N', weekly: String(r[7]) === 'Y', memo: String(r[8] || ''), team: String(r[9] || '') }; });
  }
  async function staffSave(session, req) {
    var old = {}; (await calStaff()).forEach(function (s) { old[s.id] = s; });
    var seen = {};
    var list = (req.staff || []).map(function (x) {
      var name = String(x.name || '').trim().slice(0, 30); if (!name) return null;
      if (seen[name]) throw err('"' + name + '" 이름이 두 번 있어요.'); seen[name] = 1;
      var email = String(x.email || '').trim().slice(0, 100);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw err(name + ' 메일 주소를 확인하세요.');
      var biz = BIZ_LIST.indexOf(x.biz) !== -1 ? x.biz : '';
      return { id: old[x.id] ? x.id : 'S' + crypto.randomUUID().replace(/-/g, '').slice(0, 10), name: name, biz: biz, dept: String(x.dept || '').trim().slice(0, 30), email: email,
        account: String(x.account || '').trim(), active: x.active !== false, weekly: !!x.weekly && !!email, memo: String(x.memo || '').slice(0, 200), team: String(x.team || '').trim().slice(0, 30) };
    }).filter(Boolean);
    await edit([SHEET_STAFF], function (W) { return staffWrite(W, list); });
    var accs = {}; (await o.listUsers()).forEach(function (u) { accs[String(u.id)] = u; });
    for (var s2 of list) { // 계정을 연결하면 계정 이름도 직원 이름으로
      var u = s2.active && s2.account && accs[s2.account]; if (!u || String(u.name) === s2.name) continue;
      await Q(sql, 'update accounts set name = $2 where id = $1', [s2.account, s2.name]);
    }
    return { staff: await calStaff() };
  }
  async function staffList() { return { staff: await calStaff(), accounts: (await o.listUsers()).map(function (u) { return { id: String(u.id), name: String(u.name), active: u.active }; }) }; }

  /* ───────────── 일정 (달력 · 할 일 · 휴가 · 당직 · 공휴일 · Code.js calAll_ …) ───────────── */
  var SHEET_EVENTS = '일정', EVENT_HEADER = ['ID', '시작일', '종료일', '제목', '메모', '공개', '작성자ID', '작성자', '작성일시'];
  var SHEET_TASKS = '할일규칙', TASK_HEADER = ['ID', '업체', '제목', '규칙', '휴일처리', '담당ID', '담당', '메모', '사용', '시작일', '작성자', '작성일시'];
  var SHEET_TASK_DONE = '할일완료', TASK_DONE_HEADER = ['규칙ID', '기한일', '완료일시', '완료자', '메모'];
  var SHEET_LEAVES = '휴가', LEAVE_HEADER = ['ID', '아이디', '이름', '종류', '시작일', '종료일', '메모', '등록자', '등록일시', '시작시각', '종료시각', '시간'];
  var LEAVE_KINDS = ['연차', '오전 반차', '오후 반차', '병가', '경조', '공가', '대체휴무', '기타', '야간근무', '휴일근무', '당직'];
  var LEAVE_ALIAS = { '반차(오전)': '오전 반차', '반차(오후)': '오후 반차', '오전반차': '오전 반차', '오후반차': '오후 반차', '반차': '오후 반차' };
  function isWorkKind(k) { return /근무|당직/.test(k); }
  var SHEET_GRANTS = '연차부여', GRANT_HEADER = ['연도', '아이디', '이름', '부여일수'];
  var SHEET_DUTY_OVR = '당직변경', DUTY_OVR_HEADER = ['규칙ID', '주시작', '아이디', '이름', '시간', '취소', '메모', '등록자', '등록일시'];
  var SHEET_HOLI = '공휴일', HOLI_HEADER = ['날짜', '이름', '구분'];
  var KR_HOLIDAY_ICS = 'https://calendar.google.com/calendar/ical/ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics';
  var KR_HOLIDAY_BUILTIN = [
    ['2026-01-01', '신정'], ['2026-02-16', '설날 연휴'], ['2026-02-17', '설날'], ['2026-02-18', '설날 연휴'], ['2026-03-01', '삼일절'], ['2026-03-02', '대체공휴일(삼일절)'],
    ['2026-05-05', '어린이날'], ['2026-05-24', '부처님오신날'], ['2026-05-25', '대체공휴일(부처님오신날)'], ['2026-06-03', '전국동시지방선거'], ['2026-06-06', '현충일'],
    ['2026-08-15', '광복절'], ['2026-08-17', '대체공휴일(광복절)'], ['2026-09-24', '추석 연휴'], ['2026-09-25', '추석'], ['2026-09-26', '추석 연휴'],
    ['2026-10-03', '개천절'], ['2026-10-05', '대체공휴일(개천절)'], ['2026-10-09', '한글날'], ['2026-12-25', '기독탄신일'],
    ['2027-01-01', '신정'], ['2027-02-06', '설날 연휴'], ['2027-02-07', '설날'], ['2027-02-08', '설날 연휴'], ['2027-02-09', '대체공휴일(설날)'], ['2027-03-01', '삼일절'],
    ['2027-05-05', '어린이날'], ['2027-05-13', '부처님오신날'], ['2027-06-06', '현충일'], ['2027-08-15', '광복절'], ['2027-08-16', '대체공휴일(광복절)'],
    ['2027-09-14', '추석 연휴'], ['2027-09-15', '추석'], ['2027-09-16', '추석 연휴'], ['2027-10-03', '개천절'], ['2027-10-04', '대체공휴일(개천절)'],
    ['2027-10-09', '한글날'], ['2027-10-11', '대체공휴일(한글날)'], ['2027-12-25', '기독탄신일'], ['2027-12-27', '대체공휴일(기독탄신일)']
  ];
  function holidayDedupe(list) { var seen = {}; return list.filter(function (h) { var k = h.date + h.name; if (seen[k]) return false; seen[k] = true; return true; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }); }
  function parseHolidayIcs(text) {
    var lines = String(text).replace(/\r\n[ \t]/g, '').split(/\r?\n/), out = [], ev = null;
    lines.forEach(function (l) {
      if (l === 'BEGIN:VEVENT') ev = {};
      else if (l === 'END:VEVENT') {
        if (ev && ev.start) {
          var st = ev.start, e = ev.end || null, d = new Date(Date.UTC(+st.slice(0, 4), +st.slice(4, 6) - 1, +st.slice(6, 8)));
          var endD = e ? new Date(Date.UTC(+e.slice(0, 4), +e.slice(4, 6) - 1, +e.slice(6, 8))) : new Date(d.getTime() + 86400000);
          for (var t = d; t < endD; t = new Date(t.getTime() + 86400000)) out.push({ date: t.toISOString().slice(0, 10), name: ev.name || '', off: !/기념일|observance/i.test(ev.desc || '') });
        }
        ev = null;
      } else if (ev) {
        var m = /^DTSTART[^:]*:(\d{8})/.exec(l); if (m) ev.start = m[1];
        m = /^DTEND[^:]*:(\d{8})/.exec(l); if (m) ev.end = m[1];
        m = /^SUMMARY[^:]*:(.*)$/.exec(l); if (m) ev.name = m[1].replace(/\\,/g, ',').trim();
        m = /^DESCRIPTION[^:]*:(.*)$/.exec(l); if (m) ev.desc = m[1];
      }
    });
    return holidayDedupe(out);
  }
  /** 공휴일: (구글 캘린더는 Supabase 에서 못 씀) 공개 ics → 시트에 저장된 목록 → 기본 목록 */
  async function loadHolidays() {
    var list = null, source = '', errs = ['캘린더: CalendarApp 는 Supabase 서버에서 쓸 수 없어요.'];
    try {
      if (!netFetch) throw new Error('인터넷 없음');
      var res = await netFetch(KR_HOLIDAY_ICS); if (res.status !== 200) throw new Error('응답 코드 ' + res.status);
      list = parseHolidayIcs(await res.text()); source = '공개 캘린더 주소(ics)';
    } catch (e) { errs.push('ics: ' + ((e && e.message) || e)); }
    if (list && list.length) {
      list = holidayDedupe(list);
      await edit([SHEET_HOLI], async function (W) {
        var n = await W.lastRow(SHEET_HOLI); if (n < 1) { await W.putRows(SHEET_HOLI, 1, [HOLI_HEADER]); n = 1; }
        if (n > 1) await W.clearRows(SHEET_HOLI, 2, n - 1, HOLI_HEADER.length);
        await W.putRows(SHEET_HOLI, 2, list.map(function (h) { return ["'" + h.date, h.name, h.off ? '공휴일' : '기념일']; }));
      });
      return { list: list, source: source, ok: true, errors: errs };
    }
    list = (await rowsOf(SHEET_HOLI, HOLI_HEADER)).map(function (r) { return { date: textDate(r[0]), name: String(r[1]), off: String(r[2]) !== '기념일' }; });
    if (list.length) return { list: list, source: '시트에 저장된 목록', ok: false, errors: errs };
    return { list: KR_HOLIDAY_BUILTIN.map(function (h) { return { date: h[0], name: h[1], off: true }; }), source: '기본 목록(2026~2027)', ok: false, errors: errs };
  }
  async function krHolidays() {
    var hit = await cacheGet('KR_HOLI'); if (hit) return JSON.parse(hit);
    var r = await loadHolidays(); await cachePut('KR_HOLI', JSON.stringify(r.list), r.ok ? 43200 : 600); return r.list;
  }
  async function refreshHolidays() { await cacheDel('KR_HOLI'); var r = await loadHolidays(); await cachePut('KR_HOLI', JSON.stringify(r.list), r.ok ? 43200 : 600); return { ok: r.ok, source: r.source, count: r.list.length, errors: r.errors }; }
  async function companyHolidays() { var raw = await propGet('COMPANY_HOLI'); return raw ? JSON.parse(raw) : []; }
  async function saveCompanyHolidays(list) {
    var clean = (list || []).map(function (h) { return { date: checkDate(h.date), name: String(h.name || '회사 휴무').trim().slice(0, 40) || '회사 휴무' }; }).slice(0, 200);
    await sql.begin(function (tx) { return propSet(tx, 'COMPANY_HOLI', JSON.stringify(clean)); });
    return { companyHolidays: clean };
  }
  function hm(v) { if (v instanceof Date) return formatDate(v, '', 'HH:mm'); var m = /^(\d{1,2}):(\d{2})/.exec(String(v || '').replace(/^'/, '').trim()); return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : ''; }
  /* 직원 ↔ 계정 연결 (Code.js calLink_ · calRelink_ · calUsers_ · staffInfo_) — 요청 하나 안에서만 재사용 */
  async function calCtx() {
    var users = await o.listUsers(), staff = await calStaff(), acc = {}; users.forEach(function (u) { if (u.active) acc[String(u.id)] = 1; });
    var link = { byStaff: {}, nameOf: {} };
    staff.forEach(function (s2) { if (s2.active && s2.account && acc[s2.account]) { link.byStaff[s2.id] = s2.account; link.nameOf[s2.account] = s2.name; } });
    var accU = users.filter(function (u) { return u.active; }).map(function (u) { return { id: String(u.id), name: link.nameOf[String(u.id)] || String(u.name) }; });
    var names = {}, ids = {}; accU.forEach(function (u) { names[u.name] = 1; ids[u.id] = 1; });
    var calUsers = accU.concat(staff.filter(function (s2) { return s2.active && !names[s2.name] && !(s2.account && ids[s2.account]); }).map(function (s2) { return { id: s2.id, name: s2.name, nameOnly: true }; }));
    var accName = {}; users.forEach(function (u) { accName[String(u.id)] = String(u.name); });
    var info = {}; staff.forEach(function (s2) { var v = { biz: s2.biz, dept: s2.dept, team: s2.team }; info[s2.name] = v; if (s2.account && accName[s2.account]) info[accName[s2.account]] = v; });
    return { link: link, users: calUsers, staff: staff, info: info, relink: function (x) { if (link.byStaff[x.userId]) x.userId = link.byStaff[x.userId]; if (link.nameOf[x.userId]) x.name = link.nameOf[x.userId]; return x; } };
  }
  async function dutyRules(cc) {
    var list = parseJson(await propGet('DUTY_RULES'), []);
    list.forEach(function (r) { (r.members || []).forEach(function (m) { var x = cc.relink({ userId: m.id, name: m.name }); m.id = x.userId; m.name = x.name; }); });
    return list;
  }
  function mondayOf(st) { var d = new Date(Date.UTC(+st.slice(0, 4), +st.slice(5, 7) - 1, +st.slice(8, 10))), w = (d.getUTCDay() + 6) % 7; return new Date(d.getTime() - w * 86400000).toISOString().slice(0, 10); }
  async function calAll(session) {
    var events = (await rowsOf(SHEET_EVENTS, EVENT_HEADER)).map(function (r) {
      return { id: String(r[0]), start: textDate(r[1]), end: textDate(r[2]) || textDate(r[1]), title: String(r[3]), memo: String(r[4] || ''), private: String(r[5]) === '나만', ownerId: String(r[6]), owner: String(r[7]), at: fmtV(r[8]) };
    }).filter(function (e) { return !e.private || e.ownerId === session.id; });
    var tasks = (await rowsOf(SHEET_TASKS, TASK_HEADER)).map(function (r) {
      return { id: String(r[0]), cust: String(r[1] || ''), title: String(r[2]), rule: parseJson(r[3], { type: 'once' }), adjust: String(r[4] || 'prev'), assigneeId: String(r[5] || ''), assignee: String(r[6] || ''),
        memo: String(r[7] || ''), active: String(r[8]) !== 'N', start: textDate(r[9]), by: String(r[10]), at: fmtV(r[11]) };
    });
    var since = ymdNow(new Date(Date.now() - 400 * 86400000));
    var done = (await rowsOf(SHEET_TASK_DONE, TASK_DONE_HEADER)).map(function (r) { return { taskId: String(r[0]), date: textDate(r[1]), at: fmtV(r[2]), by: String(r[3]), memo: String(r[4] || '') }; }).filter(function (d) { return d.date >= since; });
    var leaves = (await rowsOf(SHEET_LEAVES, LEAVE_HEADER)).map(function (r) {
      return { id: String(r[0]), userId: String(r[1]), name: String(r[2]), kind: String(r[3]), start: textDate(r[4]), end: textDate(r[5]) || textDate(r[4]), memo: String(r[6] || ''), by: String(r[7]), at: fmtV(r[8]), from: hm(r[9]), to: hm(r[10]), hours: Number(r[11]) || 0 };
    });
    var grants = (await rowsOf(SHEET_GRANTS, GRANT_HEADER)).map(function (r) { return { year: String(r[0]), userId: String(r[1]), name: String(r[2]), days: Number(r[3]) || 0 }; });
    var cc = await calCtx(); leaves.forEach(cc.relink); grants.forEach(cc.relink);
    var dutyOvr = (await rowsOf(SHEET_DUTY_OVR, DUTY_OVR_HEADER)).map(function (r) { return { ruleId: String(r[0]), week: textDate(r[1]), userId: String(r[2] || ''), name: String(r[3] || ''), hours: r[4] === '' ? null : Number(r[4]), cancel: String(r[5]) === 'Y', memo: String(r[6] || ''), by: String(r[7] || ''), at: fmtV(r[8]) }; });
    dutyOvr.forEach(function (x) { if (x.userId) cc.relink(x); });
    return { events: events, tasks: tasks, done: done, leaves: leaves, grants: grants, users: cc.users, holidays: await krHolidays(), companyHolidays: await companyHolidays(), today: ymdNow(),
      dutyRules: await dutyRules(cc), dutyOverrides: dutyOvr, staffInfo: cc.info };
  }
  async function eventSave(session, req) {
    var e = req.event || {}, start = checkDate(e.start, '시작일'), end = e.end ? checkDate(e.end, '종료일') : start;
    if (end < start) throw err('종료일이 시작일보다 빠릅니다.');
    var title = String(e.title || '').trim(); if (!title) throw err('일정 제목을 입력하세요.');
    var row = ["'" + start, "'" + end, title.slice(0, 100), String(e.memo || '').slice(0, 1000), e.private ? '나만' : '팀'];
    await edit([SHEET_EVENTS], async function (W) {
      if (req.id) {
        var f = await W.findRow(SHEET_EVENTS, EVENT_HEADER, req.id); if (!f) throw err('일정을 찾을 수 없습니다.');
        if (String(f.raw[6]) !== session.id && session.role !== 'admin') throw err('작성한 사람이나 관리자만 고칠 수 있습니다.');
        await W.set(SHEET_EVENTS, f.row, 2, row);
      } else await W.append(SHEET_EVENTS, EVENT_HEADER, [newId('C')].concat(row).concat([session.id, session.name, nowTxt()]));
    });
    return calAll(session);
  }
  async function eventDelete(session, id) {
    await edit([SHEET_EVENTS], async function (W) {
      var f = await W.findRow(SHEET_EVENTS, EVENT_HEADER, id); if (!f) throw err('일정을 찾을 수 없습니다.');
      if (String(f.raw[6]) !== session.id && session.role !== 'admin') throw err('작성한 사람이나 관리자만 지울 수 있습니다.');
      await W.del(SHEET_EVENTS, f.row);
    });
    return calAll(session);
  }
  var TASK_TYPES = ['once', 'daily', 'monthEnd', 'monthDay', 'weekly', 'yearly'];
  function cleanRule(r) {
    r = r || {};
    var type = TASK_TYPES.indexOf(r.type) !== -1 ? r.type : 'once', out = { type: type };
    if (type === 'once') out.date = checkDate(r.date, '날짜');
    if (type === 'monthDay') { out.day = Math.round(Number(r.day)); if (!(out.day >= 1 && out.day <= 31)) throw err('매월 며칠인지 1~31로 넣으세요.'); }
    if (type === 'daily') out.workdays = r.workdays !== false;
    if (type === 'weekly') { out.dow = Math.round(Number(r.dow)); if (!(out.dow >= 0 && out.dow <= 6)) throw err('요일을 고르세요.'); }
    if (type === 'yearly') { out.month = Math.round(Number(r.month)); out.day = Math.round(Number(r.day)); if (!(out.month >= 1 && out.month <= 12 && out.day >= 1 && out.day <= 31)) throw err('매년 몇 월 며칠인지 넣으세요.'); }
    return out;
  }
  async function taskSave(session, req) {
    var t = req.task || {};
    var title = String(t.title || '').trim(); if (!title) throw err('할 일 제목을 입력하세요.');
    var rule = cleanRule(t.rule), adjust = ['prev', 'next', 'none'].indexOf(t.adjust) !== -1 ? t.adjust : 'prev';
    var start = t.start ? checkDate(t.start, '시작일') : ymdNow();
    var row = [String(t.cust || '').slice(0, 100), title.slice(0, 200), JSON.stringify(rule), adjust, String(t.assigneeId || ''), String(t.assignee || '').slice(0, 50), String(t.memo || '').slice(0, 1000), t.active === false ? 'N' : 'Y', "'" + start];
    await edit([SHEET_TASKS], async function (W) {
      if (req.id) { var f = await W.findRow(SHEET_TASKS, TASK_HEADER, req.id); if (!f) throw err('할 일을 찾을 수 없습니다.'); await W.set(SHEET_TASKS, f.row, 2, row); }
      else await W.append(SHEET_TASKS, TASK_HEADER, [newId('T')].concat(row).concat([session.name, nowTxt()]));
    });
    return calAll(session);
  }
  async function taskDelete(session, id) {
    await edit([SHEET_TASKS], async function (W) { var f = await W.findRow(SHEET_TASKS, TASK_HEADER, id); if (!f) throw err('할 일을 찾을 수 없습니다.'); await W.del(SHEET_TASKS, f.row); });
    return calAll(session);
  }
  async function taskDone(session, req) {
    var id = String(req.id || ''), date = checkDate(req.date, '기한일');
    if (!(await findRow(SHEET_TASKS, TASK_HEADER, id))) throw err('할 일을 찾을 수 없습니다.');
    await edit([SHEET_TASK_DONE], async function (W) {
      var all = await readAll(SHEET_TASK_DONE, W.tx), idx = -1;
      for (var i = 1; i < all.length; i++) { var r = all[i]; if (String(readValue(r[0] == null ? '' : r[0])) === id && textDate(readValue(r[1] == null ? '' : r[1])) === date) idx = i + 1; }
      if (req.undo) { if (idx !== -1) await W.del(SHEET_TASK_DONE, idx); }
      else if (idx === -1) await W.append(SHEET_TASK_DONE, TASK_DONE_HEADER, [id, "'" + date, nowTxt(), session.name, String(req.memo || '').slice(0, 500)]);
    });
    return calAll(session);
  }
  function cleanLeave(l) {
    var k = String(l.kind || '').trim(); k = LEAVE_ALIAS[k] || k;
    if (LEAVE_KINDS.indexOf(k) === -1) throw err('종류 "' + k + '"를 알 수 없습니다.');
    var start = checkDate(l.start, '시작일'), end = l.end ? checkDate(l.end, '종료일') : start;
    if (/반차/.test(k)) end = start;
    if (end < start) throw err('종료일이 시작일보다 빠릅니다.');
    var work = isWorkKind(k), hours = work ? Math.round(Number(l.hours) * 100) / 100 || 0 : 0;
    if (hours < 0 || hours > 400) throw err('추가근무 시간을 확인하세요.');
    return { kind: k, start: start, end: end, memo: String(l.memo || '').slice(0, 500), from: work ? hm(l.from) : '', to: work ? hm(l.to) : '', hours: hours };
  }
  function leaveRow(id, userId, name, v, by) { return [id, userId, name, v.kind, "'" + v.start, "'" + v.end, v.memo, by, nowTxt(), "'" + v.from, "'" + v.to, v.hours]; }
  /** Code.js leaveSheet_: 예전 시트(칸이 적음)면 제목 줄을 늘려요 */
  async function leaveHeader(W) { var h = ((await Q(W.tx, 'select sheet_getrow($1, 1) v', [SHEET_LEAVES]))[0].v || []); if (h.filter(function (x) { return x !== '' && x != null; }).length < LEAVE_HEADER.length && h.length) await W.putRows(SHEET_LEAVES, 1, [LEAVE_HEADER]); }
  async function leaveSave(session, req) {
    var l = req.leave || {}, cc = await calCtx();
    var userId = String(l.userId || session.id), lk = cc.link.byStaff[userId]; if (lk) userId = lk;
    if (userId !== session.id && session.role !== 'admin') throw err('다른 사람의 휴가는 관리자만 등록할 수 있습니다.');
    var u = cc.users.filter(function (x) { return x.id === userId; })[0];
    if (!u) throw err('직원을 찾을 수 없습니다.');
    var v = cleanLeave(l);
    await edit([SHEET_LEAVES], async function (W) {
      await leaveHeader(W);
      if (req.id) {
        var f = await W.findRow(SHEET_LEAVES, LEAVE_HEADER, req.id); if (!f) throw err('기록을 찾을 수 없습니다.');
        if (String(f.raw[1]) !== session.id && session.role !== 'admin') throw err('본인이나 관리자만 고칠 수 있습니다.');
        await W.set(SHEET_LEAVES, f.row, 2, [userId, u.name, v.kind, "'" + v.start, "'" + v.end, v.memo]);
        await W.set(SHEET_LEAVES, f.row, 10, ["'" + v.from, "'" + v.to, v.hours]);
      } else await W.append(SHEET_LEAVES, LEAVE_HEADER, leaveRow(newId('L'), userId, u.name, v, session.name));
    });
    return calAll(session);
  }
  async function leaveDelete(session, id) {
    await edit([SHEET_LEAVES], async function (W) {
      var f = await W.findRow(SHEET_LEAVES, LEAVE_HEADER, id); if (!f) throw err('기록을 찾을 수 없습니다.');
      if (String(f.raw[1]) !== session.id && session.role !== 'admin') throw err('본인이나 관리자만 지울 수 있습니다.');
      await W.del(SHEET_LEAVES, f.row);
    });
    return calAll(session);
  }
  async function writeGrants(W, rows) {
    var n = await W.lastRow(SHEET_GRANTS); if (n < 1) { await W.putRows(SHEET_GRANTS, 1, [GRANT_HEADER]); n = 1; }
    if (n > 1) await W.clearRows(SHEET_GRANTS, 2, n - 1, GRANT_HEADER.length);
    if (rows.length) await W.putRows(SHEET_GRANTS, 2, rows);
  }
  async function grantsSave(session, req) {
    var year = String(req.year || ''); if (!/^\d{4}$/.test(year)) throw err('연도를 확인하세요.');
    var cc = await calCtx();
    await edit([SHEET_GRANTS], async function (W) {
      var keep = (await W.rowsOf(SHEET_GRANTS, GRANT_HEADER)).filter(function (r) { return String(r[0]) !== year; }).map(function (r) { return r.slice(); });
      var add = Object.keys(req.grants || {}).map(function (uid) {
        var u = cc.users.filter(function (x) { return String(x.id) === uid; })[0]; if (!u) return null;
        var v = Number(req.grants[uid]); if (!(v >= 0 && v <= 100)) throw err(u.name + ' 부여 일수를 확인하세요.');
        return [year, uid, String(u.name), v];
      }).filter(Boolean);
      await writeGrants(W, keep.concat(add));
    });
    return calAll(session);
  }
  async function dutyRuleSave(session, req) {
    var r = req.rule || {}, cc = await calCtx(), list = await dutyRules(cc);
    var name = String(r.name || '').trim().slice(0, 30); if (!name) throw err('규칙 이름을 넣으세요.');
    var byName = {}; cc.users.forEach(function (u) { byName[u.name] = u.id; });
    var members = (r.members || []).map(function (m) { var n = String((m && m.name) || m || '').trim(); if (!n) return null; if (!byName[n]) throw err('"' + n + '"은(는) 계정이나 직원 명단에 없습니다. 먼저 직원 명단에 추가하세요.'); return { id: byName[n], name: n }; }).filter(Boolean);
    if (members.length < 1) throw err('순번에 들어갈 사람을 한 명 이상 넣으세요.');
    var mode = r.mode === 'days' ? 'days' : 'week', hours = Number(r.hours);
    if (!(hours >= 0 && hours <= 100)) throw err('시간을 확인하세요.');
    var days = (r.days || []).map(Number).filter(function (x) { return x >= 0 && x <= 6; });
    if (mode === 'days' && !days.length && !r.holidays) throw err('요일이나 공휴일을 하나 이상 고르세요.');
    var ob = { id: r.id || 'R' + crypto.randomUUID().replace(/-/g, '').slice(0, 8), name: name, members: members, start: mondayOf(checkDate(r.start, '시작 주')), mode: mode, hours: hours, days: days, holidays: !!r.holidays, active: r.active !== false };
    var i = -1; list.forEach(function (x, k) { if (x.id === ob.id) i = k; });
    if (i === -1) list.push(ob); else list[i] = ob;
    await sql.begin(function (tx) { return propSet(tx, 'DUTY_RULES', JSON.stringify(list)); });
    return calAll(session);
  }
  async function dutyRuleDelete(session, id) {
    var list = (await dutyRules(await calCtx())).filter(function (x) { return x.id !== id; });
    await sql.begin(function (tx) { return propSet(tx, 'DUTY_RULES', JSON.stringify(list)); });
    return calAll(session);
  }
  async function dutyOverride(session, req) {
    var cc = await calCtx(), rule = (await dutyRules(cc)).filter(function (x) { return x.id === req.ruleId; })[0]; if (!rule) throw err('규칙을 찾을 수 없습니다.');
    var mine = rule.members.some(function (m) { return m.id === session.id || m.name === session.name; });
    if (session.role !== 'admin' && !mine) throw err('관리자나 이 당직 순번에 있는 사람만 바꿀 수 있습니다.');
    var week = mondayOf(checkDate(req.week, '주'));
    await edit([SHEET_DUTY_OVR], async function (W) {
      var rows = await W.rowsOf(SHEET_DUTY_OVR, DUTY_OVR_HEADER);
      for (var i = rows.length - 1; i >= 0; i--) if (String(rows[i][0]) === rule.id && textDate(rows[i][1]) === week) await W.del(SHEET_DUTY_OVR, rows[i]._r);
      if (!req.clear) {
        var u = null;
        if (!req.cancel) { u = cc.users.filter(function (x) { return x.id === req.userId || x.name === req.name; })[0]; if (!u) throw err('바꿀 사람을 고르세요.'); }
        var h = req.hours === '' || req.hours == null ? '' : Number(req.hours);
        if (h !== '' && !(h >= 0 && h <= 100)) throw err('시간을 확인하세요.');
        await W.append(SHEET_DUTY_OVR, DUTY_OVR_HEADER, [rule.id, "'" + week, u ? u.id : '', u ? u.name : '', h, req.cancel ? 'Y' : '', String(req.memo || '').slice(0, 200), session.name, nowTxt()]);
      }
    });
    return calAll(session);
  }
  async function calImport(session, req) {
    var cc = await calCtx(), staff = cc.staff.map(function (x) { return Object.assign({}, x); }), byName = {};
    cc.users.forEach(function (u) { byName[u.name] = u.id; });
    var who = function (name) {
      name = String(name || '').trim(); if (!name) throw err('이름이 비어 있는 줄이 있습니다.');
      if (byName[name]) return byName[name];
      var id = 'S' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
      staff.push({ id: id, name: name.slice(0, 30), active: true }); byName[name] = id; return id;
    };
    var res = { leaves: 0, events: 0, grants: 0, skipped: 0, staff: 0 }, n0 = staff.length;
    await edit([SHEET_LEAVES, SHEET_EVENTS, SHEET_GRANTS, SHEET_STAFF], async function (W) {
      await leaveHeader(W);
      var have = {}; (await W.rowsOf(SHEET_LEAVES, LEAVE_HEADER)).forEach(function (r) { have[String(r[2]) + '|' + String(r[3]) + '|' + textDate(r[4])] = 1; });
      var add = [];
      (req.leaves || []).slice(0, 3000).forEach(function (l, i) {
        var v; try { v = cleanLeave(l); } catch (e) { throw err('휴가·근무 ' + (i + 2) + '번째 줄: ' + e.message); }
        var name = String(l.name || '').trim(), key = name + '|' + v.kind + '|' + v.start;
        if (have[key]) { res.skipped++; return; }
        have[key] = 1; add.push(leaveRow(newId('L'), who(name), name, v, session.name + ' (가져오기)')); res.leaves++;
      });
      if (add.length) { var n1 = await W.lastRow(SHEET_LEAVES); if (n1 < 1) { await W.putRows(SHEET_LEAVES, 1, [LEAVE_HEADER]); n1 = 1; } await W.putRows(SHEET_LEAVES, n1 + 1, add); }
      var ehave = {}, eadd = [];
      (await W.rowsOf(SHEET_EVENTS, EVENT_HEADER)).forEach(function (r) { ehave[String(r[3]) + '|' + textDate(r[1])] = 1; });
      (req.events || []).slice(0, 3000).forEach(function (e, i) {
        var title = String(e.title || '').trim().slice(0, 100); if (!title) { res.skipped++; return; }
        var start = checkDate(e.start, '일정 ' + (i + 2) + '번째 줄 시작일'), end = e.end ? checkDate(e.end, '종료일') : start;
        if (ehave[title + '|' + start]) { res.skipped++; return; }
        ehave[title + '|' + start] = 1; eadd.push([newId('C'), "'" + start, "'" + (end < start ? start : end), title, String(e.memo || '').slice(0, 1000), '팀', session.id, session.name, nowTxt()]); res.events++;
      });
      if (eadd.length) { var n2 = await W.lastRow(SHEET_EVENTS); if (n2 < 1) { await W.putRows(SHEET_EVENTS, 1, [EVENT_HEADER]); n2 = 1; } await W.putRows(SHEET_EVENTS, n2 + 1, eadd); }
      var g = req.grants || [];
      if (g.length) {
        var rows = (await W.rowsOf(SHEET_GRANTS, GRANT_HEADER)).map(function (r) { return r.slice(); });
        g.forEach(function (x) {
          var y = String(x.year || ''), d = Number(x.days); if (!/^\d{4}$/.test(y) || !(d >= 0 && d <= 100)) { res.skipped++; return; }
          var id = who(x.name);
          rows = rows.filter(function (r) { return !(String(r[0]) === y && String(r[1]) === id); }).concat([[y, id, String(x.name).trim(), d]]); res.grants++;
        });
        await writeGrants(W, rows);
      }
      res.staff = staff.length - n0;
      if (res.staff) await staffWrite(W, staff);
    });
    return { result: res, cal: await calAll(session) };
  }

  /* ───────────── 견적모음 (읽기 도구 · 견적 접수가 상태를 맞출 때) ───────────── */
  var SHEET_QUOTES = '견적모음';
  var QUOTE_HEADER = ['견적ID', '저장일', '아이디', '이름', '견적명', '거래처', '메모', '상태', '종류', '건수', '상차지', '하차지', '원본기록ID', '조회일', '수정일', '실적연결', '조정', '조정기록'];
  function parseLink(v) { try { return v ? JSON.parse(String(v)) : null; } catch (e) { return null; } }
  function quoteRowToObj(r) {
    return { id: String(r[0]), savedAt: fmtV(r[1]), userId: String(r[2]), userName: String(r[3]), name: String(r[4]), client: String(r[5]), memo: String(r[6]), status: String(r[7]), type: String(r[8]), count: r[9], from: String(r[10]), to: String(r[11]),
      recordId: String(r[12]), queriedAt: fmtV(r[13]), updatedAt: fmtV(r[14]), link: parseLink(r[15]), hasAdj: !!r[16] };
  }
  /** Code.js quotesSheet_: 제목 줄 끝 칸이 다르면 제목을 다시 써요 */
  async function quotesHeader(W) { var h = (await Q(W.tx, 'select sheet_getrow($1, 1) v', [SHEET_QUOTES]))[0].v; if (!h || String(dec(h[QUOTE_HEADER.length - 1] == null ? '' : h[QUOTE_HEADER.length - 1])) !== QUOTE_HEADER[QUOTE_HEADER.length - 1]) await W.putRows(SHEET_QUOTES, 1, [QUOTE_HEADER]); }
  async function findQuote(id, db) { var f = await findRow(SHEET_QUOTES, QUOTE_HEADER, id, db); return f ? { row: f.row, data: quoteRowToObj(f.raw), raw: f.raw } : null; }

  /* ───────────── 견적 접수함 (Code.js reqsList_ … reqsImport_) ───────────── */
  var SHEET_REQS = '견적접수', REQ_HEADER = ['ID', '사업자', '거래처', '제목', '본문', '받은날', '회신기한', '상태', '제출일', '제출요약', '연결견적ID', '담당', '등록자', '등록일시', '수정일시', '기록', '이전접수ID', '연결구분', '상대담당'];
  var SHEET_REQ_FILES = '접수파일', REQ_FILE_HEADER = ['파일ID', '접수ID', '종류', '파일명', '형식', '크기', '올린사람', '올린일시', '단계ID'];
  var REQ_STATUS = ['접수', '검토중', '제출', '수주', '미수주', '보류'];
  var SHEET_REQ_STEPS = '견적진행', REQ_STEP_HEADER = ['ID', '접수ID', '날짜', '종류', '내용', '제출금액', '협력사', '매입금액', '작성자', '작성일시', '수정일시'];
  var REQ_STEP_KINDS = ['요청 받음', '수정 요청', '할인 요청', '협력사 견적', '회신', '제출', '수주', '미수주', '메모'];
  var REQ_LINK_TYPES = ['수정 요청', '재계약', '관련 건'];
  var REQ_TO_QUOTE_STATUS = { '접수': '작성', '검토중': '작성', '보류': '작성', '제출': '제출', '수주': '수주', '미수주': '미수주' };
  function canCost(session) { return !!session && (session.role === 'admin' || (session.perms || []).indexOf('analysis') !== -1); }
  /** Code.js headerSheet_: 제목 칸이 모자라면 늘려요 */
  async function headerFix(W, name, header) { var h = ((await Q(W.tx, 'select sheet_getrow($1, 1) v', [name]))[0].v || []); var n = 0; h.forEach(function (x, i) { if (x !== '' && x != null) n = i + 1; }); if (h.length && n < header.length) await W.putRows(name, 1, [header]); }
  function reqStepRow(r) { return { id: String(r[0]), reqId: String(r[1]), date: textDate(r[2]), kind: String(r[3]), text: String(r[4] || ''), amount: r[5] === '' ? null : Number(r[5]), partner: String(r[6] || ''), cost: r[7] === '' ? null : Number(r[7]), by: String(r[8] || ''), at: fmtV(r[9]) }; }
  async function reqSteps(reqId, session) {
    var see = canCost(session);
    return (await rowsOf(SHEET_REQ_STEPS, REQ_STEP_HEADER)).filter(function (r) { return String(r[1]) === String(reqId); }).map(reqStepRow).map(function (x) { if (!see) { delete x.cost; x.costHidden = true; } return x; })
      .sort(function (a, b) { return (a.date || '9999') < (b.date || '9999') ? -1 : (a.date || '9999') > (b.date || '9999') ? 1 : a.at < b.at ? -1 : 1; });
  }
  function reqRowToObj(r, withBody) {
    var ob = { id: String(r[0]), biz: String(r[1]), cust: String(r[2]), title: String(r[3]), received: textDate(r[5]), due: textDate(r[6]), status: String(r[7]) || '접수',
      submitted: textDate(r[8]), summary: String(r[9] || ''), quoteId: String(r[10] || ''), owner: String(r[11] || ''), by: String(r[12]), at: fmtV(r[13]), updated: fmtV(r[14]),
      prevId: String(r[16] || ''), linkType: String(r[17] || ''), contact: String(r[18] || '') };
    if (withBody) { ob.body = String(r[4] || ''); ob.log = parseJson(r[15], []); } else ob.snippet = String(r[4] || '').replace(/\s+/g, ' ').slice(0, 120);
    return ob;
  }
  /** 시트의 '2번 줄부터 끝까지' (빈 줄 포함 · Code.js getRange(2,1,last-1,n).getValues() 와 같게) */
  /** Code.js getRange(2, 1, getLastRow() - 1, width) — 끝의 빈 줄은 빼요(getLastRow 처럼) */
  async function bodyRows(name, width, db) { var all = await readAll(name, db), n = all.length; while (n > 1 && (all[n - 1] || []).every(function (v) { return v === '' || v == null; })) n--; return all.slice(1, n).map(function (r, i) { var v = []; for (var j = 0; j < width; j++) v.push(readValue(r[j] == null ? '' : r[j])); v._r = i + 2; return v; }); }
  async function findReq(id, db) { if (!id) return null; var hit = (await bodyRows(SHEET_REQS, REQ_HEADER.length, db)).filter(function (r) { return display(r[0]) === String(id); })[0]; return hit ? { row: hit._r, raw: hit } : null; }
  async function reqFiles(reqId, db) {
    return (await bodyRows(SHEET_REQ_FILES, REQ_FILE_HEADER.length, db)).filter(function (r) { return String(r[1]) === String(reqId); }).map(function (r) {
      return { id: String(r[0]), kind: String(r[2]), fileName: String(r[3]), mime: String(r[4]), size: Number(r[5]) || 0, by: String(r[6]), at: fmtV(r[7]), stepId: String(r[8] || '') };
    });
  }
  async function reqsList() {
    var counts = {}, st = {};
    (await bodyRows(SHEET_REQ_FILES, REQ_FILE_HEADER.length)).forEach(function (r) { var k = String(r[1]); var c = counts[k] || (counts[k] = { in: 0, out: 0 }); if (String(r[2]) === '제출') c.out++; else c.in++; });
    (await rowsOf(SHEET_REQ_STEPS, REQ_STEP_HEADER)).forEach(function (r) { var k = String(r[1]), c = st[k] || (st[k] = { n: 0, submit: 0, discount: 0, revise: 0, partner: 0, last: '' }); c.n++;
      var kd = String(r[3]); if (kd === '제출') c.submit++; else if (kd === '할인 요청') c.discount++; else if (kd === '수정 요청') c.revise++; else if (kd === '협력사 견적') c.partner++; var d = textDate(r[2]); if (d > c.last) c.last = d; });
    var list = (await bodyRows(SHEET_REQS, REQ_HEADER.length)).filter(function (r) { return r[0]; }).map(function (r) {
      var ob = reqRowToObj(r, false); ob.files = counts[ob.id] || { in: 0, out: 0 }; ob.steps = st[ob.id] || { n: 0, submit: 0, discount: 0, revise: 0, partner: 0, last: '' }; return ob;
    });
    return { reqs: list.reverse() };
  }
  async function reqsGet(id, session) {
    var f = await findReq(id); if (!f) throw err('접수 건을 찾을 수 없습니다.');
    var ob = reqRowToObj(f.raw, true);
    ob.files = await reqFiles(ob.id);
    ob.steps = await reqSteps(ob.id, session); ob.canCost = canCost(session);
    if (ob.prevId) { var pv = await findReq(ob.prevId); ob.prev = pv ? { id: ob.prevId, title: String(pv.raw[3]), cust: String(pv.raw[2]), received: textDate(pv.raw[5]), status: String(pv.raw[7]) } : null; }
    ob.next = (await bodyRows(SHEET_REQS, REQ_HEADER.length)).filter(function (r) { return String(r[16]) === ob.id; }).map(function (r) { return { id: String(r[0]), title: String(r[3]), linkType: String(r[17] || ''), received: textDate(r[5]), status: String(r[7]) }; });
    if (ob.quoteId) { var q = await findQuote(ob.quoteId); ob.quote = q ? { id: q.data.id, name: q.data.name, status: q.data.status, userName: q.data.userName } : null; }
    return { req: ob };
  }
  function checkReq(r) {
    r = r || {};
    var d = function (v) { v = String(v || '').trim(); if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw err('날짜 형식은 YYYY-MM-DD 입니다: ' + v); return v; };
    var cust = String(r.cust || '').trim(); if (!cust) throw err('거래처를 입력하세요.');
    var title = String(r.title || '').trim(); if (!title) throw err('제목을 입력하세요.');
    return { biz: String(r.biz || '').slice(0, 30), cust: cust.slice(0, 100), title: title.slice(0, 200), body: String(r.body || '').slice(0, 40000), received: d(r.received), due: d(r.due),
      status: REQ_STATUS.indexOf(r.status) !== -1 ? r.status : '접수', submitted: d(r.submitted), summary: String(r.summary || '').slice(0, 3000), quoteId: String(r.quoteId || '').slice(0, 40), owner: String(r.owner || '').slice(0, 50),
      prevId: String(r.prevId || '').slice(0, 40), linkType: REQ_LINK_TYPES.indexOf(r.linkType) !== -1 ? r.linkType : (r.prevId ? '관련 건' : ''), contact: String(r.contact || '').slice(0, 100) };
  }
  async function reqAddLog(W, id, session, text) {
    var found = await findReq(id, W.tx); if (!found) return;
    var log = parseJson(found.raw[15], []); log.push({ at: nowTxt(), by: session.name, text: text }); if (log.length > 200) log = log.slice(-200);
    await W.set(SHEET_REQS, found.row, 15, [nowTxt(), JSON.stringify(log)]);
  }
  async function reqQuoteStatus(W, qid, st) { if (!qid) return; var q = await findQuote(qid, W.tx); if (q) { await quotesHeader(W); await W.set(SHEET_QUOTES, q.row, 8, [REQ_TO_QUOTE_STATUS[st]]); } }
  var REQ_SHEETS = [SHEET_REQS, SHEET_REQ_FILES, SHEET_REQ_STEPS, SHEET_QUOTES];
  async function reqsSave(session, req) {
    var f = checkReq(req.req), now = nowTxt(), who = session.name, id;
    if (f.quoteId && !(await findQuote(f.quoteId))) throw err('연결할 견적모음 건을 찾을 수 없습니다.');
    if (f.prevId && (f.prevId === req.id || !(await findReq(f.prevId)))) throw err('연결할 이전 견적을 찾을 수 없습니다.');
    var row = [f.biz, f.cust, f.title, f.body, "'" + f.received, "'" + f.due, f.status, "'" + f.submitted, f.summary, f.quoteId, f.owner];
    var tail = [f.prevId, f.prevId ? f.linkType : '', f.contact];
    await edit(REQ_SHEETS, async function (W) {
      await headerFix(W, SHEET_REQS, REQ_HEADER);
      var log;
      if (req.id) {
        var found = await findReq(req.id, W.tx); if (!found) throw err('접수 건을 찾을 수 없습니다.');
        var old = reqRowToObj(found.raw, true); id = old.id; log = old.log || [];
        if (old.status !== f.status) log.push({ at: now, by: who, text: '상태 ' + old.status + ' → ' + f.status });
        if (old.quoteId !== f.quoteId) log.push({ at: now, by: who, text: f.quoteId ? '견적모음 연결' : '견적모음 연결 해제' });
        if (old.submitted !== f.submitted && f.submitted) log.push({ at: now, by: who, text: '제출일 ' + f.submitted });
        if (old.summary !== f.summary && f.summary) log.push({ at: now, by: who, text: '제출 단가 요약 수정' });
        if (old.prevId !== f.prevId) log.push({ at: now, by: who, text: f.prevId ? '이전 견적 연결 (' + f.linkType + ')' : '이전 견적 연결 해제' });
        if (log.length > 200) log = log.slice(-200);
        await W.set(SHEET_REQS, found.row, 2, row);
        await W.set(SHEET_REQS, found.row, 15, [now, JSON.stringify(log)].concat(tail));
      } else {
        id = newId('Q');
        log = [{ at: now, by: who, text: '접수 등록' + (f.received ? ' (받은 날 ' + f.received + ')' : '') + (f.prevId ? ' · 이전 견적 연결 (' + f.linkType + ')' : '') }];
        await W.append(SHEET_REQS, REQ_HEADER, [id].concat(row).concat([session.name + ' (' + session.id + ')', now, now, JSON.stringify(log)]).concat(tail));
      }
      await reqQuoteStatus(W, f.quoteId, f.status);
    });
    return reqsGet(id, session);
  }
  async function reqsUpload(session, req) {
    var reqId = String(req.id || ''); if (!(await findReq(req.id))) throw err('접수 건을 찾을 수 없습니다.');
    var kind = req.kind === '제출' ? '제출' : '받은', stepId = String(req.stepId || '');
    if (stepId) { var sf = await findRow(SHEET_REQ_STEPS, REQ_STEP_HEADER, stepId); if (!sf || String(sf.raw[1]) !== reqId) throw err('단계를 찾을 수 없습니다.'); kind = String(sf.raw[3]) === '제출' ? '제출' : '받은'; }
    var data = String(req.data || ''), size = b64len(data); if (!size) throw err('파일이 비어 있습니다.');
    if (size > DOC_MAX_BYTES) throw err('파일은 20MB까지 올릴 수 있습니다.');
    var fileName = String(req.fileName || '파일').replace(/[\\/:*?"<>|]/g, '_').slice(0, 150), mime = String(req.mime || 'application/octet-stream');
    var file = await drive('create', { folder: await docsFolder(), name: fileName, mime: mime, data: data });
    await edit(REQ_SHEETS, async function (W) {
      await headerFix(W, SHEET_REQ_FILES, REQ_FILE_HEADER);
      await W.append(SHEET_REQ_FILES, REQ_FILE_HEADER, [file.id, reqId, kind, fileName, mime, size, session.name, nowTxt(), stepId]);
      await reqAddLog(W, reqId, session, (kind === '제출' ? '제출 파일' : '받은 파일') + ' 추가: ' + fileName);
    });
    return reqsGet(reqId, session);
  }
  async function findReqFile(fileId, db) {
    if (!fileId) return null;
    var hit = (await bodyRows(SHEET_REQ_FILES, REQ_FILE_HEADER.length, db)).filter(function (r) { return display(r[0]) === String(fileId); })[0];
    return hit ? { row: hit._r, id: String(hit[0]), reqId: String(hit[1]), kind: String(hit[2]), fileName: String(hit[3]), mime: String(hit[4]) } : null;
  }
  async function reqsFile(fileId) { var f = await findReqFile(fileId); if (!f) throw err('파일을 찾을 수 없습니다.'); var r = await drive('get', { id: f.id }); return { data: r.data, fileName: f.fileName, mime: f.mime }; }
  async function reqsFileDelete(session, fileId) {
    var f0 = await findReqFile(fileId); if (!f0) throw err('파일을 찾을 수 없습니다.');
    try { await drive('trash', { id: f0.id, on: true }); } catch (e) { /* 이미 없음 */ }
    await edit(REQ_SHEETS, async function (W) { var f = await findReqFile(fileId, W.tx); if (f) await W.del(SHEET_REQ_FILES, f.row); await reqAddLog(W, f0.reqId, session, '파일 삭제: ' + f0.fileName); });
    return reqsGet(f0.reqId, session);
  }
  async function reqsZip(id) {
    var files = await reqFiles(id); if (!files.length) throw err('파일이 없습니다.');
    var used = {}, out = {};
    for (var f of files) {
      var nm = (f.kind === '제출' ? '제출_' : '받은_') + f.fileName, k = 2, base = nm.replace(/(\.[^.]+)?$/, ''), ext = (nm.match(/\.[^.]+$/) || [''])[0];
      while (used[nm]) nm = base + '(' + (k++) + ')' + ext; used[nm] = true;
      out[nm] = Uint8Array.from(atob((await drive('get', { id: f.id })).data), function (ch) { return ch.charCodeAt(0); });
    }
    var z = o.zip(out), bin = ''; for (var i = 0; i < z.length; i += 0x8000) bin += String.fromCharCode.apply(null, z.subarray(i, i + 0x8000));
    return { data: btoa(bin) };
  }
  async function reqsDelete(session, id) {
    var f0 = await findReq(id); if (!f0) throw err('접수 건을 찾을 수 없습니다.');
    if (session.role !== 'admin' && String(f0.raw[12]).indexOf('(' + session.id + ')') === -1) throw err('등록한 사람이나 관리자만 삭제할 수 있습니다.');
    for (var x of await reqFiles(id)) { try { await drive('trash', { id: x.id, on: true }); } catch (e) { /* 무시 */ } }
    await edit(REQ_SHEETS, async function (W) {
      var fr = await bodyRows(SHEET_REQ_FILES, 2, W.tx); for (var i = fr.length - 1; i >= 0; i--) if (String(fr[i][1]) === String(id)) await W.del(SHEET_REQ_FILES, fr[i]._r);
      var sr = await bodyRows(SHEET_REQ_STEPS, 2, W.tx); for (var j = sr.length - 1; j >= 0; j--) if (String(sr[j][1]) === String(id)) await W.del(SHEET_REQ_STEPS, sr[j]._r);
      var f = await findReq(id, W.tx); await W.del(SHEET_REQS, f.row);
    });
    return {};
  }
  function reqStepClean(x) {
    x = x || {};
    var date = String(x.date || '').trim(); if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw err('날짜 형식은 YYYY-MM-DD 입니다: ' + date);
    var kind = REQ_STEP_KINDS.indexOf(x.kind) !== -1 ? x.kind : '메모';
    var num = function (v, nm) { if (v === '' || v == null) return ''; var n = Number(String(v).replace(/[,\s원]/g, '')); if (!isFinite(n) || n < 0) throw err(nm + ' 금액을 확인하세요.'); return n; };
    return { date: date, kind: kind, text: String(x.text || '').slice(0, 20000), amount: num(x.amount, '제출'), partner: String(x.partner || '').trim().slice(0, 60), cost: num(x.cost, '매입') };
  }
  async function reqApplyStep(W, reqId, v, session) {
    var f = await findReq(reqId, W.tx); if (!f) return;
    var st = String(f.raw[7]) || '접수', sub = textDate(f.raw[8]), ns = st, nsub = sub;
    if (v.kind === '제출') { if (['접수', '검토중', '보류'].indexOf(st) !== -1) ns = '제출'; if (v.date && v.date > sub) nsub = v.date; }
    else if (v.kind === '수주' || v.kind === '미수주') ns = v.kind;
    else if ((v.kind === '수정 요청' || v.kind === '할인 요청') && st === '제출') ns = '검토중';
    if (ns === st && nsub === sub) return;
    await W.set(SHEET_REQS, f.row, 8, [ns, "'" + nsub]);
    if (ns !== st) await reqAddLog(W, reqId, session, '상태 ' + st + ' → ' + ns + ' (' + v.kind + ' 단계)');
    var qid = String(f.raw[10] || ''); if (qid && ns !== st) await reqQuoteStatus(W, qid, ns);
  }
  async function reqStepSave(session, req) {
    var reqId = String(req.reqId || ''); if (!(await findReq(reqId))) throw err('접수 건을 찾을 수 없습니다.');
    var v = reqStepClean(req.step), see = canCost(session), now = nowTxt();
    await edit(REQ_SHEETS, async function (W) {
      if (req.id) {
        var f = await W.findRow(SHEET_REQ_STEPS, REQ_STEP_HEADER, req.id); if (!f || String(f.raw[1]) !== reqId) throw err('단계를 찾을 수 없습니다.');
        var cost = see ? v.cost : f.raw[7]; // 분석 권한이 없으면 매입 금액은 그대로 둠
        await W.set(SHEET_REQ_STEPS, f.row, 3, ["'" + v.date, v.kind, v.text, v.amount, v.partner, cost]);
        await W.set(SHEET_REQ_STEPS, f.row, 11, [now]);
        await reqAddLog(W, reqId, session, '진행 기록 수정: ' + v.kind);
      } else {
        await W.append(SHEET_REQ_STEPS, REQ_STEP_HEADER, [newId('P'), reqId, "'" + v.date, v.kind, v.text, v.amount, v.partner, see ? v.cost : '', session.name, now, now]);
        await reqAddLog(W, reqId, session, '진행 기록 추가: ' + v.kind + (v.date ? ' (' + v.date + ')' : ''));
      }
      await reqApplyStep(W, reqId, v, session);
    });
    return reqsGet(reqId, session);
  }
  async function reqStepDelete(session, id) {
    var f0 = await findRow(SHEET_REQ_STEPS, REQ_STEP_HEADER, id); if (!f0) throw err('단계를 찾을 수 없습니다.');
    var reqId = String(f0.raw[1]);
    await edit(REQ_SHEETS, async function (W) {
      for (var x of (await reqFiles(reqId, W.tx)).filter(function (y) { return y.stepId === id; })) { var ff = await findReqFile(x.id, W.tx); if (ff) await W.set(SHEET_REQ_FILES, ff.row, 9, ['']); } // 파일은 남기고 단계 연결만 해제
      var f = await W.findRow(SHEET_REQ_STEPS, REQ_STEP_HEADER, id); await W.del(SHEET_REQ_STEPS, f.row);
      await reqAddLog(W, reqId, session, '진행 기록 삭제: ' + String(f0.raw[3]));
    });
    return reqsGet(reqId, session);
  }
  async function reqsImport(session, req) {
    var items = (req.items || []).slice(0, 500), see = canCost(session), now = nowTxt(), res = { added: 0, skipped: 0, steps: 0 };
    await edit(REQ_SHEETS, async function (W) {
      await headerFix(W, SHEET_REQS, REQ_HEADER);
      var have = {}, byKey = {}, rows = [], steps = [];
      (await bodyRows(SHEET_REQS, REQ_HEADER.length, W.tx)).forEach(function (r) { have[String(r[3]).trim() + '|' + textDate(r[5])] = String(r[0]); });
      items.forEach(function (it, i) {
        var f; try { f = checkReq({ cust: it.cust || '(거래처 미정)', title: it.title, body: it.body, received: it.received, due: it.due, status: it.status, contact: it.contact, owner: it.owner }); } catch (e) { throw err((i + 1) + '번째 견적: ' + e.message); }
        var k = f.title + '|' + f.received;
        if (have[k]) { res.skipped++; if (it.key) byKey[it.key] = have[k]; return; }
        var id = newId('Q') + i; have[k] = id; if (it.key) byKey[it.key] = id;
        var prev = it.prev ? (byKey[it.prev] || '') : '';
        var log = [{ at: now, by: session.name, text: '가져오기로 등록' + (req.source ? ' (' + String(req.source).slice(0, 30) + ')' : '') }];
        rows.push([id, f.biz, f.cust, f.title, f.body, "'" + f.received, "'" + f.due, f.status, "'" + f.submitted, f.summary, '', f.owner, session.name + ' (' + session.id + ')', now, now, JSON.stringify(log), prev, prev ? (REQ_LINK_TYPES.indexOf(it.prevType) !== -1 ? it.prevType : '관련 건') : '', f.contact]);
        (it.steps || []).slice(0, 100).forEach(function (x, j) {
          var v; try { v = reqStepClean(x); } catch (e) { throw err((i + 1) + '번째 견적 ' + (j + 1) + '번째 단계: ' + e.message); }
          steps.push([newId('P') + i + '_' + j, id, "'" + v.date, v.kind, v.text, v.amount, v.partner, see ? v.cost : '', session.name, now, now]);
          if (v.kind === '제출' && v.date) { var rr = rows[rows.length - 1]; if (v.date > String(rr[8]).replace(/^'/, '')) rr[8] = "'" + v.date; }
        });
        res.added++;
      });
      if (rows.length) { var n = await W.lastRow(SHEET_REQS); if (n < 1) { await W.putRows(SHEET_REQS, 1, [REQ_HEADER]); n = 1; } await W.putRows(SHEET_REQS, n + 1, rows); }
      if (steps.length) { var n2 = await W.lastRow(SHEET_REQ_STEPS); if (n2 < 1) { await W.putRows(SHEET_REQ_STEPS, 1, [REQ_STEP_HEADER]); n2 = 1; } await W.putRows(SHEET_REQ_STEPS, n2 + 1, steps); }
      res.steps = steps.length;
    });
    return res;
  }

  /* ───────────── 서류함 (구글 드라이브 · Code.js docsList_ … docsDelete_) ───────────── */
  var SHEET_DOCS = '서류목록', DOCS_HEADER = ['파일ID', '사업자', '분류', '서류명', '파일명', '형식', '크기', '발급일', '만료일', '메모', '올린사람', '올린일시', '수정일시'];
  function docRowToObj(r) {
    return { id: String(r[0]), biz: String(r[1]), cat: String(r[2]), name: String(r[3]), fileName: String(r[4]), mime: String(r[5]), size: Number(r[6]) || 0,
      issued: textDate(r[7]), expires: textDate(r[8]), memo: String(r[9] || ''), by: String(r[10] || ''), at: fmtV(r[11]), updated: fmtV(r[12]) };
  }
  async function docsList() { return { docs: (await bodyRows(SHEET_DOCS, DOCS_HEADER.length)).filter(function (r) { return r[0]; }).map(docRowToObj) }; }
  async function findDoc(id, db) { if (!id) return null; var hit = (await bodyRows(SHEET_DOCS, DOCS_HEADER.length, db)).filter(function (r) { return display(r[0]) === String(id); })[0]; return hit ? { row: hit._r, data: docRowToObj(hit) } : null; }
  function checkDocMeta(m) {
    var name = String(m.name || '').trim(); if (!name) throw err('서류명을 입력하세요.');
    var d = function (v) { v = String(v || '').trim(); if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw err('날짜 형식은 YYYY-MM-DD 입니다: ' + v); return v; };
    return { name: name.slice(0, 100), biz: String(m.biz || '').slice(0, 30), cat: String(m.cat || '기타').slice(0, 30), issued: d(m.issued), expires: d(m.expires), memo: String(m.memo || '').slice(0, 500) };
  }
  async function docsUpload(session, req) {
    var m = checkDocMeta(req), data = String(req.data || ''), size = b64len(data);
    if (!size) throw err('파일이 비어 있습니다.');
    if (size > DOC_MAX_BYTES) throw err('파일은 20MB까지 올릴 수 있습니다.');
    var fileName = String(req.fileName || m.name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 150), mime = String(req.mime || 'application/octet-stream');
    var file = await drive('create', { folder: await docsFolder(), name: fileName, mime: mime, data: data }), now = nowTxt();
    await edit([SHEET_DOCS], function (W) { return W.append(SHEET_DOCS, DOCS_HEADER, [file.id, m.biz, m.cat, m.name, fileName, mime, size, "'" + m.issued, "'" + m.expires, m.memo, session.name + ' (' + session.id + ')', now, now]); });
    return { doc: (await findDoc(file.id)).data };
  }
  async function docsUpdate(session, id, patch) {
    var found = await findDoc(id); if (!found) throw err('서류를 찾을 수 없습니다.');
    var m = checkDocMeta(Object.assign({}, found.data, patch || {}));
    await edit([SHEET_DOCS], async function (W) {
      var f = await findDoc(id, W.tx);
      await W.set(SHEET_DOCS, f.row, 2, [m.biz, m.cat, m.name]); await W.set(SHEET_DOCS, f.row, 8, ["'" + m.issued, "'" + m.expires, m.memo]); await W.set(SHEET_DOCS, f.row, 13, [nowTxt() + ' · ' + session.name]);
    });
    return { doc: (await findDoc(id)).data };
  }
  async function docsGet(id) { var found = await findDoc(id); if (!found) throw err('서류를 찾을 수 없습니다.'); return { doc: found.data, data: (await drive('get', { id: found.data.id })).data }; }
  async function docsZip(ids) {
    ids = (ids || []).slice(0, 50); if (!ids.length) throw err('서류를 고르세요.');
    var used = {}, out = {};
    for (var id of ids) {
      var found = await findDoc(id); if (!found) continue;
      var bytes = Uint8Array.from(atob((await drive('get', { id: found.data.id })).data), function (ch) { return ch.charCodeAt(0); });
      var ext = (found.data.fileName.match(/\.[^.]+$/) || [''])[0], base = ((found.data.biz ? found.data.biz + '_' : '') + found.data.name).replace(/[\\/:*?"<>|]/g, '_'), nm = base + ext, k = 2;
      while (used[nm]) nm = base + '(' + (k++) + ')' + ext; used[nm] = true; out[nm] = bytes;
    }
    var z = o.zip(out), bin = ''; for (var i = 0; i < z.length; i += 0x8000) bin += String.fromCharCode.apply(null, z.subarray(i, i + 0x8000));
    return { data: btoa(bin) };
  }
  async function docsDelete(session, id) {
    var found = await findDoc(id); if (!found) throw err('서류를 찾을 수 없습니다.');
    try { await drive('trash', { id: found.data.id, on: true }); } catch (e) { /* 이미 없음 */ }
    await edit([SHEET_DOCS], async function (W) { var f = await findDoc(id, W.tx); if (f) await W.del(SHEET_DOCS, f.row); });
    console.log('서류 삭제: ' + found.data.name + ' by ' + session.id);
    return {};
  }

  /* ───────────── 주간 업무 요약 (사이트 + 메일 · Code.js weekly_ · weeklyHtml_ · weeklySend_) ───────────── */
  function addD(st, n) { var d = new Date(Date.UTC(+st.slice(0, 4), +st.slice(5, 7) - 1, +st.slice(8, 10)) + n * 86400000); return d.toISOString().slice(0, 10); }
  function dowD(st) { return new Date(Date.UTC(+st.slice(0, 4), +st.slice(5, 7) - 1, +st.slice(8, 10))).getUTCDay(); }
  function holiMap(cal) { var m = {}; (cal.holidays || []).forEach(function (h) { (m[h.date] = m[h.date] || []).push({ name: h.name, off: h.off }); }); (cal.companyHolidays || []).forEach(function (h) { (m[h.date] = m[h.date] || []).push({ name: h.name, off: true }); }); return m; }
  function isOffD(st, holi) { var w = dowD(st); return w === 0 || w === 6 || (holi[st] || []).some(function (h) { return h.off; }); }
  function taskOccD(t, from, to, holi, today) {
    if (!t.active) return [];
    var r = t.rule || {}, bases = [], lo = addD(from, -10), hi = addD(to, 10), x;
    if (r.type === 'once') bases = [r.date];
    else if (r.type === 'daily') { if (today >= from && today <= to && (r.workdays === false || !isOffD(today, holi))) bases = [today]; }
    else if (r.type === 'weekly') { for (x = lo; x <= hi; x = addD(x, 1)) if (dowD(x) === Number(r.dow)) bases.push(x); }
    else for (x = lo.slice(0, 7) + '-01'; x <= hi; x = addD(x.slice(0, 7) + '-28', 7).slice(0, 7) + '-01') {
      var y = +x.slice(0, 4), m = +x.slice(5, 7), n = new Date(Date.UTC(y, m, 0)).getUTCDate(), ym = x.slice(0, 7);
      if (r.type === 'monthEnd') bases.push(ym + '-' + ('0' + n).slice(-2));
      else if (r.type === 'monthDay') bases.push(ym + '-' + ('0' + Math.min(r.day, n)).slice(-2));
      else if (r.type === 'yearly' && m === Number(r.month)) bases.push(ym + '-' + ('0' + Math.min(r.day, n)).slice(-2));
    }
    return bases.filter(function (b) { return b && (!t.start || b >= t.start); }).map(function (b) {
      var date = b;
      if (r.type !== 'weekly' && r.type !== 'daily' && t.adjust !== 'none') { var k = 0; while (isOffD(date, holi) && k++ < 15) date = addD(date, t.adjust === 'next' ? 1 : -1); }
      return { task: t, base: b, date: date };
    }).filter(function (ob) { return ob.date >= from && ob.date <= to; });
  }
  function dutyEntD(cal, from, to, holi) {
    var out = [], real = {}, ovr = {};
    cal.leaves.forEach(function (l) { if (l.kind === '당직') real[l.name + '|' + l.start] = 1; });
    (cal.dutyOverrides || []).forEach(function (x) { ovr[x.ruleId + '|' + x.week] = x; });
    (cal.dutyRules || []).forEach(function (r) {
      if (!r.active || !r.members.length) return;
      var w = mondayOf(from); if (w < r.start) w = r.start;
      for (; w <= to; w = addD(w, 7)) {
        var n = Math.round((Date.parse(w) - Date.parse(r.start)) / 604800000), m = r.members[((n % r.members.length) + r.members.length) % r.members.length];
        var ov = ovr[r.id + '|' + w]; if (ov && ov.cancel) continue;
        var who = ov && ov.name ? ov.name : m.name, h = ov && ov.hours != null ? ov.hours : r.hours;
        if (r.mode === 'week') { if (!real[who + '|' + w]) out.push({ kind: '당직', label: r.name, name: who, start: w, end: addD(w, 6), hours: h }); }
        else for (var k = 0; k < 7; k++) {
          var day = addD(w, k), hol = (holi[day] || []).some(function (z) { return z.off; });
          if ((r.days.indexOf(dowD(day)) !== -1 || (r.holidays && hol)) && !real[who + '|' + day]) out.push({ kind: '당직', label: r.name, name: who, start: day, end: day, hours: h });
        }
      }
    });
    return out.filter(function (l) { return l.end >= from && l.start <= to; });
  }
  var OT_KINDS = ['야간근무', '휴일근무', '당직'];
  function otDate(l) { return l.kind === '당직' ? l.end : l.start; }
  async function ownerCover(cal, from, to) {
    var off = {};
    cal.leaves.forEach(function (l) { if (/근무|당직/.test(l.kind) || l.end < from || l.start > to) return; (off[l.name] = off[l.name] || []).push(l); });
    return (await o.ownersList()).owners.filter(function (x) { return x.main && off[x.main]; }).map(function (x) { var l = off[x.main][0]; return { task: x.task, cust: x.cust, main: x.main, sub: x.sub, kind: l.kind, start: l.start, end: l.end }; });
  }
  async function weekly(week, session) {
    var today = ymdNow(), w = mondayOf(week ? checkDate(week, '주') : today), we = addD(w, 6), lw = addD(w, -7), lwe = addD(w, -1);
    var cal = await calAll(session || { id: '', role: '' }), holi = holiMap(cal), quote = !session || (session.perms || []).indexOf('quote') !== -1;
    var res = { week: w, weekEnd: we, lastWeek: lw, today: today, holidays: [], ot: [], duty: [], leaves: [], tasks: [], overdue: 0, reqs: null, contracts: [], docs: [], notices: [] };
    for (var d = w; d <= we; d = addD(d, 1)) (holi[d] || []).forEach(function (h) { if (h.off) res.holidays.push({ date: d, name: h.name }); });
    var by = {};
    cal.leaves.concat(dutyEntD(cal, addD(lw, -7), lwe, holi)).forEach(function (l) {
      if (OT_KINDS.indexOf(l.kind) === -1) return; var k = otDate(l); if (k < lw || k > lwe) return;
      var x = by[l.name] || (by[l.name] = { name: l.name, '야간근무': 0, '휴일근무': 0, '당직': 0, total: 0 });
      x[l.kind] += Number(l.hours) || 0; x.total += Number(l.hours) || 0;
    });
    res.ot = Object.keys(by).sort().map(function (k) { return by[k]; });
    var dmap = {};
    cal.leaves.filter(function (l) { return l.kind === '당직'; }).concat(dutyEntD(cal, w, we, holi)).forEach(function (l) {
      if (l.end < w || l.start > we) return; var lab = l.label || (l.memo && l.memo.length <= 10 ? l.memo : '당직'), k = lab + '|' + l.name;
      var x = dmap[k] || (dmap[k] = { label: lab, name: l.name, days: [] }); x.days.push(l.start < w ? w : l.start); x.end = l.end > we ? we : l.end;
    });
    res.duty = Object.keys(dmap).map(function (k) { var x = dmap[k]; x.days.sort(); return { label: x.label, name: x.name, from: x.days[0], to: x.end }; }).sort(function (a, b) { return a.label.localeCompare(b.label); });
    res.leaves = cal.leaves.filter(function (l) { return l.kind !== '당직' && l.end >= w && l.start <= we; }).map(function (l) { return { name: l.name, kind: l.kind, start: l.start, end: l.end, hours: l.hours }; }).sort(function (a, b) { return a.start < b.start ? -1 : 1; });
    var done = {}; cal.done.forEach(function (x) { done[x.taskId + '|' + x.date] = 1; });
    cal.tasks.forEach(function (t) {
      taskOccD(t, w, we, holi, today).forEach(function (x) { if (!done[t.id + '|' + x.base]) res.tasks.push({ date: x.date, cust: t.cust, title: t.title, who: t.assignee || '팀 전체' }); });
      taskOccD(t, addD(today, -90), addD(w < today ? today : w, -1), holi, today).forEach(function (x) { if (!done[t.id + '|' + x.base] && x.date < today) res.overdue++; });
    });
    res.tasks.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (quote) {
      var rq = { received: 0, submitted: 0, won: 0, lost: 0, open: 0, due: [] };
      (await rowsOf(SHEET_REQS, REQ_HEADER)).forEach(function (r) {
        var ob = reqRowToObj(r, false), log = parseJson(r[15], []);
        if (ob.received >= lw && ob.received <= lwe) rq.received++;
        if (ob.submitted >= lw && ob.submitted <= lwe) rq.submitted++;
        log.forEach(function (x) { var dd = String(x.at).slice(0, 10); if (dd >= lw && dd <= lwe) { if (/→ 수주$/.test(x.text)) rq.won++; if (/→ 미수주$/.test(x.text)) rq.lost++; } });
        if (ob.status === '접수' || ob.status === '검토중') { rq.open++; if (ob.due && ob.due <= we) rq.due.push({ date: ob.due, cust: ob.cust, title: ob.title, late: ob.due < today }); }
      });
      rq.due.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      res.reqs = rq;
      var lim = addD(today, 30);
      (await custsList()).custs.forEach(function (c) { if (c.end && c.end <= lim && c.end >= addD(today, -7)) res.contracts.push({ name: c.name, end: c.end }); });
      (await docsList()).docs.forEach(function (x) { if (x.expires && x.expires <= lim && x.expires >= addD(today, -7)) res.docs.push({ name: (x.biz ? x.biz + ' ' : '') + x.name, end: x.expires }); });
      res.contracts.sort(function (a, b) { return a.end < b.end ? -1 : 1; }); res.docs.sort(function (a, b) { return a.end < b.end ? -1 : 1; });
    }
    res.cover = await ownerCover(cal, w, we);
    var since = addD(today, -14);
    res.notices = (await o.noticesList()).filter(function (n) { return n.pinned || n.at.slice(0, 10) >= since; }).slice(0, 8).map(function (n) { return { title: n.title, body: n.body.slice(0, 300), pinned: n.pinned, owner: n.owner, at: n.at.slice(0, 10) }; });
    return res;
  }
  function md(st) { return (+st.slice(5, 7)) + '/' + (+st.slice(8, 10)); }
  function weeklyHtml(x) {
    var H = function (v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var WDN = ['일', '월', '화', '수', '목', '금', '토'], wd = function (v) { return md(v) + '(' + WDN[dowD(v)] + ')'; };
    var sec = function (t, inner) { return '<h3 style="font-size:15px;margin:22px 0 8px;color:#1E1C19;border-left:4px solid #F07A22;padding-left:8px">' + t + '</h3>' + inner; };
    var tbl = function (head, rows) { return rows.length ? '<table style="border-collapse:collapse;width:100%;font-size:13px">' + '<tr>' + head.map(function (h) { return '<th style="text-align:left;background:#F4EEE3;padding:6px 8px;border:1px solid #DCD2C1">' + h + '</th>'; }).join('') + '</tr>' + rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td style="padding:6px 8px;border:1px solid #DCD2C1">' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>' : '<p style="color:#7A7265;font-size:13px;margin:0">없음</p>'; };
    var h = '<div style="font-family:\'Malgun Gothic\',sans-serif;max-width:680px;color:#1E1C19">' +
      '<div style="height:6px;background:linear-gradient(90deg,#E0472E 0 20%,#F07A22 20% 40%,#F4BE2E 40% 60%,#4FA864 60% 80%,#2A9DB0 80%)"></div>' +
      '<h2 style="margin:14px 0 2px">JOIL 주간 업무 요약</h2><p style="color:#7A7265;margin:0 0 6px">' + wd(x.week) + ' ~ ' + wd(x.weekEnd) + (x.holidays.length ? ' · 공휴일: ' + x.holidays.map(function (d) { return H(md(d.date) + ' ' + d.name); }).join(', ') : '') + '</p>';
    if (x.notices.length) h += sec('📢 공지', x.notices.map(function (n) { return '<div style="background:#FBF8F2;border:1px solid #DCD2C1;border-radius:8px;padding:8px 10px;margin-bottom:6px"><b>' + (n.pinned ? '📌 ' : '') + H(n.title) + '</b> <span style="color:#7A7265;font-size:12px">' + H(n.owner) + ' · ' + H(n.at) + '</span>' + (n.body ? '<div style="font-size:13px;white-space:pre-wrap;margin-top:4px">' + H(n.body) + '</div>' : '') + '</div>'; }).join(''));
    h += sec('🛡 이번 주 당직', tbl(['구분', '담당', '기간'], x.duty.map(function (d) { return [H(d.label), '<b>' + H(d.name) + '</b>', d.from === d.to ? wd(d.from) : wd(d.from) + ' ~ ' + wd(d.to)]; })));
    if (x.cover && x.cover.length) h += sec('🔁 휴가로 대신 맡는 업무', tbl(['업무', '주담당 (휴가)', '대신', '기간'], x.cover.map(function (c) { return [H(c.task) + (c.cust ? ' <span style="color:#7A7265">' + H(c.cust) + '</span>' : ''), H(c.main) + ' · ' + H(c.kind), '<b>' + H(c.sub || '미정') + '</b>', c.start === c.end ? wd(c.start) : wd(c.start) + ' ~ ' + wd(c.end)]; })));
    h += sec('🌴 이번 주 휴가·근무', tbl(['이름', '종류', '날짜'], x.leaves.map(function (l) { return [H(l.name), H(l.kind) + (l.hours ? ' ' + l.hours + 'h' : ''), l.start === l.end ? wd(l.start) : wd(l.start) + ' ~ ' + wd(l.end)]; })));
    h += sec('✅ 이번 주 할 일' + (x.overdue ? ' <span style="color:#E0472E;font-size:13px">(밀린 할 일 ' + x.overdue + '건)</span>' : ''), tbl(['기한', '할 일', '담당'], x.tasks.map(function (t) { return [wd(t.date), (t.cust ? '[' + H(t.cust) + '] ' : '') + H(t.title), H(t.who)]; })));
    if (x.reqs) {
      h += sec('📨 견적', '<p style="font-size:13px;margin:0 0 8px">지난주 접수 <b>' + x.reqs.received + '</b> · 제출 <b>' + x.reqs.submitted + '</b> · 수주 <b>' + x.reqs.won + '</b> · 미수주 <b>' + x.reqs.lost + '</b> · 지금 진행 중 <b>' + x.reqs.open + '</b>건</p>' +
        tbl(['회신 기한', '거래처', '제목'], x.reqs.due.map(function (r) { return [(r.late ? '<b style="color:#E0472E">' + wd(r.date) + ' 지남</b>' : wd(r.date)), H(r.cust), H(r.title)]; })));
      if (x.contracts.length || x.docs.length) h += sec('⏰ 만료 임박 (30일)', tbl(['구분', '이름', '만료일'], x.contracts.map(function (c) { return ['계약', H(c.name), wd(c.end)]; }).concat(x.docs.map(function (c) { return ['서류', H(c.name), wd(c.end)]; }))));
    }
    h += sec('⏱ 지난주 추가근무', tbl(['이름', '야간근무', '휴일근무', '당직', '합계'], x.ot.map(function (ob) { return [H(ob.name), ob['야간근무'] || '–', ob['휴일근무'] || '–', ob['당직'] || '–', '<b>' + ob.total + '시간</b>']; })));
    return h + '<p style="color:#7A7265;font-size:12px;margin-top:24px">JOIL · 조일그룹 견적·실적 시스템에서 자동으로 보낸 메일이에요. 받지 않으려면 관리자에게 말씀해 주세요.</p></div>';
  }
  /** 주간 요약 메일 (금액 없음 — 견적은 건수만) · 메일은 구글 쪽(int.drive mail)이 보내요 */
  async function weeklySend(week, onlyMe) {
    var x = await weekly(week, null), staff = await calStaff(), to;
    if (onlyMe) {
      var me = staff.filter(function (s2) { return s2.email && (s2.account === onlyMe.id || s2.name === onlyMe.name); })[0];
      if (!me) throw err('직원 목록에서 내 이름(또는 계정)에 메일 주소를 먼저 넣으세요.');
      to = [me.email];
    } else to = staff.filter(function (s2) { return s2.active && s2.weekly && s2.email; }).map(function (s2) { return s2.email; });
    if (!to.length) throw err('"주간 요약 받기"를 체크한 직원이 없어요.');
    var subj = '[JOIL] 주간 업무 요약 ' + md(x.week) + '~' + md(x.weekEnd), html = weeklyHtml(x);
    for (var e of to) await drive('mail', { to: e, subject: subj, htmlBody: html, name: 'JOIL 조일그룹' });
    return { sent: to.length, to: to };
  }

  /* ───────────── 견적 계산 공통 (설정 · 타리프 · 버전 · 경유가 · 카카오 주소·경로 캐시) ───────────── */
  // Calc.js(견적 계산식)는 그대로: 함수 입구가 글자로 넘겨 주면 여기서 한 번 읽어요
  var CALC = null;
  function calc() {
    if (!CALC) CALC = new Function(String(o.calcSrc || '') + '\n;return { joilDefaultSettings: joilDefaultSettings, joilMergeSettings: joilMergeSettings, joilFindTon: joilFindTon, joilNormalizeAddress: joilNormalizeAddress, joilComputeQuote: joilComputeQuote, joilValidateTariff: joilValidateTariff };')();
    return CALC;
  }
  var SHEET_TARIFF = '타리프', SHEET_LOG = '조회기록', SHEET_SNAP = '스냅샷', SHEET_QDATA = '견적데이터', SHEET_VER = '타리프버전';
  var SHEET_GEO_CACHE = '주소캐시', SHEET_ROUTE_CACHE = '경로캐시', SHEET_DIESEL = '유가기록', SHEET_RATES = '업체단가', SHEET_CUSTSET = '업체설정';
  var PACK_HEADER = ['ID', '저장시각', '아이디', '데이터'], VER_HEADER = ['버전ID', '처음 사용', '사용자', '데이터1', '데이터2', '데이터3'];
  var LOG_HEADER = ['일시', '아이디', '이름', '상차지', '하차지', '거리(km)', '비고', '기록ID', '종류', '건수'];
  var GEO_HEADER = ['주소(입력)', '위도', '경도', '시도', '찾은 주소', '저장일'], ROUTE_HEADER = ['경로키', '거리(km)', '통행료', '저장일'];
  var DIESEL_HEADER = ['날짜', '경유(원/L)', '출처', '기록시각'];
  var RATES_HEADER = ['업체', '상차지', '하차지', '톤수', '단가', '적용시작일', '비고', '올린사람', '올린일시'], CUSTSET_HEADER = ['업체', '특수운임', '메모', '수정일시'];
  var CALC_KEYS = ['tons', 'maxKm', 'kmRounding', 'priceRounding', 'regionRules', 'downhill', 'specials'];
  var BATCH_CHUNK_MAX = 50, ADJ_MAX = 5000, QUOTE_STATUS = ['작성', '제출', '수주', '미수주'];
  function md5(v) { return createHash('md5').update(String(v), 'utf8').digest('hex'); }
  function firstToken(v) { return String(v || '').split(' ')[0]; }
  function packJson(obj) { return Buffer.from(gzipSync(Buffer.from(JSON.stringify(obj), 'utf8'))).toString('base64'); }
  function unpackJson(v) { return JSON.parse(Buffer.from(gunzipSync(Buffer.from(String(v), 'base64'))).toString('utf8')); }
  async function getSettings(db) { var raw = await propGet('SETTINGS', db); return calc().joilMergeSettings(raw ? JSON.parse(raw) : null); }
  async function readTariff(db) {
    var all = await readAll(SHEET_TARIFF, db);
    return { tons: (all[0] || []).slice(1).map(function (v) { return String(readValue(v == null ? '' : v)); }), rows: all.slice(1).map(function (r) { return r.slice(1).map(function (v) { return Number(readValue(v == null ? '' : v)) || 0; }); }) };
  }
  function calcPart(st) { var ob = {}; CALC_KEYS.forEach(function (k) { ob[k] = st[k]; }); return ob; }
  async function currentVersion(session) {
    var content = { s: calcPart(await getSettings()), t: (await readTariff()).rows };
    var id = 'V' + md5(JSON.stringify(content)).slice(0, 12);
    if (!(await findRow(SHEET_VER, VER_HEADER, id))) {
      var packed = packJson(content), parts = [];
      for (var i = 0; i < packed.length; i += CELL_LIMIT) parts.push(packed.slice(i, i + CELL_LIMIT));
      if (parts.length > 3) throw err('타리프 버전 데이터가 너무 큽니다.');
      while (parts.length < 3) parts.push('');
      var at = nowTxt(), who = session ? session.name + ' (' + session.id + ')' : '';
      await edit([SHEET_VER], async function (W) { await W.append(SHEET_VER, VER_HEADER, [id, at, who].concat(parts)); await verMirror(W.tx, id, at, who, content); });
    }
    return id;
  }
  async function loadVersion(id) {
    var all = id ? await readAll(SHEET_VER) : [], row = null;
    for (var i = 1; i < all.length; i++) if (display(readValue(all[i][0] == null ? '' : all[i][0])) === String(id)) { row = all[i].map(function (v) { return readValue(v == null ? '' : v); }); break; }
    if (!row) return null;
    var c = unpackJson(String(row[3] || '') + String(row[4] || '') + String(row[5] || '')), st = await getSettings();
    CALC_KEYS.forEach(function (k) { st[k] = c.s[k]; });
    return { settings: st, tariff: { tons: c.s.tons.map(function (t) { return t.name; }), rows: c.t }, at: fmtV(row[1]) };
  }
  /* 경유가 (Code.js dieselHistoryMap_ · upsertDiesel_ · recordDieselDaily · dieselPrice_) */
  function dieselDate(v) { return v instanceof Date ? formatDate(v, '', 'yyyy-MM-dd') : String(v).replace(/^'/, ''); }
  async function dieselHistoryMap(db) {
    var out = {}; (await readAll(SHEET_DIESEL, db)).slice(1).forEach(function (r) {
      var d = dieselDate(readValue(r[0] == null ? '' : r[0])), pr = Number(readValue(r[1] == null ? '' : r[1]));
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && pr > 0) out[d] = { price: pr, source: String(readValue(r[2] == null ? '' : r[2]) || '') };
    });
    return out;
  }
  async function upsertDiesel(entries) {
    if (!entries.length) return 0;
    await edit([SHEET_DIESEL], async function (W) {
      var all = await readAll(SHEET_DIESEL, W.tx), rows = all.slice(1).filter(function (r) { return r.some(function (v) { return v !== '' && v != null; }); }), at = {};
      rows.forEach(function (r, i) { at[dieselDate(readValue(r[0] == null ? '' : r[0]))] = i; });
      var now = nowTxt();
      entries.forEach(function (e) { var row = ["'" + e.date, Math.round(e.price * 100) / 100, e.source, now].map(sheetValue); if (at[e.date] != null) rows[at[e.date]] = row; else { at[e.date] = rows.length; rows.push(row); } });
      rows.sort(function (a, b) { var x = String(a[0] instanceof Date ? formatDate(a[0], '', 'yyyy-MM-dd') : a[0]), y = String(b[0] instanceof Date ? formatDate(b[0], '', 'yyyy-MM-dd') : b[0]); return x < y ? -1 : x > y ? 1 : 0; }); // 날짜순 (글자 날짜)
      if (all.length < 1) await W.putRows(SHEET_DIESEL, 1, [DIESEL_HEADER]);
      await Q(W.tx, 'select sheet_write($1, $2::text::jsonb)', [SHEET_DIESEL, JSON.stringify(rows.map(function (v, i) { return { r: i + 2, v: v.map(enc) }; }))]);
    });
    await cacheDel('DIESEL_TODAY');
    return entries.length;
  }
  async function recordDieselDaily() {
    var key = await propGet('OPINET_KEY'); if (!key) throw err('오피넷 키가 없습니다. 관리자 > API 키에서 입력하세요.');
    if (!netFetch) throw err('인터넷 없음');
    var res = await netFetch('https://www.opinet.co.kr/api/avgRecentPrice.do?out=json&prodcd=D047&code=' + encodeURIComponent(key)); if (res.status !== 200) throw err('오피넷 응답 오류 (' + res.status + ')');
    var oils = (JSON.parse(await res.text()).RESULT || {}).OIL || [];
    var entries = oils.filter(function (x) { return !x.PRODCD || x.PRODCD === 'D047'; }).map(function (x) { var d = String(x.DATE || x.TRADE_DT || ''); return { date: d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8), price: Number(x.PRICE), source: '오피넷 전국평균' }; })
      .filter(function (e) { return /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.price > 0; });
    if (!entries.length) throw err('오피넷에서 받은 경유가가 없습니다.');
    await upsertDiesel(entries);
    await sql.begin(function (tx) { return propSet(tx, 'DIESEL_LAST_FETCH', ymdNow()); });
    return entries.length;
  }
  async function dieselStatus() {
    var h = await dieselHistoryMap(), dates = Object.keys(h).sort();
    return { count: dates.length, first: dates[0] || '', last: dates[dates.length - 1] || '', lastPrice: dates.length ? h[dates[dates.length - 1]].price : null, triggerOn: false, hasKey: !!(await propGet('OPINET_KEY')) };
  }
  async function dieselPrice() {
    var st = await getSettings(), manual = { price: Number(st.fuel.manualPrice) || 0, source: '관리자 기본값' };
    if (st.fuel.mode !== 'auto') return manual;
    var hit = await cacheGet('DIESEL_TODAY'); if (hit) return JSON.parse(hit);
    var today = ymdNow();
    if ((await propGet('OPINET_KEY')) && (await propGet('DIESEL_LAST_FETCH')) !== today) { try { await recordDieselDaily(); } catch (e) { await sql.begin(function (tx) { return propSet(tx, 'DIESEL_LAST_FETCH', today); }); } }
    var h = await dieselHistoryMap(), dates = Object.keys(h).sort();
    if (!dates.length) { manual.source = '관리자 기본값 (유가 기록 없음)'; return manual; }
    var d = dates[dates.length - 1], out = { price: Math.round(h[d].price), source: (h[d].source || '오피넷') + ' (' + d + ')' };
    await cachePut('DIESEL_TODAY', JSON.stringify(out), 3600); return out;
  }
  async function dieselRecent(n) { var h = await dieselHistoryMap(), dates = Object.keys(h).sort().slice(-n); return { now: await dieselPrice(), rows: dates.map(function (d) { return [d, h[d].price]; }) }; }
  /* 카카오 (주소 → 좌표 · 경로) : 조회한 것은 시트(표)에 계속 저장해 다시 씀 */
  async function kakaoKey() { var k = await propGet('KAKAO_REST_KEY'); if (!k) throw err('카카오 REST 키가 설정되지 않았습니다. 관리자 > API 키에서 입력하세요.'); return k; }
  function kakaoError(code) { if (code === 401 || code === 403) return '카카오 키 인증 실패 (키와 사용 설정을 확인하세요)'; if (code === 429) return '카카오 호출 한도 초과 (잠시 후 다시 시도)'; return '카카오 API 오류 (' + code + ')'; }
  async function fetchAllKakao(urls) {
    var key = await kakaoKey(), out = new Array(urls.length), todo = urls.map(function (u, i) { return i; });
    for (var attempt = 0; attempt < 2 && todo.length; attempt++) {
      if (attempt > 0) await new Promise(function (r) { setTimeout(r, 1200); });
      var res = await Promise.all(todo.map(function (i) { return netFetch(urls[i], { headers: { Authorization: 'KakaoAK ' + key } }).then(function (r) { return r.text().then(function (t) { return { code: r.status, text: t }; }); }, function () { return { code: 599, text: '' }; }); }));
      var retry = [];
      res.forEach(function (r, j) { var i = todo[j]; if ((r.code === 429 || r.code >= 500) && attempt === 0) { retry.push(i); return; } var json = null; try { json = JSON.parse(r.text); } catch (e) { /* 무시 */ } out[i] = { code: r.code, json: json }; });
      todo = retry;
    }
    return out;
  }
  async function cacheRows(name, header, keys, parseRow) {
    var want = {}, found = {}; keys.forEach(function (k) { want[k] = 1; });
    (await readAll(name)).slice(1).forEach(function (r) { var row = header.map(function (h, j) { return readValue(r[j] == null ? '' : r[j]); }), k = String(row[0]); if (want[k]) found[k] = parseRow(row); });
    return found;
  }
  async function cacheAdd(name, header, rows) { if (!rows.length) return; try { await edit([name], async function (W) { var n = await W.lastRow(name); if (n < 1) { await W.putRows(name, 1, [header]); n = 1; } await W.putRows(name, n + 1, rows); }); } catch (e) { /* 저장 못 해도 계산에는 영향 없음 */ } }
  async function geocodeMany(queries) {
    var uniq = [], seen = {}; queries.forEach(function (q) { if (q && !seen[q]) { seen[q] = true; uniq.push(q); } });
    var found = await cacheRows(SHEET_GEO_CACHE, GEO_HEADER, uniq, function (row) { return { lat: Number(row[1]), lng: Number(row[2]), sido: String(row[3]), address: String(row[4]) }; });
    var missing = uniq.filter(function (q) { return !found[q]; }); if (!missing.length) return found;
    var res = await fetchAllKakao(missing.map(function (q) { return 'https://dapi.kakao.com/v2/local/search/address.json?size=1&query=' + encodeURIComponent(q); })), needKeyword = [];
    res.forEach(function (r, i) {
      var q = missing[i]; if (r.code !== 200) { found[q] = { error: kakaoError(r.code) }; return; }
      var doc = r.json.documents && r.json.documents[0]; if (!doc) { needKeyword.push(q); return; }
      var region = doc.address || doc.road_address || {};
      found[q] = { lat: Number(doc.y), lng: Number(doc.x), sido: region.region_1depth_name || firstToken(doc.address_name), address: doc.address_name };
    });
    if (needKeyword.length) (await fetchAllKakao(needKeyword.map(function (q) { return 'https://dapi.kakao.com/v2/local/search/keyword.json?size=1&query=' + encodeURIComponent(q); }))).forEach(function (r, i) {
      var q = needKeyword[i]; if (r.code !== 200) { found[q] = { error: kakaoError(r.code) }; return; }
      var doc = r.json.documents && r.json.documents[0]; if (!doc) { found[q] = { error: '주소를 찾지 못했습니다 ("' + q + '")' }; return; }
      found[q] = { lat: Number(doc.y), lng: Number(doc.x), sido: firstToken(doc.address_name), address: doc.address_name + (doc.place_name ? ' (' + doc.place_name + ')' : '') };
    });
    var today = nowTxt();
    await cacheAdd(SHEET_GEO_CACHE, GEO_HEADER, missing.filter(function (q) { return found[q] && !found[q].error; }).map(function (q) { var pt = found[q]; return [q, pt.lat, pt.lng, pt.sido, pt.address, today]; }));
    return found;
  }
  function routeKey(a, d, tollClass) { return a.lng.toFixed(6) + ',' + a.lat.toFixed(6) + '>' + d.lng.toFixed(6) + ',' + d.lat.toFixed(6) + '#' + tollClass; }
  async function routeMany(list, tollClass) {
    var keys = [], byKey = {}; list.forEach(function (x) { var k = routeKey(x.origin, x.dest, tollClass); if (!byKey[k]) { byKey[k] = x; keys.push(k); } });
    var found = await cacheRows(SHEET_ROUTE_CACHE, ROUTE_HEADER, keys, function (row) { return { km: Number(row[1]), toll: Number(row[2]) }; });
    var missing = keys.filter(function (k) { return !found[k]; }); if (!missing.length) return found;
    var res = await fetchAllKakao(missing.map(function (k) { var x = byKey[k]; return 'https://apis-navi.kakaomobility.com/v1/directions?summary=true&priority=RECOMMEND&car_fuel=DIESEL&car_type=' + tollClass + '&origin=' + x.origin.lng + ',' + x.origin.lat + '&destination=' + x.dest.lng + ',' + x.dest.lat; }));
    var fresh = [], today = nowTxt();
    res.forEach(function (r, i) {
      var k = missing[i]; if (r.code !== 200) { found[k] = { error: kakaoError(r.code) }; return; }
      var route = r.json && r.json.routes && r.json.routes[0];
      if (!route || route.result_code !== 0) { found[k] = { error: '경로 없음: ' + ((route && route.result_msg) || '알 수 없음') }; return; }
      var v = { km: route.summary.distance / 1000, toll: (route.summary.fare && route.summary.fare.toll) || 0 }; found[k] = v; fresh.push([k, v.km, v.toll, today]);
    });
    await cacheAdd(SHEET_ROUTE_CACHE, ROUTE_HEADER, fresh);
    return found;
  }
  /* 업체별 특수 추가운임 (Code.js custSpecials_ · resolveSpecials_) */
  async function custSpecials(cust) { if (!cust) return null; var f = await findRow(SHEET_CUSTSET, CUSTSET_HEADER, cust); return f ? parseJson(f.raw[1], null) : null; }
  async function resolveSpecials(st, ids, cust) {
    ids = (ids || []).map(String); if (!ids.length) return [];
    var over = (await custSpecials(cust)) || {};
    return (st.specials || []).filter(function (sp) { return ids.indexOf(sp.id) !== -1; }).map(function (sp) { var x = over[sp.id]; return x ? { id: sp.id, name: sp.name, mode: x.mode || sp.mode, values: x.values || {}, cust: cust } : { id: sp.id, name: sp.name, mode: sp.mode, values: sp.values || {} }; });
  }
  /** 주소 → 좌표 → 경로 → 계산 (한 건이 실패해도 나머지는 계속) */
  async function quoteMany(pairs, req, ver) {
    var st = ver ? ver.settings : await getSettings(), tariff = ver ? ver.tariff : await readTariff(), C = calc();
    var baseTon = C.joilFindTon(st, req.baseTon) || C.joilFindTon(st, st.milkrun.baseTon) || st.tons[0], tollClass = Number(baseTon.tollClass) || 1;
    var specials = req.specialsResolved || await resolveSpecials(st, req.specials, req.cust);
    var diesel = (req.dieselMode === 'manual' && Number(req.dieselPrice) > 0) ? { price: Number(req.dieselPrice), source: '직접 입력' } : await dieselPrice();
    var queries = []; pairs.forEach(function (pp) { queries.push(pp.origin, pp.dest); });
    var points = await geocodeMany(queries), routeReqs = [];
    pairs.forEach(function (pp) { var a = points[pp.origin], d = points[pp.dest]; if (a && !a.error && d && !d.error) routeReqs.push({ origin: a, dest: d }); });
    var routes = routeReqs.length ? await routeMany(routeReqs, tollClass) : {};
    var items = pairs.map(function (pp) {
      var a = points[pp.origin], d = points[pp.dest];
      if (!a || a.error) return { error: '상차지: ' + ((a && a.error) || '주소를 찾지 못했습니다') };
      if (!d || d.error) return { error: '하차지: ' + ((d && d.error) || '주소를 찾지 못했습니다') };
      var r = routes[routeKey(a, d, tollClass)]; if (!r || r.error) return { error: (r && r.error) || '경로를 찾지 못했습니다' };
      var result = C.joilComputeQuote({ origin: a, dest: d, distanceKm: r.km, toll: r.toll, dieselPrice: diesel.price, baseTon: baseTon.name, specials: specials }, st, tariff);
      result.origin = a; result.dest = d; result.dieselSource = diesel.source; return { result: result };
    });
    return { items: items, diesel: diesel, baseTon: baseTon.name, specials: specials.map(function (x) { return x.id; }), cust: req.cust ? String(req.cust) : '' };
  }
  /* 조회기록 · 스냅샷 (결과를 압축해 한 칸에 — 예전 그대로 · 나중에 풀어서 표로) */
  async function logAdd(session, from, to, km, note, recordId, type, count) {
    await edit([SHEET_LOG], async function (W) {
      var h = (await Q(W.tx, 'select sheet_getrow($1, 1) v', [SHEET_LOG]))[0].v; if (!h) return; // Code.js: 조회기록 시트가 없으면 기록 안 함
      if (String(dec(h[7] == null ? '' : h[7])) !== '기록ID') await W.putRows(SHEET_LOG, 1, [LOG_HEADER]);
      var n = await W.lastRow(SHEET_LOG); await W.putRows(SHEET_LOG, n + 1, [[nowTxt(), session.id, session.name, from, to, km, note, recordId || '', type || '', count || '']]);
    });
  }
  function packChunks(meta, items) { var packed = packJson({ meta: meta, items: items }); if (packed.length <= CELL_LIMIT || items.length <= 1) return [packed]; var half = Math.ceil(items.length / 2); return packChunks(meta, items.slice(0, half)).concat(packChunks(meta, items.slice(half))); }
  async function appendPacked(name, id, userId, meta, items) {
    var now = Date.now(), rows = packChunks(meta, items).map(function (d) { return [id, now, userId, d]; });
    await edit([name], async function (W) {
      var n = await W.lastRow(name); if (n < 1) { await W.putRows(name, 1, [PACK_HEADER]); n = 1; } await W.putRows(name, n + 1, rows);
      for (var r of rows) await snapMirror(W.tx, name, r);
    });
  }
  /* ── 풀어 둔 표(017) 같이 맞추기: 스냅샷·견적데이터 → quote_snaps · 타리프버전 → tariff_vers · 분석데이터 → an_rows ── */
  function snapKind(name) { return name === SHEET_SNAP ? 'snap' : 'quote'; }
  async function snapMirror(db, name, r) {
    var d = unpackJson(r[3]);
    await Q(db, "insert into quote_snaps (kind, id, part, saved_ms, user_id, meta, items) values ($1, $2, coalesce((select max(part) + 1 from quote_snaps where kind = $1 and id = $2), 1), $3, $4, $5::text::jsonb, $6::text::jsonb)",
      [snapKind(name), String(r[0]), Number(r[1]) || null, String(r[2] || ''), JSON.stringify(d.meta), JSON.stringify(d.items)]);
  }
  async function verMirror(db, id, at, user, content) {
    await Q(db, 'insert into tariff_vers (id, first_at, user_name, settings, rows) values ($1, $2, $3, $4::text::jsonb, $5::text::jsonb) on conflict (id) do nothing', [id, at, user, JSON.stringify(content.s), JSON.stringify(content.t)]);
  }
  async function anMirror(db, key, rows) {
    if (!rows) { await Q(db, 'delete from an_rows where key = $1', [key]); return; }
    var kp = key.split('|'), sales = 0, buys = 0; rows.forEach(function (r) { sales += Number(r[5]) || 0; buys += Number(r[6]) || 0; });
    await Q(db, 'insert into an_rows (key, biz, month, n, sales, buys, rows) values ($1, $2, $3, $4, $5, $6, $7::text::jsonb) on conflict (key) do update set biz = excluded.biz, month = excluded.month, n = excluded.n, sales = excluded.sales, buys = excluded.buys, rows = excluded.rows, updated_at = now()',
      [key, kp[0], kp[1] || '', rows.length, sales, buys, JSON.stringify(rows)]);
  }
  /** 처음 한 번: 압축 원본을 모두 풀어 채우고 원본과 건수·합계를 맞춰 봄 (결과에는 건수·맞음 여부만) */
  async function unpackAll() {
    var out = {};
    await sql.begin(async function (tx) {
      await Q(tx, 'select name from sheet_meta where name = any($1) order by name for update', [[SHEET_SNAP, SHEET_QDATA, SHEET_VER, SHEET_AN_DATA, SHEET_AN_INDEX]]);
      for (var name of [SHEET_SNAP, SHEET_QDATA]) {
        await Q(tx, 'delete from quote_snaps where kind = $1', [snapKind(name)]);
        var rows = (await bodyRows(name, 4, tx)).filter(function (r) { return display(r[0]); }), items = 0, bad = 0;
        for (var r of rows) { try { await snapMirror(tx, name, r); items += unpackJson(r[3]).items.length; } catch (e) { bad++; } }
        var got = (await Q(tx, "select count(*)::int n, coalesce(sum(jsonb_array_length(items)), 0)::int i from quote_snaps where kind = $1", [snapKind(name)]))[0];
        out[snapKind(name)] = { rows: rows.length, items: items, bad: bad, ok: !bad && got.n === rows.length && got.i === items };
      }
      var vers = (await bodyRows(SHEET_VER, 6, tx)).filter(function (r) { return display(r[0]); }), vbad = 0;
      for (var v of vers) { try { await verMirror(tx, display(v[0]), fmtV(v[1]), String(v[2] || ''), unpackJson(String(v[3] || '') + String(v[4] || '') + String(v[5] || ''))); } catch (e) { vbad++; } }
      out.ver = { rows: vers.length, bad: vbad, ok: !vbad && Number((await Q(tx, 'select count(*)::int n from tariff_vers'))[0].n) === vers.length };
      var parts = {}; (await bodyRows(SHEET_AN_DATA, 3, tx)).forEach(function (r) { var k = display(r[0]); if (k) (parts[k] = parts[k] || []).push(r); });
      var idx = {}; (await bodyRows(SHEET_AN_INDEX, 6, tx)).forEach(function (r) { idx[display(r[0])] = r; });
      var keys = Object.keys(parts), same = 0, diff = [];
      await Q(tx, 'delete from an_rows');
      for (var k of keys) {
        var data = parts[k].sort(function (a, b) { return a[1] - b[1]; }).map(function (x) { return String(x[2]); }).join(''), list;
        try { list = unpackJson(data); } catch (e) { diff.push(k); continue; }
        await anMirror(tx, k, list);
        var got2 = (await Q(tx, 'select n, sales, buys from an_rows where key = $1', [k]))[0], ix = idx[k];
        if (ix && got2.n === Number(ix[3]) && Math.abs(Number(got2.sales) - Number(ix[4])) < 0.5 && Math.abs(Number(got2.buys) - Number(ix[5])) < 0.5) same++; else diff.push(k);
      }
      out.an = { keys: keys.length, same: same, diff: diff, ok: !diff.length };
    });
    return out;
  }
  async function packedRows(name, id, db) { return (await bodyRows(name, 4, db)).filter(function (r) { return display(r[0]) === String(id); }); }
  async function readPacked(name, id) {
    var rows = await packedRows(name, id); if (!rows.length) return null;
    var meta = null, byNo = {};
    rows.forEach(function (r) { var d = unpackJson(r[3]); meta = d.meta; d.items.forEach(function (it) { var prev = byNo[it.no]; if (!prev || it.result || !prev.result) byNo[it.no] = it; }); });
    return { meta: meta, items: Object.keys(byNo).map(function (k) { return byNo[k]; }).sort(function (a, b) { return a.no - b.no; }) };
  }
  async function snapshotMeta(session, type, count, out) {
    var st = await getSettings(), ver = '';
    try { ver = await currentVersion(session); } catch (e) { /* 버전 기록 실패해도 조회는 계속 */ }
    return { ver: ver, type: type, at: nowTxt(), user: { id: session.id, name: session.name }, count: count, baseTon: out.baseTon, diesel: out.diesel, roundTrip: !!st.milkrun.roundTrip, specials: out.specials || [], cust: out.cust || '', tons: st.tons.map(function (t) { return t.name; }) };
  }
  async function saveSnapshotSafe(recordId, session, meta, items) { try { await appendPacked(SHEET_SNAP, recordId, session.id, meta, items); } catch (e) { console.log('스냅샷 저장 실패: ' + e); } }
  async function quote(session, req) {
    var C = calc(), originQ = C.joilNormalizeAddress(req.origin), destQ = C.joilNormalizeAddress(req.dest);
    if (!originQ || !destQ) throw err('상차지와 하차지를 모두 입력하세요.');
    var out = await quoteMany([{ origin: originQ, dest: destQ }], req), item = out.items[0];
    if (item.error) throw err(item.error);
    var recordId = newId('R'), r = item.result;
    await logAdd(session, r.origin.address, r.dest.address, r.distanceKm, '', recordId, '단건', 1);
    await saveSnapshotSafe(recordId, session, await snapshotMeta(session, '단건', 1, out), [{ no: 1, origin: originQ, dest: destQ, result: r }]);
    return { result: r, recordId: recordId };
  }
  async function quoteBatch(session, req) {
    var C = calc(), pairs = (req.pairs || []).map(function (pp, i) { return { no: Number(pp.no) || i + 1, origin: C.joilNormalizeAddress(pp.origin), dest: C.joilNormalizeAddress(pp.dest) }; });
    if (!pairs.length) throw err('계산할 경로가 없습니다.');
    if (pairs.length > BATCH_CHUNK_MAX) throw err('한 번에 ' + BATCH_CHUNK_MAX + '건까지만 보낼 수 있습니다.');
    var st = await getSettings(), b = req.batch || {}, count = Number(b.count) || pairs.length;
    if (count > Number(st.batch.maxRows)) throw err('대량 계산은 최대 ' + st.batch.maxRows + '건까지입니다.');
    var recordId = /^[A-Za-z0-9_-]{6,40}$/.test(String(b.id || '')) ? String(b.id) : null;
    var out = await quoteMany(pairs, req);
    if (Number(b.index) === 0) {
      var origins = {}; pairs.forEach(function (pp) { origins[pp.origin] = true; });
      await logAdd(session, Object.keys(origins).length === 1 ? pairs[0].origin : '여러 상차지', '하차지 ' + count + '곳', '', '대량 ' + count + '건', recordId || '', '대량', count);
    }
    if (recordId) await saveSnapshotSafe(recordId, session, await snapshotMeta(session, '대량', count, out), pairs.map(function (pp, i) { var it = out.items[i]; return { no: pp.no, origin: pp.origin, dest: pp.dest, result: it.result || null, error: it.error || null }; }));
    out.recordId = recordId; return out;
  }
  function logRowToObj(r) { return { at: fmtV(r[0]), id: String(r[1]), name: String(r[2]), from: r[3], to: r[4], km: r[5], note: r[6], recordId: String(r[7] || ''), type: String(r[8] || ''), count: r[9] }; }
  async function getLogs(limit) { var rows = await bodyRows(SHEET_LOG, LOG_HEADER.length); return rows.slice(Math.max(0, rows.length - Math.min(limit, rows.length))).reverse().map(logRowToObj); }
  async function cleanupSnapshots() {
    var last = Number((await propGet('SNAP_CLEAN_AT')) || 0); if (Date.now() - last < 86400000) return;
    await sql.begin(function (tx) { return propSet(tx, 'SNAP_CLEAN_AT', String(Date.now())); });
    var cutoff = Date.now() - Number((await getSettings()).snapshot.retentionDays || 90) * 86400000;
    await edit([SHEET_SNAP], async function (W) {
      var rows = await bodyRows(SHEET_SNAP, 2, W.tx), n = 0; while (n < rows.length && Number(rows[n][1]) < cutoff) n++;
      for (var i = 0; i < n; i++) await W.del(SHEET_SNAP, 2);
      await Q(W.tx, "delete from quote_snaps where kind = 'snap' and saved_ms < $1", [cutoff]);
    });
  }
  async function historyList(session, req) {
    await cleanupSnapshots();
    var isAdmin = session.role === 'admin', days = Number(req.days) || 0, since = days ? Date.now() - days * 86400000 : 0, q = String(req.q || '').trim();
    var who = isAdmin ? String(req.userId || '') : session.id, type = String(req.type || ''), limit = Math.min(Number(req.limit) || 300, 1000);
    var snapIds = {}; (await bodyRows(SHEET_SNAP, 1)).forEach(function (r) { snapIds[r[0]] = true; });
    var values = await bodyRows(SHEET_LOG, LOG_HEADER.length), out = [];
    for (var i = values.length - 1; i >= 0 && out.length < limit; i--) {
      var r = values[i], t = r[0] instanceof Date ? r[0].getTime() : Date.parse(String(r[0]).replace(' ', 'T') + '+09:00');
      if (since && t < since) break;
      var ob = logRowToObj(r);
      if (who && ob.id !== who) continue;
      if (type && (ob.type || (ob.note && /^대량/.test(ob.note) ? '대량' : '단건')) !== type) continue;
      if (q && (ob.from + ' ' + ob.to + ' ' + ob.name + ' ' + ob.id).indexOf(q) === -1) continue;
      ob.hasSnapshot = !!(ob.recordId && snapIds[ob.recordId]); out.push(ob);
    }
    var res = { logs: out };
    if (isAdmin) res.users = (await o.listUsers()).map(function (u) { return { id: u.id, name: u.name }; });
    return res;
  }
  async function findLogByRecord(recordId) { if (!recordId) return null; var hit = (await bodyRows(SHEET_LOG, LOG_HEADER.length)).filter(function (r) { return display(r[7]) === recordId; })[0]; return hit ? logRowToObj(hit) : null; }
  async function historyGet(session, recordId) {
    var log = await findLogByRecord(String(recordId || '')); if (!log) throw err('기록을 찾을 수 없습니다.');
    if (session.role !== 'admin' && log.id !== session.id) throw err('본인 기록만 볼 수 있습니다.');
    var snap = await readPacked(SHEET_SNAP, log.recordId); if (!snap) throw err('보관 기간(' + (await getSettings()).snapshot.retentionDays + '일)이 지나 상세 내용이 삭제된 기록입니다.');
    return { log: log, meta: snap.meta, items: snap.items };
  }
  /* 견적모음 (Code.js quotesSave_ … quotesAddRoutes_) */
  function checkQuoteFields(f) {
    var name = String(f.name || '').trim(); if (!name) throw err('견적명을 입력하세요.'); if (name.length > 100) throw err('견적명은 100자 이내로 입력하세요.');
    return { name: name, client: String(f.client || '').trim().slice(0, 100), memo: String(f.memo || '').slice(0, 2000), status: QUOTE_STATUS.indexOf(f.status) !== -1 ? f.status : '작성' };
  }
  function cleanAdj(adj) {
    if (!adj) return null;
    var out = { rows: {}, cols: {}, cells: {} }, n = 0, num = function (v) { v = Math.round(Number(v)); if (!isFinite(v) || Math.abs(v) > 100000000) throw err('조정 금액이 올바르지 않습니다.'); return v; };
    ['rows', 'cols', 'cells'].forEach(function (k) { Object.keys(adj[k] || {}).forEach(function (key) { var v = num(adj[k][key]); if (k !== 'cells' && !v) return; if (++n > ADJ_MAX) throw err('조정이 너무 많습니다. (최대 ' + ADJ_MAX + '개)'); out[k][String(key).slice(0, 60)] = v; }); });
    return n ? out : null;
  }
  async function addAdjLog(W, row, session, note) {
    var cur = ((await Q(W.tx, 'select sheet_getrow($1, $2) v', [SHEET_QUOTES, row]))[0].v || []).map(dec), list = parseJson(readValue(cur[17] == null ? '' : cur[17]), []);
    list.push({ at: nowTxt(), by: session.name + ' (' + session.id + ')', note: String(note || '').slice(0, 300) }); if (list.length > 60) list = list.slice(-60);
    await W.set(SHEET_QUOTES, row, 18, [JSON.stringify(list)]);
  }
  async function quotesSave(session, req) {
    var log = await findLogByRecord(String(req.recordId || '')); if (!log) throw err('저장할 조회 기록을 찾을 수 없습니다.');
    if (session.role !== 'admin' && log.id !== session.id) throw err('본인 조회만 저장할 수 있습니다.');
    var snap = await readPacked(SHEET_SNAP, log.recordId); if (!snap) throw err('보관 기간이 지나 저장할 수 없는 기록입니다.');
    var f = checkQuoteFields(req), id = newId('E');
    await appendPacked(SHEET_QDATA, id, session.id, snap.meta, snap.items);
    var isBatch = snap.meta.type === '대량', first = snap.items[0] || {}, origins = {};
    snap.items.forEach(function (it) { origins[it.origin] = true; });
    var from = isBatch ? (Object.keys(origins).length === 1 ? first.origin : '여러 상차지') : (first.result ? first.result.origin.address : first.origin);
    var to = isBatch ? '하차지 ' + snap.items.length + '곳' : (first.result ? first.result.dest.address : first.dest);
    var now = nowTxt(), adj = cleanAdj(req.adj);
    await edit([SHEET_QUOTES], async function (W) {
      await quotesHeader(W);
      await W.append(SHEET_QUOTES, QUOTE_HEADER, [id, now, session.id, session.name, f.name, f.client, f.memo, f.status, snap.meta.type, snap.items.length, from, to, log.recordId, log.at, now, '', adj ? JSON.stringify(adj) : '',
        JSON.stringify([{ at: now, by: session.name + ' (' + session.id + ')', note: '견적 저장' + (adj ? ' (조정 포함: ' + String(req.adjNote || '').slice(0, 200) + ')' : '') }])]);
    });
    return { quote: (await findQuote(id)).data };
  }
  async function quotesList(session, req) {
    var isAdmin = session.role === 'admin', q = String(req.q || '').trim(), out = [];
    (await bodyRows(SHEET_QUOTES, QUOTE_HEADER.length)).forEach(function (r) {
      var ob = quoteRowToObj(r); if (!isAdmin && ob.userId !== session.id) return;
      if (q && (ob.name + ' ' + ob.client + ' ' + ob.memo + ' ' + ob.from + ' ' + ob.to + ' ' + ob.userName).indexOf(q) === -1) return;
      out.push(ob);
    });
    return { quotes: out.reverse() };
  }
  async function findQuoteAny(id, db) { if (!id) return null; var hit = (await bodyRows(SHEET_QUOTES, QUOTE_HEADER.length, db)).filter(function (r) { return display(r[0]) === String(id); })[0]; return hit ? { row: hit._r, data: quoteRowToObj(hit), raw: hit } : null; }
  async function quoteAccess(session, id) { var found = await findQuoteAny(id); if (!found) throw err('견적을 찾을 수 없습니다.'); if (session.role !== 'admin' && found.data.userId !== session.id) throw err('본인 견적만 볼 수 있습니다.'); return found; }
  async function quotesGet(session, id) {
    var found = await quoteAccess(session, id), data = await readPacked(SHEET_QDATA, found.data.id); if (!data) throw err('견적 데이터가 없습니다.');
    var meta = data.meta;
    if (meta.ver) { var all = await readAll(SHEET_VER); for (var i = 1; i < all.length; i++) if (display(readValue(all[i][0] == null ? '' : all[i][0])) === meta.ver) { meta.verAt = fmtV(readValue(all[i][1] == null ? '' : all[i][1])); break; } }
    return { quote: found.data, meta: meta, items: data.items, adj: parseJson(found.raw[16], null), adjLog: parseJson(found.raw[17], []) };
  }
  async function quotesUpdate(session, id, patch) {
    var found = await quoteAccess(session, id);
    await edit([SHEET_QUOTES], async function (W) {
      await quotesHeader(W);
      if (patch && Object.prototype.hasOwnProperty.call(patch, 'adj')) {
        var adj = cleanAdj(patch.adj), v = adj ? JSON.stringify(adj) : ''; if (v.length > CELL_LIMIT) throw err('조정이 너무 많아 저장할 수 없습니다.');
        await W.set(SHEET_QUOTES, found.row, 17, [v]); await addAdjLog(W, found.row, session, patch.adjNote || (adj ? '금액 조정' : '조정 모두 해제'));
      }
      if (patch && Object.prototype.hasOwnProperty.call(patch, 'link')) {
        var l = patch.link, clean = l ? { cust: String(l.cust || '').slice(0, 100), from: String(l.from || '').slice(0, 100), to: String(l.to || '').slice(0, 100), weight: String(l.weight || '').slice(0, 30), since: /^\d{4}-\d{2}$/.test(l.since) ? l.since : '', price: Number(l.price) || 0, ton: String(l.ton || '').slice(0, 20) } : null;
        if (clean && !clean.cust) throw err('연결할 매출처를 고르세요.');
        await W.set(SHEET_QUOTES, found.row, 16, [clean ? JSON.stringify(clean) : '']);
      }
      var f = checkQuoteFields(Object.assign({}, found.data, patch || {}));
      await W.set(SHEET_QUOTES, found.row, 5, [f.name, f.client, f.memo, f.status]); await W.set(SHEET_QUOTES, found.row, 15, [nowTxt()]);
    });
    return { quote: (await findQuoteAny(id)).data };
  }
  async function quotesDelete(session, id) {
    var found = await quoteAccess(session, id);
    await edit([SHEET_QDATA, SHEET_QUOTES], async function (W) {
      var rows = (await packedRows(SHEET_QDATA, found.data.id, W.tx)).map(function (r) { return r._r; }).sort(function (a, b) { return b - a; });
      for (var r of rows) await W.del(SHEET_QDATA, r);
      var f = await findQuoteAny(id, W.tx); await W.del(SHEET_QUOTES, f.row);
      await Q(W.tx, "delete from quote_snaps where kind = 'quote' and id = $1", [found.data.id]);
    });
    return {};
  }
  async function quotesAddRoutes(session, req) {
    var found = await quoteAccess(session, req.id), data = await readPacked(SHEET_QDATA, found.data.id); if (!data) throw err('견적 데이터가 없습니다.');
    var C = calc(), pairs = (req.pairs || []).map(function (pp) { return { origin: C.joilNormalizeAddress(pp.origin), dest: C.joilNormalizeAddress(pp.dest) }; }).filter(function (pp) { return pp.origin && pp.dest; });
    if (!pairs.length) throw err('추가할 구간을 입력하세요.');
    if (pairs.length > BATCH_CHUNK_MAX) throw err('한 번에 ' + BATCH_CHUNK_MAX + '건까지 추가할 수 있습니다.');
    var meta = data.meta, ver = meta.ver ? await loadVersion(meta.ver) : null, used = null;
    data.items.some(function (it) { if (it.result && it.result.specials) { used = it.result.specials; return true; } return false; });
    var out = await quoteMany(pairs, { baseTon: meta.baseTon, dieselMode: 'manual', dieselPrice: meta.diesel && meta.diesel.price, specialsResolved: used || [] }, ver);
    if (meta.diesel) out.items.forEach(function (it) { if (it.result) it.result.dieselSource = meta.diesel.source; });
    var maxNo = data.items.reduce(function (m, it) { return Math.max(m, Number(it.no) || 0); }, 0), added = [], failed = [], stamp = { at: nowTxt(), by: session.name };
    out.items.forEach(function (it, i) { if (it.error) failed.push({ origin: pairs[i].origin, dest: pairs[i].dest, error: it.error }); else added.push({ no: ++maxNo, origin: pairs[i].origin, dest: pairs[i].dest, result: it.result, added: stamp }); });
    if (added.length) {
      var total = data.items.length + added.length, newMeta = JSON.parse(JSON.stringify(meta));
      newMeta.type = '대량'; newMeta.count = total;
      if (!newMeta.ver && !newMeta.verNote) newMeta.verNote = '버전 기록 이전 견적 · 추가 구간은 ' + stamp.at.slice(0, 10) + ' 기준';
      await appendPacked(SHEET_QDATA, found.data.id, session.id, newMeta, added);
      var origins = {}; data.items.concat(added).forEach(function (x) { origins[x.origin] = true; });
      await edit([SHEET_QUOTES], async function (W) {
        var f = await findQuoteAny(req.id, W.tx);
        await W.set(SHEET_QUOTES, f.row, 9, ['대량', total]); await W.set(SHEET_QUOTES, f.row, 11, [Object.keys(origins).length === 1 ? data.items[0].origin : '여러 상차지', '하차지 ' + total + '곳']);
        await W.set(SHEET_QUOTES, f.row, 15, [nowTxt()]); await addAdjLog(W, f.row, session, '구간 ' + added.length + '건 추가' + (ver ? ' (견적 당시 기준 ' + meta.ver + ')' : ' (현재 기준)'));
      });
    }
    var res = await quotesGet(session, req.id); res.added = added.map(function (x) { return x.no; }); res.failed = failed; res.usedVersion = ver ? meta.ver : null; return res;
  }
  /* 업체별 단가표 · 특수 추가운임 (Code.js ratesList_ … ratesDelete_) */
  async function ratesList() {
    var by = {};
    (await bodyRows(SHEET_RATES, RATES_HEADER.length)).forEach(function (r) { var c = String(r[0]); if (!c) return; var x = by[c] || (by[c] = { cust: c, count: 0, updated: '', by: '' }); x.count++; var at = fmtV(r[8]); if (at > x.updated) { x.updated = at; x.by = String(r[7]); } });
    (await bodyRows(SHEET_CUSTSET, 3)).forEach(function (r) { var c = String(r[0]); if (!c) return; var x = by[c] || (by[c] = { cust: c, count: 0, updated: '', by: '' }); x.hasSpecial = !!String(r[1]); x.memo = String(r[2] || ''); });
    return { custs: Object.keys(by).sort().map(function (k) { return by[k]; }) };
  }
  async function ratesGet(cust) {
    cust = String(cust || ''); var rows = [];
    (await bodyRows(SHEET_RATES, RATES_HEADER.length)).forEach(function (r) { if (String(r[0]) === cust) rows.push([String(r[1]), String(r[2]), String(r[3]), Number(r[4]) || 0, textDate(r[5]), String(r[6] || '')]); });
    return { cust: cust, rows: rows, specials: (await custSpecials(cust)) || {} };
  }
  function checkCustName(c) { c = String(c || '').trim(); if (!c) throw err('업체 이름을 입력하세요.'); if (c.length > 60) throw err('업체 이름이 너무 깁니다.'); return c; }
  /** 그 업체 줄을 모두 지움 (아래에서부터 — 줄 번호가 밀리지 않게) */
  async function removeCustRows(W, cust) { var rows = await bodyRows(SHEET_RATES, 1, W.tx); for (var i = rows.length - 1; i >= 0; i--) if (String(rows[i][0]) === cust) await W.del(SHEET_RATES, rows[i]._r); }
  async function cleanSpecialsOverride(sp) {
    var st = await getSettings(), ids = (st.specials || []).map(function (x) { return x.id; }), tons = st.tons.map(function (t) { return t.name; }), out = {};
    Object.keys(sp || {}).forEach(function (id) { if (ids.indexOf(id) === -1) return; var x = sp[id] || {}, vals = {}; tons.forEach(function (t) { var v = Number((x.values || {})[t]); if (v) vals[t] = Math.round(v * 100) / 100; }); out[id] = { mode: x.mode === 'percent' ? 'percent' : 'amount', values: vals }; });
    return out;
  }
  async function saveCustSpecials(cust, specials) {
    cust = checkCustName(cust);
    var clean = await cleanSpecialsOverride(specials), json = Object.keys(clean).length ? JSON.stringify(clean) : '';
    await edit([SHEET_CUSTSET], async function (W) {
      var f = await W.findRow(SHEET_CUSTSET, CUSTSET_HEADER, cust);
      if (f) await W.set(SHEET_CUSTSET, f.row, 2, [json, f.raw[2], nowTxt()]); else await W.append(SHEET_CUSTSET, CUSTSET_HEADER, [cust, json, '', nowTxt()]);
    });
    return { specials: clean };
  }
  async function ratesUpload(session, req) {
    var cust = checkCustName(req.cust), tons = (await getSettings()).tons.map(function (t) { return t.name; });
    var rows = (req.rows || []).map(function (r, i) {
      var from = String(r[0] || '').trim(), to = String(r[1] || '').trim(), ton = String(r[2] || '').trim(), price = Number(r[3]);
      if (!from || !to) throw err((i + 1) + '번째 줄: 상차지·하차지를 확인하세요.');
      if (tons.indexOf(ton) === -1) throw err((i + 1) + '번째 줄: 톤수 "' + ton + '"를 알 수 없습니다.');
      if (!(price > 0)) throw err((i + 1) + '번째 줄: 단가를 확인하세요.');
      var since = String(r[4] || '').trim(); if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) throw err((i + 1) + '번째 줄: 적용 시작일은 YYYY-MM-DD 입니다.');
      return [cust, from.slice(0, 200), to.slice(0, 200), ton, Math.round(price), "'" + since, String(r[5] || '').slice(0, 200), session.name + ' (' + session.id + ')', nowTxt()];
    });
    if (!rows.length) throw err('올릴 단가가 없습니다.');
    if (rows.length > 5000) throw err('한 번에 5,000줄까지 올릴 수 있습니다.');
    await edit([SHEET_RATES], async function (W) {
      if (req.mode !== 'append') await removeCustRows(W, cust);
      var n = await W.lastRow(SHEET_RATES); if (n < 1) { await W.putRows(SHEET_RATES, 1, [RATES_HEADER]); n = 1; }
      await W.putRows(SHEET_RATES, n + 1, rows);
    });
    if (req.specials) await saveCustSpecials(cust, req.specials);
    return { count: rows.length };
  }
  async function ratesDelete(cust) {
    cust = checkCustName(cust);
    await edit([SHEET_RATES, SHEET_CUSTSET], async function (W) { await removeCustRows(W, cust); var f = await W.findRow(SHEET_CUSTSET, CUSTSET_HEADER, cust); if (f) await W.del(SHEET_CUSTSET, f.row); });
    return {};
  }

  /* ───────────── 관리자: 설정 · 키 · 타리프 · 캐시 · 유가 (Code.js saveSettings_ … dieselImport_) ───────────── */
  function publicOf(st) {
    return { tons: st.tons.map(function (t) { return t.name; }), fuelMode: st.fuel.mode, manualPrice: st.fuel.manualPrice, baseTon: st.milkrun.baseTon, roundTrip: st.milkrun.roundTrip, maxRows: st.batch.maxRows,
      retentionDays: st.snapshot.retentionDays, quoteFooter: st.quoteFooter, maxKm: st.maxKm, priceRounding: st.priceRounding,
      specials: (st.specials || []).map(function (x) { return { id: x.id, name: x.name, mode: x.mode, set: Object.keys(x.values || {}).some(function (k) { return Number(x.values[k]); }) }; }) };
  }
  async function saveSettings(settings) {
    if (!settings || !Array.isArray(settings.tons) || !Array.isArray(settings.regionRules)) throw err('설정 형식이 올바르지 않습니다.');
    var merged = calc().joilMergeSettings(settings), tonNames = merged.tons.map(function (t) { return t.name; }), seen = {};
    merged.specials = (Array.isArray(merged.specials) ? merged.specials : []).slice(0, 40).map(function (sp, i) {
      var name = String(sp && sp.name || '').trim().slice(0, 30); if (!name) throw err('특수 운임 ' + (i + 1) + '번째 항목의 이름을 입력하세요.');
      var id = /^[A-Za-z0-9_-]{1,20}$/.test(String(sp.id || '')) && !seen[sp.id] ? String(sp.id) : 'sp' + Date.now().toString(36) + i; seen[id] = true;
      var vals = {}; tonNames.forEach(function (t) { var v = Number((sp.values || {})[t]); if (v) { if (!isFinite(v) || v < 0 || v > 100000000) throw err(name + ' ' + t + ' 금액이 올바르지 않습니다.'); vals[t] = Math.round(v * 100) / 100; } });
      return { id: id, name: name, mode: sp.mode === 'percent' ? 'percent' : 'amount', values: vals };
    });
    // 로그인·me 가 읽는 공개 설정(core.js props.PUBLIC_SETTINGS)도 같이 — 예전엔 옮기기 때만 맞춰져서 설정을 바꿔도 화면에 늦게 보였어요
    await sql.begin(async function (tx) { await propSet(tx, 'SETTINGS', JSON.stringify(merged)); await Q(tx, "insert into props (key, value) values ('PUBLIC_SETTINGS', $1) on conflict (key) do update set value = excluded.value", [JSON.stringify(publicOf(merged))]); });
    return { settings: merged };
  }
  async function keyStatus() { var k = await Q(sql, "select key from gas_props where key in ('KAKAO_REST_KEY','OPINET_KEY','SB_KEY') and value <> ''"), has = {}; k.forEach(function (r) { has[r.key] = true; }); return { kakao: !!has.KAKAO_REST_KEY, opinet: !!has.OPINET_KEY, track: !!has.SB_KEY }; }
  /** 키는 저장만 하고 화면으로 돌려보내지 않아요 */
  async function saveKeys(kakao, opinet) {
    await sql.begin(async function (tx) { if (kakao) await propSet(tx, 'KAKAO_REST_KEY', String(kakao).trim()); if (opinet) await propSet(tx, 'OPINET_KEY', String(opinet).trim()); });
    return { keys: await keyStatus() };
  }
  async function saveTariff(tariff) {
    var st = await getSettings(), e = calc().joilValidateTariff(tariff, st.tons.length, Number(st.maxKm) || 600); if (e) throw err(e);
    var tons = st.tons.map(function (t) { return t.name; }), rows = tariff.rows.map(function (r, i) { return [i + 1].concat(r.map(Number)); });
    await edit([SHEET_TARIFF], async function (W) { await Q(W.tx, 'select sheet_cut($1, 0)', [SHEET_TARIFF]); await W.putRows(SHEET_TARIFF, 1, [['km'].concat(tons)].concat(rows)); });
    return {};
  }
  async function tariffWarn() {
    var t = await readTariff(), zeros = 0, first = null;
    t.rows.forEach(function (r, i) { r.forEach(function (v, j) { if (!(v > 0)) { zeros++; if (!first) first = (i + 1) + 'km ' + (t.tons[j] || ''); } }); });
    var st = await getSettings();
    return { zeros: zeros, first: first, rows: t.rows.length, tonMismatch: st.tons.map(function (x) { return x.name; }).join('|') !== t.tons.join('|') };
  }
  async function sheetLast(name) { var all = await readAll(name), n = all.length; while (n > 0 && (all[n - 1] || []).every(function (v) { return v === '' || v == null; })) n--; return n; }
  async function cacheInfo() { var g = await sheetLast(SHEET_GEO_CACHE), r = await sheetLast(SHEET_ROUTE_CACHE); return { addresses: Math.max(0, g - 1), routes: Math.max(0, r - 1) }; }
  async function clearCache() {
    await edit([SHEET_GEO_CACHE, SHEET_ROUTE_CACHE], async function (W) { for (var n of [SHEET_GEO_CACHE, SHEET_ROUTE_CACHE]) await Q(W.tx, 'select sheet_cut($1, 0)', [n]); await propSet(W.tx, 'CACHE_GEN', String(Date.now())); });
    return cacheInfo();
  }
  async function testKakao() { var q = '서울특별시 중구 세종대로 110', pt = (await geocodeMany([q]))[q]; if (pt.error) throw err(pt.error); return { message: '카카오 연결 정상: ' + pt.address }; }
  async function dieselHistory() { var h = await dieselHistoryMap(); return { rows: Object.keys(h).sort().map(function (d) { return [d, h[d].price, h[d].source]; }), status: await dieselStatus() }; }
  async function dieselImport(rows) {
    var entries = (rows || []).map(function (r) { return { date: String(r[0]), price: Number(r[1]), source: '엑셀 가져오기' }; }).filter(function (e) { return /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.price > 0 && e.price < 10000; });
    if (!entries.length) throw err('가져올 날짜·경유가가 없습니다.');
    return { count: await upsertDiesel(entries), status: await dieselStatus() };
  }
  async function bootstrap() {
    await cleanupSnapshots();
    return { settings: await getSettings(), keys: await keyStatus(), users: await o.listUsers(), logs: await getLogs(200), cache: await cacheInfo(), diesel: await dieselStatus(), tariffWarn: await tariffWarn() };
  }

  /* ───────────── 매출매입 분석 (Code.js analysisIndex_ … analysisAccessLog_) — 화면이 보낸 압축 글자를 그대로 보관·전달 ───────────── */
  var SHEET_AN_INDEX = '분석목록', SHEET_AN_DATA = '분석데이터', SHEET_AN_MAP = '매출처설정', SHEET_AN_LOG = '분석접속기록';
  var AN_INDEX_HEADER = ['키', '사업자', '월', '건수', '매출합', '매입합', '파일명', '업로드일시', '업로더'], AN_DATA_HEADER = ['키', '순번', '데이터'], AN_MAP_HEADER = ['원본 매출처', '표시 이름', '숨김'];
  var AN_LOG_HEADER = ['일시', '아이디', '이름', '데이터 묶음 수'], AN_LOAD_MAX = 12, AN_RULE_FIELDS = ['any', 'cust', 'from', 'to', 'weight', 'car', 'driver', 'etc', 'note'];
  async function analysisRules() { var raw = await propGet('AN_RULES'); return raw ? JSON.parse(raw) : []; }
  async function analysisIndex(session) {
    var list = (await bodyRows(SHEET_AN_INDEX, AN_INDEX_HEADER.length)).map(function (r) {
      var kp = String(r[0]).split('|');
      return { key: String(r[0]), biz: kp[0], month: kp[1], count: Number(r[3]), sales: Number(r[4]), buys: Number(r[5]), fileName: String(r[6]), uploadedAt: fmtV(r[7]), uploader: String(r[8]) };
    });
    var mapping = (await bodyRows(SHEET_AN_MAP, 3)).map(function (r) { return { raw: String(r[0]), display: String(r[1] || ''), hidden: r[2] === 'Y' || r[2] === true }; });
    await edit([SHEET_AN_LOG], function (W) { return W.append(SHEET_AN_LOG, AN_LOG_HEADER, [nowTxt(), session.id, session.name, list.length]); });
    return { index: list, mapping: mapping, businesses: AN_BUSINESSES, rules: await analysisRules(), notes: await notesList() };
  }
  async function analysisLoad(keys) {
    keys = (keys || []).map(String).slice(0, AN_LOAD_MAX); var out = {}, want = {};
    if (!keys.length) return { data: out };
    keys.forEach(function (k) { want[k] = []; });
    var order = []; (await bodyRows(SHEET_AN_DATA, 3)).forEach(function (r) { var k = display(r[0]); if (want[k]) { if (!want[k].length) order.push(k); want[k].push(r); } });
    order.forEach(function (k) { if (want[k].length) out[k] = want[k].sort(function (a, b) { return a[1] - b[1]; }).map(function (v) { return String(v[2]); }).join(''); });
    return { data: out };
  }
  async function removeAnalysisRows(W, key) {
    for (var name of [SHEET_AN_DATA, SHEET_AN_INDEX]) { var rows = await bodyRows(name, 1, W.tx); for (var i = rows.length - 1; i >= 0; i--) if (display(rows[i][0]) === key) await W.del(name, rows[i]._r); }
  }
  async function analysisUpload(session, req) {
    var biz = String(req.biz || ''), month = String(req.month || '');
    if (AN_BUSINESSES.indexOf(biz) === -1) throw err('사업자를 선택하세요.');
    if (!/^\d{4}-\d{2}$/.test(month)) throw err('월 형식이 올바르지 않습니다: ' + month);
    var data = String(req.data || ''); if (!data) throw err('데이터가 비어 있습니다.');
    // 서버에서 한 번 풀어서 건수·합계를 직접 확인 (화면이 보낸 숫자를 그대로 믿지 않음)
    var rows = unpackJson(data); if (!Array.isArray(rows) || !rows.length) throw err('행이 없습니다.');
    var sales = 0, buys = 0;
    rows.forEach(function (r) { if (String(r[0]).slice(0, 7) !== month) throw err('다른 달 행이 섞여 있습니다: ' + r[0]); sales += Number(r[5]) || 0; buys += Number(r[6]) || 0; });
    if (req.count != null && Number(req.count) !== rows.length) throw err('건수가 맞지 않습니다. 다시 시도하세요.');
    var key = biz + '|' + month;
    await edit([SHEET_AN_DATA, SHEET_AN_INDEX], async function (W) {
      await removeAnalysisRows(W, key);
      var parts = []; for (var i = 0; i < data.length; i += CELL_LIMIT) parts.push([key, parts.length + 1, data.slice(i, i + CELL_LIMIT)]);
      var n = await W.lastRow(SHEET_AN_DATA); if (n < 1) { await W.putRows(SHEET_AN_DATA, 1, [AN_DATA_HEADER]); n = 1; }
      await W.putRows(SHEET_AN_DATA, n + 1, parts);
      await W.append(SHEET_AN_INDEX, AN_INDEX_HEADER, [key, biz, "'" + month, rows.length, sales, buys, String(req.fileName || '').slice(0, 200), nowTxt(), session.name + ' (' + session.id + ')']);
      await anMirror(W.tx, key, rows);
    });
    return { key: key, count: rows.length, sales: sales, buys: buys };
  }
  async function analysisDelete(key) {
    key = String(key || ''); if (!key) throw err('삭제할 데이터를 선택하세요.');
    await edit([SHEET_AN_DATA, SHEET_AN_INDEX], async function (W) { await removeAnalysisRows(W, key); await anMirror(W.tx, key, null); });
    return {};
  }
  async function analysisSaveMap(map) {
    if (!Array.isArray(map)) throw err('매출처 설정 형식이 올바르지 않습니다.');
    var rows = map.filter(function (m) { return m && String(m.raw || '') !== ''; }).map(function (m) { return [String(m.raw), String(m.display || '').trim().slice(0, 100), m.hidden ? 'Y' : '']; });
    await edit([SHEET_AN_MAP], async function (W) {
      var n = await W.lastRow(SHEET_AN_MAP); if (n < 1) { await W.putRows(SHEET_AN_MAP, 1, [AN_MAP_HEADER]); n = 1; }
      if (n > 1) await W.clearRows(SHEET_AN_MAP, 2, n - 1, 3);
      if (rows.length) await W.putRows(SHEET_AN_MAP, 2, rows);
    });
    return { count: rows.length };
  }
  async function analysisSaveRules(rules) {
    if (!Array.isArray(rules)) throw err('규칙 형식이 올바르지 않습니다.');
    if (rules.length > 200) throw err('규칙은 200개까지 만들 수 있습니다.');
    var clean = rules.map(function (r) {
      var word = String(r.word || '').trim(); if (!word) throw err('단어가 비어 있는 규칙이 있습니다.');
      if (AN_RULE_FIELDS.indexOf(r.field) === -1) throw err('칸 선택이 올바르지 않습니다.');
      var action = r.action === 'class' ? 'class' : 'exclude', cat = String(r.cat || '').trim().slice(0, 30);
      if (action === 'class' && !cat) throw err('분류 규칙은 분류 이름이 필요합니다: ' + word);
      return { on: r.on !== false, field: r.field, mode: ['eq', 'contains', 'starts'].indexOf(r.mode) !== -1 ? r.mode : 'contains', word: word.slice(0, 100), biz: AN_BUSINESSES.indexOf(r.biz) !== -1 ? r.biz : '', action: action, cat: action === 'class' ? cat : '', memo: String(r.memo || '').slice(0, 200) };
    });
    await sql.begin(function (tx) { return propSet(tx, 'AN_RULES', JSON.stringify(clean)); });
    return { rules: clean };
  }
  async function analysisAccessLog(limit) { var rows = await bodyRows(SHEET_AN_LOG, 4); return rows.slice(Math.max(0, rows.length - limit)).reverse().map(function (r) { return { at: fmtV(r[0]), id: r[1], name: r[2], n: r[3] }; }); }

  /* ───────────── 물류 정보 (유가 · 뉴스 · 날씨 · 주식) — 로그인한 직원 누구나 ───────────── */
  var NEWS_DEFAULT = { include: ['화물연대', '화물 파업', '안전운임', '화물차 운송', '물류 업계', '운송업계', '경유 가격', '고속도로 통행료', '항만 파업', '컨테이너 운임', '국토부 화물', '택배 노조'], exclude: ['교통사고', '추돌', '음주운전', '사망사고', '부고', '인사'], watch: ['쿠팡', 'CJ대한통운', '한진', '롯데글로벌로지스'] };
  var WEATHER_REGIONS = [{ name: '경기도', city: '수원', lat: 37.26, lon: 127.03 }, { name: '충청도', city: '대전', lat: 36.35, lon: 127.38 }, { name: '전라도', city: '광주', lat: 35.16, lon: 126.85 }, { name: '강원도', city: '강릉', lat: 37.75, lon: 128.88 }, { name: '경상도', city: '대구', lat: 35.87, lon: 128.60 }];
  var KR_MEDIA = ['KBS', 'MBC', 'SBS', 'YTN', 'JTBC', 'MBN', 'TV조선', 'TV CHOSUN', 'KTV', 'OBS', 'EBS', 'TBS', 'CBS', 'BBS', 'ZDNet Korea', 'ZDNET Korea', 'iMBC', 'Newsis', 'News1', 'NEWSIS', 'KMIB', 'SBS Biz', 'MTN', 'Edaily', 'inews24', 'etnews', 'thebell', 'Bloter', 'Ajunews', 'Hankyung', 'Chosunbiz', 'JoongAng', 'Dong-A'];
  var KR_HOSTS = ['chosun.com', 'donga.com', 'hankyung.com', 'mk.co.kr', 'newsis.com', 'news1.kr', 'yna.co.kr', 'yonhapnewstv.co.kr', 'kbs.co.kr', 'imbc.com', 'sbs.co.kr', 'ytn.co.kr', 'jtbc.co.kr', 'joins.com', 'joongang.co.kr', 'hani.co.kr', 'khan.co.kr', 'hankookilbo.com', 'segye.com', 'kmib.co.kr', 'munhwa.com', 'seoul.co.kr', 'sedaily.com', 'edaily.co.kr', 'asiae.co.kr', 'mt.co.kr', 'heraldcorp.com', 'fnnews.com', 'etnews.com', 'dt.co.kr', 'inews24.com', 'zdnet.co.kr', 'nocutnews.co.kr', 'ohmynews.com', 'pressian.com', 'ajunews.com', 'newspim.com', 'businesspost.co.kr', 'mbn.co.kr', 'tvchosun.com', 'klnews.co.kr', 'cargonews.co.kr', 'ksg.co.kr', 'bloter.net', 'thebell.co.kr', 'wowtv.co.kr', 'sbsbiz.co.kr', 'biz.chosun.com', 'news.naver.com', 'n.news.naver.com', 'v.daum.net'];
  async function newsRules() { var raw = await propGet('NEWS_RULES'), r = raw ? JSON.parse(raw) : {}; return { include: r.include || NEWS_DEFAULT.include, exclude: r.exclude || NEWS_DEFAULT.exclude, watch: r.watch || NEWS_DEFAULT.watch, blockSources: r.blockSources || [] }; }
  async function saveNewsRules(rules) {
    var clean = function (list) { var seen = {}; return (list || []).map(function (w) { return String(w || '').trim().slice(0, 40); }).filter(function (w) { if (!w || seen[w]) return false; seen[w] = true; return true; }).slice(0, 40); };
    var r = { include: clean(rules && rules.include), exclude: clean(rules && rules.exclude), watch: clean(rules && rules.watch), blockSources: clean(rules && rules.blockSources) };
    if (!r.include.length && !r.watch.length) throw err('모을 키워드를 하나 이상 넣으세요.');
    await sql.begin(function (tx) { return propSet(tx, 'NEWS_RULES', JSON.stringify(r)); }); await cacheDel('NEWS');
    return { rules: r };
  }
  function xmlText(v) { return String(v || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim(); }
  function parseRss(xml, keyword, kind) {
    var out = [], m, re = /<item>([\s\S]*?)<\/item>/g;
    while ((m = re.exec(xml))) {
      var it = m[1], g = function (tag) { var x = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>').exec(it); return x ? xmlText(x[1]) : ''; };
      var title = g('title'), source = g('source'), su = /<source[^>]*url="([^"]*)"/.exec(it), host = '';
      if (su) { var hm = /^https?:\/\/([^\/:?#]+)/i.exec(su[1]); host = hm ? hm[1].toLowerCase() : ''; }
      if (source && title.slice(-(source.length + 3)) === ' - ' + source) title = title.slice(0, -(source.length + 3));
      var t = Date.parse(g('pubDate'));
      out.push({ title: title, link: g('link'), source: source, host: host, at: isNaN(t) ? 0 : t, kw: keyword, kind: kind });
    }
    return out;
  }
  function isDomesticNews(n) {
    var hangul = /[\uAC00-\uD7A3]/; if (!hangul.test(n.title || '')) return false;
    var src = String(n.source || ''), host = String(n.host || '');
    if (hangul.test(src) || /\.kr$/.test(host)) return true;
    if (KR_HOSTS.some(function (h) { return host === h || host.slice(-(h.length + 1)) === '.' + h; })) return true;
    return KR_MEDIA.some(function (m) { return src.toLowerCase().indexOf(m.toLowerCase()) !== -1; });
  }
  /** 바깥 주소 여러 개 한꺼번에 (UrlFetchApp.fetchAll · muteHttpExceptions 처럼 오류도 응답으로) */
  function fetchMany(list) { return Promise.all(list.map(function (x) { return netFetch(x.url, { headers: x.headers || {} }).then(function (r) { return r.text().then(function (t) { return { code: r.status, text: t }; }); }, function () { return { code: 599, text: '' }; }); })); }
  async function news(force) {
    if (!force) { var hit = await cacheGet('NEWS'); if (hit) return JSON.parse(hit); }
    var rules = await newsRules(), qs = rules.include.map(function (k) { return [k, 'topic']; }).concat(rules.watch.map(function (k) { return [k, 'watch']; }));
    var urls = qs.map(function (q) { return { url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('"' + q[0] + '" when:7d') + '&hl=ko&gl=KR&ceid=KR:ko' }; }), res = [];
    for (var i = 0; i < urls.length; i += 20) res = res.concat(await fetchMany(urls.slice(i, i + 20)));
    var byTitle = {}, failed = 0, foreign = 0;
    res.forEach(function (r, i) {
      if (r.code !== 200) { failed++; return; }
      parseRss(r.text, qs[i][0], qs[i][1]).forEach(function (n) {
        var key = n.title.replace(/[\s"'“”‘’\[\]…·,.]/g, '').slice(0, 40); if (!key) return;
        var prev = byTitle[key];
        if (prev) { if (prev.kws.indexOf(n.kw) === -1) prev.kws.push(n.kw); if (n.kind === 'watch') prev.watch = true; return; }
        if (!isDomesticNews(n)) { foreign++; return; }
        byTitle[key] = { title: n.title, link: n.link, source: n.source, at: n.at, kws: [n.kw], watch: n.kind === 'watch' };
      });
    });
    var ex = rules.exclude, blocked = rules.blockSources || [], since = Date.now() - 7 * 86400000;
    var list = Object.keys(byTitle).map(function (k) { return byTitle[k]; }).filter(function (n) {
      if (n.at && n.at < since) return false;
      if (blocked.some(function (b) { return n.source === b || (n.source || '').indexOf(b) !== -1; })) return false;
      return !ex.some(function (w) { return n.title.indexOf(w) !== -1; });
    }).sort(function (a, b) { return b.at - a.at; }).slice(0, 120);
    var out = { items: list, at: nowTxt(), failed: failed, foreign: foreign, keywords: rules }, txt = JSON.stringify(out);
    while (txt.length > 95000 && out.items.length > 10) { out.items = out.items.slice(0, Math.floor(out.items.length * 0.8)); txt = JSON.stringify(out); }
    await cachePut('NEWS', txt, 1800); return out;
  }
  async function weather() {
    var hit = await cacheGet('WEATHER'); if (hit) return JSON.parse(hit);
    var R = WEATHER_REGIONS, url = 'https://api.open-meteo.com/v1/forecast?latitude=' + R.map(function (r) { return r.lat; }).join(',') + '&longitude=' + R.map(function (r) { return r.lon; }).join(',') +
      '&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,snowfall_sum,wind_speed_10m_max&timezone=Asia%2FSeoul&forecast_days=3';
    var r = (await fetchMany([{ url: url }]))[0]; if (r.code !== 200) throw err('날씨 정보를 받지 못했습니다. 잠시 후 다시 시도하세요.');
    var data = JSON.parse(r.text); if (!Array.isArray(data)) data = [data];
    var out = { at: nowTxt(), regions: R.map(function (reg, i) {
      var d = data[i] || {}, dl = d.daily || {}, cur = d.current || {};
      return { name: reg.name, city: reg.city, now: { temp: cur.temperature_2m, code: cur.weather_code, wind: cur.wind_speed_10m },
        days: (dl.time || []).map(function (t, k) { return { date: t, code: dl.weather_code[k], max: dl.temperature_2m_max[k], min: dl.temperature_2m_min[k], pop: dl.precipitation_probability_max[k], rain: dl.precipitation_sum[k], snow: dl.snowfall_sum[k], wind: dl.wind_speed_10m_max[k] }; }) };
    }) };
    await cachePut('WEATHER', JSON.stringify(out), 3600); return out;
  }
  var STOCK_UA = { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://m.stock.naver.com/' }, STOCK_CUR = { USD: '$', JPY: '¥', CNY: '¥', HKD: 'HK$', EUR: '€', GBP: '£' };
  function stockNum(v) { var n = Number(String(v == null ? '' : v).replace(/[,%\s+]/g, '')); return isFinite(n) ? n : null; }
  function stockForeign(code) { return !/^\d{6}$/.test(code); }
  function stockCodeOk(code) { return /^\d{6}$/.test(code) || /^[A-Za-z0-9][A-Za-z0-9.\-]{0,19}$/.test(code); }
  function stockParse(code, json) {
    var d = (json && json.datas || [])[0]; if (!d) throw err('시세 형식이 바뀌었어요');
    var dir = d.compareToPreviousPrice && d.compareToPreviousPrice.name || '', diff = stockNum(d.compareToPreviousClosePrice), rate = stockNum(d.fluctuationsRatio);
    if (diff != null && /FALL|LOWER/.test(dir) && diff > 0) diff = -diff;
    if (rate != null && /FALL|LOWER/.test(dir) && rate > 0) rate = -rate;
    var foreign = stockForeign(code), cur = foreign ? String(d.currencyType && d.currencyType.code || 'USD') : 'KRW';
    return { code: code, name: String(d.stockName || d.stockNameEng || code), foreign: foreign, cur: cur, sym: foreign ? (STOCK_CUR[cur] || cur + ' ') : '', price: stockNum(d.closePrice), diff: diff, rate: rate,
      open: stockNum(d.openPrice), high: stockNum(d.highPrice), low: stockNum(d.lowPrice), volume: stockNum(d.accumulatedTradingVolume), market: String(d.marketStatus || ''), at: String(d.localTradedAt || '') };
  }
  async function stockQuotes(codes) {
    var keys = (codes || []).map(function (c) { return String(c).trim(); }).filter(stockCodeOk).slice(0, 5), out = {}, need = [];
    for (var k of keys) { var v = await cacheGet('STK_' + k); if (v) out[k] = JSON.parse(v); else need.push(k); }
    if (need.length) {
      var res = await fetchMany(need.map(function (k) { return { url: 'https://polling.finance.naver.com/api/realtime/' + (stockForeign(k) ? 'worldstock/stock/' : 'domestic/stock/') + encodeURIComponent(k), headers: STOCK_UA }; }));
      for (var i = 0; i < need.length; i++) {
        var key = need[i], r = res[i];
        try { if (r.code !== 200) throw err('응답 ' + r.code); out[key] = stockParse(key, JSON.parse(r.text)); await cachePut('STK_' + key, JSON.stringify(out[key]), 60); }
        catch (e) { out[key] = { code: key, name: key, foreign: stockForeign(key), error: e.message }; }
      }
    }
    return { quotes: keys.map(function (k) { return out[k]; }), at: nowTxt() };
  }
  async function stockSearch(q) {
    q = String(q || '').trim(); if (!q) return { items: [] };
    if (/^\d{6}$/.test(q)) { var one = (await stockQuotes([q])).quotes[0]; return { items: one && !one.error ? [{ code: q, name: one.name, market: '', ticker: q }] : [] }; }
    var key = 'STKQ2_' + encodeURIComponent(q).slice(0, 200), hit = await cacheGet(key); if (hit) return JSON.parse(hit);
    var r = (await fetchMany([{ url: 'https://ac.stock.naver.com/ac?q=' + encodeURIComponent(q) + '&target=stock', headers: STOCK_UA }]))[0];
    if (r.code !== 200) throw err('종목 검색 응답 ' + r.code);
    var j = JSON.parse(r.text), items = (j.items || []).map(function (x) {
      var kor = (x.nationCode || 'KOR') === 'KOR', code = kor ? String(x.code || '') : String(x.reutersCode || x.code || '');
      if (kor && !/^\d{6}$/.test(code)) return null; if (!kor && !stockCodeOk(code)) return null;
      return { code: code, name: String(x.name || code), ticker: String(x.code || code), market: String(x.typeName || x.typeCode || '') + (kor ? '' : ' · ' + String(x.nationName || x.nationCode || '해외')), foreign: !kor };
    }).filter(Boolean).slice(0, 12);
    var out = { items: items }; await cachePut(key, JSON.stringify(out), 86400); return out;
  }
  async function stockChart(code) {
    code = String(code || '').trim(); if (!stockCodeOk(code)) throw err('종목 코드를 확인하세요.');
    var key = 'STKC_' + code, hit = await cacheGet(key); if (hit) return JSON.parse(hit);
    var pts = [];
    if (!stockForeign(code)) {
      var r = (await fetchMany([{ url: 'https://fchart.stock.naver.com/sise.nhn?symbol=' + code + '&timeframe=day&count=70&requestType=0', headers: STOCK_UA }]))[0];
      if (r.code !== 200) throw err('차트 응답 ' + r.code);
      var re = /data="([^"]+)"/g, m; while ((m = re.exec(r.text))) { var f = m[1].split('|'); if (f.length >= 5) pts.push({ d: f[0].slice(0, 4) + '-' + f[0].slice(4, 6) + '-' + f[0].slice(6, 8), c: Number(f[4]) }); }
    } else {
      var end = new Date(), start = new Date(end.getTime() - 100 * 86400000), fmt = function (d) { return d.toISOString().slice(0, 10).replace(/-/g, '') + '0000'; };
      var r2 = (await fetchMany([{ url: 'https://api.stock.naver.com/chart/foreign/item/' + encodeURIComponent(code) + '/day?startDateTime=' + fmt(start) + '&endDateTime=' + fmt(end), headers: STOCK_UA }]))[0];
      if (r2.code !== 200) throw err('차트 응답 ' + r2.code);
      var j = JSON.parse(r2.text), arr = Array.isArray(j) ? j : (j.priceInfos || []);
      arr.forEach(function (x) { var d = String(x.localDate || x.localTradedAt || '').replace(/\D/g, '').slice(0, 8), c = stockNum(x.closePrice); if (d.length === 8 && c != null) pts.push({ d: d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8), c: c }); });
      pts = pts.slice(-70);
    }
    var out = { code: code, points: pts }; await cachePut(key, JSON.stringify(out), 1800); return out;
  }

  /* ───────────── 요청 나누기 (Code.js handle_ 의 순서·권한 그대로) ───────────── */
  // 권한: quote = 견적 메뉴 권한(Code.js QUOTE_ACTIONS) · admin = 관리자만 · '' = 로그인만
  var TABLE = {
    'custs.list': ['quote', function (s, q) { return custsList(); }],
    'custs.save': ['quote', function (s, q) { return custSave(s, q); }],
    'custs.delete': ['quote', function (s, q) { return custDelete(q.id); }],
    'manual.list': ['quote', function (s, q) { return manualList(); }],
    'manual.save': ['quote', function (s, q) { return manualSave(s, q); }],
    'manual.delete': ['quote', function (s, q) { return manualDelete(s, q.id); }],
    'manual.upload': ['quote', function (s, q) { return manualUpload(s, q); }],
    'manual.file': ['quote', function (s, q) { return manualFile(q.fileId); }],
    'manual.fileDelete': ['quote', function (s, q) { return manualFileDelete(s, q.fileId); }],
    'notes.list': ['analysis', async function (s, q) { return { notes: await notesList() }; }],
    'notes.save': ['analysis', function (s, q) { return notesSave(s, q); }],
    'notes.import': ['analysis', function (s, q) { return notesImport(s, q.rows); }],
    'notes.delete': ['analysis', function (s, q) { return notesDelete(q.id); }],
    'addr.list': ['quote', function (s, q) { return addrList(); }],
    'companies': ['quote', async function (s, q) { return { companies: await companies() }; }],
    'admin.saveCompanies': ['admin', function (s, q) { return saveCompanies(q.companies); }],
    'staff.list': ['admin1', function (s, q) { return staffList(); }],
    'staff.save': ['admin1', function (s, q) { return staffSave(s, q); }],
    'cal.all': ['', function (s, q) { return calAll(s); }],
    'cal.eventSave': ['', function (s, q) { return eventSave(s, q); }],
    'cal.eventDelete': ['', function (s, q) { return eventDelete(s, q.id); }],
    'cal.taskSave': ['', function (s, q) { return taskSave(s, q); }],
    'cal.taskDelete': ['', function (s, q) { return taskDelete(s, q.id); }],
    'cal.taskDone': ['', function (s, q) { return taskDone(s, q); }],
    'cal.leaveSave': ['', function (s, q) { return leaveSave(s, q); }],
    'cal.leaveDelete': ['', function (s, q) { return leaveDelete(s, q.id); }],
    'cal.dutyRuleSave': ['admin1', function (s, q) { return dutyRuleSave(s, q); }],
    'cal.dutyRuleDelete': ['admin1', function (s, q) { return dutyRuleDelete(s, q.id); }],
    'cal.dutyOverride': ['', function (s, q) { return dutyOverride(s, q); }],
    'cal.import': ['admin1', function (s, q) { return calImport(s, q); }],
    'cal.grantsSave': ['admin1', function (s, q) { return grantsSave(s, q); }],
    'cal.refreshHolidays': ['admin1', async function (s, q) { return { result: await refreshHolidays(), cal: await calAll(s) }; }],
    'reqs.list': ['quote', function (s, q) { return reqsList(); }],
    'reqs.get': ['quote', function (s, q) { return reqsGet(q.id, s); }],
    'reqs.save': ['quote', function (s, q) { return reqsSave(s, q); }],
    'reqs.stepSave': ['quote', function (s, q) { return reqStepSave(s, q); }],
    'reqs.stepDelete': ['quote', function (s, q) { return reqStepDelete(s, q.id); }],
    'reqs.import': ['quote', function (s, q) { return reqsImport(s, q); }],
    'reqs.upload': ['quote', function (s, q) { return reqsUpload(s, q); }],
    'reqs.file': ['quote', function (s, q) { return reqsFile(q.fileId); }],
    'reqs.fileDelete': ['quote', function (s, q) { return reqsFileDelete(s, q.fileId); }],
    'reqs.zip': ['quote', function (s, q) { return reqsZip(q.id); }],
    'reqs.delete': ['quote', function (s, q) { return reqsDelete(s, q.id); }],
    'docs.list': ['quote', function (s, q) { return docsList(); }],
    'docs.upload': ['quote', function (s, q) { return docsUpload(s, q); }],
    'docs.update': ['quote', function (s, q) { return docsUpdate(s, q.id, q.patch); }],
    'docs.get': ['quote', function (s, q) { return docsGet(q.id); }],
    'docs.zip': ['quote', function (s, q) { return docsZip(q.ids); }],
    'docs.delete': ['quote', function (s, q) { return docsDelete(s, q.id); }],
    'quote': ['quote', function (s, q) { return quote(s, q); }],
    'quoteBatch': ['quote', function (s, q) { return quoteBatch(s, q); }],
    'dieselPrice': ['quote', function (s, q) { return dieselPrice(); }],
    'diesel.recent': ['quote', function (s, q) { return dieselRecent(60); }],
    'history.list': ['quote', function (s, q) { return historyList(s, q); }],
    'history.get': ['quote', function (s, q) { return historyGet(s, q.recordId); }],
    'quotes.save': ['quote', function (s, q) { return quotesSave(s, q); }],
    'quotes.list': ['quote', function (s, q) { return quotesList(s, q); }],
    'quotes.get': ['quote', function (s, q) { return quotesGet(s, q.id); }],
    'quotes.update': ['quote', function (s, q) { return quotesUpdate(s, q.id, q.patch); }],
    'quotes.delete': ['quote', function (s, q) { return quotesDelete(s, q.id); }],
    'quotes.addRoutes': ['quote', function (s, q) { return quotesAddRoutes(s, q); }],
    'rates.list': ['quote', function (s, q) { return ratesList(); }],
    'rates.get': ['quote', function (s, q) { return ratesGet(q.cust); }],
    'rates.upload': ['quote', function (s, q) { return ratesUpload(s, q); }],
    'rates.saveSpecials': ['quote', function (s, q) { return saveCustSpecials(q.cust, q.specials); }],
    'rates.delete': ['admin', function (s, q) { return ratesDelete(q.cust); }],
    'admin.bootstrap': ['admin', function (s, q) { return bootstrap(); }],
    'admin.getSettings': ['admin', async function (s, q) { return { settings: await getSettings(), keys: await keyStatus() }; }],
    'admin.saveSettings': ['admin', function (s, q) { return saveSettings(q.settings); }],
    'admin.getTariff': ['admin', async function (s, q) { return { tariff: await readTariff() }; }],
    'admin.saveTariff': ['admin', function (s, q) { return saveTariff(q.tariff); }],
    'admin.getLogs': ['admin', async function (s, q) { return { logs: await getLogs(Number(q.limit) || 200) }; }],
    'admin.saveKeys': ['admin', function (s, q) { return saveKeys(q.kakao, q.opinet); }],
    'admin.testKakao': ['admin', function (s, q) { return testKakao(); }],
    'admin.cacheInfo': ['admin', async function (s, q) { return { cache: await cacheInfo() }; }],
    'admin.clearCache': ['admin', async function (s, q) { return { cache: await clearCache() }; }],
    'admin.dieselHistory': ['admin', function (s, q) { return dieselHistory(); }],
    'admin.dieselRecordNow': ['admin', async function (s, q) { await recordDieselDaily(); return dieselHistory(); }],
    'admin.dieselImport': ['admin', function (s, q) { return dieselImport(q.rows); }],
    'admin.saveNews': ['admin', function (s, q) { return saveNewsRules(q.rules); }],
    'analysis.index': ['anls', function (s, q) { return analysisIndex(s); }],
    'analysis.load': ['anls', function (s, q) { return analysisLoad(q.keys); }],
    'analysis.upload': ['admin', function (s, q) { return analysisUpload(s, q); }],
    'analysis.delete': ['admin', function (s, q) { return analysisDelete(q.key); }],
    'analysis.saveMap': ['admin', function (s, q) { return analysisSaveMap(q.map); }],
    'analysis.saveRules': ['admin', function (s, q) { return analysisSaveRules(q.rules); }],
    'analysis.accessLog': ['admin', async function (s, q) { return { logs: await analysisAccessLog(50) }; }],
    'info.diesel': ['', function (s, q) { return dieselRecent(100000); }],
    'info.news': ['', function (s, q) { return news(!!q.force && s.role === 'admin'); }],
    'info.weather': ['', function (s, q) { return weather(); }],
    'stock.quotes': ['', function (s, q) { return stockQuotes(q.codes); }],
    'stock.search': ['', function (s, q) { return stockSearch(q.q); }],
    'stock.chart': ['', function (s, q) { return stockChart(q.code); }],
    'weekly.get': ['', async function (s, q) { return { weekly: await weekly(q.week, s) }; }],
    'weekly.send': ['admin1', function (s, q) { return weeklySend(q.week, q.onlyMe ? s : null); }],
    'cal.companyHolidays': ['admin1', async function (s, q) { await saveCompanyHolidays(q.list); return calAll(s); }]
  };
  async function handle(action, session, req) {
    var t = TABLE[action];
    if (t[0] === 'quote') o.requirePerm(session, 'quote');
    else if (t[0] === 'analysis') o.requirePerm(session, 'analysis');
    else if (t[0] === 'anls') { if (session.perms.indexOf('analysis') === -1 && session.perms.indexOf('search') === -1) o.requirePerm(session, 'analysis'); }
    else if ((t[0] === 'admin' || t[0] === 'admin1') && session.role !== 'admin') throw err('관리자만 사용할 수 있습니다.');
    return t[1](session, req);
  }
  return { weeklySend: weeklySend, unpackAll: unpackAll, geo: geocodeMany, kakao: fetchAllKakao, ACTIONS: Object.keys(TABLE), has: function (a) { return Object.prototype.hasOwnProperty.call(TABLE, a); }, handle: handle, _t: { readAll: readAll, rowsOf: rowsOf, edit: edit } };
}
