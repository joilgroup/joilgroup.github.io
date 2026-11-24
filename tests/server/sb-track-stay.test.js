// 차량 위치 머문 시작(020·021): 200m 안이면 처음 도착 시각 유지 · 벗어나면 새로 · 늦게 온 예전 점은 무시 · 차를 지우면 위치 기록도 (가짜 좌표)
var PG = require('../sb/pg.js'), fs = require('fs'), path = require('path'), ok = require('../lib/mock.js').ok;
(async function () {
  var db = await PG.start(); if (!db) { console.log('PASS (건너뜀) 시험용 Postgres 가 없어요'); return; }
  var postgres = require(path.join(__dirname, '..', 'sb', 'node_modules', 'postgres')), sql = postgres(db.url, { max: 1, onnotice: function () {} });
  try {
    var mig = path.join(__dirname, '..', '..', 'supabase', 'migrations');
    await sql.unsafe('drop table if exists public.track_links, public.positions, public.vehicles, public.app_settings cascade');
    await sql.unsafe("do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if; if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if; if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if; end $$");
    for (var f of ['001_tracking.sql', '002_tracking_throttle.sql', '003_track_links.sql', '020_track_stay.sql', '021_track_stay_fix.sql']) {
      var p = path.join(mig, f); if (!fs.existsSync(p)) p = path.join(mig, fs.readdirSync(mig).filter(function (x) { return x.indexOf(f.slice(0, 4)) === 0; })[0]);
      await sql.unsafe(fs.readFileSync(p, 'utf8'));
    }
    var v = (await sql.unsafe("insert into public.vehicles (plate, device_id) values ('00가0001', '00가0001') returning id"))[0].id;
    var put = function (hm, lat, lng) { return sql.unsafe('insert into public.positions (vehicle_id, fix_time, lat, lng) values ($1, $2, $3, $4)', [v, '2026-11-23T' + hm + ':00+09:00', lat, lng]); };
    var get = async function () { return (await sql.unsafe('select stay_since from public.vehicles where id = $1', [v]))[0].stay_since.toISOString(); };
    await put('08:00', 37.40, 127.10); await put('08:15', 37.45, 127.15); await put('08:30', 37.50, 127.20);
    ok('달리는 중: 마지막 위치 시각', await get() === '2026-11-22T23:30:00.000Z', await get());
    await put('08:35', 37.5005, 127.2004); await put('10:00', 37.5009, 127.1998); await put('12:00', 37.5003, 127.2002);
    ok('같은 곳(200m 안)에 계속: 처음 도착(08:30) 그대로', await get() === '2026-11-22T23:30:00.000Z', await get());
    await put('09:00', 37.6, 127.3);
    ok('늦게 온 예전 점은 무시', await get() === '2026-11-22T23:30:00.000Z', await get());
    await put('12:10', 37.55, 127.25);
    ok('벗어나면 새로 시작', await get() === '2026-11-23T03:10:00.000Z', await get());
    // 받는 함수 track 은 service_role 로 넣어요 — 020 은 트리거 안 track_dist_m 권한이 없어 insert 가 통째로 실패했음(021 로 고침)
    await sql.unsafe('alter role service_role bypassrls; grant usage on schema public to service_role; grant all on all tables in schema public to service_role; grant all on all sequences in schema public to service_role');
    var srErr = ''; try { await sql.begin(async function (t) { await t.unsafe('set local role service_role'); await t.unsafe("insert into public.positions (vehicle_id, fix_time, lat, lng) values ($1, '2026-11-23T12:20:00+09:00', 37.56, 127.26)", [v]); }); } catch (e) { srErr = e.message; }
    ok('service_role 로 넣어도 성공(트리거 권한)', !srErr, srErr);
    ok('service_role 로 넣은 점도 마지막 위치로', (await sql.unsafe('select last_time from public.vehicles where id = $1', [v]))[0].last_time.toISOString() === '2026-11-23T03:20:00.000Z');
    await sql.unsafe('delete from public.vehicles where id = $1', [v]);
    ok('차를 지우면 위치 기록도 같이 지워짐', Number((await sql.unsafe('select count(*) n from public.positions'))[0].n) === 0);
  } finally { await sql.unsafe('drop table if exists public.track_links, public.positions, public.vehicles, public.app_settings cascade').catch(function () {}); await sql.end(); await db.stop(); }
})().catch(function (e) { console.log('FAIL 테스트 중단 :: ' + e.message); process.exit(1); });
