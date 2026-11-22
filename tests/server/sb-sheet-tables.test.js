// 014 시트 → 칸 있는 표: 칸 종류(글자·숫자·일시) · 한 칸씩 같은지 검사 · 종류가 섞이면 jsonb 로 넓힘 · 제목/칸 늘리기 · 줄 지우기 · 되돌리기
var PG = require('../sb/pg.js'), ok = require('../lib/mock.js').ok;
(async function () {
  var db = await PG.start(); if (!db) { console.log('PASS (건너뜀) 시험용 Postgres 가 없어요'); return; }
  var sql = db.sql, read = async function (n) { return (await sql.unsafe('select r, v from joil.sheet_read($1) order by r', [[n]])).map(function (x) { return x.v; }); };
  try {
    var rows = [['ID', '날짜', '금액', '메모'], ['A1', { $d: '2026-11-20T01:02:03.456Z' }, 1500, "'010"], ['A2', '', 0.022000000000000002, ''], ['A3', { $d: '2026-11-21T00:00:00.000Z' }, '', '메모']];
    await sql.unsafe("insert into joil.sheet_meta values ('시험', 1)");
    for (var i = 0; i < rows.length; i++) await sql.unsafe('insert into joil.sheet_rows values ($1, $2, $3)', ['시험', i + 1, rows[i]]);
    var tb = (await sql.unsafe("select joil.sheet_tabulate('시험', 'gs_t') r"))[0].r; ok('표로 옮김 (3줄 · 4칸)', tb.rows === 3 && tb.cols === 4, tb);
    var ty = await sql.unsafe("select column_name c, data_type t from information_schema.columns where table_schema = 'joil' and table_name = 'gs_t' order by ordinal_position");
    ok('칸 이름 = 제목 · 종류 = 값대로', ty.map(function (x) { return x.c + ':' + x.t; }).join() === 'r:integer,ID:text,날짜:timestamp with time zone,금액:numeric,메모:text', ty);
    var back = await read('시험'); ok('읽으면 원래 줄 그대로 (날짜 ms · 긴 소수까지 정확 · 앞 따옴표)', JSON.stringify(back[1]) === JSON.stringify(rows[1]) && back[2][2] === 0.022000000000000002 && back[0].join() === 'ID,날짜,금액,메모', back);
    await sql.unsafe("select joil.sheet_write('시험', $1)", [[{ r: 3, v: ['A2', '', '모름', 'x'] }]]);
    var t2 = await sql.unsafe("select data_type t from information_schema.columns where table_schema = 'joil' and table_name = 'gs_t' and column_name = '금액'"), b2 = await read('시험');
    ok('숫자 칸에 글자 → 그 칸만 jsonb 로 · 다른 줄 숫자 그대로', t2[0].t === 'jsonb' && b2[1][2] === 1500 && b2[2][2] === '모름', [t2, b2]);
    await sql.unsafe("select joil.sheet_write('시험', $1)", [[{ r: 1, v: ['ID', '날짜', '금액', '메모', '담당'] }, { r: 5, v: ['A4', '', 7, '', '김'] }]]);
    var b3 = await read('시험'); ok('제목 늘리기 · 새 줄', b3[0].length === 5 && b3[0][4] === '담당' && b3[4][4] === '김' && b3[4][2] === 7, b3);
    await sql.unsafe("select joil.sheet_cut('시험', 3)"); var b4 = await read('시험'); ok('줄 지우기', b4.length === 3, b4.length);
    var n = (await sql.unsafe("select joil.sheet_untabulate('시험') n"))[0].n, b5 = (await sql.unsafe("select v from joil.sheet_rows where sheet = '시험' order by r")).map(function (x) { return x.v; });
    ok('되돌리기: 표 내용을 시트 줄로', n === 3 && b5[2][2] === '모름' && b5[0][4] === '담당', b5);
    var bad = await sql.unsafe("select count(*)::int n from joil.sheet_tables where sheet = '시험' and \"on\""); ok('되돌린 뒤엔 시트 줄 사용', bad[0].n === 0);
  } finally { await db.stop(); }
})().catch(function (e) { ok('실행 오류', false, e.stack || String(e)); });
