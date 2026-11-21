-- 자동 알림: DB 예약 작업(pg_cron)이 5분마다 배차를 훑어 '해야 할 일'을 joil.alerts 에 올리고, 해결되면 내려요.
-- 화면은 공개 키 RPC public.joil_alerts(로그인 토큰 확인)로 읽어요 → 함수 호출 수에 안 들어가요. 금액은 넣지 않아요.
--   un    : 오늘(16시부터는 내일도) 호차 미배정 오더
--   nocar : 오늘(16시부터는 내일도) 차량정보가 빈 배차전 호차
--   rcpt  : 지난 3일(10시부터는 어제까지) 배차분 중 인수증이 하나도 안 온 호차 (회차·합차 연결 호차 빼고)
-- 되돌리기: select cron.unschedule('joil-alerts'); drop function joil.alerts_scan(), public.joil_alerts(text); drop table joil.alerts;

create table if not exists joil.alerts (
  ref         text primary key,            -- 종류|업체 키|날짜 (같은 일은 한 줄)
  kind        text not null,
  cust        text not null,
  date        text not null,
  n           int not null default 0,
  nos         text not null default '',    -- 호차 번호들 (예: 1·3·5)
  msg         text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists alerts_open on joil.alerts (resolved_at) where resolved_at is null;
alter table joil.alerts enable row level security;
revoke all on joil.alerts from anon, authenticated;
grant select, insert, update, delete on joil.alerts to service_role;

create or replace function joil.alerts_scan() returns int language plpgsql security definer set search_path = joil, public as $$
declare now_k timestamp := (now() at time zone 'Asia/Seoul'); d0 text := to_char(now_k, 'YYYY-MM-DD'); d1 text := to_char(now_k + interval '1 day', 'YYYY-MM-DD');
  late boolean := extract(hour from now_k) >= 16; rcpt_to text := case when extract(hour from now_k) >= 10 then d0 else to_char(now_k - interval '1 day', 'YYYY-MM-DD') end;
  days text[]; seen text[] := '{}'; r record;
begin
  days := case when late then array[d0, d1] else array[d0] end;
  -- 호차 미배정 오더
  for r in select cust, date, count(*)::int n from disp_orders where date = any(days) and truck is null group by cust, date loop
    perform joil.alerts_put('un', r.cust, r.date, r.n, '', '호차 미배정 오더 ' || r.n || '줄'); seen := seen || ('un|' || r.cust || '|' || r.date);
  end loop;
  -- 차량정보 빈 배차전 호차 (오더가 실린 호차만)
  for r in select t.cust, t.date, count(*)::int n, string_agg(t.no::text, '·' order by t.no) nos from disp_trucks t
      where t.date = any(days) and btrim(t.car) = '' and t.status in ('', '배차전') and t.join_tk = ''
        and exists (select 1 from disp_orders o where o.cust = t.cust and o.date = t.date and o.truck = t.no) group by t.cust, t.date loop
    perform joil.alerts_put('nocar', r.cust, r.date, r.n, r.nos, '차량정보 빈 호차 ' || r.n || '대 (' || r.nos || '호차)'); seen := seen || ('nocar|' || r.cust || '|' || r.date);
  end loop;
  -- 인수증 미도착 (지난 3일, 오늘 배차분은 10시 이후부터)
  for r in select t.cust, t.date, count(*)::int n, string_agg(t.no::text, '·' order by t.no) nos from disp_trucks t
      where t.date >= to_char(now_k - interval '3 day', 'YYYY-MM-DD') and t.date < rcpt_to and btrim(t.car) <> '' and t.status not in ('회차') and t.join_tk = ''
        and exists (select 1 from disp_orders o where o.cust = t.cust and o.date = t.date and o.truck = t.no)
        and not exists (select 1 from receipts x where x.cust = t.cust and x.date = t.date and x.no = t.no) group by t.cust, t.date loop
    perform joil.alerts_put('rcpt', r.cust, r.date, r.n, r.nos, '인수증 안 온 호차 ' || r.n || '대 (' || r.nos || '호차)'); seen := seen || ('rcpt|' || r.cust || '|' || r.date);
  end loop;
  update alerts set resolved_at = now() where resolved_at is null and not (ref = any(seen));
  delete from alerts where resolved_at < now() - interval '14 days';
  return coalesce(array_length(seen, 1), 0);
end $$;

create or replace function joil.alerts_put(p_kind text, p_cust text, p_date text, p_n int, p_nos text, p_msg text) returns void language sql security definer set search_path = joil, public as $$
  insert into joil.alerts (ref, kind, cust, date, n, nos, msg) values (p_kind || '|' || p_cust || '|' || p_date, p_kind, p_cust, p_date, p_n, p_nos, p_msg)
  on conflict (ref) do update set n = excluded.n, nos = excluded.nos, msg = excluded.msg, updated_at = case when alerts.n is distinct from excluded.n or alerts.resolved_at is not null then now() else alerts.updated_at end, resolved_at = null
$$;
revoke all on function joil.alerts_scan(), joil.alerts_put(text, text, text, int, text, text) from public, anon, authenticated;

-- 화면이 읽는 알림 (로그인 토큰 확인 · 협력사는 배정된 탭의 차량정보·인수증 알림만)
create or replace function public.joil_alerts(p_token text) returns jsonb language plpgsql security definer set search_path = joil, public, extensions as $$
declare s record; u record; tabs text[];
begin
  select * into s from joil.sessions where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') and expires_at > now();
  if not found then raise exception '로그인이 만료되었습니다. 다시 로그인하세요.'; end if;
  select * into u from joil.accounts where id = s.user_id;
  if not found or u.status <> '사용' then raise exception '사용이 중지된 계정입니다.'; end if;
  tabs := string_to_array(u.disp_tabs, E'\n');
  if u.role <> 'partner' and u.role <> 'admin' and not ('quote' = any (string_to_array(coalesce(u.perms, 'quote'), ','))) then return jsonb_build_object('ok', true, 'list', '[]'::jsonb); end if;
  return jsonb_build_object('ok', true, 'list', coalesce((select jsonb_agg(jsonb_build_object('kind', a.kind, 'cust', a.cust, 'date', a.date, 'n', a.n, 'nos', a.nos, 'msg', a.msg, 'at', to_char(a.updated_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI')) order by a.date, a.kind, a.cust)
    from joil.alerts a where a.resolved_at is null and (u.role <> 'partner' or (a.cust = any (tabs) and a.kind in ('nocar', 'rcpt')))), '[]'::jsonb));
end $$;
revoke all on function public.joil_alerts(text) from public;
grant execute on function public.joil_alerts(text) to anon, authenticated, service_role;

-- 예약 작업: 5분마다 (pg_cron 이 없는 시험용 DB 에서는 건너뜀)
do $$ begin
  begin execute 'create extension if not exists pg_cron'; exception when others then raise notice 'pg_cron 없음 — 예약 작업 건너뜀'; end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('joil-alerts', '*/5 * * * *', 'select joil.alerts_scan()');
  end if;
end $$;
