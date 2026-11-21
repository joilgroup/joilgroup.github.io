-- 배차 이력 찾기(dispatch.search)를 빠르게: 글자 일부로 찾는 색인(pg_trgm). 데이터는 안 바뀌어요.
-- 되돌리기: drop index joil.disp_trucks_find, joil.disp_orders_find;
create extension if not exists pg_trgm schema extensions;
create index if not exists disp_trucks_find on joil.disp_trucks using gin ((car || ' ' || replace(car, ' ', '') || ' ' || driver || ' ' || regexp_replace(phone, '[^0-9]', '', 'g')) extensions.gin_trgm_ops); -- core.js TRK_FIND 와 같은 식
create index if not exists disp_orders_find on joil.disp_orders using gin ((data::text) extensions.gin_trgm_ops);
