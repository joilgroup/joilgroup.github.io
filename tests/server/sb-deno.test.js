// Supabase 함수 입구(supabase/functions/joil/index.ts)를 실제 Deno 로 띄워 시험용 Postgres 에 붙여 봐요 (배포 전 확인).
// Deno 가 없으면 tests/sb 에 한 번 설치(npm 'deno'), 그래도 없으면 건너뜀. 화면처럼 text/plain 으로 보내 CORS 사전 요청 없이 되는지도.
var cp = require('child_process'), fs = require('fs'), path = require('path'), L = require('../sb/lib.js'), PG = require('../sb/pg.js'), ok = require('../lib/mock.js').ok;
var SB = path.join(__dirname, '..', 'sb'), BIN = path.join(SB, 'node_modules', '.bin', 'deno');
function deno() { if (fs.existsSync(BIN)) return BIN; cp.spawnSync('npm', ['install', '--no-audit', '--no-fund', '--no-save', '--prefix', SB, 'deno@2.1.4'], { encoding: 'utf8' }); return fs.existsSync(BIN) ? BIN : null; }
(async function () {
  var bin = deno(); if (!bin) { console.log('PASS (건너뜀) Deno 를 설치하지 못했어요'); return; }
  var db = await PG.start(); if (!db) { console.log('PASS (건너뜀) 시험용 Postgres 가 없어요'); return; }
  var port = 8000, proc = null;
  try {
    var salt = 's1', core = await import(path.join(__dirname, '..', '..', 'supabase', 'functions', 'joil', 'core.js')), h = core.makeServer(db.sql)._t.hash;
    await db.sql.unsafe("insert into joil.accounts (id, name, role, status, pw_hash, salt, must_change, perms) values ('a', '관리', 'admin', '사용', $1, $2, 'N', null)", [await h('test1234', salt), salt]);
    proc = cp.spawn(bin, ['run', '--allow-net', '--allow-env', '--allow-read', '--no-prompt', path.join(__dirname, '..', '..', 'supabase', 'functions', 'joil', 'index.ts')], { env: Object.assign({}, process.env, { SUPABASE_DB_URL: db.url, DENO_DIR: path.join(SB, '.deno'), DENO_NO_UPDATE_CHECK: '1' }), stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    var log = ''; proc.stdout.on('data', function (d) { log += d; }); proc.stderr.on('data', function (d) { log += d; });
    var up = false; for (var i = 0; i < 120 && !up; i++) { await new Promise(function (r) { setTimeout(r, 500); }); up = /Listening/.test(log); }
    ok('Deno 로 함수가 뜸', up, log.slice(-500)); if (!up) return;
    var post = async function (body) { var r = await fetch('http://127.0.0.1:' + port + '/', { method: 'POST', body: JSON.stringify(body) }); return { cors: r.headers.get('access-control-allow-origin'), enc: r.headers.get('content-encoding'), j: await r.json() }; };
    var lg = await post({ action: 'login', id: 'a', password: 'test1234' });
    ok('text/plain 로그인 · CORS 열림', lg.j.ok && lg.j.token && lg.cors === '*', lg);
    var tb = await post({ action: 'dispatch.tabs', token: lg.j.token, cust: '삼다수' });
    ok('배차 탭 (Code.js 와 같은 기본 탭)', tb.j.ok && tb.j.tabs.length === 5 && typeof tb.j.ms === 'number', tb.j);
    var im = await post({ action: 'dispatch.import', token: lg.j.token, cust: '삼다수', rows: [{ date: '2026-11-20', key: 'k1', d: { fc: '인천', bundle: '18' } }] });
    var dy = await post({ action: 'dispatch.day', token: lg.j.token, cust: '삼다수', date: '2026-11-20' });
    ok('붙여넣기 → 날짜 조회', im.j.ok && im.j.added === 1 && dy.j.ok && dy.j.orders.length === 1 && dy.j.orders[0].d.bundle === '18', [im.j, dy.j]);
    var many = []; for (var k = 0; k < 40; k++) many.push({ date: '2026-11-21', key: 'm' + k, d: { fc: '센터' + k, bundle: '3', addr: '경기 테스트시 테스트로 ' + k } });
    await post({ action: 'dispatch.import', token: lg.j.token, cust: '삼다수', rows: many });
    var big = await post({ action: 'dispatch.day', token: lg.j.token, cust: '삼다수', date: '2026-11-21' });
    ok('큰 응답은 gzip 으로 줄여 보냄 (무료 전송량 아끼기)', big.enc === 'gzip' && big.j.ok && big.j.orders.length === 40, { enc: big.enc, n: big.j.orders && big.j.orders.length });
    var bad = await post({ action: 'dispatch.day', token: 'nope', cust: '삼다수', date: '2026-11-20' });
    ok('토큰이 틀리면 같은 오류 문구', !bad.j.ok && bad.j.error === '로그인이 만료되었습니다. 다시 로그인하세요.', bad.j);
    var g = await fetch('http://127.0.0.1:' + port + '/'); ok('GET = 작동 확인 글', /정상 작동/.test(await g.text()));
  } finally { if (proc) try { process.kill(-proc.pid, 'SIGKILL'); } catch (e) { proc.kill('SIGKILL'); } await db.stop(); }
})().catch(function (e) { ok('실행 오류', false, e.stack || String(e)); }).then(function () { setTimeout(function () { process.exit(); }, 50); }); // Deno 가 남긴 연결이 node 를 붙잡지 않게
