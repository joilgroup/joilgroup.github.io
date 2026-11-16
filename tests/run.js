// 테스트 한 번에 돌리기: node tests/run.js [server|ui|파일이름 일부]
// 화면 테스트는 저장소 폴더를 잠깐 웹 서버(python3 -m http.server)로 띄워서 데모 모드로 열어요.
var cp = require('child_process'), fs = require('fs'), path = require('path'), http = require('http');
var ROOT = path.join(__dirname, '..'), PORT = process.env.PORT || 8765, want = process.argv[2] || '';
var files = ['server', 'ui'].reduce(function (a, d) { return a.concat(fs.readdirSync(path.join(__dirname, d)).filter(function (f) { return /\.test\.js$/.test(f); }).sort().map(function (f) { return d + '/' + f; })); }, []).filter(function (f) { return f.indexOf(want) !== -1; });
function up(cb) { http.get('http://localhost:' + PORT + '/index.html', function (r) { r.resume(); cb(r.statusCode === 200); }).on('error', function () { cb(false); }); }
function waitUp(n, cb) { up(function (ok) { if (ok || n <= 0) return cb(ok); setTimeout(function () { waitUp(n - 1, cb); }, 300); }); }
var web = null, pass = 0, fail = 0, bad = [];
function runAll(i) {
  if (i >= files.length) { if (web) web.kill(); console.log('\n합계: 통과 ' + pass + ' · 실패 ' + fail + (bad.length ? '\n실패한 파일: ' + bad.join(', ') : '')); process.exit(fail ? 1 : 0); }
  var f = files[i]; console.log('\n== ' + f);
  var r = cp.spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', env: Object.assign({}, process.env, { PORT: String(PORT) }), timeout: 240000 });
  var out = (r.stdout || '') + (r.stderr || ''), p = (out.match(/^PASS /gm) || []).length, x = (out.match(/^FAIL /gm) || []).length;
  if (r.status !== 0 && !x) x = 1; // 멈추거나 시간 초과
  out.split('\n').filter(function (l) { return /^FAIL /.test(l); }).forEach(function (l) { console.log(l); });
  console.log('통과 ' + p + (x ? ' · 실패 ' + x : '')); pass += p; fail += x; if (x) bad.push(f);
  runAll(i + 1);
}
if (!files.length) { console.log('맞는 테스트 파일이 없어요: ' + want); process.exit(1); }
if (!files.some(function (f) { return f.indexOf('ui/') === 0; })) runAll(0);
else up(function (ok) {
  if (ok) return runAll(0);
  web = cp.spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  waitUp(20, function (ok2) { if (!ok2) { console.log('웹 서버를 띄우지 못했어요 (포트 ' + PORT + ')'); process.exit(1); } runAll(0); });
});
