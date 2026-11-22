-- 새 서버(port.js)의 오래 두는 캐시 (Code.js CacheService 대신): 공휴일 목록·뉴스·날씨·시세 등 바깥에서 받아 오는 것.
-- 예전 gas.js 는 요청마다 캐시가 비어서 공휴일을 매번 구글에서 받아 왔어요 → 이제 12시간 보관.
-- 되돌리기: drop table joil.kv_cache;
create table if not exists joil.kv_cache (key text primary key, value text not null, expires_at timestamptz not null);
alter table joil.kv_cache enable row level security;
revoke all on joil.kv_cache from anon, authenticated;
grant select, insert, update, delete on joil.kv_cache to service_role;
