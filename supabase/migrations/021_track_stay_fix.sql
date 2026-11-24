-- 020 고침 (2026-11-24): 020 이 track_dist_m 실행 권한을 service_role 에서도 빼 버려서(public 에서 revoke), 받는 함수 track 이 위치를 넣을 때
-- 트리거 positions_set_last 가 'permission denied for function track_dist_m' 으로 insert 를 통째로 실패시켰어요(11-23 12:45 KST 이후 위치 0개).
-- 둘 다 security definer(소유자 권한)로 돌게 해서 누가 넣든 트리거가 돌아요. 직접 호출 권한은 계속 막아요.
create or replace function public.track_dist_m(alat double precision, alng double precision, blat double precision, blng double precision) returns double precision
language sql immutable security definer set search_path = public as $$
  select 111320 * sqrt(power(blat - alat, 2) + power((blng - alng) * cos(radians((alat + blat) / 2)), 2))
$$;

create or replace function public.positions_set_last() returns trigger language plpgsql security definer set search_path = public as $$
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
