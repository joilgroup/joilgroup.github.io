// 조일 서버 (Supabase 함수 'joil' · 기사 사이트용 같은 코드 'info') — 화면이 Apps Script 대신 이 주소로 { action, token, ... } 를 보내면 같은 { ok, ... } 를 돌려줘요.
// 로그인·계정·배차·기사 링크 = core.js (Code.js 를 옮긴 것) · 그 밖의 모든 메뉴 = gas.js 가 Code.js 를 그대로 실행 (gas_src.js = 배포 때 apps-script/*.js 를 묶은 글자).
// DB는 함수에 자동으로 들어오는 SUPABASE_DB_URL 로 직접 붙어요(서비스 권한). verify_jwt = false (권한은 로그인 토큰으로 확인).
import postgres from 'npm:postgres@3.4.5';
import { zipSync } from 'npm:fflate@0.8.2';
import { createHash } from 'node:crypto';
import { makeServer, ACTIONS, MOVED } from './core.js';
import { makeGas } from './gas.js';
import { SRC, CALC } from './gas_src.js';

const schema = Deno.env.get('JOIL_SCHEMA') || 'joil';
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 3, prepare: false, idle_timeout: 20, connection: { search_path: schema + ', extensions, public', application_name: 'joil-fn' }, onnotice: () => {} });
const server = makeServer(sql, { calcSrc: CALC, zip: (files: Record<string, Uint8Array>) => zipSync(files) });
// 구글 쪽 Code.js 부르기 (드라이브·메일 대행): 주소·비밀값은 시험 복사 때 props 에 저장돼요
async function gasFetch(action: string, payload: Record<string, unknown>) {
  const p: Record<string, string> = {};
  (await sql.unsafe("select key, value from props where key in ('GAS_URL','GAS_SECRET')")).forEach((r: any) => { p[r.key] = r.value; });
  if (!p.GAS_URL) throw new Error('구글 서버 연결(GAS_URL)이 아직 없어요.');
  const res = await fetch(p.GAS_URL, { method: 'POST', body: JSON.stringify(Object.assign({ action, secret: p.GAS_SECRET }, payload)), redirect: 'follow' });
  const j = JSON.parse(await res.text()); if (!j.ok) throw new Error(j.error || '구글 서버 오류'); return j;
}
const gas = makeGas({ sql, src: SRC, gasFetch, zip: (files: Record<string, Uint8Array>) => zipSync(files) });
// 구글 쪽에만 있는 기능(서버 이전 도구·예약 작업 켜기)은 화면이 계속 Apps Script 로 보내요 — 여기 오면 안내만
const GAS_ONLY = /^admin\.sb|^admin\.saveTrackKeys$/;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'content-type' };

async function secretOk(s: unknown) { const r = await sql.unsafe("select value from props where key = 'GAS_SECRET'"); return !!(r[0] && s && String(s) === r[0].value); }
// 진짜 표로 옮긴 영역(012~): 옮김 표시(props MOVED_시트)가 있을 때만 core.js, 없으면 예전처럼 gas.js (30초마다 다시 확인)
let movedAt = 0, moved: Record<string, boolean> = {};
async function movedFlags() {
  if (Date.now() - movedAt > 30000) { const m: Record<string, boolean> = {}; (await sql.unsafe("select key, value from props where key like 'MOVED\\_%' or key = 'PORT_OFF'")).forEach((r: any) => { if (r.key === 'PORT_OFF') (m as any).__off = String(r.value || '').split(',').map((x: string) => x.trim()); else m[String(r.key).slice(6)] = true; }); moved = m; movedAt = Date.now(); }
  return moved;
}
async function route(req: any) {
  const action = String(req.action || '');
  const pre = Object.keys(MOVED).find((p) => action.indexOf(p) === 0);
  // 옮긴 영역 꺼짐 스위치: props PORT_OFF = 'custs,cal' 처럼 → 그 영역은 gas.js(Code.js 그대로)로
  const off = (await movedFlags()).__off as unknown as string[] | undefined;
  const isOff = !!off && off.some((p) => p && action.indexOf(p + '.') === 0);
  if (!isOff && (pre ? (await movedFlags())[(MOVED as any)[pre]] : ACTIONS.indexOf(action) !== -1)) return server.call(req);
  const t0 = Date.now();
  try {
    let out: any;
    if (action === 'sys.run' || action === 'sys.hashes') { // 구글 쪽 예약 작업·비교 (비밀값으로만)
      if (!(await secretOk(req.secret))) throw new Error('권한이 없어요.');
      // 월요일 주간 요약 메일은 새 서버(port.js)가 · 나머지 예약 작업은 그대로 Code.js
      if (action === 'sys.run' && String(req.fn) === 'sendWeeklySummary') { try { out = { result: await (server as any).port.weeklySend(null, null) }; } catch (e) { console.error(e); out = { result: null }; } }
      else if (action === 'sys.run') out = { result: await gas.call(null, null, String(req.fn || ''), []) ?? null };
      else {
        const hashes: Record<string, unknown> = {};
        for (const n of (req.names || []).map(String)) {
          const rows = (await sql.unsafe('select v from sheet_read(array[$1]) order by r', [n])).map((x: any) => x.v);
          hashes[n] = { rows: rows.length, md5: createHash('md5').update(JSON.stringify(rows)).digest('hex') };
        }
        out = { hashes };
      }
    } else if (GAS_ONLY.test(action)) throw new Error('이 기능은 구글 서버에서만 돼요. 사이트를 새로고침해 주세요.');
    else {
      const s = await server.requireSession(req.token); // 로그인 확인은 core.js 와 같게 (Supabase 세션)
      out = (await gas.call(req, server.pub(s))) || {};
    }
    out.ok = true; out.ms = Date.now() - t0; return out;
  } catch (e) { return { ok: false, error: (e && (e as Error).message) || String(e), ms: Date.now() - t0 }; }
}

Deno.serve(async (r: Request) => {
  if (r.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (r.method === 'GET') return new Response('서버가 정상 작동 중입니다.', { headers: { ...CORS, 'content-type': 'text/plain; charset=utf-8' } });
  let req: Record<string, unknown> = {};
  try { req = JSON.parse(await r.text() || '{}'); } catch (_e) { /* 아래에서 알 수 없는 요청 */ }
  const out = await route(req), body = JSON.stringify(out);
  const headers: Record<string, string> = { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
  // 무료 전송량(월 5GB)을 아끼려고 큰 응답은 gzip (브라우저가 알아서 풀어요)
  if (body.length > 2048 && /gzip/.test(r.headers.get('accept-encoding') || '')) {
    headers['content-encoding'] = 'gzip';
    return new Response(new Blob([body]).stream().pipeThrough(new CompressionStream('gzip')), { headers });
  }
  return new Response(body, { headers });
});
