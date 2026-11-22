-- 진짜 표로 정리 3단계: 아직 '시트 그대로'(sheet_rows, 줄 = 값 배열)인 나머지 시트를 모두 시트마다 칸 있는 표(joil.gs_…)로.
-- 칸 = 시트 제목 줄 이름 그대로(예: joil.gs_custs."거래처"), 칸 종류 = 들어 있는 값으로 정함(글자 text · 숫자 numeric(정확한 소수) · 일시 timestamptz · 섞이면 jsonb).
-- Code.js 는 그대로 Supabase 에서 돌고(gas.js), 읽고 쓰는 자리만 sheet_rows → 이 표들로 바뀌어요(joil.sheet_read · sheet_write · sheet_cut).
-- 옮기기 = joil.sheet_tabulate(시트): 표를 만들어 채운 뒤 '원래 줄 값과 한 칸씩 같은지' 검사 → 같을 때만 사용 표시(sheet_tables.on).
-- 예전 sheet_rows 줄은 지우지 않아요. 되돌리기: update joil.sheet_tables set on = false; → 다시 sheet_rows (옮긴 뒤 쓴 줄은 joil.sheet_untabulate(시트) 로 되돌려 써요).

create table if not exists joil.sheet_tables (
  sheet text primary key,
  tbl   text not null unique,
  cols  jsonb not null default '[]'::jsonb,   -- [{ n: 제목, c: 칸 이름, t: 'text'|'num'|'ts'|'json' }]
  "on"  boolean not null default false,
  at    timestamptz not null default now()
);
alter table joil.sheet_tables enable row level security;
revoke all on joil.sheet_tables from anon, authenticated;
grant select, insert, update, delete on joil.sheet_tables to service_role;

-- 값(jsonb, 날짜 = {$d}) 종류: '' 와 null 은 비어 있음
create or replace function joil.sv_kind(v jsonb) returns text language sql immutable as $$
  select case when v is null or v = 'null'::jsonb or v = '""'::jsonb then '' when jsonb_typeof(v) = 'string' then 'text' when jsonb_typeof(v) = 'number' then 'num'
    when jsonb_typeof(v) = 'object' and v ? '$d' then 'ts' else 'json' end
$$;
create or replace function joil.sv_pgtype(t text) returns text language sql immutable as $$
  select case t when 'num' then 'numeric' when 'ts' then 'timestamptz' when 'json' then 'jsonb' else 'text' end
$$;
-- 칸 하나를 jsonb 값으로 (읽기 · 검사에 같이 씀)
create or replace function joil.sv_enc(col text, t text) returns text language sql immutable as $$
  select case t
    when 'ts' then format('case when %1$s is null then ''""''::jsonb else jsonb_build_object(''$d'', to_char(%1$s at time zone ''UTC'', ''YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'')) end', col)
    when 'json' then format('coalesce(%s, ''""''::jsonb)', col)
    else format('coalesce(to_jsonb(%s), ''""''::jsonb)', col) end
$$;
-- 쓰기용: jsonb 값 → 칸 종류
create or replace function joil.sv_dec(v text, t text) returns text language sql immutable as $$
  select case t
    when 'ts' then format('case when joil.sv_kind(%1$s) = '''' then null else (%1$s ->> ''$d'')::timestamptz end', v)
    when 'num' then format('case when joil.sv_kind(%1$s) = '''' then null else (%1$s #>> ''{}'')::numeric end', v)
    when 'json' then format('case when joil.sv_kind(%1$s) = '''' then null else %1$s end', v)
    else format('case when joil.sv_kind(%1$s) = '''' then null else %1$s #>> ''{}'' end', v) end
$$;
-- 줄 비교용: 끝의 빈 칸을 떼고, null 은 '' 로
create or replace function joil.sv_norm(v jsonb) returns jsonb language plpgsql immutable as $$
declare a jsonb := '[]'::jsonb; n int; i int;
begin
  if v is null or jsonb_typeof(v) <> 'array' then return '[]'::jsonb; end if;
  n := jsonb_array_length(v);
  while n > 0 and joil.sv_kind(v -> (n - 1)) = '' loop n := n - 1; end loop;
  for i in 0 .. n - 1 loop a := a || jsonb_build_array(case when joil.sv_kind(v -> i) = '' then '""'::jsonb else v -> i end); end loop;
  return a;
end $$;

-- 표의 한 줄을 jsonb 배열로 만드는 select 식
create or replace function joil.sheet_row_expr(p_cols jsonb, p_pre text default '') returns text language sql immutable as $$
  select 'jsonb_build_array(' || coalesce(string_agg(joil.sv_enc(p_pre || format('%I', c ->> 'c'), c ->> 't'), ', ' order by i), '') || ')'
  from jsonb_array_elements(p_cols) with ordinality x(c, i)
$$;

/** 읽기: 시트 이름들 → (sheet, r, v) — 표로 옮긴 시트는 표에서(1번 줄 = 제목), 아니면 sheet_rows */
create or replace function joil.sheet_read(p_names text[]) returns table (sheet text, r int, v jsonb) language plpgsql stable security definer set search_path = joil, public as $$
declare t record;
begin
  return query select s.sheet, s.r, s.v from sheet_rows s where s.sheet = any(p_names) and not exists (select 1 from sheet_tables x where x.sheet = s.sheet and x."on") order by s.sheet, s.r;
  for t in select * from sheet_tables x where x.sheet = any(p_names) and x."on" loop
    return query select t.sheet, 1, (select coalesce(jsonb_agg(to_jsonb(c ->> 'n') order by i), '[]'::jsonb) from jsonb_array_elements(t.cols) with ordinality x(c, i));
    if jsonb_array_length(t.cols) > 0 then
      return query execute format('select %L::text, r, %s from joil.%I order by r', t.sheet, joil.sheet_row_expr(t.cols), t.tbl);
    end if;
  end loop;
end $$;

/** 쓰기: [{ r, v }] (v = 줄 값 배열) — 표로 옮긴 시트는 칸 종류를 맞춰(안 맞으면 그 칸을 jsonb 로 넓힘) 표에, 아니면 sheet_rows */
create or replace function joil.sheet_write(p_sheet text, p_rows jsonb) returns void language plpgsql security definer set search_path = joil, public as $$
declare t record; x jsonb; v jsonb; i int; cs jsonb; k text; ct text; nm text; sqlc text; sqlv text; changed boolean;
begin
  select * into t from sheet_tables where sheet = p_sheet and "on";
  if not found then
    insert into sheet_rows (sheet, r, v) select p_sheet, (e ->> 'r')::int, e -> 'v' from jsonb_array_elements(p_rows) e
      on conflict (sheet, r) do update set v = excluded.v;
    return;
  end if;
  cs := t.cols; changed := false;
  for x in select * from jsonb_array_elements(p_rows) loop
    v := coalesce(x -> 'v', '[]'::jsonb);
    if (x ->> 'r')::int = 1 then -- 제목 줄: 이름 바꾸기·칸 늘리기
      for i in 0 .. jsonb_array_length(v) - 1 loop
        nm := coalesce(v ->> i, '');
        if i < jsonb_array_length(cs) then if cs -> i ->> 'n' is distinct from nm then cs := jsonb_set(cs, array[i::text, 'n'], to_jsonb(nm)); changed := true; end if;
        else execute format('alter table joil.%I add column %I text', t.tbl, 'c' || (i + 1)); cs := cs || jsonb_build_array(jsonb_build_object('n', nm, 'c', 'c' || (i + 1), 't', 'text')); changed := true; end if;
      end loop;
      continue;
    end if;
    for i in 0 .. jsonb_array_length(v) - 1 loop
      k := joil.sv_kind(v -> i);
      if i >= jsonb_array_length(cs) then
        if k = '' then continue; end if;
        while jsonb_array_length(cs) < i loop execute format('alter table joil.%I add column %I text', t.tbl, 'c' || (jsonb_array_length(cs) + 1)); cs := cs || jsonb_build_array(jsonb_build_object('n', '', 'c', 'c' || (jsonb_array_length(cs) + 1), 't', 'text')); end loop;
        execute format('alter table joil.%I add column %I %s', t.tbl, 'c' || (i + 1), joil.sv_pgtype(k)); cs := cs || jsonb_build_array(jsonb_build_object('n', '', 'c', 'c' || (i + 1), 't', k)); changed := true;
      elsif k <> '' and k <> cs -> i ->> 't' and cs -> i ->> 't' <> 'json' then -- 칸 종류가 섞임 → jsonb 로 넓힘 (값은 그대로)
        ct := cs -> i ->> 'c';
        execute format('alter table joil.%I alter column %I type jsonb using %s', t.tbl, ct, replace(joil.sv_enc(format('%I', ct), cs -> i ->> 't'), '''""''::jsonb', 'null'));
        cs := jsonb_set(cs, array[i::text, 't'], '"json"'); changed := true;
      end if;
    end loop;
  end loop;
  if changed then update sheet_tables set cols = cs where sheet = p_sheet; end if;
  if jsonb_array_length(cs) = 0 then return; end if;
  select string_agg(format('%I', c ->> 'c'), ', ' order by ix), string_agg(joil.sv_dec(format('(e -> ''v'' -> %s)', ix - 1), c ->> 't'), ', ' order by ix)
    into sqlc, sqlv from jsonb_array_elements(cs) with ordinality y(c, ix);
  execute format('insert into joil.%I (r, %s) select (e ->> ''r'')::int, %s from jsonb_array_elements($1) e where (e ->> ''r'')::int > 1 on conflict (r) do update set (%s) = (%s)',
    t.tbl, sqlc, sqlv, sqlc, (select string_agg('excluded.' || format('%I', c ->> 'c'), ', ' order by ix) from jsonb_array_elements(cs) with ordinality y(c, ix))) using p_rows;
end $$;

/** 줄 지우기: p_len 줄 뒤를 모두 */
create or replace function joil.sheet_cut(p_sheet text, p_len int) returns void language plpgsql security definer set search_path = joil, public as $$
declare t record;
begin
  select * into t from sheet_tables where sheet = p_sheet and "on";
  if not found then delete from sheet_rows where sheet = p_sheet and r > p_len; return; end if;
  execute format('delete from joil.%I where r > $1', t.tbl) using p_len;
  if p_len < 1 then update sheet_tables set cols = '[]'::jsonb where sheet = p_sheet; end if;
end $$;

/** 옮기기: 시트 하나를 표로 → 한 칸씩 같은지 검사 → 같으면 on (다르면 표를 지우고 다른 줄 수를 돌려줌) */
create or replace function joil.sheet_tabulate(p_sheet text, p_tbl text) returns jsonb language plpgsql security definer set search_path = joil, public as $$
declare hdr jsonb; ncol int; cols jsonb := '[]'::jsonb; i int; nm text; used text[] := '{}'; k text; ks text[]; bad int; n int; sqlc text; sqlv text;
begin
  if exists (select 1 from sheet_tables where sheet = p_sheet and "on") then return jsonb_build_object('skip', 'already'); end if;
  perform 1 from sheet_meta where name = p_sheet for update; -- 옮기는 동안 그 시트 저장은 기다리게 (gas.js 저장도 이 줄을 잠가요)
  select v into hdr from sheet_rows where sheet = p_sheet and r = 1;
  select greatest(coalesce(jsonb_array_length(hdr), 0), coalesce(max(jsonb_array_length(v)), 0)) into ncol from sheet_rows where sheet = p_sheet;
  for i in 0 .. ncol - 1 loop
    nm := coalesce(hdr ->> i, '');
    k := case when nm = '' or nm = 'r' or nm = any(used) or octet_length(nm) > 60 then 'c' || (i + 1) else nm end; used := used || k;
    select array_agg(distinct joil.sv_kind(s.v -> i)) filter (where joil.sv_kind(s.v -> i) <> '') into ks from sheet_rows s where s.sheet = p_sheet and s.r > 1;
    cols := cols || jsonb_build_array(jsonb_build_object('n', nm, 'c', k, 't', case when ks is null then 'text' when array_length(ks, 1) = 1 then ks[1] else 'json' end));
  end loop;
  execute format('drop table if exists joil.%I', p_tbl);
  execute format('create table joil.%I (r int primary key%s)', p_tbl, (select coalesce(string_agg(format(', %I %s', c ->> 'c', joil.sv_pgtype(c ->> 't')), '' order by ix), '') from jsonb_array_elements(cols) with ordinality y(c, ix)));
  execute format('alter table joil.%I enable row level security', p_tbl);
  execute format('revoke all on joil.%I from anon, authenticated', p_tbl);
  execute format('grant select, insert, update, delete on joil.%I to service_role', p_tbl);
  if ncol > 0 then
    select string_agg(format('%I', c ->> 'c'), ', ' order by ix), string_agg(joil.sv_dec(format('(s.v -> %s)', ix - 1), c ->> 't'), ', ' order by ix) into sqlc, sqlv from jsonb_array_elements(cols) with ordinality y(c, ix);
    execute format('insert into joil.%I (r, %s) select s.r, %s from joil.sheet_rows s where s.sheet = %L and s.r > 1', p_tbl, sqlc, sqlv, p_sheet);
    execute format('select count(*) from joil.sheet_rows s left join joil.%I t on t.r = s.r where s.sheet = %L and s.r > 1 and (t.r is null or joil.sv_norm(s.v) <> joil.sv_norm(%s))',
      p_tbl, p_sheet, joil.sheet_row_expr(cols, 't.')) into bad;
  else bad := 0; end if;
  execute format('select count(*) from joil.%I', p_tbl) into n;
  if bad > 0 or n <> (select count(*) from sheet_rows where sheet = p_sheet and r > 1) then execute format('drop table joil.%I', p_tbl); return jsonb_build_object('bad', bad, 'rows', n); end if;
  insert into sheet_tables (sheet, tbl, cols, "on") values (p_sheet, p_tbl, cols, true) on conflict (sheet) do update set tbl = excluded.tbl, cols = excluded.cols, "on" = true, at = now();
  update sheet_meta set ver = ver + 1 where name = p_sheet; -- 옮기기 전에 읽어 둔 화면 요청은 다시 읽게
  return jsonb_build_object('rows', n, 'cols', jsonb_array_length(cols));
end $$;

/** 되돌리기: 표 내용을 다시 sheet_rows 로 쓰고 off (옮긴 뒤 쓴 줄도 살려요) */
create or replace function joil.sheet_untabulate(p_sheet text) returns int language plpgsql security definer set search_path = joil, public as $$
declare t record; n int;
begin
  select * into t from sheet_tables where sheet = p_sheet and "on"; if not found then return 0; end if;
  delete from sheet_rows where sheet = p_sheet;
  insert into sheet_rows (sheet, r, v) select x.sheet, x.r, x.v from joil.sheet_read(array[p_sheet]) x;
  update sheet_tables set "on" = false where sheet = p_sheet;
  get diagnostics n = row_count; update sheet_meta set ver = ver + 1 where name = p_sheet;
  return (select count(*) from sheet_rows where sheet = p_sheet);
end $$;

/** 나머지 시트 모두 (배차·계정·이미 옮긴 공지 등은 빼고) — 시트 이름 → 표 이름 */
create or replace function joil.sheet_tabulate_all() returns jsonb language plpgsql security definer set search_path = joil, public as $$
declare s text; out jsonb := '{}'::jsonb; nm text;
  names jsonb := '{"거래처":"gs_custs","견적데이터":"gs_quote_data","견적모음":"gs_quote_sets","견적접수":"gs_quote_reqs","견적진행":"gs_quote_progress","경로캐시":"gs_route_cache","공휴일":"gs_holidays","단가변경":"gs_rate_changes","매출처설정":"gs_an_sales_map","분석데이터":"gs_an_data","분석목록":"gs_an_index","분석접속기록":"gs_an_access","서류목록":"gs_docs","스냅샷":"gs_snapshots","연차부여":"gs_leave_grants","유가기록":"gs_diesel","일정":"gs_cal_events","접수파일":"gs_req_files","조회기록":"gs_quote_history","주소캐시":"gs_geo_cache","직원":"gs_staff","타리프":"gs_tariff","타리프버전":"gs_tariff_versions","할일완료":"gs_task_done","회사직인":"gs_company_seal","휴가":"gs_leaves","매뉴얼":"gs_manuals","업체단가":"gs_cust_rates","할일규칙":"gs_task_rules","당직변경":"gs_duty_changes","당직규칙":"gs_duty_rules","할일":"gs_tasks"}'::jsonb;
begin
  for s in select m.name from sheet_meta m where m.name <> '__props' and m.name not in ('공지', '문의기록', '업무담당', '담당변경기록', '업무기록', '계정', '배차오더', '배차호차', '상차지', '상차지사진', '하차지주소록', '기사풀', '배차단가표', '배차단가', '센터도착', '도착지특이사항', '인수증')
      and not exists (select 1 from sheet_tables x where x.sheet = m.name and x."on") order by m.name loop
    nm := coalesce(names ->> s, 'gs_' || substr(md5(s), 1, 10));
    out := out || jsonb_build_object(s, joil.sheet_tabulate(s, nm));
  end loop;
  return out;
end $$;
revoke all on function joil.sheet_read(text[]), joil.sheet_write(text, jsonb), joil.sheet_cut(text, int), joil.sheet_tabulate(text, text), joil.sheet_untabulate(text), joil.sheet_tabulate_all() from public, anon, authenticated;
