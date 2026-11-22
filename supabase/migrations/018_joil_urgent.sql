-- 긴급 배차 알림: 배차 알림은 '오늘 차가 안 잡힌 호차의 상차 마감·출발 마감'만 (2026-11-22 사용자 요청 · 예전 미배정·차량정보·인수증 알림은 내림).
-- 계산은 함수(urgent.js)가 해요 — 길찾기(카카오)가 필요해서. 5분마다 예약 작업 joil-alerts 가 alerts_scan → pg_net 으로 함수 sys.urgent 를 불러요.
--   함수 주소 = props SELF_URL, 비밀값 = props GAS_SECRET (둘 다 DB 안에만 · 저장소에 없음)
-- route_times: 상차지↔하차지(주소 글자) 조합마다 카카오 길찾기 결과(승용차, 초). 화면 계산 때 × 1.2.
-- 되돌리기: 011 의 alerts_scan 을 다시 실행 · drop table joil.route_times · alter table joil.alerts drop column lvl.

create table if not exists joil.route_times (
  okey text not null,             -- 출발 주소
  dkey text not null,             -- 도착 주소
  sec  int not null,              -- 카카오 길찾기 걸리는 시간 (초, 보정 전)
  km   numeric not null default 0,
  olat double precision, olng double precision, dlat double precision, dlng double precision,
  at   timestamptz not null default now(),
  primary key (okey, dkey)
);
alter table joil.route_times enable row level security;
revoke all on joil.route_times from anon, authenticated;
grant select, insert, update, delete on joil.route_times to service_role;

alter table joil.alerts add column if not exists lvl text not null default '';  -- soon(1시간 안) · late(지남)

do $$ begin
  begin execute 'create extension if not exists pg_net'; exception when others then raise notice 'pg_net 없음 — 함수 부르기 건너뜀'; end;
end $$;

create or replace function joil.alerts_scan() returns int language plpgsql security definer set search_path = joil, public as $$
declare h int := extract(hour from (now() at time zone 'Asia/Seoul')); u text; s text;
begin
  -- 예전 배차 알림(미배정·차량정보·인수증)은 이제 안 띄워요
  update alerts set resolved_at = now() where resolved_at is null and kind in ('un', 'nocar', 'rcpt');
  delete from alerts where resolved_at < now() - interval '14 days';
  if h < 5 or h >= 23 then return 0; end if; -- 밤에는 함수 호출 아낌
  select value into u from props where key = 'SELF_URL'; select value into s from props where key = 'GAS_SECRET';
  if coalesce(u, '') = '' or coalesce(s, '') = '' or not exists (select 1 from pg_extension where extname = 'pg_net') then return 0; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 60000)' using u, jsonb_build_object('action', 'sys.urgent', 'secret', s), '{"Content-Type":"application/json"}'::jsonb;
  return 1;
end $$;
revoke all on function joil.alerts_scan() from public, anon, authenticated;

-- 화면이 읽는 알림: lvl 도 같이 · 협력사는 배정된 탭의 긴급 알림만
create or replace function public.joil_alerts(p_token text) returns jsonb language plpgsql security definer set search_path = joil, public, extensions as $$
declare s record; u record; tabs text[];
begin
  select * into s from joil.sessions where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') and expires_at > now();
  if not found then raise exception '로그인이 만료되었습니다. 다시 로그인하세요.'; end if;
  select * into u from joil.accounts where id = s.user_id;
  if not found or u.status <> '사용' then raise exception '사용이 중지된 계정입니다.'; end if;
  tabs := string_to_array(u.disp_tabs, E'\n');
  if u.role <> 'partner' and u.role <> 'admin' and not ('quote' = any (string_to_array(coalesce(u.perms, 'quote'), ','))) then return jsonb_build_object('ok', true, 'list', '[]'::jsonb); end if;
  return jsonb_build_object('ok', true, 'list', coalesce((select jsonb_agg(jsonb_build_object('kind', a.kind, 'cust', a.cust, 'date', a.date, 'n', a.n, 'nos', a.nos, 'msg', a.msg, 'lvl', a.lvl, 'at', to_char(a.updated_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI')) order by a.date, (a.lvl = 'late') desc, a.cust, a.ref)
    from joil.alerts a where a.resolved_at is null and (u.role <> 'partner' or (a.cust = any (tabs) and a.kind = 'urg'))), '[]'::jsonb));
end $$;
revoke all on function public.joil_alerts(text) from public;
grant execute on function public.joil_alerts(text) to anon, authenticated, service_role;
