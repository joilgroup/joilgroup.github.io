// 조일 차량 위치 받기 (Supabase Edge Function 'track', verify_jwt = false)
// Traccar Client 가 보내는 위치를 저장. 주소: https://<프로젝트>.supabase.co/functions/v1/track/<비밀키>
//  - 예전 앱(OsmAnd 방식): GET/POST ?id=&lat=&lon=&timestamp=(초)&speed=(노트)&bearing=&altitude=&accuracy=&batt=&charge=
//  - 새 앱(JSON): { device_id, location: { timestamp(ISO), coords:{latitude,longitude,speed(m/s),heading,accuracy,altitude}, battery:{level 0~1} } }
// 비밀 키(app_settings.track_key)가 맞고, 등록·사용 중인 차량의 기기 ID일 때만 저장.
// 키가 주소 경로에 있는 이유: 새 앱이 주소의 ?key= 를 그대로 살리는지 확인 못 해서 (경로는 두 버전 모두 그대로 보냄).

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H: Record<string, string> = { apikey: SB_KEY, "Content-Type": "application/json" };
if (SB_KEY.startsWith("eyJ")) H.Authorization = "Bearer " + SB_KEY;

type Pos = { dev: string; t: Date; lat: number; lng: number; speed: number | null; heading: number | null; accuracy: number | null; battery: number | null };

let cache: { at: number; key: string; dev: Map<string, number> } | null = null;

/** 기기 ID 비교: 띄어쓰기·하이픈 빼고 대문자 (차량번호 "12가 3456" = "12가3456") */
export const norm = (s: string) => String(s || "").replace(/[\s-]/g, "").toUpperCase();

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(SB_URL + "/rest/v1/" + path, { ...init, headers: { ...H, ...(init.headers as Record<string, string> || {}) } });
  if (!r.ok) throw new Error("db " + r.status + " " + await r.text());
  return r;
}

/** 키·차량 목록은 1분 동안 기억 (5분마다 들어오는 위치마다 다시 읽지 않게) */
async function lookup(force = false) {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache;
  const [k, v] = await Promise.all([
    rest("app_settings?key=eq.track_key&select=value").then((r) => r.json()),
    rest("vehicles?active=eq.true&select=id,device_id").then((r) => r.json()),
  ]);
  const dev = new Map<string, number>();
  for (const x of v) dev.set(norm(x.device_id), x.id);
  cache = { at: Date.now(), key: k[0]?.value || "", dev };
  return cache;
}

const num = (v: unknown) => { if (v === null || v === undefined || v === "") return null; const n = Number(v); return isFinite(n) ? n : null; };

function parseTime(v: unknown): Date {
  if (v === null || v === undefined || v === "") return new Date();
  const s = String(v);
  if (/^\d+(\.\d+)?$/.test(s)) { let n = Number(s); if (n < 2147483647) n *= 1000; return new Date(n); }
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date() : d;
}

/** 예전 앱(쿼리) 한 건 */
export function fromQuery(p: URLSearchParams): Pos | null {
  let lat = num(p.get("lat")), lng = num(p.get("lon"));
  const loc = p.get("location");
  if ((lat === null || lng === null) && loc) { const a = loc.split(","); lat = num(a[0]); lng = num(a[1]); }
  const dev = p.get("id") || p.get("deviceid") || "";
  if (!dev || lat === null || lng === null) return null;
  const kn = num(p.get("speed"));
  return { dev, t: parseTime(p.get("timestamp")), lat, lng, speed: kn === null ? null : kn * 1.852, heading: num(p.get("bearing") ?? p.get("heading")), accuracy: num(p.get("accuracy")), battery: num(p.get("batt")) };
}

/** 새 앱(JSON) — 한 건 또는 여러 건(배열·locations) 모두 */
export function fromJson(body: any): Pos[] {
  const out: Pos[] = [];
  const one = (dev: string, l: any) => {
    const c = l && l.coords;
    if (!dev || !c) return;
    const lat = num(c.latitude), lng = num(c.longitude);
    if (lat === null || lng === null) return;
    const ms = num(c.speed), hd = num(c.heading), bl = num(l.battery && l.battery.level);
    out.push({ dev, t: parseTime(l.timestamp), lat, lng, speed: ms === null || ms < 0 ? null : ms * 3.6, heading: hd === null || hd < 0 ? null : hd, accuracy: num(c.accuracy), battery: bl === null || bl < 0 ? null : (bl <= 1 ? Math.round(bl * 100) : bl) });
  };
  const roots = Array.isArray(body) ? body : [body];
  for (const r of roots) {
    if (!r || typeof r !== "object") continue;
    const dev = String(r.device_id || r.deviceId || r.id || "");
    const locs = Array.isArray(r.location) ? r.location : Array.isArray(r.locations) ? r.locations : [r.location];
    for (const l of locs) one(dev, l);
  }
  return out;
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" };
const reply = (status: number, msg = "") => new Response(msg, { status, headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });

/** 한국 날짜 (YYYY-MM-DD) */
export const kstDate = (t: Date) => new Date(t.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

/* ── 용차 위치 링크 (브라우저): /track/l/<token>
   GET  → { plate, date, today, state: ready|started|ended|expired }   (링크 화면이 보여 줄 것만)
   POST { lat, lng, accuracy, speed(m/s), heading, battery(0~100), t(ms) } 또는 { points: [...] } → 저장 · 처음이면 started_at
   POST { end: true } → ended_at (기사가 '종료')
   본문은 text/plain 으로 보내도 됨(브라우저가 미리 묻는 요청을 안 보내게). 링크 날짜(한국)가 지나면 410. */
async function linkMode(req: Request, token: string, action: string) {
  if (!/^[a-f0-9]{24,64}$/.test(token)) return reply(404, "no link");
  const rows = await rest("track_links?token=eq." + token + "&select=token,vehicle_id,date,started_at,ended_at,vehicles(plate,active)").then((r) => r.json());
  const L = rows[0];
  if (!L || !L.vehicles) return reply(404, "no link");
  const now = new Date(), today = kstDate(now);
  const state = L.ended_at ? "ended" : today > L.date ? "expired" : L.started_at ? "started" : "ready";
  // Traccar 앱이 링크 주소로 보낸 것 (용차가 화면을 꺼도 되게): 기기 ID는 보지 않고 링크로 차를 정함.
  // 링크가 끝났거나(종료·밤 12시) 아직 날짜 전이면 저장하지 않고 200 — 오류를 주면 앱이 계속 모아 두고 다시 보내요.
  const url = new URL(req.url), text = req.method === "POST" ? await req.text() : "";
  const q = new URLSearchParams(url.search);
  const isJsonApp = /"coords"/.test(text), isQueryApp = q.has("lat") || q.has("location") || (!/^\s*[\[{]/.test(text) && /(^|&)lat=/.test(text));
  if (isJsonApp || isQueryApp) {
    let list: Pos[] = [];
    if (isJsonApp) list = fromJson(JSON.parse(text));
    else { if (!q.get("lat") && !q.get("location") && text) new URLSearchParams(text).forEach((v, k) => q.set(k, v)); if (!q.get("id")) q.set("id", "link"); const p = fromQuery(q); if (p) list = [p]; }
    if (state === "ended" || state === "expired" || today < L.date) return reply(200, "closed");
    const pts = list.filter((p) => kstDate(p.t) === L.date && p.t.getTime() <= now.getTime() + 120_000).map((p) => ({ vehicle_id: L.vehicle_id, fix_time: p.t.toISOString(), lat: p.lat, lng: p.lng, speed: p.speed, heading: p.heading, accuracy: p.accuracy, battery: p.battery }));
    if (pts.length) await rest("positions?on_conflict=vehicle_id,fix_time", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(pts) });
    if (!L.started_at && pts.length) await rest("track_links?token=eq." + token, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ started_at: now.toISOString() }) });
    return reply(200);
  }
  if (req.method === "GET") return json(200, { plate: L.vehicles.plate, date: L.date, today, state });
  const body = JSON.parse(text || "{}");
  if (body.end || action === "end") {
    if (!L.ended_at) await rest("track_links?token=eq." + token, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ended_at: now.toISOString() }) });
    return json(200, { state: "ended" });
  }
  if (state === "ended" || state === "expired") return json(410, { state });
  if (today < L.date) return json(409, { state: "early", date: L.date });
  // 늦게 보낸 점(화면이 꺼졌다 켜지며 모아 보낸 것)은 링크 날짜 안이고 미래가 아닐 때만
  const pts = (Array.isArray(body.points) ? body.points : [body]).slice(0, 200).map((p: any) => {
    const lat = num(p.lat), lng = num(p.lng), t = num(p.t);
    const time = t && t <= now.getTime() + 120_000 ? new Date(Math.min(t, now.getTime())) : now;
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180 || kstDate(time) !== L.date) return null;
    const sp = num(p.speed), hd = num(p.heading), bt = num(p.battery);
    return { vehicle_id: L.vehicle_id, fix_time: time.toISOString(), lat, lng, speed: sp === null || sp < 0 ? null : sp * 3.6, heading: hd === null || hd < 0 ? null : hd, accuracy: num(p.accuracy), battery: bt === null || bt < 0 ? null : bt };
  }).filter(Boolean);
  if (pts.length) await rest("positions?on_conflict=vehicle_id,fix_time", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(pts) });
  if (!L.started_at) await rest("track_links?token=eq." + token, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ started_at: now.toISOString() }) });
  return json(200, { state: "started", saved: pts.length });
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    const seg = url.pathname.split("/").filter(Boolean);
    const i = seg.indexOf("track");
    if (seg[i + 1] === "l") return await linkMode(req, String(seg[i + 2] || ""), String(seg[i + 3] || ""));
    const key = (i >= 0 && seg[i + 1]) || url.searchParams.get("key") || "";
    let list: Pos[] = [];
    const ct = req.headers.get("content-type") || "";
    const text = req.method === "POST" ? await req.text() : "";
    if (ct.startsWith("application/json") || /^\s*[\[{]/.test(text)) list = fromJson(JSON.parse(text || "{}"));
    else {
      const q = new URLSearchParams(url.search);
      if (!q.get("lat") && !q.get("location") && text) new URLSearchParams(text).forEach((v, k) => q.set(k, v));
      const p = fromQuery(q);
      if (p) list = [p];
    }
    let c = await lookup();
    if (!key || key !== c.key) { c = await lookup(true); if (!key || key !== c.key) return reply(401, "bad key"); }
    if (!list.length) return reply(400, "no position");
    if (list.some((p) => !c.dev.has(norm(p.dev)))) c = await lookup(true);
    const rows = list.filter((p) => c.dev.has(norm(p.dev))).map((p) => ({ vehicle_id: c.dev.get(norm(p.dev)), fix_time: p.t.toISOString(), lat: p.lat, lng: p.lng, speed: p.speed, heading: p.heading, accuracy: p.accuracy, battery: p.battery }));
    // 등록 안 된 기기는 404 — 앱이 버리지 않고 모아 두었다가 등록되면 다시 보냄 (Traccar 서버와 같은 방식)
    if (!rows.length) return reply(404, "unknown device");
    await rest("positions?on_conflict=vehicle_id,fix_time", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(rows) });
    return reply(200);
  } catch (e) {
    console.error("track error", String(e));
    return reply(500, "error");
  }
});
