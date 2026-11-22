// Supabase 함수 입구(supabase/functions/joil/index.ts)를 실제 Deno 로 띄워 시험용 Postgres 에 붙여 봐요 (배포 전 확인).
// Deno 가 없으면 tests/sb 에 한 번 설치(npm 'deno'), 그래도 없으면 건너뜀. 화면처럼 text/plain 으로 보내 CORS 사전 요청 없이 되는지도.
var cp = require('child_process'), fs = require('fs'), path = require('path'), L = require('../sb/lib.js'), PG = require('../sb/pg.js'), ok = require('../lib/mock.js').ok;
var SB = path.join(__dirname, '..', 'sb'), BIN = path.join(SB, 'node_modules', '.bin', 'deno');
function deno() { if (fs.existsSync(BIN)) return BIN; cp.spawnSync('npm', ['install', '--no-audit', '--no-fund', '--no-save', '--prefix', SB, 'deno@2.1.4'], { encoding: 'utf8' }); return fs.existsSync(BIN) ? BIN : null; }
(async function () {
  require('child_process').spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'supabase', 'functions', 'joil', 'build.js')]); // gas_src.js 만들기
  var bin = deno(); if (!bin) { console.log('PASS (건너뜀) Deno 를 설치하지 못했어요'); return; }
  var db = await PG.start(); if (!db) { console.log('PASS (건너뜀) 시험용 Postgres 가 없어요'); return; }
  var port = 8000, proc = null;
  try {
    var salt = 's1', core = await import(path.join(__dirname, '..', '..', 'supabase', 'functions', 'joil', 'core.js')), h = core.makeServer(db.sql)._t.hash;
    await db.sql.unsafe("insert into joil.accounts (id, name, role, status, pw_hash, salt, must_change, perms) values ('a', '관리', 'admin', '사용', $1, $2, 'N', null)", [await h('test1234', salt), salt]);
    // 압축 값 풀기(017)가 Deno 에서 되는지: 압축 원본을 넣고 UNPACK = go 로 띄움 (Deno 엔 Buffer 가 기본으로 없어 한 번 실제 서버에서 실패했음)
    var gz = function (o) { return require('zlib').gzipSync(Buffer.from(JSON.stringify(o))).toString('base64'); }, AN = [['2026-10-01', '가', 'a', 'b', '1톤', 1000, 500], ['2026-10-02', '나', 'a', 'c', '5톤', 3000, 2000]];
    var put = function (sheet, rows) { return db.sql.unsafe('select joil.sheet_write($1, $2::text::jsonb)', [sheet, JSON.stringify(rows.map(function (v, i) { return { r: i + 1, v: v }; }))]); };
    await put('분석데이터', [['키', '순번', '데이터'], ['조일물류|2026-10', 1, gz(AN)]]);
    await put('분석목록', [['키', '사업자', '월', '건수', '매출합', '매입합'], ['조일물류|2026-10', '조일물류', "'2026-10", 2, 4000, 2500]]);
    await put('스냅샷', [['ID', '저장시각', '아이디', '데이터'], ['R1', 1, 'a', gz({ meta: { type: '단건' }, items: [{ no: 1 }] })]]);
    await db.sql.unsafe("insert into joil.props (key, value) values ('UNPACK', 'go')");
    proc = cp.spawn(bin, ['run', '--allow-net', '--allow-env', '--allow-read', '--no-prompt', path.join(__dirname, '..', '..', 'supabase', 'functions', 'joil', 'index.ts')], { env: Object.assign({}, process.env, { SUPABASE_DB_URL: db.url, DENO_DIR: path.join(SB, '.deno'), DENO_NO_UPDATE_CHECK: '1' }), stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    var log = ''; proc.stdout.on('data', function (d) { log += d; }); proc.stderr.on('data', function (d) { log += d; });
    var up = false; for (var i = 0; i < 120 && !up; i++) { await new Promise(function (r) { setTimeout(r, 500); }); up = /Listening/.test(log); }
    ok('Deno 로 함수가 뜸', up, log.slice(-500)); if (!up) return;
    var post = async function (body) { var r = await fetch('http://127.0.0.1:' + port + '/', { method: 'POST', body: JSON.stringify(body) }); return { cors: r.headers.get('access-control-allow-origin'), enc: r.headers.get('content-encoding'), j: await r.json() }; };
    var lg = await post({ action: 'login', id: 'a', password: 'test1234' });
    ok('text/plain 로그인 · CORS 열림', lg.j.ok && lg.j.token && lg.cors === '*', lg);
    var ur = JSON.parse(((await db.sql.unsafe("select value from joil.props where key = 'UNPACK_RESULT'"))[0] || {}).value || '{}');
    ok('Deno 에서 압축 풀기 (스냅샷·분석, 원본 합계와 같음)', ur.snap && ur.snap.ok && ur.snap.rows === 1 && ur.an && ur.an.ok && ur.an.same === 1, ur);
    var au = await post({ action: 'analysis.upload', token: lg.j.token, biz: '명일로지스', month: '2026-09', data: gz([['2026-09-03', '다', 'a', 'b', '1톤', 10, 5]]), count: 1 }), al = await post({ action: 'analysis.load', token: lg.j.token, keys: ['명일로지스|2026-09'] });
    ok('분석 올리기·받기 (Deno 의 gzip)', au.j.ok && au.j.count === 1 && al.j.ok && /^H4sI/.test(al.j.data['명일로지스|2026-09'] || ''), [au.j, al.j.error]);
    var tb = await post({ action: 'dispatch.tabs', token: lg.j.token, cust: '삼다수' });
    ok('배차 탭 (Code.js 와 같은 기본 탭)', tb.j.ok && tb.j.tabs.length === 5 && typeof tb.j.ms === 'number', tb.j);
    var im = await post({ action: 'dispatch.import', token: lg.j.token, cust: '삼다수', rows: [{ date: '2026-11-20', key: 'k1', d: { fc: '인천', bundle: '18' } }] });
    var dy = await post({ action: 'dispatch.day', token: lg.j.token, cust: '삼다수', date: '2026-11-20' });
    ok('붙여넣기 → 날짜 조회', im.j.ok && im.j.added === 1 && dy.j.ok && dy.j.orders.length === 1 && dy.j.orders[0].d.bundle === '18', [im.j, dy.j]);
    var many = []; for (var k = 0; k < 40; k++) many.push({ date: '2026-11-21', key: 'm' + k, d: { fc: '센터' + k, bundle: '3', addr: '경기 테스트시 테스트로 ' + k } });
    await post({ action: 'dispatch.import', token: lg.j.token, cust: '삼다수', rows: many });
    var big = await post({ action: 'dispatch.day', token: lg.j.token, cust: '삼다수', date: '2026-11-21' });
    ok('큰 응답은 gzip 으로 줄여 보냄 (무료 전송량 아끼기)', big.enc === 'gzip' && big.j.ok && big.j.orders.length === 40, { enc: big.enc, n: big.j.orders && big.j.orders.length });
    var ns = await post({ action: 'notice.save', token: lg.j.token, notice: { title: '첫 공지', body: '내용' } }), nl = await post({ action: 'notice.list', token: lg.j.token });
    ok('Code.js 실행기(공지 저장·목록)가 Deno 에서 동작', ns.j.ok && nl.j.ok && nl.j.notices.length === 1 && nl.j.notices[0].title === '첫 공지', [ns.j, nl.j]);
    var cs = await post({ action: 'cal.all', token: lg.j.token }); ok('일정 달력 읽기', cs.j.ok && Array.isArray(cs.j.events), cs.j.error);
    var bad = await post({ action: 'dispatch.day', token: 'nope', cust: '삼다수', date: '2026-11-20' });
    ok('토큰이 틀리면 같은 오류 문구', !bad.j.ok && bad.j.error === '로그인이 만료되었습니다. 다시 로그인하세요.', bad.j);
    var g = await fetch('http://127.0.0.1:' + port + '/'); ok('GET = 작동 확인 글', /정상 작동/.test(await g.text()));
  } finally { if (proc) try { process.kill(-proc.pid, 'SIGKILL'); } catch (e) { proc.kill('SIGKILL'); } await db.stop(); }
})().catch(function (e) { ok('실행 오류', false, e.stack || String(e)); }).then(function () { setTimeout(function () { process.exit(); }, 50); }); // Deno 가 남긴 연결이 node 를 붙잡지 않게
