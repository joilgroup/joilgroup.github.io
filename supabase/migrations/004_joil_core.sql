-- 조일 서버 이전 2·3단계: 로그인·계정·권한 + 배차. 구글 시트 칸을 빠짐없이 옮길 수 있게 시트마다 표 하나.
-- 모두 새 스키마 joil 안에 만들어요 → 차량 위치 표(public.vehicles·positions·track_links·app_settings)는 건드리지 않아요.
-- 되돌리기: drop schema joil cascade; (public 의 joil_ 함수 두 개도 drop) — docs/서버이전.md '되돌리는 방법'.
-- RLS 켜고 정책 없음 = 브라우저 공개 키(anon)로는 못 읽음. 서버 함수(joil)는 DB에 직접 붙어서(SUPABASE_DB_URL) 읽고 써요.
-- 날짜 칸은 시트처럼 'YYYY-MM-DD' 글자(text) — 화면·Code.js가 글자로 비교해서 그대로 두는 게 같은 응답을 내기 쉬워요.
-- 일시 칸(등록일시·수정일시)도 시트에 적힌 'yyyy-MM-dd HH:mm:ss' 글자 그대로.

create schema if not exists joil;

-- ── 계정 (시트 '계정': 아이디·이름·권한·사용여부·비밀번호해시·솔트·비밀번호변경필요·생성일·마지막로그인·메뉴권한·배차탭)
create table if not exists joil.accounts (
  id          text primary key,                 -- 아이디
  name        text not null default '',         -- 이름
  role        text not null default 'user',     -- 권한 admin / user / partner (시트에 staff 등 다른 값이 있어도 그대로)
  status      text not null default '사용',     -- 사용여부 (사용 / 중지)
  pw_hash     text not null default '',         -- 비밀번호해시 (Code.js hash_ 와 같은 방식 → 옮겨도 비밀번호 그대로)
  salt        text not null default '',
  must_change text not null default 'N',        -- 비밀번호변경필요 Y/N
  created_at  text not null default '',         -- 생성일
  last_login  text not null default '',         -- 마지막로그인
  perms       text,                             -- 메뉴권한 (null = 예전 계정 = 견적만 · 'none' = 없음)
  disp_tabs   text not null default '',         -- 배차탭 (협력사: 줄바꿈으로 구분)
  ord         bigint generated always as identity -- 시트 줄 순서 (계정 목록 순서)
);

-- ── 로그인 세션 (Apps Script 캐시 S_… 6시간 + 스크립트 속성 RT_… 30일 '로그인 유지' 를 한 표로)
create table if not exists joil.sessions (
  token_hash text primary key,                  -- 토큰의 SHA-256 (토큰 자체는 저장 안 함)
  user_id    text not null,
  keep       boolean not null default false,    -- 이 기기에서 로그인 유지
  expires_at timestamptz not null,              -- 유지 안 함: 마지막 요청 + 6시간 · 유지: 30일 (쓰는 동안 연장)
  created_at timestamptz not null default now()
);
create index if not exists sessions_user on joil.sessions (user_id);

create table if not exists joil.login_fails (
  user_id text primary key,
  n       int not null default 0,
  until   timestamptz not null                  -- 10분 지나면 0부터
);

-- ── 스크립트 속성에 있던 값 (SETTINGS → 화면 공개 설정 PUBLIC_SETTINGS 등)
create table if not exists joil.props (
  key   text primary key,
  value text not null
);

-- ── 배차오더 (ID·업체·날짜·키·데이터·호차·순서·등록자·등록일시·내부공지·기사공지)
create table if not exists joil.disp_orders (
  id       text primary key,
  cust     text not null,                       -- 업체 키 (업체+탭 접미사, 예: 쿠팡부자재/평택)
  date     text not null,                       -- YYYY-MM-DD
  key      text not null default '',            -- 가져오기 키 (겹침 확인)
  data     json not null default '{}'::json,    -- 오더 내용 (화면이 정한 JSON 그대로 · json = 칸 순서도 그대로)
  truck    int,                                 -- 호차 (null = 미배정)
  seq      bigint not null default 0,           -- 순서 (합차 하차 순서는 100000~)
  by_name  text not null default '',            -- 등록자
  at       text not null default '',            -- 등록일시
  note_in  text not null default '',            -- 내부공지
  note_drv text not null default '',            -- 기사공지
  sheet_row int,                                -- 옮겨 올 때 시트 줄 번호 (비교용 · 새로 만든 줄은 null)
  ord      bigint generated always as identity  -- 시트 줄 순서 (같은 날짜·순서일 때 시트와 같은 순서로)
);
create index if not exists disp_orders_cd on joil.disp_orders (cust, date);
create index if not exists disp_orders_date on joil.disp_orders (date);

-- ── 배차호차 (업체·날짜·호차·차량정보·운전원·연락처·입차시간·톤수·메모·수정자·수정일시·링크코드·상태·회차비용·대기료·운송료지원·합차·매출·매입)
create table if not exists joil.disp_trucks (
  uid      bigint generated always as identity primary key,
  cust     text not null,
  date     text not null,
  no       int not null,                        -- 호차
  car      text not null default '',
  driver   text not null default '',
  phone    text not null default '',
  time     text not null default '',            -- 입차시간
  ton      text not null default '',
  memo     text not null default '',
  by_name  text not null default '',
  at       text not null default '',
  token    text not null default '',            -- 링크코드 (기사 링크 · 합차 기준)
  status   text not null default '',
  ret_cost bigint not null default 0,           -- 회차비용
  wait     bigint not null default 0,           -- 대기료
  support  bigint not null default 0,           -- 운송료지원
  join_tk  text not null default '',            -- 합차 = 기준 호차의 링크코드
  rev      bigint,                              -- 매출 직접 고침 (null = 단가로 계산) · 분석 권한만
  cost     bigint,                              -- 실제 매입 (null = 단가표) · 분석 권한만
  sheet_row int
);
create index if not exists disp_trucks_cd on joil.disp_trucks (cust, date);
create index if not exists disp_trucks_date on joil.disp_trucks (date);
create index if not exists disp_trucks_token on joil.disp_trucks (token) where token <> '';

-- ── 인수증 (ID·업체·날짜·호차·착지·파일ID·올린시각·크기) — 사진 파일은 구글 드라이브에 그대로 (파일ID만)
create table if not exists joil.receipts (
  id      text primary key,
  cust    text not null,
  date    text not null,
  no      int not null,
  fc      text not null default '',
  file_id text not null default '',
  at      text not null default '',
  size    bigint not null default 0,
  ord     bigint generated always as identity
);
create index if not exists receipts_cd on joil.receipts (cust, date);

-- ── 기사풀 (ID·차량정보·운전원·연락처·톤수·메모·고정·횟수·마지막배차·수정자·수정일시·생년월일·소속·블랙)
create table if not exists joil.drivers (
  id      text primary key,
  car     text not null default '',
  driver  text not null default '',
  phone   text not null default '',
  ton     text not null default '',
  memo    text not null default '',
  pin     text not null default 'N',            -- 고정 Y/N
  n       int not null default 0,               -- 횟수
  last    text not null default '',             -- 마지막배차 YYYY-MM-DD
  by_name text not null default '',
  at      text not null default '',
  birth   text not null default '',             -- 생년월일 (협력사에는 안 보냄)
  org     text not null default '',             -- 소속
  black   text not null default '',             -- 블랙 (원래 적힌 글자 그대로: O·Y·블랙 …)
  ord     bigint generated always as identity   -- 시트 줄 순서
);

-- ── 상차지 (ID·이름·주소·상차가능시간·연락처·메모·수정자·수정일시·단가표출발·업체·담당자)
create table if not exists joil.loading_places (
  id        text primary key,
  name      text not null default '',
  addr      text not null default '',
  time      text not null default '',
  contact   text not null default '',
  memo      text not null default '',
  by_name   text not null default '',
  at        text not null default '',
  rate_from text not null default '',
  cust      text not null default '',           -- 빈 칸 = 예전 자료 = 쿠팡부자재
  manager   text not null default '',
  ord       bigint generated always as identity
);

-- ── 상차지사진 (ID·상차지ID·파일ID·설명·올린이·올린시각)
create table if not exists joil.place_photos (
  id       text primary key,
  place_id text not null,
  file_id  text not null default '',
  cap      text not null default '',
  by_name  text not null default '',
  at       text not null default '',
  ord      bigint generated always as identity
);

-- ── 하차지주소록 (종류·코드·센터명·주소·수정자·수정일시·업체·담당자·연락처·하차가능시간·단가표도착·비고)
create table if not exists joil.dest_book (
  uid      bigint generated always as identity primary key,  -- 시트에 ID 칸이 없어서
  kind     text not null default '',
  code     text not null default '',
  name     text not null default '',
  addr     text not null default '',
  by_name  text not null default '',
  at       text not null default '',
  cust     text not null default '',
  manager  text not null default '',
  tel      text not null default '',
  hours    text not null default '',
  rate_to  text not null default '',
  memo     text not null default ''
);

-- ── 매입 단가표 (세로형 '배차단가표': 업체·출발·도착·톤수·단가·적용시작일·비고·거리·수정자·수정일시) · 분석 권한만
create table if not exists joil.disp_rates (
  uid     bigint generated always as identity primary key,
  cust    text not null default '',
  "from"  text not null default '',
  "to"    text not null default '',
  ton     text not null default '',
  price   numeric not null default 0,
  start   text not null default '',             -- 적용시작일 (빈 칸 = 처음부터)
  memo    text not null default '',
  dist    numeric,
  by_name text not null default '',
  at      text not null default ''
);

-- ── 센터도착 (센터명·도착·수정자·수정일시)
create table if not exists joil.center_map (
  fc      text primary key,
  dest    text not null default '',
  by_name text not null default '',
  at      text not null default '',
  ord     bigint generated always as identity
);

-- ── 도착지특이사항 (업체·센터·멘트·협력사·기사·시간고정·수정자·수정일시)
create table if not exists joil.center_notes (
  uid     bigint generated always as identity primary key,
  cust    text not null,
  fc      text not null default '',
  note    text not null default '',
  ptn     text not null default 'N',
  drv     text not null default 'N',
  lock    text not null default 'N',
  by_name text not null default '',
  at      text not null default ''
);
create index if not exists center_notes_cust on joil.center_notes (cust);

-- ── 스크립트 속성에 있던 배차 값: 탭(DISP_TABS_업체) · 월별 단가(DISP_PRICE_업체) · 차도리 코드(DISP_CODES_업체) · 바뀐 시각(DST|업체|날짜)
create table if not exists joil.disp_tabs   (cust text primary key, tabs json not null);
create table if not exists joil.disp_prices (cust text primary key, prices json not null default '{}'::json);  -- { 'YYYY-MM': 단가 }
create table if not exists joil.disp_codes  (cust text primary key, codes json not null default '{}'::json);
create table if not exists joil.disp_stamps (cust text not null, date text not null, stamp bigint not null, primary key (cust, date));

-- ── 데이터 옮기기 기록 (Code.js '시험 복사'가 어디까지 보냈는지)
create table if not exists joil.copy_log (
  sheet  text primary key,
  rows   int not null default 0,
  at     timestamptz not null default now(),
  note   text not null default ''
);

-- 모든 표: RLS 켜고 정책 없음 + anon/authenticated 권한 없음
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'joil' loop
    execute format('alter table joil.%I enable row level security', t);
    execute format('revoke all on joil.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on joil.%I to service_role', t);
  end loop;
end $$;
revoke all on schema joil from anon, authenticated;
grant usage on schema joil to service_role;
