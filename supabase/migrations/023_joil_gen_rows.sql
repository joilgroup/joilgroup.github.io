-- 일반업체 배차 기록 (2026-11-27 · 사용자: 구글 시트 '일반업체 시트'의 날짜 탭(11월30일 등)을 매일 밤 그대로 쌓아 두고, 마스터시트 취합·옛 탭 보관을 없애려고)
-- 시트 스크립트(apps-script/GenSync.js)가 날짜마다 통째로 보내면 그 날짜 줄을 지우고 새로 넣어요(고친 건·취소 건 반영, 두 번 안 쌓임). 지운 탭의 날짜는 그대로 남아요.
-- 칸은 마스터시트 10칸 그대로(글자 그대로 저장 · 배차금액은 분석 권한자만 화면에). 실데이터라 저장소에는 절대 넣지 않아요.
-- 되돌리기: drop table joil.gen_rows;
create table if not exists joil.gen_rows (
  id        bigint generated always as identity primary key,
  date      text not null,                 -- yyyy-MM-dd (탭 이름에서)
  seq       int not null,                  -- 그 날짜 안 순서 (시트 줄 순서)
  cust      text not null default '',      -- 매출처
  src       text not null default '',      -- 발지
  dst       text not null default '',      -- 착지
  kg        text not null default '',      -- 중량
  amount    text not null default '',      -- 배차금액
  car       text not null default '',      -- 차량번호
  driver    text not null default '',      -- 기사명
  phone     text not null default '',      -- 차량전화
  note      text not null default '',      -- 비고
  msg       text not null default '',      -- 문자
  origin    text not null default '',      -- 날짜 탭 이름 또는 '마스터시트'
  synced_at timestamptz not null default now()
);
create index if not exists gen_rows_date on joil.gen_rows (date, seq);
alter table joil.gen_rows enable row level security;
revoke all on joil.gen_rows from anon, authenticated;
grant select, insert, update, delete on joil.gen_rows to service_role;
