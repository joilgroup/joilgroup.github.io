-- 차량 위치: '배차 출발~도착만' 받기 (2026-11-24 · 사용자: 앱을 깔면 어디를 가든 위치가 남음 → 실제 업무 때만, 기사가 켜고 끄지 않게)
-- 차마다 track_mode: always(예전처럼 늘) · work(그날 배차에서 기사가 '출발'을 누른 때부터 마지막 '도착'까지, 안 누르면 출발 뒤 14시간까지).
-- 그 밖에 들어온 위치는 저장하지 않고 버려요(앱에는 성공으로 답해서 다시 보내지 않음). 배차 차량번호(disp_trucks.car)와 차량 위치 차량번호를 띄어쓰기·- 빼고 비교.
-- 하루 두 번 배차면 배차(호차)마다 따로 — 사이 시간은 버림.
-- 되돌리기: drop trigger positions_work on public.positions; drop function public.positions_work_only(); alter table public.vehicles drop column track_mode; alter table joil.drv_events drop column last;
alter table public.vehicles add column if not exists track_mode text not null default 'always';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vehicles_track_mode_chk') then
    alter table public.vehicles add constraint vehicles_track_mode_chk check (track_mode in ('always', 'work'));
  end if;
end $$;
alter table joil.drv_events add column if not exists last boolean not null default false; -- 마지막 하차지 도착 (이걸 누르면 위치 받기 끝)
create index if not exists drv_events_dep_at on joil.drv_events (at) where kind = 'dep' and undone_at is null;

create or replace function public.track_plate_key(s text) returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(s, ''), '[\s-]', '', 'g'))
$$;

create or replace function public.positions_work_only() returns trigger language plpgsql security definer set search_path = public, joil as $$
declare m text; p text;
begin
  select track_mode, public.track_plate_key(plate) into m, p from public.vehicles where id = new.vehicle_id;
  if m is distinct from 'work' or p = '' then return new; end if;
  if exists (
    select 1 from joil.drv_events d
    where d.kind = 'dep' and d.undone_at is null
      and d.at <= new.fix_time and d.at > new.fix_time - interval '14 hours'
      and exists (select 1 from joil.disp_trucks t where t.token = d.token and t.token <> '' and position(p in public.track_plate_key(t.car)) > 0)
      and not exists (select 1 from joil.drv_events a where a.token = d.token and a.kind = 'arr' and a.last and a.undone_at is null and a.at < new.fix_time)
  ) then return new; end if;
  return null; -- 업무 시간 밖: 저장 안 함
end $$;
revoke execute on function public.positions_work_only() from public, anon, authenticated;
revoke execute on function public.track_plate_key(text) from public, anon, authenticated;
drop trigger if exists positions_work on public.positions;
create trigger positions_work before insert on public.positions for each row execute function public.positions_work_only();
