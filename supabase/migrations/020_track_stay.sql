-- 차량 위치: '언제부터 여기 있었나'(머문 시작 시각)를 차마다 기억해요 (2026-11-23 · 사용자: 8시 30분에 도착했는데 12시에 보면 12시로만 보여서 도착 시각을 모름)
-- 새 위치가 머문 곳 기준점에서 200m 안이면 그대로, 벗어나면 그 위치·시각으로 새로 시작. 가장 최신 위치일 때만(늦게 온 예전 점은 무시).
-- 되돌리기: 001 의 positions_set_last 를 다시 실행 · alter table public.vehicles drop column stay_since, drop column stay_lat, drop column stay_lng;
alter table public.vehicles add column if not exists stay_since timestamptz;
alter table public.vehicles add column if not exists stay_lat double precision;
alter table public.vehicles add column if not exists stay_lng double precision;

create or replace function public.track_dist_m(alat double precision, alng double precision, blat double precision, blng double precision) returns double precision
language sql immutable as $$
  select 111320 * sqrt(power(blat - alat, 2) + power((blng - alng) * cos(radians((alat + blat) / 2)), 2))
$$;

create or replace function public.positions_set_last() returns trigger language plpgsql as $$
begin
  update public.vehicles v set last_time = new.fix_time, last_lat = new.lat, last_lng = new.lng,
    last_speed = new.speed, last_battery = new.battery, last_received = new.received_at,
    stay_since = case when v.stay_lat is null or public.track_dist_m(v.stay_lat, v.stay_lng, new.lat, new.lng) > 200 then new.fix_time else v.stay_since end,
    stay_lat   = case when v.stay_lat is null or public.track_dist_m(v.stay_lat, v.stay_lng, new.lat, new.lng) > 200 then new.lat else v.stay_lat end,
    stay_lng   = case when v.stay_lat is null or public.track_dist_m(v.stay_lat, v.stay_lng, new.lat, new.lng) > 200 then new.lng else v.stay_lng end
  where v.id = new.vehicle_id and (v.last_time is null or v.last_time <= new.fix_time);
  return new;
end $$;
revoke execute on function public.positions_set_last() from public, anon, authenticated;
revoke execute on function public.track_dist_m(double precision, double precision, double precision, double precision) from public, anon, authenticated;

-- 지금 있는 차들: 마지막 위치에서 거꾸로 200m 안에 있던 가장 이른 점을 머문 시작으로 (한 번)
do $$
declare v record; p record; s_time timestamptz; done boolean;
begin
  for v in select id, last_lat, last_lng from public.vehicles where last_lat is not null loop
    s_time := null; done := false;
    for p in select fix_time, lat, lng from public.positions where vehicle_id = v.id and fix_time > now() - interval '3 days' order by fix_time desc loop
      exit when done;
      if public.track_dist_m(v.last_lat, v.last_lng, p.lat, p.lng) <= 200 then s_time := p.fix_time; else done := true; end if;
    end loop;
    update public.vehicles set stay_since = coalesce(s_time, last_time), stay_lat = last_lat, stay_lng = last_lng where id = v.id;
  end loop;
end $$;
