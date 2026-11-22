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
    'staff.save': ['admin1', function (s, q) { return staffSave(s, q); }]
  };
  async function handle(action, session, req) {
    var t = TABLE[action];
    if (t[0] === 'quote') o.requirePerm(session, 'quote');
    else if (t[0] === 'analysis') o.requirePerm(session, 'analysis');
    else if ((t[0] === 'admin' || t[0] === 'admin1') && session.role !== 'admin') throw err('관리자만 사용할 수 있습니다.');
    return t[1](session, req);
  }
  return { ACTIONS: Object.keys(TABLE), has: function (a) { return Object.prototype.hasOwnProperty.call(TABLE, a); }, handle: handle, _t: { readAll: readAll, rowsOf: rowsOf, edit: edit } };
}
