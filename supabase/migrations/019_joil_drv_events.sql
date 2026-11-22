-- 출발·도착 버튼 (애플 업체 기사 화면 go.html · 초기 작업): 기사가 상차지 출발 1번 + 하차지마다 도착을 누르면 그 시각과 그때 위치 한 번.
-- 앱 설치·GPS 단말기가 안 되는 용차용. 위치 권한을 거부해도 시각은 남아요(lat·lng 빈 값). 실수로 누르면 되돌리기(undone_at).
-- 되돌리기: drop table joil.drv_events;
create table if not exists joil.drv_events (
  id        bigint generated always as identity primary key,
  token     text not null,               -- 호차 링크코드 (disp_trucks.token)
  cust      text not null,
  date      text not null,
  no        int not null,
  kind      text not null,               -- dep(상차지 출발) · arr(하차지 도착)
  stop      int not null default 0,      -- 하차지 순서 (0부터 · 출발은 0)
  fc        text not null default '',    -- 하차지 이름 (그때 화면에 보인 것)
  at        timestamptz not null default now(),
  lat       double precision, lng double precision, acc double precision,
  undone_at timestamptz
);
create index if not exists drv_events_cd on joil.drv_events (cust, date);
create index if not exists drv_events_tk on joil.drv_events (token);
alter table joil.drv_events enable row level security;
revoke all on joil.drv_events from anon, authenticated;
grant select, insert, update, delete on joil.drv_events to service_role;
