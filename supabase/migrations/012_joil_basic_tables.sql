-- 진짜 DB 구조로 정리 1단계: 팀 공지 · 문의 기록 · 업무 담당표(+담당 변경 기록)를 시트 그대로(sheet_rows)에서 칸이 있는 표로.
-- 표만 만들고 옮기기는 joil.move_basic() 을 불렀을 때 (옮긴 뒤 줄 수가 같을 때만 '옮김' 표시 → 그때부터 새 서버 core.js 가 맡아요).
-- 예전 sheet_rows 줄은 지우지 않아요(되돌리기용). Code.js(gas.js)가 이 시트를 읽을 때(주간 요약 등)는 새 표에서 읽어요.
-- 되돌리기: delete from joil.props where key like 'MOVED_%'; → 다시 sheet_rows 로 돌아가요(옮긴 뒤 새로 쓴 건 표에만 있으니 docs/서버이전.md 참고).

create table if not exists joil.notices (
  id text primary key, title text not null default '', body text not null default '', pinned boolean not null default false,
  owner_id text not null default '', owner text not null default '', created_at text not null default '', updated_at text not null default '',
  ord bigint generated always as identity
);
create table if not exists joil.inquiries (
  id text primary key, at text not null default '', cust text not null default '', who text not null default '', body text not null default '',
  answer text not null default '', status text not null default '', by_id text not null default '', by_name text not null default '',
  faq boolean not null default false, updated_at text not null default '', ord bigint generated always as identity
);
create index if not exists inquiries_at on joil.inquiries (at desc);
create table if not exists joil.owners (
  id text primary key, task text not null default '', cust text not null default '', main text not null default '', sub text not null default '',
  memo text not null default '', by_name text not null default '', at text not null default '', ord bigint generated always as identity
);
create table if not exists joil.owner_log (
  id bigint generated always as identity primary key, at text not null default '', task text not null default '', text text not null default '', by_name text not null default ''
);

do $$ declare t text; begin
  foreach t in array array['notices', 'inquiries', 'owners', 'owner_log'] loop
    execute format('alter table joil.%I enable row level security', t);
    execute format('revoke all on joil.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on joil.%I to service_role', t);
  end loop;
end $$;

-- 시트 칸 값(jsonb) → 글자: 날짜({$d}) = 한국 시각 'YYYY-MM-DD HH24:MI:SS' · 앞의 ' 는 뺌
create or replace function joil.sv_txt(v jsonb) returns text language sql immutable as $$
  select case when v is null or v = 'null'::jsonb then ''
    when jsonb_typeof(v) = 'object' and v ? '$d' then to_char((v ->> '$d')::timestamptz at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS')
    when jsonb_typeof(v) = 'string' then regexp_replace(v #>> '{}', '^''', '')
    else v #>> '{}' end
$$;

-- 옮기기: 표를 비우고 시트 줄에서 다시 채운 뒤 줄 수를 비교 → 같으면 '옮김' 표시. 이미 옮긴 시트는 건너뜀(덮어쓰기 방지).
create or replace function joil.move_basic() returns jsonb language plpgsql security definer set search_path = joil, public as $$
declare out jsonb := '{}'::jsonb; n_src int; n_dst int;
begin
  if not exists (select 1 from props where key = 'MOVED_공지') then
    delete from notices;
    insert into notices (id, title, body, pinned, owner_id, owner, created_at, updated_at)
      select sv_txt(v -> 0), sv_txt(v -> 1), sv_txt(v -> 2), sv_txt(v -> 3) = 'Y', sv_txt(v -> 4), sv_txt(v -> 5), sv_txt(v -> 6), sv_txt(v -> 7)
      from sheet_rows where sheet = '공지' and r > 1 and sv_txt(v -> 0) <> '' order by r;
    select count(*) into n_src from sheet_rows where sheet = '공지' and r > 1 and sv_txt(v -> 0) <> ''; select count(*) into n_dst from notices;
    if n_src = n_dst then insert into props values ('MOVED_공지', '1') on conflict (key) do update set value = '1'; end if;
    out := out || jsonb_build_object('공지', jsonb_build_array(n_src, n_dst));
  end if;
  if not exists (select 1 from props where key = 'MOVED_문의기록') then
    delete from inquiries;
    insert into inquiries (id, at, cust, who, body, answer, status, by_id, by_name, faq, updated_at)
      select sv_txt(v -> 0), case when jsonb_typeof(v -> 1) = 'object' then left(sv_txt(v -> 1), 16) else sv_txt(v -> 1) end, sv_txt(v -> 2), sv_txt(v -> 3), sv_txt(v -> 4), sv_txt(v -> 5), sv_txt(v -> 6), sv_txt(v -> 7), sv_txt(v -> 8), sv_txt(v -> 9) = 'Y', sv_txt(v -> 10)
      from sheet_rows where sheet = '문의기록' and r > 1 and sv_txt(v -> 0) <> '' order by r;
    select count(*) into n_src from sheet_rows where sheet = '문의기록' and r > 1 and sv_txt(v -> 0) <> ''; select count(*) into n_dst from inquiries;
    if n_src = n_dst then insert into props values ('MOVED_문의기록', '1') on conflict (key) do update set value = '1'; end if;
    out := out || jsonb_build_object('문의기록', jsonb_build_array(n_src, n_dst));
  end if;
  if not exists (select 1 from props where key = 'MOVED_업무담당') then
    delete from owners; delete from owner_log;
    insert into owners (id, task, cust, main, sub, memo, by_name, at)
      select sv_txt(v -> 0), sv_txt(v -> 1), sv_txt(v -> 2), sv_txt(v -> 3), sv_txt(v -> 4), sv_txt(v -> 5), sv_txt(v -> 6), sv_txt(v -> 7)
      from sheet_rows where sheet = '업무담당' and r > 1 and sv_txt(v -> 0) <> '' order by r;
    insert into owner_log (at, task, text, by_name) select sv_txt(v -> 0), sv_txt(v -> 1), sv_txt(v -> 2), sv_txt(v -> 3) from sheet_rows where sheet = '담당변경기록' and r > 1 order by r;
    select count(*) into n_src from sheet_rows where sheet = '업무담당' and r > 1 and sv_txt(v -> 0) <> ''; select count(*) into n_dst from owners;
    if n_src = n_dst and (select count(*) from sheet_rows where sheet = '담당변경기록' and r > 1) = (select count(*) from owner_log) then insert into props values ('MOVED_업무담당', '1') on conflict (key) do update set value = '1'; end if;
    out := out || jsonb_build_object('업무담당', jsonb_build_array(n_src, n_dst));
  end if;
  return out;
end $$;
revoke all on function joil.move_basic(), joil.sv_txt(jsonb) from public, anon, authenticated;
