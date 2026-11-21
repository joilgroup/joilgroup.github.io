-- 서버 이전 4단계: 배차·계정 밖의 모든 메뉴(견적·일정·분석·공지·업무·매뉴얼 …).
-- Code.js 를 Supabase 에서 그대로 돌리기 때문에(supabase/functions/joil/gas.js) 구글 시트를 '시트 그대로' 담아요:
--   sheet_rows = 시트 이름 · 줄 번호(1 = 제목 줄) · 그 줄 값 배열 (날짜 칸은 {"$d": "ISO 시각"})
--   sheet_meta = 시트마다 버전 (저장할 때 다른 사람이 먼저 바꿨는지 확인 · '__props' = 스크립트 속성 버전)
--   gas_props  = 스크립트 속성 (설정·카카오 키·폴더 ID 등 · 로그인 유지 RT_·배차 DST|·DISP_ 는 빼고 옮김)
create table if not exists joil.sheet_meta (name text primary key, ver bigint not null default 0);
create table if not exists joil.sheet_rows (sheet text not null, r int not null, v jsonb not null default '[]'::jsonb, primary key (sheet, r));
create table if not exists joil.gas_props (key text primary key, value text not null);
do $$ declare t text; begin
  foreach t in array array['sheet_meta','sheet_rows','gas_props'] loop
    execute format('alter table joil.%I enable row level security', t);
    execute format('revoke all on joil.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on joil.%I to service_role', t);
  end loop;
end $$;

-- 시험 복사 (구글 Code.js admin.sbCopyAll 이 서비스 키로): 첫 조각(p_reset)에서 그 시트를 비우고 줄 번호 p_start 부터 넣어요.
-- 전체 전환 뒤(props.SB_LIVE_ALL = '1')에는 거부.
create or replace function public.joil_sheet_copy(p_sheet text, p_start int, p_rows json, p_reset boolean)
returns jsonb language plpgsql security definer set search_path = joil, public as $$
declare n int;
begin
  if exists (select 1 from joil.props where key = 'SB_LIVE_ALL' and value = '1') then raise exception '이미 전체 전환했어요(SB_LIVE_ALL). 시험 복사로 덮어쓸 수 없어요.'; end if;
  if p_reset then delete from joil.sheet_rows where sheet = p_sheet; end if;
  insert into joil.sheet_rows (sheet, r, v) select p_sheet, p_start + (x.i - 1)::int, x.v::jsonb from json_array_elements(p_rows) with ordinality as x(v, i)
    on conflict (sheet, r) do update set v = excluded.v;
  insert into joil.sheet_meta (name, ver) values (p_sheet, 1) on conflict (name) do update set ver = joil.sheet_meta.ver + 1;
  select count(*) into n from joil.sheet_rows where sheet = p_sheet;
  return jsonb_build_object('rows', n);
end $$;

-- 스크립트 속성 통째로 (p_reset 이면 비우고)
create or replace function public.joil_gas_props_copy(p_rows json, p_reset boolean)
returns jsonb language plpgsql security definer set search_path = joil, public as $$
begin
  if exists (select 1 from joil.props where key = 'SB_LIVE_ALL' and value = '1') then raise exception '이미 전체 전환했어요(SB_LIVE_ALL). 시험 복사로 덮어쓸 수 없어요.'; end if;
  if p_reset then delete from joil.gas_props where true; end if;
  insert into joil.gas_props (key, value) select key, value from json_populate_recordset(null::joil.gas_props, p_rows) on conflict (key) do update set value = excluded.value;
  insert into joil.sheet_meta (name, ver) values ('__props', 1) on conflict (name) do update set ver = joil.sheet_meta.ver + 1;
  return jsonb_build_object('rows', (select count(*) from joil.gas_props));
end $$;

-- 시트 하나를 조각으로 읽기 (무료 자동 백업 · 비교)
create or replace function public.joil_sheet_dump(p_sheet text, p_from int, p_limit int)
returns json language sql security definer set search_path = joil, public as $$
  select coalesce(json_agg(v order by r), '[]'::json) from (select r, v from joil.sheet_rows where sheet = p_sheet and r >= p_from order by r limit least(p_limit, 5000)) x
$$;
create or replace function public.joil_sheet_list()
returns json language sql security definer set search_path = joil, public as $$
  select coalesce(json_agg(json_build_object('name', m.name, 'rows', (select count(*) from joil.sheet_rows s where s.sheet = m.name)) order by m.name), '[]'::json) from joil.sheet_meta m where m.name <> '__props'
$$;

do $$ declare f text; begin
  foreach f in array array['joil_sheet_copy(text, integer, json, boolean)', 'joil_gas_props_copy(json, boolean)', 'joil_sheet_dump(text, integer, integer)', 'joil_sheet_list()'] loop
    execute 'revoke all on function public.' || f || ' from public, anon, authenticated';
    execute 'grant execute on function public.' || f || ' to service_role';
  end loop;
end $$;
