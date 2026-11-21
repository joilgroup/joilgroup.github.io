-- 변경 이력: 누가 언제 무엇을 바꿨는지 DB 트리거가 자동으로 남겨요 (배차 오더·호차·금액·단가표·특이사항·월별 단가·코드·탭·센터도착 + 계정·권한).
-- 누가 = 서버(core.js)가 요청마다 set_config('joil.who', 이름, true) 로 알려 줘요. 없으면 줄의 수정자 칸(by_name).
-- 호차·단가표·특이사항은 저장할 때 '다 지우고 다시 넣기'라서, 지운 줄을 잠깐 audit_stash 에 두었다가 다시 넣은 줄과 비교해 바뀐 칸만 남겨요.
--   다시 안 넣은 줄은 트랜잭션이 끝날 때(지연 트리거) '삭제'로 남겨요.
-- 금액이 든 이력(money = true)은 분석 권한자에게만 보여 줘요(core.js dispHistory · auditList).
-- 되돌리기: drop trigger … (아래 이름들) · drop table joil.audit, joil.audit_stash · drop function joil.audit_* — docs/서버이전.md

create table if not exists joil.audit (
  id    bigint generated always as identity primary key,
  at    timestamptz not null default now(),
  who   text not null default '',
  tbl   text not null,                       -- truck · order · rate · note · price · code · tab · map · account
  op    text not null,                       -- add · edit · del
  cust  text not null default '',
  date  text not null default '',
  ref   text not null default '',            -- 호차 링크코드 · 오더 ID · 계정 아이디 · 단가 키 …
  no    int,                                 -- 호차 번호 (호차·오더)
  chg   jsonb not null default '{}'::jsonb,  -- { 칸: [전, 후] }
  money boolean not null default false
);
create index if not exists audit_cd on joil.audit (cust, date);
create index if not exists audit_ref on joil.audit (ref);
create index if not exists audit_tbl on joil.audit (tbl, at desc);

create table if not exists joil.audit_stash (
  id   bigint generated always as identity primary key,
  tx   bigint not null,
  tbl  text not null,
  k    text not null,
  row  jsonb not null
);
create index if not exists audit_stash_k on joil.audit_stash (tx, tbl, k);

alter table joil.audit enable row level security;
alter table joil.audit_stash enable row level security;
revoke all on joil.audit, joil.audit_stash from anon, authenticated;
grant select, insert, update, delete on joil.audit, joil.audit_stash to service_role;

create or replace function joil.audit_who(fallback text) returns text language sql stable as $$
  select coalesce(nullif(current_setting('joil.who', true), ''), nullif(fallback, ''), '')
$$;

-- 두 줄(jsonb)에서 바뀐 칸만 { 칸: [전, 후] } (skip 칸은 빼고)
create or replace function joil.audit_diff(o jsonb, n jsonb, skip text[]) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k, jsonb_build_array(o -> k, n -> k)), '{}'::jsonb)
  from (select jsonb_object_keys(coalesce(o, '{}'::jsonb) || coalesce(n, '{}'::jsonb)) k) s
  where not (k = any (skip)) and (o -> k) is distinct from (n -> k)
$$;

-- 표마다: 구분 키 · 비교에서 뺄 칸 · 금액 칸
create or replace function joil.audit_key(kind text, r jsonb) returns text language sql immutable as $$
  select case kind
    when 'truck' then concat_ws('|', r ->> 'cust', r ->> 'date', r ->> 'token')
    when 'rate'  then concat_ws('|', r ->> 'cust', r ->> 'from', r ->> 'to', r ->> 'ton', r ->> 'start')
    when 'note'  then concat_ws('|', r ->> 'cust', r ->> 'fc', r ->> 'note')
    else '' end
$$;
create or replace function joil.audit_skip(kind text) returns text[] language sql immutable as $$
  select case kind
    when 'truck'   then array['uid', 'sheet_row', 'at', 'by_name']
    when 'rate'    then array['uid', 'at', 'by_name']
    when 'note'    then array['uid', 'at', 'by_name']
    when 'order'   then array['ord', 'sheet_row', 'at', 'by_name', 'seq', 'key', 'data']
    when 'account' then array['ord', 'last_login']
    when 'map'     then array['ord', 'at', 'by_name']
    else array['at', 'by_name'] end
$$;
create or replace function joil.audit_money(kind text, chg jsonb) returns boolean language sql immutable as $$
  select case
    when kind in ('rate', 'price', 'code') then true
    when kind = 'truck' then chg ?| array['rev', 'cost', 'ret_cost', 'wait', 'support']
    else false end
$$;
-- 새로 생긴 줄: 빈 칸·0·null 은 빼고 값만
create or replace function joil.audit_fresh(r jsonb, skip text[]) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k, jsonb_build_array(null, v)), '{}'::jsonb)
  from jsonb_each(r) e(k, v)
  where not (k = any (skip)) and v <> 'null'::jsonb and v <> '""'::jsonb and v <> '0'::jsonb
$$;

create or replace function joil.audit_put(kind text, op text, r jsonb, ref text, no int, chg jsonb) returns void language plpgsql as $$
begin
  if chg = '{}'::jsonb and op = 'edit' then return; end if;
  insert into joil.audit (who, tbl, op, cust, date, ref, no, chg, money)
  values (joil.audit_who(r ->> 'by_name'), kind, op, coalesce(r ->> 'cust', ''), coalesce(r ->> 'date', ''), coalesce(ref, ''), no, chg, joil.audit_money(kind, chg));
end $$;

create or replace function joil.audit_ref(kind text, r jsonb) returns text language sql immutable as $$
  select case kind when 'truck' then r ->> 'token' when 'order' then r ->> 'id' when 'account' then r ->> 'id' when 'map' then r ->> 'fc' else joil.audit_key(kind, r) end
$$;

-- ── '다 지우고 다시 넣기' 표 (호차·단가표·특이사항)
create or replace function joil.audit_stash_del() returns trigger language plpgsql security definer set search_path = joil, public as $$
begin
  insert into joil.audit_stash (tx, tbl, k, row) select txid_current(), TG_ARGV[0], joil.audit_key(TG_ARGV[0], to_jsonb(o)), to_jsonb(o) from old_rows o;
  return null;
end $$;
create or replace function joil.audit_stash_ins() returns trigger language plpgsql security definer set search_path = joil, public as $$
declare kind text := TG_ARGV[0]; n jsonb := to_jsonb(NEW); s record; kk text := joil.audit_key(TG_ARGV[0], to_jsonb(NEW));
begin
  select * into s from joil.audit_stash where tx = txid_current() and tbl = kind and audit_stash.k = kk order by id limit 1;
  if found then
    delete from joil.audit_stash where id = s.id;
    perform joil.audit_put(kind, 'edit', n, joil.audit_ref(kind, n), (n ->> 'no')::int, joil.audit_diff(s.row, n, joil.audit_skip(kind)));
  else
    perform joil.audit_put(kind, 'add', n, joil.audit_ref(kind, n), (n ->> 'no')::int, joil.audit_fresh(n, joil.audit_skip(kind) || array['cust', 'date', 'token', 'no']));
  end if;
  return null;
end $$;
-- 트랜잭션 끝에 아직 남은 = 다시 안 넣은 줄 = 삭제
create or replace function joil.audit_stash_end() returns trigger language plpgsql security definer set search_path = joil, public as $$
declare o jsonb;
begin
  delete from joil.audit_stash where id = NEW.id returning row into o;
  if o is not null then perform joil.audit_put(NEW.tbl, 'del', o, joil.audit_ref(NEW.tbl, o), (o ->> 'no')::int, joil.audit_fresh(o, joil.audit_skip(NEW.tbl) || array['cust', 'date', 'token', 'no']) ); end if;
  return null;
end $$;
-- 줄 하나 고치기 (호차 합차 전파 등)
create or replace function joil.audit_row() returns trigger language plpgsql security definer set search_path = joil, public as $$
declare kind text := TG_ARGV[0]; o jsonb; n jsonb; c jsonb; sk text[] := joil.audit_skip(TG_ARGV[0]); r jsonb;
begin
  if TG_OP <> 'INSERT' then o := to_jsonb(OLD); end if;
  if TG_OP <> 'DELETE' then n := to_jsonb(NEW); end if;
  if kind = 'account' then -- 비밀번호는 값 대신 '바뀜'만
    if o is not null then o := o - 'salt' || jsonb_build_object('pw_hash', case when n is not null and o ->> 'pw_hash' is distinct from n ->> 'pw_hash' then '(전)' else '' end); end if;
    if n is not null then n := n - 'salt' || jsonb_build_object('pw_hash', case when o is not null and o ->> 'pw_hash' is distinct from n ->> 'pw_hash' then '(바뀜)' else '' end); end if;
  end if;
  if kind = 'order' then -- 오더 내용(data)은 칸마다 'd.칸' 으로
    c := joil.audit_diff(o, n, sk);
    c := c || coalesce((select jsonb_object_agg('d.' || k, v) from jsonb_each(joil.audit_diff((o ->> 'data')::jsonb - 'editedBy' - 'editedAt', (n ->> 'data')::jsonb - 'editedBy' - 'editedAt', array[]::text[])) e(k, v)), '{}'::jsonb);
    r := coalesce(n, o);
    if TG_OP = 'INSERT' then c := jsonb_build_object('d.fc', jsonb_build_array(null, (n ->> 'data')::jsonb -> 'fc')) || case when n ->> 'truck' is not null then jsonb_build_object('truck', jsonb_build_array(null, n -> 'truck')) else '{}'::jsonb end;
    elsif TG_OP = 'DELETE' then c := jsonb_build_object('d.fc', jsonb_build_array((o ->> 'data')::jsonb -> 'fc', null)); end if;
    -- 옮기기(날짜·업체가 바뀜)는 새 자리에도 보이게 cust·date = 새 값
    perform joil.audit_put(kind, lower(case TG_OP when 'INSERT' then 'add' when 'DELETE' then 'del' else 'edit' end), r, r ->> 'id', (r ->> 'truck')::int, c);
    return null;
  end if;
  if kind = 'tab' then -- 탭 목록은 통째로
    c := case when (o -> 'tabs') is distinct from (n -> 'tabs') then jsonb_build_object('tabs', jsonb_build_array(o -> 'tabs', n -> 'tabs')) else '{}'::jsonb end;
  elsif kind in ('price', 'code') then -- 업체 하나에 json 하나 → json 안의 칸마다 (월 · 코드)
    c := joil.audit_diff(o -> (case kind when 'price' then 'prices' else 'codes' end), n -> (case kind when 'price' then 'prices' else 'codes' end), array[]::text[]);
  elsif TG_OP = 'INSERT' then c := joil.audit_fresh(n, sk);
  elsif TG_OP = 'DELETE' then c := joil.audit_fresh(o, sk);
  else c := joil.audit_diff(o, n, sk); end if;
  r := coalesce(n, o);
  perform joil.audit_put(kind, lower(case TG_OP when 'INSERT' then 'add' when 'DELETE' then 'del' else 'edit' end), r, joil.audit_ref(kind, r), (r ->> 'no')::int, c);
  return null;
end $$;

-- 호차
drop trigger if exists audit_del on joil.disp_trucks;
create trigger audit_del after delete on joil.disp_trucks referencing old table as old_rows for each statement execute function joil.audit_stash_del('truck');
drop trigger if exists audit_ins on joil.disp_trucks;
create trigger audit_ins after insert on joil.disp_trucks for each row execute function joil.audit_stash_ins('truck');
drop trigger if exists audit_upd on joil.disp_trucks;
create trigger audit_upd after update on joil.disp_trucks for each row execute function joil.audit_row('truck');
-- 단가표
drop trigger if exists audit_del on joil.disp_rates;
create trigger audit_del after delete on joil.disp_rates referencing old table as old_rows for each statement execute function joil.audit_stash_del('rate');
drop trigger if exists audit_ins on joil.disp_rates;
create trigger audit_ins after insert on joil.disp_rates for each row execute function joil.audit_stash_ins('rate');
drop trigger if exists audit_upd on joil.disp_rates;
create trigger audit_upd after update on joil.disp_rates for each row execute function joil.audit_row('rate');
-- 도착지 특이사항
drop trigger if exists audit_del on joil.center_notes;
create trigger audit_del after delete on joil.center_notes referencing old table as old_rows for each statement execute function joil.audit_stash_del('note');
drop trigger if exists audit_ins on joil.center_notes;
create trigger audit_ins after insert on joil.center_notes for each row execute function joil.audit_stash_ins('note');
drop trigger if exists audit_upd on joil.center_notes;
create trigger audit_upd after update on joil.center_notes for each row execute function joil.audit_row('note');
-- 지운 줄 중 다시 안 넣은 것 = 삭제 (트랜잭션 끝에)
drop trigger if exists audit_end on joil.audit_stash;
create constraint trigger audit_end after insert on joil.audit_stash deferrable initially deferred for each row execute function joil.audit_stash_end();
-- 오더 · 계정 · 월별 단가 · 차도리 코드 · 탭 · 센터도착 (줄 단위)
drop trigger if exists audit_row on joil.disp_orders;
create trigger audit_row after insert or update or delete on joil.disp_orders for each row execute function joil.audit_row('order');
drop trigger if exists audit_row on joil.accounts;
create trigger audit_row after insert or update or delete on joil.accounts for each row execute function joil.audit_row('account');
drop trigger if exists audit_row on joil.disp_prices;
create trigger audit_row after insert or update or delete on joil.disp_prices for each row execute function joil.audit_row('price');
drop trigger if exists audit_row on joil.disp_codes;
create trigger audit_row after insert or update or delete on joil.disp_codes for each row execute function joil.audit_row('code');
drop trigger if exists audit_row on joil.disp_tabs;
create trigger audit_row after insert or update or delete on joil.disp_tabs for each row execute function joil.audit_row('tab');
drop trigger if exists audit_row on joil.center_map;
create trigger audit_row after insert or update or delete on joil.center_map for each row execute function joil.audit_row('map');
