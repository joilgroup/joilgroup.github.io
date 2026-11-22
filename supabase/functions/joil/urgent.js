// 긴급 배차 알림 (018): 오늘 차가 아직 안 잡힌 호차(배차전 · 차량정보 빈 칸)의 상차 마감·출발 마감을 5분마다 계산해 joil.alerts 에 올려요.
// 출발 마감 = 하차지마다 (하차 끝 시각 − 상차지에서 그 하차지까지 걸리는 시간) 중 가장 이른 것. 걸리는 시간 = 카카오 길찾기(승용차) × 1.2 + 앞 하차지마다 30분.
// 길찾기는 상차지↔하차지(주소) 조합마다 한 번만 조회해 joil.route_times 에 계속 저장. 시간 글자를 못 읽으면 그 호차는 조용히 빼요. 금액 없음.
export var ROUTE_X = 1.2, UNLOAD_MIN = 30, WARN_MIN = 60, NIGHT_MIN = 18 * 60;

var T = '(\\d{1,2})(?:\\s*:\\s*(\\d{2})|\\s*시(?:\\s*(\\d{1,2})\\s*분|\\s*(반))?)?';
function tok(h, m, m2, half) { h = Number(h); var mm = m != null ? Number(m) : m2 != null ? Number(m2) : half ? 30 : 0; return h <= 24 && mm < 60 ? h * 60 + mm : null; }
/** 시간 글자 → 가능한 구간들 [[시작분, 끝분]] (끝이 없으면 9999) · 하차불가·점심 같은 구간은 뺌 */
export function windows(text) {
  var s = String(text == null ? '' : text).replace(/[：]/g, ':').replace(/[∼～〜]/g, '~').replace(/\s+/g, ' ').replace(/(?<![:\d])\d{1,2}\/\d{1,2}(?![:\d])/g, ' ').replace(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g, '$1~$2'); // 6/1 같은 날짜는 빼요 (/ 로 나누기 전에)
  s = s.replace(/\([^)]*\)/g, function (p) { return /불가|점심|식사|휴게|쉬는|중식|석식|휴식/.test(p) ? ' / ' : p.slice(1, -1); });
  var out = [];
  s.split(/\/|,|\n/).forEach(function (seg) {
    if (/불가|점심|식사|휴게|쉬는|중식|석식|휴식|협의/.test(seg)) return;
    var pm = /오후/.test(seg); // '오후 2시~4시' = 14~16시
    seg = seg.replace(/오전\s*/g, '').replace(/오후\s*(\d{1,2})(?=\s*[시:])/g, function (x, h) { return Number(h) < 12 ? String(Number(h) + 12) : h; });
    var re = new RegExp('(?<![\\d/.])' + T + '\\s*~\\s*' + T + '(?![\\d/.])', 'g'), m, hit = false;
    while ((m = re.exec(seg))) {
      var a = tok(m[1], m[2], m[3], m[4]), b = tok(m[5], m[6], m[7], m[8]);
      if (a == null || b == null) continue;
      if (!m[2] && !m[3] && !m[4] && !m[6] && !m[7] && !m[8] && !/^\s*[\d\s~]+\s*$/.test(seg) && !/시/.test(m[0])) continue; // 숫자만 있는 구간은 글이 그것뿐일 때만 (09~16)
      if (b <= a) b += pm && b + 720 > a ? 720 : 1440; // 밤을 넘는 구간 (오후 표기면 12시간)
      out.push([a, b]); hit = true;
    }
    if (hit) return;
    var u = new RegExp('(?<![\\d/.])' + T + '\\s*(까지|이전|전)'), v = new RegExp('(?<![\\d/.])' + T + '\\s*(이후|부터|~\\s*$)'), x;
    if ((x = u.exec(seg)) && (x[2] || x[3] || x[4] || /시/.test(x[0]))) { var e = tok(x[1], x[2], x[3], x[4]); if (e != null) out.push([0, e]); return; }
    if ((x = v.exec(seg)) && (x[2] || x[3] || x[4] || /시/.test(x[0]))) { var st = tok(x[1], x[2], x[3], x[4]); if (st != null) out.push([st, 9999]); }
  });
  return out;
}
/** 낮 구간(18시 전에 시작) 중 가장 늦은 끝 · 못 읽으면 null · 끝이 열려 있으면 null(마감 없음) */
export function dayEnd(text) {
  var all = windows(text), closed = all.filter(function (x) { return x[1] < 9999; });
  var w = (closed.length ? closed : all).filter(function (x) { return x[0] < NIGHT_MIN; }); if (!w.length) return null; // '14시 이후로 부탁' 같은 안내보다 적힌 구간이 먼저
  var e = Math.max.apply(null, w.map(function (x) { return x[1]; })); return e >= 9999 ? null : e;
}
export function fmt(min) { min = Math.max(0, Math.round(min)); var h = Math.floor(min / 60), m = min % 60; return (h >= 24 ? '익일 ' + (h - 24) : h) + (m ? ':' + String(m).padStart(2, '0') : '시'); }
/**
 * 호차 하나의 마감: loadEnd(상차 마감, 분 · null 가능), stops [{ name, end(분 · null 가능) }], legs [초 · null] (legs[0] = 상차지→첫 하차지, legs[i] = i번째→i+1번째)
 * → { kind: 'load'|'dep', at, stop, stopEnd } | null
 */
export function deadline(loadEnd, stops, legs) {
  var cum = 0, dep = null;
  for (var i = 0; i < stops.length; i++) {
    if (legs[i] == null) break; // 길을 모르면 그 뒤 하차지는 못 셈
    cum += legs[i] / 60 * ROUTE_X + (i ? UNLOAD_MIN : 0);
    if (stops[i].end != null) { var d = stops[i].end - cum; if (!dep || d < dep.at) dep = { kind: 'dep', at: d, stop: stops[i].name, stopEnd: stops[i].end }; }
  }
  if (loadEnd != null && (!dep || loadEnd <= dep.at)) return { kind: 'load', at: loadEnd };
  return dep;
}
/** 지금(분) 기준 알림 글 · 아직 1시간보다 많이 남았으면 null */
export function message(no, dl, now) {
  if (!dl || now < dl.at - WARN_MIN) return null;
  var late = now > dl.at;
  if (dl.kind === 'load') return { lvl: late ? 'late' : 'soon', msg: no + '호차 ' + (late ? '상차 마감 지남 (' + fmt(dl.at) + ')' : '상차 마감 ' + fmt(dl.at) + ' 임박') };
  var why = dl.stop + ' ' + fmt(dl.stopEnd) + '까지 하차';
  return { lvl: late ? 'late' : 'soon', msg: no + '호차 ' + (late ? '출발 마감 지남 (' + fmt(dl.at) + ' · ' + why + ')' : fmt(dl.at) + ' 전 출발해야 함 (' + why + ')') };
}

function addrKey(a) { return String(a || '').replace(/\s+/g, ' ').trim(); }
function nameKey(v) { return String(v || '').replace(/\(주\)|㈜|주식회사|\s/g, '').toLowerCase(); }
function loose(v) { return nameKey(v).replace(/[()（）\[\]_\-·.]/g, ''); }
function destKey(v) { return String(v || '').replace(/\s|FC|센터/gi, '').toUpperCase(); }

/** o = { sql, geocode(addrs) → { addr: {lat,lng}|{error} }, kakao(urls) → [{ code, json }] } */
export function makeUrgent(o) {
  var sql = o.sql, Q = function (t, p) { return sql.unsafe(t, p || []); };
  function kst(ms) { var d = new Date((ms || Date.now()) + 9 * 3600e3); return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() }; }
  /** 조합마다 걸리는 시간(초) · 없는 조합은 카카오로 조회해 저장 */
  async function legs(pairs, got) {
    got = got || await stored(pairs);
    var miss = {}; pairs.forEach(function (p) { var k = p[0] + '\n' + p[1]; if (p[0] && p[1] && p[0] !== p[1] && !(k in got)) miss[k] = p; });
    var ks = Object.keys(miss); if (ks.length) await fetchRoutes(ks.map(function (k) { return miss[k]; }), got);
    return got;
  }
  async function fetchRoutes(pairs, got) {
    var addrs = []; pairs.forEach(function (p) { addrs.push(p[0], p[1]); });
    var pt = await o.geocode(addrs), ok = pairs.filter(function (p) { var a = pt[p[0]], b = pt[p[1]]; return a && b && !a.error && !b.error; });
    var res = ok.length ? await o.kakao(ok.map(function (p) { var a = pt[p[0]], b = pt[p[1]]; return 'https://apis-navi.kakaomobility.com/v1/directions?summary=true&priority=RECOMMEND&car_type=1&origin=' + a.lng + ',' + a.lat + '&destination=' + b.lng + ',' + b.lat; })) : [];
    for (var i = 0; i < ok.length; i++) {
      var r = res[i], route = r && r.code === 200 && r.json && r.json.routes && r.json.routes[0], p = ok[i], a = pt[p[0]], b = pt[p[1]];
      if (!route || route.result_code !== 0) continue; // 못 찾으면 저장 안 함 → 다음에 다시
      var sec = Math.round(route.summary.duration), km = Math.round(route.summary.distance / 100) / 10;
      await Q('insert into route_times (okey, dkey, sec, km, olat, olng, dlat, dlng) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (okey, dkey) do update set sec = excluded.sec, km = excluded.km, olat = excluded.olat, olng = excluded.olng, dlat = excluded.dlat, dlng = excluded.dlng, at = now()', [p[0], p[1], sec, km, a.lat, a.lng, b.lat, b.lng]);
      if (got) got[p[0] + '\n' + p[1]] = sec;
    }
    return ok.length;
  }
  /** 호차마다 상차지·하차지(경로 순서, 같은 주소는 하나로)·상차 마감 · trucks [{cust, no}] · 알림과 배차 화면(dispatch.times)이 같이 써요 */
  async function plan(date, trucks, keys) {
    var items = [], pairs = []; if (!trucks.length) return { items: items, pairs: pairs };
    var orders = keys ? await Q('select cust, truck, seq, data from disp_orders where date = $1 and truck is not null and cust = any($2::text[]) order by cust, truck, seq, ord', [date, keys])
      : await Q('select cust, truck, seq, data from disp_orders where date = $1 and truck is not null order by cust, truck, seq, ord', [date]);
    var places = await Q('select name, addr, time, rate_from, cust from loading_places'), dests = await Q('select code, name, addr, hours, cust from dest_book');
    var co = function (key) { return String(key).replace(/\/.*$/, ''); }, mine = function (rowCust, c) { return (rowCust || '쿠팡부자재') === c; };
    var findPlace = function (name, c) {
      var n = nameKey(name), ln = loose(name); if (!n) return null;
      var pick = function (f) { var l = places.filter(f); return l.filter(function (p) { return mine(p.cust, c); })[0] || l[0] || null; };
      return pick(function (p) { return nameKey(p.name) === n; }) || pick(function (p) { return loose(p.name) === ln; }) || pick(function (p) { return p.rate_from && loose(p.rate_from) === ln; });
    };
    var findDest = function (d, c) { var l = dests.filter(function (x) { return mine(x.cust, c); }), code = String(d.code || '').trim().toUpperCase(), nm = destKey(d.fc);
      return (code && l.filter(function (x) { return String(x.code || '').toUpperCase() === code; })[0]) || (nm && l.filter(function (x) { return destKey(x.name) === nm; })[0]) || null; };
    trucks.forEach(function (t) {
      var c = co(t.cust), rows = orders.filter(function (x) { return x.cust === t.cust && Number(x.truck) === Number(t.no); }); if (!rows.length) return;
      var d0 = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data || {}, pl = findPlace(d0.from, c);
      var stops = [];
      rows.forEach(function (r) {
        var d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data || {}, de = findDest(d, c), addr = addrKey(d.addr) || addrKey(de && de.addr), last = stops[stops.length - 1];
        var end = dayEnd(d.hours); if (end == null && !String(d.hours || '').trim() && de) end = dayEnd(de.hours);
        if (last && last.addr === addr) { if (end != null && (last.end == null || end < last.end)) { last.end = end; last.name = d.fc || last.name; } return; }
        stops.push({ name: d.fc || '-', addr: addr, end: end });
      });
      var from = addrKey(pl && pl.addr), it = { t: t, loadEnd: pl ? dayEnd(pl.time) : null, stops: stops, from: from };
      var prev = from; stops.forEach(function (s) { pairs.push([prev, s.addr]); prev = s.addr; });
      items.push(it);
    });
    return { items: items, pairs: pairs };
  }
  /** 구간마다 걸리는 시간(초) · 모르면 null */
  function legsOf(it, got) { var prev = it.from; return it.stops.map(function (s) { var v = !prev || !s.addr ? null : prev === s.addr ? 0 : got[prev + '\n' + s.addr]; prev = s.addr; return v == null ? null : v; }); }
  /** 저장된 조합만 읽기 (카카오 조회 없음) */
  async function stored(pairs) {
    var want = {}; pairs.forEach(function (p) { if (p[0] && p[1] && p[0] !== p[1]) want[p[0] + '\n' + p[1]] = p; });
    var keys = Object.keys(want), got = {}; if (!keys.length) return got;
    (await Q('select okey, dkey, sec from route_times where (okey, dkey) in (select * from unnest($1::text[], $2::text[]))', [keys.map(function (k) { return want[k][0]; }), keys.map(function (k) { return want[k][1]; })]))
      .forEach(function (r) { got[r.okey + '\n' + r.dkey] = r.sec; });
    return got;
  }
  /** 5분마다 (pg_cron → pg_net → sys.urgent) · 돌려주는 값 = 올린 알림 수 */
  async function scan(nowMs) {
    var k = kst(nowMs), today = k.date;
    var trucks = await Q("select cust, date, no, car, status from disp_trucks where date = $1 and join_tk = '' and status not in ('회차') and (status in ('', '배차전') or btrim(car) = '')", [today]);
    var seen = [], items = [];
    if (trucks.length) {
      var pl = await plan(today, trucks);
      items = pl.items.filter(function (it) { return it.loadEnd != null || it.stops.some(function (s) { return s.end != null; }); });
      var pairs = []; items.forEach(function (it) { var prev = it.from; it.stops.forEach(function (s) { pairs.push([prev, s.addr]); prev = s.addr; }); });
      var got = await legs(pairs);
      items.forEach(function (it) {
        var m = message(it.t.no, deadline(it.loadEnd, it.stops, legsOf(it, got)), k.min); if (!m) return;
        var ref = 'urg|' + it.t.cust + '|' + today + '|' + it.t.no; seen.push(ref);
        it.ref = ref; it.m = m;
      });
      for (var it of items) if (it.m) await Q("insert into alerts (ref, kind, cust, date, n, nos, msg, lvl) values ($1, 'urg', $2, $3, 1, $4, $5, $6) on conflict (ref) do update set msg = excluded.msg, lvl = excluded.lvl, updated_at = case when alerts.msg is distinct from excluded.msg or alerts.resolved_at is not null then now() else alerts.updated_at end, resolved_at = null", [it.ref, it.t.cust, today, String(it.t.no), it.m.msg, it.m.lvl]);
    }
    await Q("update alerts set resolved_at = now() where resolved_at is null and kind = 'urg' and not (ref = any($1::text[]))", [seen]);
    return seen.length;
  }
  /** 배차 화면 호차 칸: 그날 호차마다 걸리는 시간(알림과 같은 계산) · fetch 가 아니면 저장된 조합만 읽어요(화면을 열 때 카카오 조회 없음)
      → { times: [{ cust, no, min(상차지→마지막 하차지, × 1.2 + 앞 하차 30분) | null, vias, unk(모르는 구간 수), dl: {kind, at, stop, stopEnd} | null }], fetched } */
  async function times(date, keys, fetch) {
    keys = (keys || []).map(String).filter(Boolean); if (!date || !keys.length) return { times: [], fetched: 0 };
    var nos = await Q('select distinct cust, truck from disp_orders where date = $1 and cust = any($2::text[]) and truck is not null', [date, keys]);
    var skip = {}; (await Q("select cust, no from disp_trucks where date = $1 and cust = any($2::text[]) and (join_tk <> '' or status = '회차')", [date, keys])).forEach(function (r) { skip[r.cust + '|' + r.no] = 1; }); // 합차로 연결된 호차·회차는 빼요 (알림과 같게)
    var trucks = nos.filter(function (r) { return !skip[r.cust + '|' + r.truck]; }).map(function (r) { return { cust: r.cust, no: Number(r.truck) }; });
    var pl = await plan(date, trucks, keys), got = await stored(pl.pairs), before = Object.keys(got).length;
    if (fetch) await legs(pl.pairs, got); // 버튼을 눌렀을 때만 처음 가는 조합을 카카오로 조회해 저장
    return { times: pl.items.map(function (it) {
      var lg = legsOf(it, got), unk = lg.filter(function (v) { return v == null; }).length, cum = 0;
      lg.forEach(function (v, i) { cum += (v || 0) / 60 * ROUTE_X + (i ? UNLOAD_MIN : 0); });
      return { cust: it.t.cust, no: it.t.no, min: unk || !lg.length ? null : Math.round(cum), vias: Math.max(0, it.stops.length - 1), unk: unk, dl: deadline(it.loadEnd, it.stops, lg) };
    }), fetched: fetch ? Object.keys(got).length - before : 0 };
  }
  /** 관리자: 저장된 이동시간 표 */
  async function routeList() {
    var rows = await Q("select okey, dkey, sec, km, to_char(at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') at from route_times order by at desc limit 500");
    return { routes: rows.map(function (r) { return { from: r.okey, to: r.dkey, min: Math.round(r.sec / 60), adj: Math.round(r.sec / 60 * ROUTE_X), km: Number(r.km), at: r.at }; }), x: ROUTE_X };
  }
  /** 관리자: 조합 다시 조회 (주소 좌표는 저장된 것 그대로) */
  async function routeRefetch(from, to) {
    from = addrKey(from); to = addrKey(to); if (!from || !to) throw new Error('출발·도착 주소가 필요해요.');
    var n = await fetchRoutes([[from, to]], null); if (!n) throw new Error('길찾기에 실패했어요. 주소를 확인해 주세요.');
    return routeList();
  }
  return { scan: scan, times: times, routeList: routeList, routeRefetch: routeRefetch };
}
