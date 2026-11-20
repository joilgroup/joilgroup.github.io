// 조일 서버 (Supabase 함수 'joil') — 화면이 Apps Script 대신 이 주소로 { action, token, ... } 를 보내면 같은 { ok, ... } 를 돌려줘요.
// 실제 일은 core.js (node 테스트와 같은 코드). DB는 함수에 자동으로 들어오는 SUPABASE_DB_URL 로 직접 붙어요(서비스 권한).
// 배포: verify_jwt = false (화면은 Supabase 키 없이 text/plain 으로 보내요 → 브라우저 사전 요청(CORS preflight) 없이 빠르게). 권한은 로그인 토큰으로 core.js 가 확인.
// 시험용 스키마: 함수 비밀값 JOIL_SCHEMA=joil_test 로 두면 그 스키마를 써요(기본 joil). docs/서버이전.md '시험 방법'.
import postgres from 'npm:postgres@3.4.5';
import { makeServer } from './core.js';

const schema = Deno.env.get('JOIL_SCHEMA') || 'joil';
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 3, prepare: false, idle_timeout: 20, connection: { search_path: schema + ', extensions, public', application_name: 'joil-fn' }, onnotice: () => {} });
const server = makeServer(sql);
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'content-type' };

Deno.serve(async (r: Request) => {
  if (r.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (r.method === 'GET') return new Response('조일 서버(Supabase)가 정상 작동 중입니다.', { headers: { ...CORS, 'content-type': 'text/plain; charset=utf-8' } });
  let req: Record<string, unknown> = {};
  try { req = JSON.parse(await r.text() || '{}'); } catch (_e) { /* 아래에서 알 수 없는 요청 */ }
  const out = await server.call(req);
  return new Response(JSON.stringify(out), { headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
});
