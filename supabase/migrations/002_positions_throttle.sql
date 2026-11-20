-- 같은 차 위치는 1분에 1개만 저장 (앱이 75m마다 같은 짧은 간격으로 보내도 무료 용량이 금방 차지 않게).
-- 기본 키(vehicle_id, fix_time) 인덱스로 바로 찾아서 가벼움. 늦게 도착한 예전 점(앱이 모아 두었다 보낸 것)도 같은 규칙.
create or replace function public.positions_throttle() returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.positions p where p.vehicle_id = new.vehicle_id
             and p.fix_time > new.fix_time - interval '60 seconds' and p.fix_time < new.fix_time + interval '60 seconds') then
    return null;
  end if;
  return new;
end $$;
drop trigger if exists positions_throttle on public.positions;
create trigger positions_throttle before insert on public.positions for each row execute function public.positions_throttle();
revoke execute on function public.positions_throttle() from public, anon, authenticated;
