-- 구글 시트 → Supabase 옮기기·비교·백업용 함수 (구글 Apps Script 가 서비스 키로만 불러요 · 공개 키로는 못 씀).
-- joil 스키마는 PostgREST(REST API)에 열지 않고, 이 public 함수들로만 드나들어요.

-- 옮기기 대상 표 (이 목록에 없는 표는 못 씀)
create or replace function public.joil_copy_tables() returns text[] language sql immutable as $$
  select array['accounts','disp_orders','disp_trucks','receipts','drivers','loading_places','place_photos','dest_book','disp_rates','center_map','center_notes','disp_tabs','disp_prices','disp_codes','disp_stamps','props']
$$;

-- p_rows 는 json(jsonb 아님): 오더 내용의 칸 순서를 시트에 적힌 그대로 두려고.
-- 시험 복사: p_reset = true 면 그 표를 비우고(처음 조각), 아니면 이어서 넣어요. 여러 번 눌러도 처음 조각에서 비우니까 중복이 안 생겨요.
-- 전환한 뒤(props.SB_LIVE = '1')에는 비우기를 거부해요 — Supabase 가 원본이 된 뒤 시트로 덮어쓰는 사고 방지.
create or replace function public.joil_copy(p_table text, p_rows json, p_reset boolean)
returns jsonb language plpgsql security definer set search_path = joil, public as $$
declare cols text; n int;
begin
  if not (p_table = any (public.joil_copy_tables())) then raise exception '옮길 수 없는 표: %', p_table; end if;
  if p_reset and exists (select 1 from joil.props where key = 'SB_LIVE' and value = '1') then raise exception '이미 Supabase로 전환했어요(SB_LIVE). 시험 복사로 덮어쓸 수 없어요.'; end if;
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns where table_schema = 'joil' and table_name = p_table and is_identity = 'NO' and is_generated = 'NEVER';
  if p_reset then
    if p_table = 'props' then delete from joil.props where key not in ('SB_LIVE', 'GAS_URL', 'GAS_SECRET'); else execute format('delete from joil.%I where true', p_table); end if; -- where true: Supabase REST 는 조건 없는 delete 를 막아요(safeupdate)
  end if;
  if p_table = 'props' then
    insert into joil.props (key, value) select key, value from json_populate_recordset(null::joil.props, p_rows) on conflict (key) do update set value = excluded.value;
  else
    execute format('insert into joil.%I (%s) select %s from json_populate_recordset(null::joil.%I, $1) on conflict do nothing', p_table, cols, cols, p_table) using p_rows;
  end if;
  get diagnostics n = row_count;
  execute format('select count(*) from joil.%I', p_table) into n;
  return jsonb_build_object('rows', n);
end $$;

-- 표마다 줄 수 (관리자 화면 '서버 이전' 상태)
create or replace function public.joil_counts() returns jsonb language plpgsql security definer set search_path = joil, public as $$
declare t text; o jsonb := '{}'::jsonb; n bigint;
begin
  foreach t in array public.joil_copy_tables() loop execute format('select count(*) from joil.%I', t) into n; o := o || jsonb_build_object(t, n); end loop;
  return o;
end $$;

-- 비교 도구: 그 달의 업체(탭)·날짜별 오더 수·호차 수와 업체별 번들·금액 합계 (Code.js sbSummary_ 와 같은 계산)
create or replace function public.joil_summary(p_ym text) returns jsonb language sql security definer set search_path = joil, public as $$
  select jsonb_build_object(
    'orders', coalesce((select jsonb_object_agg(cust || '|' || date, n) from (select cust, date, count(*) n from joil.disp_orders where left(date, 7) = p_ym group by 1, 2) x), '{}'::jsonb),
    'trucks', coalesce((select jsonb_object_agg(cust || '|' || date, n) from (select cust, date, count(*) n from joil.disp_trucks where left(date, 7) = p_ym group by 1, 2) x), '{}'::jsonb),
    'bundle', coalesce((select jsonb_object_agg(cust, b) from (select cust, round(sum(coalesce(nullif(regexp_replace(coalesce(data->>'bundle', ''), '[^0-9.]', '', 'g'), '')::numeric, 0)), 2) b from joil.disp_orders where left(date, 7) = p_ym and coalesce(data->>'bundle', '') !~ '패키지' group by 1) x), '{}'::jsonb),
    'money', coalesce((select jsonb_object_agg(cust, jsonb_build_object('rev', rev, 'cost', cost, 'ret', ret, 'wait', wt, 'support', sp)) from (
      select cust, coalesce(sum(rev), 0) rev, coalesce(sum(cost), 0) cost, sum(ret_cost) ret, sum(wait) wt, sum(support) sp from joil.disp_trucks where left(date, 7) = p_ym group by 1) x), '{}'::jsonb))
$$;

-- 무료 자동 백업: 표를 조각으로 읽기 (Code.js sbBackupNightly 가 매일 밤 구글 시트로 복사)
create or replace function public.joil_dump(p_table text, p_offset int, p_limit int) returns jsonb language plpgsql security definer set search_path = joil, public as $$
declare o jsonb;
begin
  if not (p_table = any (public.joil_copy_tables() || array['sessions'])) then raise exception '읽을 수 없는 표: %', p_table; end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from joil.%I order by 1 offset $1 limit $2) t', p_table) into o using p_offset, least(p_limit, 5000);
  return o;
end $$;

-- 설정 값 하나 넣기 (공개 설정·구글 연결 주소 등)
create or replace function public.joil_prop_set(p_key text, p_value text) returns void language sql security definer set search_path = joil, public as $$
  insert into joil.props (key, value) values (p_key, p_value) on conflict (key) do update set value = excluded.value
$$;

do $$ declare f text; begin
  foreach f in array array['joil_copy(text, json, boolean)', 'joil_counts()', 'joil_summary(text)', 'joil_dump(text, integer, integer)', 'joil_prop_set(text, text)', 'joil_copy_tables()'] loop
    execute 'revoke all on function public.' || f || ' from public, anon, authenticated';
    execute 'grant execute on function public.' || f || ' to service_role';
  end loop;
end $$;
