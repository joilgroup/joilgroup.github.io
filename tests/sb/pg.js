// 시험용 Postgres: 이 컴퓨터에 잠깐 띄우는 빈 DB (실제 Supabase 프로젝트는 건드리지 않아요).
// supabase/migrations/*.sql 을 순서대로 적용하고 연결 주소를 돌려줘요. Postgres가 없으면 null (테스트는 건너뜀).
// 이미 띄운 DB를 쓰려면 환경변수 JOIL_TEST_DB=postgres://… (예: 다른 시험용 스키마 · 운영 표에는 쓰지 마세요)
var cp = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
var ROOT = path.join(__dirname, '..', '..');
function bin(name) { try { var d = fs.readdirSync('/usr/lib/postgresql').sort().pop(); var p = '/usr/lib/postgresql/' + d + '/bin/' + name; return fs.existsSync(p) ? p : null; } catch (e) { return null; } }
function asPg(args) { var root = process.getuid && process.getuid() === 0; return root ? cp.spawnSync('runuser', ['-u', 'postgres', '--'].concat(args), { encoding: 'utf8' }) : cp.spawnSync(args[0], args.slice(1), { encoding: 'utf8' }); }
// Supabase에 원래 있는 것 흉내: extensions 스키마의 pgcrypto, anon·authenticated·service_role 역할
var PRE = "create schema if not exists extensions; create extension if not exists pgcrypto schema extensions;" +
  " do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if; end $$;";
function migrations() { var d = path.join(ROOT, 'supabase', 'migrations'); return fs.readdirSync(d).filter(function (f) { return /\.sql$/.test(f); }).sort().map(function (f) { return fs.readFileSync(path.join(d, f), 'utf8'); }); }
function need() { // postgres.js 가 없으면 한 번 설치 (tests/sb/node_modules · 저장소에는 안 올라가요)
  try { return require('postgres'); } catch (e) {}
  var r = cp.spawnSync('npm', ['install', '--no-audit', '--no-fund', '--prefix', __dirname], { encoding: 'utf8' });
  try { return require('postgres'); } catch (e) { console.log('postgres.js 설치 실패: ' + (r.stderr || '').slice(0, 200)); return null; }
}
async function start() {
  var postgres = need(); if (!postgres) return null;
  if (process.env.JOIL_TEST_DB) { var s0 = postgres(process.env.JOIL_TEST_DB, { max: 1, onnotice: function () {} }); return { url: process.env.JOIL_TEST_DB, sql: s0, stop: async function () { await s0.end(); } }; }
  var initdb = bin('initdb'), pgctl = bin('pg_ctl'); if (!initdb) return null;
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joilpg-')); fs.chmodSync(dir, 0o777);
  var data = path.join(dir, 'data'), port = 25000 + Math.floor(Math.random() * 5000);
  var r = asPg([initdb, '-D', data, '-A', 'trust', '-U', 'postgres', '--no-sync']); if (r.status !== 0) { console.log('initdb 실패: ' + r.stderr); return null; }
  r = asPg([pgctl, '-D', data, '-o', '-p ' + port + ' -k ' + dir + ' -c listen_addresses=127.0.0.1 -c fsync=off', '-l', path.join(dir, 'log'), '-w', 'start']); if (r.status !== 0) { console.log('Postgres 시작 실패: ' + r.stderr + r.stdout); return null; }
  var url = 'postgres://postgres@127.0.0.1:' + port + '/postgres', sql = postgres(url, { max: 1, onnotice: function () {} });
  await sql.unsafe(PRE); for (var m of migrations()) await sql.unsafe(m);
  return { url: url, sql: sql, stop: async function () { await sql.end(); asPg([pgctl, '-D', data, '-m', 'immediate', 'stop']); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} } };
}
module.exports = { start: start };
