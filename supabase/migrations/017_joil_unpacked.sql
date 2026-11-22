-- 압축해 한 칸에 넣던 값(스냅샷·견적데이터·타리프버전·분석데이터)을 풀어서 보관하는 표.
-- 압축 원본(시트 표 gs_snapshots·gs_quote_data·gs_tariff_versions·gs_an_data)은 그대로 두고 같이 써요 → Code.js 로 되돌려도(PORT_OFF) 그대로 동작.
-- 새 서버(port.js)가 쓸 때마다 같이 맞추고, 처음 한 번은 함수가 원본을 풀어 채워요(props UNPACK = 'go' → 결과는 UNPACK_RESULT).
-- 압축을 푸는 일은 Supabase 함수 안에서만 해요(금액 자료가 밖으로 나가지 않게).
-- 되돌리기: drop table joil.quote_snaps, joil.tariff_vers, joil.an_rows;
create table if not exists joil.quote_snaps (kind text not null check (kind in ('snap', 'quote')), id text not null, part int not null, saved_ms bigint, user_id text, meta jsonb not null, items jsonb not null, primary key (kind, id, part));
create table if not exists joil.tariff_vers (id text primary key, first_at text, user_name text, settings jsonb not null, rows jsonb not null);
create table if not exists joil.an_rows (key text primary key, biz text not null, month text not null, n int not null, sales numeric not null, buys numeric not null, rows jsonb not null, updated_at timestamptz not null default now());
do $$ declare t text; begin
  foreach t in array array['quote_snaps', 'tariff_vers', 'an_rows'] loop
    execute format('alter table joil.%I enable row level security', t);
    execute format('revoke all on joil.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on joil.%I to service_role', t);
  end loop;
end $$;
