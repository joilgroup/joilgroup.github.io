-- 배차시트 실시간 반영: 누가 저장하면(disp_stamps 가 바뀜) Supabase Realtime 으로 '바뀌었어요' 신호만 보내요 → 화면이 그때만 다시 받아요.
-- 신호에는 바뀐 시각(숫자)만 있고 데이터는 없어요. 채널 이름(topic)은 비밀값으로 만든 해시라 알 수 없고,
-- 화면은 로그인 토큰을 확인하는 joil_stamps 에서만 채널 이름을 받아요(협력사는 자기 탭만) → 공개 채널이어도 남이 엿들을 수 없어요.
-- 신호가 안 와도(연결 끊김) 화면이 2분마다 예전처럼 확인해요. 15초 확인은 연결이 안 될 때만.
-- 되돌리기: drop trigger rt_stamp on joil.disp_stamps; (화면은 신호가 없으면 15초 확인으로 돌아가요)

insert into joil.props (key, value) values ('RT_SECRET', encode(extensions.gen_random_bytes(24), 'hex')) on conflict (key) do nothing;

create or replace function joil.rt_topic(p_cust text, p_date text) returns text language sql stable security definer set search_path = joil, extensions, public as $$
  select 'j' || substr(encode(extensions.hmac(p_cust || '|' || p_date, (select value from joil.props where key = 'RT_SECRET'), 'sha256'), 'hex'), 1, 32)
$$;
revoke all on function joil.rt_topic(text, text) from public, anon, authenticated;

create or replace function joil.rt_stamp() returns trigger language plpgsql security definer set search_path = joil, public as $$
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then return null; end if; -- 시험용 DB(Realtime 없음)
  begin
    execute 'select realtime.send($1, $2, $3, false)' using jsonb_build_object('s', NEW.stamp), 'stamp', joil.rt_topic(NEW.cust, NEW.date);
  exception when others then null; -- 신호 실패가 저장을 막으면 안 돼요 (화면은 2분 확인으로 따라와요)
  end;
  return null;
end $$;
drop trigger if exists rt_stamp on joil.disp_stamps;
create trigger rt_stamp after insert or update on joil.disp_stamps for each row execute function joil.rt_stamp();

-- 15초 확인 RPC 에 채널 이름(topics)을 같이 (같은 권한 확인 · 005 와 같고 topics 만 추가)
create or replace function public.joil_stamps(p_token text, p_keys text[], p_date text)
returns jsonb language plpgsql security definer set search_path = joil, public, extensions as $$
declare s record; u record; k text; out jsonb := '{}'::jsonb; tp jsonb := '{}'::jsonb; v bigint;
begin
  if p_token is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception '로그인이 필요합니다.'; end if;
  select * into s from joil.sessions where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and expires_at > now();
  if not found then raise exception '로그인이 만료되었습니다. 다시 로그인하세요.'; end if;
  select * into u from joil.accounts where id = s.user_id;
  if not found or u.status <> '사용' then raise exception '사용이 중지된 계정입니다.'; end if;
  foreach k in array coalesce(p_keys[1:20], '{}') loop
    if u.role = 'partner' and not (k = any (string_to_array(u.disp_tabs, E'\n'))) then raise exception '볼 수 없는 탭이에요.'; end if;
    select stamp into v from joil.disp_stamps where cust = k and date = p_date;
    out := out || jsonb_build_object(k, coalesce(v, 0));
    tp := tp || jsonb_build_object(k, joil.rt_topic(k, p_date));
  end loop;
  return jsonb_build_object('ok', true, 'stamps', out, 'topics', tp);
end $$;
revoke all on function public.joil_stamps(text, text[], text) from public;
grant execute on function public.joil_stamps(text, text[], text) to anon, authenticated, service_role;
