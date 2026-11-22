// 새 서버로 옮긴 Code.js 영역 (거래처·매뉴얼·일정·견적·분석 …) — Code.js 의 같은 이름 함수(끝 _ 뺌)를 시트 표(014 joil.gs_…)에 바로 읽고 쓰게 옮긴 것.
// 같은 표를 Code.js(gas.js)도 같이 쓰니까 값은 Code.js 와 똑같이(앞 ' · 날짜 글자 → 날짜) 쓰고, 쓸 때마다 시트 버전을 올려요(joil.sheet_touch).
// 요청 → 응답은 Code.js 와 같게: tests/server/sb-port.test.js 가 목(Code.js)과 같은 요청을 보내 비교해요.
// 꺼짐 스위치: props 'PORT_OFF' = 'custs,manual' 처럼 액션 앞부분을 쉼표로 → 그 영역은 다시 gas.js(Code.js 그대로)가 맡아요(index.ts).
import { sheetValue, readValue, enc, dec, display, formatDate } from './gas.js';

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
  async function bodyRows(name, width, db) { var all = await readAll(name, db); return all.slice(1).map(function (r, i) { var v = []; for (var j = 0; j < width; j++) v.push(readValue(r[j] == null ? '' : r[j])); v._r = i + 2; return v; }); }
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
    'weekly.get': ['', async function (s, q) { return { weekly: await weekly(q.week, s) }; }],
    'weekly.send': ['admin1', function (s, q) { return weeklySend(q.week, q.onlyMe ? s : null); }],
    'cal.companyHolidays': ['admin1', async function (s, q) { await saveCompanyHolidays(q.list); return calAll(s); }]
  };
  async function handle(action, session, req) {
    var t = TABLE[action];
    if (t[0] === 'quote') o.requirePerm(session, 'quote');
    else if (t[0] === 'analysis') o.requirePerm(session, 'analysis');
    else if ((t[0] === 'admin' || t[0] === 'admin1') && session.role !== 'admin') throw err('관리자만 사용할 수 있습니다.');
    return t[1](session, req);
  }
  return { weeklySend: weeklySend, ACTIONS: Object.keys(TABLE), has: function (a) { return Object.prototype.hasOwnProperty.call(TABLE, a); }, handle: handle, _t: { readAll: readAll, rowsOf: rowsOf, edit: edit } };
}
