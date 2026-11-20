-- 용차 위치 링크: 앱 설치 없이 문자 링크(브라우저)로 그날 하루만 위치 공유.
-- token = 링크에 들어가는 무작위 값(조일 서버가 만듦). 링크 날짜(한국)가 지나거나 ended_at 이 있으면 받지 않음.
create table if not exists public.track_links (
  token      text primary key,
  vehicle_id bigint not null references public.vehicles(id) on delete cascade,
  date       date not null,                         -- 이 날짜(한국 시간) 하루만
  started_at timestamptz,                           -- 기사가 '위치 공유 시작'을 누른 시각
  ended_at   timestamptz,                           -- 기사가 '종료'(또는 직원이 끝냄)
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists track_links_date on public.track_links (date);
alter table public.track_links enable row level security;
revoke all on public.track_links from anon, authenticated;
grant select, insert, update, delete on public.track_links to service_role;
