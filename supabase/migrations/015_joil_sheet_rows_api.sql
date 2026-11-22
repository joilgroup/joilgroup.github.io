-- 새 서버(port.js)가 시트 표(014)를 줄 단위로 다루는 도구: 한 줄 읽기 · 마지막 줄 번호 · 줄 지우고 아래 줄 당기기 · 버전 올리기.
-- Code.js(gas.js)와 같은 표를 같이 쓰니까 쓸 때마다 sheet_meta 버전을 올려요(그 사이 읽은 gas.js 저장은 다시 읽고 처음부터).
-- 되돌리기: drop function joil.sheet_getrow(text, int), joil.sheet_maxr(text), joil.sheet_delrow(text, int), joil.sheet_touch(text[]);

create or replace function joil.sheet_getrow(p_sheet text, p_r int) returns jsonb language plpgsql stable security definer set search_path = joil, public as $$
declare t record; v jsonb;
begin
  select * into t from sheet_tables where sheet = p_sheet and "on";
  if not found then select s.v into v from sheet_rows s where s.sheet = p_sheet and s.r = p_r; return v; end if;
  if p_r = 1 then return (select coalesce(jsonb_agg(to_jsonb(c ->> 'n') order by i), '[]'::jsonb) from jsonb_array_elements(t.cols) with ordinality x(c, i)); end if;
  if jsonb_array_length(t.cols) = 0 then return null; end if;
  execute format('select %s from joil.%I where r = $1', joil.sheet_row_expr(t.cols), t.tbl) into v using p_r;
  return v;
end $$;

create or replace function joil.sheet_maxr(p_sheet text) returns int language plpgsql stable security definer set search_path = joil, public as $$
declare t record; n int;
begin
  select * into t from sheet_tables where sheet = p_sheet and "on";
  if not found then select coalesce(max(r), 0) into n from sheet_rows where sheet = p_sheet; return n; end if;
  execute format('select coalesce(max(r), 1) from joil.%I', t.tbl) into n; return n;
end $$;

-- 줄 하나 지우고 아래 줄을 한 칸씩 위로 (구글 시트 deleteRow 와 같게)
create or replace function joil.sheet_delrow(p_sheet text, p_r int) returns void language plpgsql security definer set search_path = joil, public as $$
declare t record;
begin
  if p_r < 2 then raise exception '제목 줄은 지울 수 없어요.'; end if;
  select * into t from sheet_tables where sheet = p_sheet and "on";
  if not found then
    delete from sheet_rows where sheet = p_sheet and r = p_r;
    update sheet_rows set r = -(r - 1) where sheet = p_sheet and r > p_r; update sheet_rows set r = -r where sheet = p_sheet and r < 0;
    return;
  end if;
  execute format('delete from joil.%I where r = $1', t.tbl) using p_r;
  execute format('update joil.%I set r = -(r - 1) where r > $1', t.tbl) using p_r;
  execute format('update joil.%I set r = -r where r < 0', t.tbl);
end $$;

-- 저장한 시트들 버전 올리기 (없으면 만들기) · 잠금은 부르는 쪽이 같은 트랜잭션에서 for update 로
create or replace function joil.sheet_touch(p_names text[]) returns void language sql security definer set search_path = joil, public as $$
  insert into sheet_meta (name, ver) select unnest(p_names), 1 on conflict (name) do update set ver = sheet_meta.ver + 1
$$;
revoke all on function joil.sheet_getrow(text, int), joil.sheet_maxr(text), joil.sheet_delrow(text, int), joil.sheet_touch(text[]) from public, anon, authenticated;
