-- 조일 차량 위치 추적 1단계 (Supabase). 나중에 배차·기사 데이터를 옮겨 와도 vehicles.id 를 기준으로 이어 붙이게 설계.
-- 표 세 개 모두 RLS 켜고 정책 없음 = 브라우저 공개 키(anon)로는 못 읽음. 조일 서버(Apps Script)·받는 함수만 서비스 키로 접근.

create table if not exists public.vehicles (
  id            bigint generated always as identity primary key,
  plate         text not null unique,               -- 차량번호
  device_id     text not null unique,               -- Traccar 앱 '기기 ID' (기본 = 차량번호, 띄어쓰기·- 뺀 값)
  driver_name   text not null default '',
  driver_phone  text not null default '',
  affiliation   text not null default '',           -- 지입 / 직영 / 용차
  company       text not null default '',           -- 업체
  ton           text not null default '',           -- 톤수
  body_type     text not null default '',           -- 차종 (윙바디·카고 등)
  memo          text not null default '',
  active        boolean not null default true,
  last_time     timestamptz,                        -- 마지막 위치 (positions 에 들어올 때 트리거가 채움)
  last_lat      double precision,
  last_lng      double precision,
  last_speed    real,
  last_battery  real,
  last_received timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 무기한 저장이라 줄을 작게: 기본 키(차량+시각)가 곧 조회 인덱스, 같은 점 두 번 저장 안 됨
create table if not exists public.positions (
  vehicle_id  bigint not null references public.vehicles(id) on delete cascade,
  fix_time    timestamptz not null,                 -- 폰이 위치를 잡은 시각
  lat         double precision not null,
  lng         double precision not null,
  speed       real,                                 -- km/h
  heading     real,                                 -- 방향(도)
  accuracy    real,                                 -- 정확도(m)
  battery     real,                                 -- 배터리(%)
  received_at timestamptz not null default now(),   -- 서버가 받은 시각
  primary key (vehicle_id, fix_time)
);

create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);

-- 앱 주소에 붙일 비밀 키: DB 안에서 만들어 아무 데도 적지 않음 (조일 관리자 화면이 서비스 키로 읽어 보여 줌)
insert into public.app_settings (key, value)
values ('track_key', replace(gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

create or replace function public.positions_set_last() returns trigger language plpgsql as $$
begin
  update public.vehicles v set last_time = new.fix_time, last_lat = new.lat, last_lng = new.lng,
    last_speed = new.speed, last_battery = new.battery, last_received = new.received_at
  where v.id = new.vehicle_id and (v.last_time is null or v.last_time <= new.fix_time);
  return new;
end $$;

drop trigger if exists positions_last on public.positions;
create trigger positions_last after insert on public.positions for each row execute function public.positions_set_last();

alter table public.vehicles     enable row level security;
alter table public.positions    enable row level security;
alter table public.app_settings enable row level security;
revoke all on public.vehicles, public.positions, public.app_settings from anon, authenticated;
revoke execute on function public.positions_set_last() from public, anon, authenticated;
-- 새 Supabase 프로젝트는 새 표에 권한을 자동으로 안 줘요 → 서버용 서비스 키(service_role)에만 줌
grant select, insert, update, delete on public.vehicles, public.positions, public.app_settings to service_role;
