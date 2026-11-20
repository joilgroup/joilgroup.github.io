-- 배차 화면의 15초 확인(dispatch.stamp)을 '함수 호출'이 아니라 가벼운 DB 직접 조회로.
-- 함수(Edge Function)는 무료 한도가 월 50만 회라, 태블릿 여러 대가 15초마다 부르면 한도를 넘어요.
-- PostgREST RPC(/rest/v1/rpc/joil_stamps)는 함수 호출 수에 안 들어가요(공개 키 anon 으로 부름).
-- 공개 키로 불러도 안전하게: 로그인 토큰을 확인하고, 바뀐 시각(숫자)만 돌려줘요. 협력사는 자기 탭만.
create or replace function public.joil_stamps(p_token text, p_keys text[], p_date text)
returns jsonb language plpgsql security definer set search_path = joil, public, extensions as $$
declare s record; u record; k text; out jsonb := '{}'::jsonb; v bigint;
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
  end loop;
  return jsonb_build_object('ok', true, 'stamps', out);
end $$;
revoke all on function public.joil_stamps(text, text[], text) from public;
grant execute on function public.joil_stamps(text, text[], text) to anon, authenticated, service_role;

-- 구글 Apps Script(견적·일정 등 아직 안 옮긴 영역)가 Supabase 로그인 토큰을 확인할 때 (서비스 키로만)
create or replace function public.joil_whoami(p_token text)
returns jsonb language sql security definer set search_path = joil, public, extensions as $$
  select jsonb_build_object('id', a.id, 'name', a.name, 'role', a.role, 'active', a.status = '사용', 'mustChange', a.must_change = 'Y', 'perms', a.perms, 'tabs', a.disp_tabs)
  from joil.sessions s join joil.accounts a on a.id = s.user_id
  where s.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and s.expires_at > now();
$$;
revoke all on function public.joil_whoami(text) from public, anon, authenticated;
grant execute on function public.joil_whoami(text) to service_role;
