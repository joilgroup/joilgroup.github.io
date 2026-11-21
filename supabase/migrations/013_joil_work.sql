-- 진짜 표로 정리 2단계: 업무 기록(개인 할 일 목록)을 시트 그대로에서 표로. 옮기기는 joil.move_work() (줄 수가 같을 때만 '옮김' 표시).
-- 바뀐 시각(work.stamp)은 예전 스크립트 속성 WK_아이디 대신 이 표의 work_stamps.
-- 되돌리기: delete from joil.props where key = 'MOVED_업무기록';
create table if not exists joil.work_items (
  id text primary key, text text not null default '', st text not null default '대기', ord numeric not null default 0,
  at text not null default '', start text not null default '', done text not null default '', uid text not null,
  r bigint generated always as identity
);
create index if not exists work_items_uid on joil.work_items (uid, r);
create table if not exists joil.work_stamps (uid text primary key, stamp text not null);
do $$ declare t text; begin
  foreach t in array array['work_items', 'work_stamps'] loop
    execute format('alter table joil.%I enable row level security', t);
    execute format('revoke all on joil.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on joil.%I to service_role', t);
  end loop;
end $$;
create or replace function joil.move_work() returns jsonb language plpgsql security definer set search_path = joil, public as $$
declare n_src int; n_dst int;
begin
  if exists (select 1 from props where key = 'MOVED_업무기록') then return '{}'::jsonb; end if;
  delete from work_items;
  insert into work_items (id, text, st, ord, at, start, done, uid)
    select sv_txt(v -> 0), sv_txt(v -> 1), sv_txt(v -> 2), coalesce(nullif(sv_txt(v -> 3), '')::numeric, 0),
      case when jsonb_typeof(v -> 4) = 'object' then left(sv_txt(v -> 4), 16) else sv_txt(v -> 4) end,
      case when jsonb_typeof(v -> 5) = 'object' then left(sv_txt(v -> 5), 16) else sv_txt(v -> 5) end,
      case when jsonb_typeof(v -> 6) = 'object' then left(sv_txt(v -> 6), 16) else sv_txt(v -> 6) end, sv_txt(v -> 7)
    from sheet_rows where sheet = '업무기록' and r > 1 and sv_txt(v -> 0) <> '' order by r;
  select count(*) into n_src from sheet_rows where sheet = '업무기록' and r > 1 and sv_txt(v -> 0) <> ''; select count(*) into n_dst from work_items;
  if n_src = n_dst then insert into props values ('MOVED_업무기록', '1') on conflict (key) do update set value = '1'; end if;
  return jsonb_build_object('업무기록', jsonb_build_array(n_src, n_dst));
end $$;
revoke all on function joil.move_work() from public, anon, authenticated;
