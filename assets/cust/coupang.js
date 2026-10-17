/* 쿠팡부자재 배차 (업체별 파일 · 새 업체 추가 방법은 assets/cust/README.md)
   동방 엑셀 오더 붙여넣기(컬리 양식 포함) · 하차지 주소록과 주소 비교 · AI 도움 / AI 한번에 짜기 */
(window.JOIL_CUST = window.JOIL_CUST || []).push({ name: '쿠팡부자재', make: function (H) {
  'use strict';
  // app.js의 공용 도우미 (저장·화면·권한)
  var $ = H.$, $$ = H.$$, advAddrKey = H.advAddrKey, advRegion = H.advRegion, api = H.api, autoTon = H.autoTon, dispBundles = H.dispBundles, dispCleanD = H.dispCleanD;
  var dispNum = H.dispNum, dispOrderB = H.dispOrderB, dispState = H.dispState, dispYmd = H.dispYmd, drawRouteMap = H.drawRouteMap, esc = H.esc, findPlace = H.findPlace, geoKey = H.geoKey;
  var hav = H.hav, isPartner = H.isPartner, loadDispRates = H.loadDispRates, modal = H.modal, parseTsv = H.parseTsv, routeLen = H.routeLen, toast = H.toast, truckCost = H.truckCost;
  var won = H.won, ymAdd = H.ymAdd;
  /* 동방 엑셀 C~AF열 (첫 칸은 항상 출발센터 · B열 순번은 쓰지 않아요) */
  var DISP_COLS = [['from', '출발센터'], ['maker', '제조사'], ['item', 'Item'], ['date', '납품일자'], ['inQty', '입고수량'], ['outQty', '출고수량'], ['dest', '도착지'], ['fc', '센터명'], ['po', 'CP 발주번호'], ['bl', 'BL#'],
    ['bundle', '상차수량(BUNDLE)'], ['car', '차량정보'], ['driver', '운전원'], ['phone', '연락처'], ['time', '입차 예정시간'], ['ton', '톤수'], ['kg', '무게(KG)'], ['load', '상차'], ['qty', '수량'], ['bundle2', '상차수량(BUNDLE)'],
    ['truckNo', '호차'], ['dist', '운송거리'], ['stmt', '거래명세서 회수'], ['kpp', 'KPP 전표 회수'], ['dock', 'FC 배정도크'], ['addr', '주소'], ['hours', '상하차 가능시간'], ['m1', '쿠팡담당자1'], ['m2', '쿠팡담당자2'], ['m3', '쿠팡담당자3']];
  /** 이미 가져온 줄인지 가리는 키 (순번 제외: 날짜·발주번호·BL·센터·품목·출고수량·번들) */
  var DISP_COLS_BASE = DISP_COLS;
  function dispOrderKey(date, d) { return [date, d.po, d.bl, d.fc, d.item, d.outQty, d.bundle].join('|'); }
  // 컬리 양식: 입고수량 칸이 없고(그 뒤 칸이 하나씩 당겨짐), 발주번호·컬리담당자 이름이 달라요
  var DISP_COLS_KURLY = DISP_COLS.filter(function (c) { return c[0] !== 'inQty'; }).map(function (c) { return c[0] === 'po' ? ['po', '발주번호'] : /^m\d$/.test(c[0]) ? [c[0], '컬리담당자' + c[0].slice(1)] : c; });
  function dispIsKurly(tab) { return /컬리/.test(String(tab || '')); }
  function dispParse(text, kurly) {
    var DISP_COLS = kurly ? DISP_COLS_KURLY : DISP_COLS_BASE;
    var rows = parseTsv(text); if (!rows.length) return { items: [], warn: '붙여넣은 내용이 없어요.' };
    var norm = function (h) { return String(h || '').replace(/\s/g, '').toLowerCase(); };
    var head = rows[0].map(norm), hasHead = head.indexOf('출발센터') !== -1 || head.indexOf('납품일자') !== -1, idx = {};
    if (hasHead) {
      var used = {};
      DISP_COLS.forEach(function (c) {
        var want = norm(c[1]), isMgr = /^m\d$/.test(c[0]);
        for (var j = 0; j < head.length; j++) { if (used[j]) continue; if (isMgr ? /^(쿠팡|컬리)담당자/.test(head[j]) : head[j] === want || (c[0] === 'po' && /^(cp)?발주번호$/.test(head[j]))) { idx[c[0]] = j; used[j] = 1; return; } }
      });
      rows = rows.slice(1);
    } else {
      // 제목 줄 없이 데이터만: C열(출발센터)부터가 기본. 실수로 B열(순번)부터 복사했으면 한 칸 밀어서 읽어요.
      var di = DISP_COLS.map(function (c) { return c[0]; }).indexOf('date'), ok = function (off) { return rows.filter(function (r) { return dispYmd(String(r[di + off] == null ? '' : r[di + off]).trim()); }).length; };
      var off = ok(1) > ok(0) ? 1 : 0; DISP_COLS.forEach(function (c, j) { idx[c[0]] = j + off; });
    }
    if (idx.date == null || idx.fc == null) return { items: [], warn: '"납품일자"나 "센터명" 칸을 찾지 못했어요. 동방 엑셀의 제목 줄까지 같이 복사해 주세요.' };
    var items = [], bad = 0;
    rows.forEach(function (r) {
      var d = {}; DISP_COLS.forEach(function (c) { var j = idx[c[0]]; d[c[0]] = j == null ? '' : String(r[j] == null ? '' : r[j]).trim(); });
      if (!d.fc && d.dest) d.fc = d.dest; // 컬리처럼 센터명이 비어 있으면 도착지(MK_GMP 등)를 센터명으로
      var date = dispYmd(d.date); if (!date || !d.fc) { bad++; return; }
      dispCleanD(d);
      d.date = date; d._n = items.length + bad;
      items.push({ date: date, key: dispOrderKey(date, d), d: d });
    });
    return { items: items, warn: bad ? '날짜나 센터명이 없는 ' + bad + '줄은 건너뛰었어요.' + (!items.length ? ' 동방 엑셀의 C열(출발센터)부터 복사했는지 확인해 주세요.' : '') : '' };
  }
  function destKind(o) { return /장갑/.test((o.d && o.d.item) || '') ? 'glove' : 'fc'; }
  /** 같은 곳인지 비교용: 시·군(광역시는 구) + 도로명/번지 (띄어쓰기·층·도크·괄호·우편번호 무시) */
  function destKey(addr) {
    var s = String(addr || '').replace(/\([^)]*\)/g, ' ').replace(/[,，]/g, ' ').replace(/번지/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/(로|길)\s+(\d+번길)/g, '$1$2');
    var t = s.split(' '), area = '', metro = /^(서울|부산|인천|대구|광주|대전|울산|세종)/;
    for (var i = 0; i < t.length; i++) {
      var w = t[i];
      if (/(특별시|광역시|특별자치시)$/.test(w) || (metro.test(w) && /시?$/.test(w) && t[i + 1] && /(구|군)$/.test(t[i + 1]))) { area = (t[i + 1] || ''); break; }
      if (/(시|군)$/.test(w) && !/(도)$/.test(w)) { area = w; break; }
    }
    var m = s.match(/(\S+번길)\s*(\d+(?:-\d+)?)/) || s.match(/(\S+(?:로|길))\s*(\d+(?:-\d+)?)/) || s.match(/(\S+(?:동|리|가))\s+(\d+(?:-\d+)?)/);
    return m ? area + '|' + m[1] + m[2] : area + '|' + advAddrKey(addr);
  }
  /** 층·동 표기 (둘 다 적혀 있을 때만 비교: 장갑과 일반 품목은 층이 다를 수 있어요) */
  function destFloor(addr) {
    var s = String(addr || ''), f = [], b = [], m, re = /(지하\s*|B)?(\d+)\s*(층|F)(?![A-Za-z])/gi;
    while ((m = re.exec(s))) f.push((m[1] ? '-' : '') + m[2]);
    var re2 = /(?:^|\s|,)([A-Z])\s*동/g; while ((m = re2.exec(s))) b.push(m[1]);
    return { f: f.sort().join(','), b: b.sort().join(',') };
  }
  function destSame(a, b) {
    if (destKey(a) !== destKey(b)) return false;
    var x = destFloor(a), y = destFloor(b);
    return !(x.f && y.f && x.f !== y.f) && !(x.b && y.b && x.b !== y.b);
  }
  /** 이 오더의 주소록 항목: 도착지 코드 = Sap Code (같은 코드가 층별로 여럿이면 센터명으로) → 없으면 센터명으로 */
  function destOf(o) {
    var st = dispState(), list = (st.dests || []).filter(function (x) { return x.kind === destKind(o); }); if (!list.length) return null;
    var code = String(o.d.dest || '').trim().toUpperCase(), nm = function (v) { return String(v || '').replace(/\s|FC|센터/gi, '').toUpperCase(); };
    var hit = code ? list.filter(function (x) { return x.code.toUpperCase() === code; }) : [];
    if (!hit.length && code) hit = list.filter(function (x) { return x.code.toUpperCase().indexOf(code + '-') === 0; });
    if (hit.length > 1) { var byName = hit.filter(function (x) { return nm(x.name) === nm(o.d.fc); }); if (byName.length) hit = byName; }
    if (!hit.length) hit = list.filter(function (x) { return nm(x.name) && nm(x.name) === nm(o.d.fc); });
    return hit[0] || null;
  }
  function destFlag(o) {
    var st = dispState(); if (isPartner() || !(st.dests || []).length) return '';
    var e = destOf(o); if (!e) return '<span class="dest-none" title="하차지 주소록(' + (destKind(o) === 'glove' ? '장갑' : 'FC도크') + ')에 이 코드·센터명이 없어요">주소록에 없음' + (o.d.dest ? ' (' + esc(o.d.dest) + ')' : '') + '</span>';
    if (!e.addr || destSame(e.addr, o.d.addr)) return '';
    return '<span class="dest-diff" title="' + esc('주소록(' + (e.kind === 'glove' ? '장갑' : 'FC도크') + ' · ' + e.code + ' ' + e.name + '): ' + e.addr) + '">⚠ 주소록과 다름: ' + esc(e.addr) + '</span>';
  }
  function destDiffCount(orders) { var st = dispState(); if (isPartner() || !(st.dests || []).length) return 0; return orders.filter(function (o) { var e = destOf(o); return e && e.addr && !destSame(e.addr, o.d.addr); }).length; }
  /* ── AI 도움: 호차 안 정해진 오더를 한 대씩 추천 (규칙 + 지난 배차 기록, 데이터는 밖으로 안 나가요) ──
     · 상차지(출발센터)가 같은 착지끼리만, 한 대에 착지 3곳까지
     · 합칠 때는 16번들(11톤)까지 · 한 착지가 17~18번들이면 그 착지만 한 대 · 18번들 넘는 착지는 오더 단위로 여러 대
     · 가까움: 착지끼리 직선 5km 이내, 같은 시·군이면 10km 이내, 또는 가는 길 위(돌아가는 거리 3km·5% 이내)
     · 먼저: 누가 봐도 혼자 가야 하는 착지(18번들 초과 → 17~18번들 → 같이 묶을 착지가 없는 곳) → 그다음 상차지에서 먼 곳
     · 고르는 기준: 차량 대수 최소 → 운임 최소(단가표 있으면) → 지난 2달 같이 보낸 조합 */
  var ADV_MIX = 16, ADV_ONE = 18, ADV_KG = 10000, ADV_STOPS = 3, ADV_KM = 5, ADV_KM_REG = 10;
  function advEnsureGeo(addrs) {
    var st = dispState(), miss = addrs.map(geoKey).filter(function (a, i, arr) { return a && !(a in st.geo) && arr.indexOf(a) === i; });
    if (!miss.length) return Promise.resolve();
    var chunks = []; for (var i = 0; i < miss.length; i += 40) chunks.push(miss.slice(i, i + 40));
    return Promise.all(chunks.map(function (c) { return api('dispatch.geo', { addrs: c }).then(function (r) { c.forEach(function (a) { st.geo[a] = (r.coords || {})[a] || null; }); }).catch(function () { }); }));
  }
  /** 지난 2달 이 탭에서 같은 호차로 간 착지 쌍 횟수 */
  function advHistory(D) {
    var st = dispState(), hk = D.key + '|' + D.date.slice(0, 7); st.advHist = st.advHist || {};
    if (st.advHist[hk]) return Promise.resolve(st.advHist[hk]);
    var yms = [D.date.slice(0, 7), ymAdd(D.date.slice(0, 7), -1)];
    return Promise.all(yms.map(function (ym) { return api('dispatch.monthAll', { keys: [D.key], ym: ym }).then(function (r) { return r.byKey[D.key] || { orders: [] }; }).catch(function () { return { orders: [] }; }); })).then(function (rs) {
      var tr = {}, pair = {};
      rs.forEach(function (r) { r.orders.forEach(function (o) { if (o.truck === '' || o.truck == null || o.date >= D.date) return; var k = o.date + '|' + o.truck; (tr[k] || (tr[k] = {}))[(o.d || {}).fc] = 1; }); });
      Object.keys(tr).forEach(function (k) { var f = Object.keys(tr[k]); for (var i = 0; i < f.length; i++) for (var j = i + 1; j < f.length; j++) { var pk = [f[i], f[j]].sort().join('|'); pair[pk] = (pair[pk] || 0) + 1; } });
      st.advHist[hk] = pair; return pair;
    });
  }
  /** 호차 안 정해진 오더 → 착지(같은 상차지 · 같은 주소면 센터 이름이 달라도 한 곳으로) */
  function advStops(D) {
    var st = dispState(), by = {}, list = [];
    D.orders.forEach(function (o) {
      if (o.truck !== '' && o.truck != null) return;
      var k = (o.d.from || '') + '|' + advAddrKey(o.d.addr || o.d.fc), s = by[k];
      if (!s) { s = by[k] = { key: k, from: o.d.from || '', fcs: [], addr: o.d.addr || '', hrs: [], os: [] }; list.push(s); }
      s.os.push(o); if (s.fcs.indexOf(o.d.fc || '-') === -1) s.fcs.push(o.d.fc || '-'); if (o.d.hours && s.hrs.indexOf(o.d.hours) === -1) s.hrs.push(o.d.hours);
    });
    list.forEach(function (s) { s.g = st.geo[geoKey(s.addr)] || null; var p = findPlace(s.from); s.o = p && p.addr ? st.geo[geoKey(p.addr)] || null : null; s.reg = advRegion(s.addr); });
    // 주소 글자가 달라도 정확한 좌표가 거의 같으면(150m) 같은 곳
    for (var i = 0; i < list.length; i++) for (var j = list.length - 1; j > i; j--) {
      var a = list[i], b = list[j];
      if (a.from === b.from && a.g && b.g && !a.g.approx && !b.g.approx && hav(a.g, b.g) < 0.15) { b.os.forEach(function (o) { a.os.push(o); }); b.fcs.forEach(function (f) { if (a.fcs.indexOf(f) === -1) a.fcs.push(f); }); b.hrs.forEach(function (h) { if (a.hrs.indexOf(h) === -1) a.hrs.push(h); }); list.splice(j, 1); }
    }
    list.forEach(function (s) { s.fc = s.fcs.join(' · '); s.hours = s.hrs.join(' / '); s.b = dispBundles(s.os); s.kg = s.os.reduce(function (a, o) { return a + dispNum(o.d.kg); }, 0); });
    return list;
  }
  /** 이 착지들을 한 대에 실을 때: 경로(상차지에서 가까운 순 → 가장 짧게), 직선 km, 합쳐도 되는지 */
  function advRoute(ss) {
    var o = ss[0].o, ok = ss.every(function (s) { return s.g; }) && o;
    if (!ok) {
      var sameReg = ss.every(function (s) { return s.reg === ss[0].reg; }), mp = 0, allG = ss.every(function (s) { return s.g; });
      if (allG) for (var a = 0; a < ss.length; a++) for (var c = a + 1; c < ss.length; c++) mp = Math.max(mp, hav(ss[a].g, ss[c].g));
      var near = allG && (mp <= ADV_KM || (sameReg && mp <= ADV_KM_REG));
      return { order: ss, km: null, fit: ss.length < 2 || near || (!allG && sameReg), why: near ? (sameReg ? '같은 지역 ' + ss[0].reg + ' · ' : '') + '착지끼리 ' + Math.round(mp) + 'km' : sameReg ? '같은 지역 ' + ss[0].reg + ' (거리 확인 못 함)' : '' };
    }
    var best = null, perm = function (arr, k) { if (k === arr.length) { var d = 0, cur = o; arr.forEach(function (s) { d += hav(cur, s.g); cur = s.g; }); if (!best || d < best.km) best = { order: arr.slice(), km: d }; return; } for (var i = k; i < arr.length; i++) { var t = arr[k]; arr[k] = arr[i]; arr[i] = t; perm(arr, k + 1); arr[i] = arr[k]; arr[k] = t; } };
    perm(ss.slice(), 0);
    if (ss.length < 2) return { order: best.order, km: best.km, fit: true, why: '' };
    var far = Math.max.apply(null, ss.map(function (s) { return hav(o, s.g); })), maxPair = 0;
    for (var i = 0; i < ss.length; i++) for (var j = i + 1; j < ss.length; j++) maxPair = Math.max(maxPair, hav(ss[i].g, ss[j].g));
    var sameReg = ss.every(function (s) { return s.reg === ss[0].reg; }), aligned = best.km - far <= Math.max(3, far * 0.05);
    var why = maxPair <= ADV_KM ? '착지끼리 ' + Math.round(maxPair) + 'km' : sameReg && maxPair <= ADV_KM_REG ? '같은 지역 ' + ss[0].reg + ' · 착지끼리 ' + Math.round(maxPair) + 'km' : aligned ? '가는 길 위에 있음 (돌아가는 거리 ' + Math.round(best.km - far) + 'km)' : '';
    return { order: best.order, km: best.km, fit: !!why, why: why };
  }
  function advCost(D, os) {
    if (!dispState().rates) return null;
    var fake = { tab: D.tab, date: D.date, trucks: [], orders: os.map(function (o) { return Object.assign({}, o, { truck: -1 }); }) }, c = truckCost(fake, -1);
    return c && c.total != null && !c.miss.length ? c : null;
  }
  /** 다음 추천 후보들 (좋은 순) */
  function advSuggest(D, hist) {
    var all = advStops(D); if (!all.length) return [];
    // 먼저 할 것: 18번들 넘는 착지 → 17~18번들 착지 → 상차지에서 가장 먼 착지(좌표 없으면 번들 많은 순)
    var far = function (s) { return s.g && s.o ? hav(s.o, s.g) : -1; };
    // 같이 묶을 수 있는 착지가 하나라도 있는지 (없으면 누가 봐도 혼자)
    var pairOk = function (a, b) { return a.from === b.from && a.b + b.b <= ADV_MIX && a.kg + b.kg <= ADV_KG && advRoute([a, b]).fit; };
    all.forEach(function (s) { s.solo = s.b > ADV_MIX || !all.some(function (x) { return x !== s && pairOk(s, x); }); });
    var seed = all.slice().sort(function (a, b) { return (b.b > ADV_ONE) - (a.b > ADV_ONE) || (b.b > ADV_MIX) - (a.b > ADV_MIX) || b.solo - a.solo || far(b) - far(a) || b.b - a.b; })[0];
    var why0 = seed.b > ADV_ONE ? seed.fc + ' ' + won(seed.b) + '번들 → 한 대(최대 ' + ADV_ONE + ')에 안 들어가서 오더 단위로 나눠요' : seed.b > ADV_MIX ? seed.fc + ' ' + won(seed.b) + '번들 → 이 착지만 한 대' : seed.solo ? seed.fc + ' → 같이 묶을 착지가 없어요 (5km, 같은 지역 10km 안에 16번들까지 실을 곳 없음)' : far(seed) >= 0 ? '상차지에서 가장 먼 착지(' + seed.fc + ', 직선 ' + Math.round(far(seed)) + 'km)부터' : '번들이 가장 많은 착지(' + seed.fc + ')부터';
    if (seed.b > ADV_ONE) {
      // 오더는 나누지 않고, 오더 단위로 여러 대에 나눠 담기 (큰 오더부터)
      var bins = [], os = seed.os.slice().sort(function (a, b) { return dispOrderB(b) - dispOrderB(a); });
      [ADV_MIX, ADV_ONE].some(function (cap) { bins = []; os.forEach(function (o) { var ob = dispOrderB(o), bin = bins.filter(function (x) { return x.b + ob <= cap; })[0]; if (!bin) { bin = { b: 0, os: [] }; bins.push(bin); } bin.b += ob; bin.os.push(o); }); return bins.length <= Math.ceil(seed.b / ADV_ONE); });
      return [{ trucks: bins.map(function (x) { var s = Object.assign({}, seed, { os: x.os, b: dispBundles(x.os), kg: x.os.reduce(function (a, o) { return a + dispNum(o.d.kg); }, 0) }); return { stops: [s], route: advRoute([s]) }; }), why: [why0].concat(bins.some(function (x) { return x.b > ADV_ONE; }) ? ['⚠️ 한 오더가 ' + ADV_ONE + '번들을 넘어요. 오더 내용을 확인하세요.'] : []) }];
    }
    var alone = { trucks: [{ stops: [seed], route: advRoute([seed]) }], why: [why0], score: 0 }, cands = [alone];
    if (seed.b <= ADV_MIX && !seed.solo) {
      var others = all.filter(function (s) { return s !== seed && s.from === seed.from && s.b <= ADV_MIX; }), combos = [];
      others.forEach(function (a, i) { combos.push([seed, a]); others.slice(i + 1).forEach(function (b) { combos.push([seed, a, b]); }); });
      var costOf = function (ss) { return advCost(D, ss.reduce(function (a, s) { return a.concat(s.os); }, [])); };
      var aloneCost = {}; [seed].concat(others).forEach(function (s) { aloneCost[s.key] = costOf([s]); });
      combos.forEach(function (ss) {
        var b = ss.reduce(function (a, s) { return a + s.b; }, 0), kg = ss.reduce(function (a, s) { return a + s.kg; }, 0); if (b > ADV_MIX || kg > ADV_KG || !advCapOk(ss)) return;
        var r = advRoute(ss); if (!r.fit) return;
        var h = 0; for (var i = 0; i < ss.length; i++) for (var j = i + 1; j < ss.length; j++) ss[i].fcs.forEach(function (x) { ss[j].fcs.forEach(function (y) { h += hist[[x, y].sort().join('|')] || 0; }); });
        var gap = 0; for (var i2 = 0; i2 < ss.length; i2++) for (var j2 = i2 + 1; j2 < ss.length; j2++) if (ss[i2].g && ss[j2].g) gap = Math.max(gap, hav(ss[i2].g, ss[j2].g));
        var c = costOf(ss), sep = ss.reduce(function (a, s) { return a == null || !aloneCost[s.key] ? null : a + aloneCost[s.key].total; }, 0), save = c && sep != null ? sep - c.total : null;
        if (save != null && save <= 0) return; // 합쳐서 더 비싸면 추천 안 함
        var extra = r.km != null ? r.km - Math.max.apply(null, ss.map(function (s) { return hav(s.o, s.g); })) : 10;
        var why = [why0, '합치면 ' + (ss.length - 1) + '대 줄어요 · ' + r.why];
        if (h) why.push('지난 2달 같이 보낸 적 ' + h + '번');
        if (save != null) why.push('예상 운임 ' + won(c.total) + '원 (따로 보내면 ' + won(sep) + '원 → ' + won(save) + '원 아낌)');
        cands.push({ trucks: [{ stops: r.order, route: r }], why: why, score: (ss.length - 1) * 100000 + (save || 0) + b * 3000 + h * 5000 - extra * 1000 - gap * 8000 }); // 가까울수록 우선
      });
    }
    var outL = cands.sort(function (a, b) { return b.score - a.score; }).slice(0, 6); outL.seed = seed; outL.why0 = why0; return outL;
  }
  function openAdvisor(D, apply) {
    var st = dispState(), stops0 = advStops(D);
    if (!stops0.length) { toast('호차가 안 정해진 오더가 없어요.'); return; }
    var addrs = []; stops0.forEach(function (s) { addrs.push(s.addr); var p = findPlace(s.from); if (p && p.addr) addrs.push(p.addr); });
    Promise.all([advEnsureGeo(addrs), advHistory(D).catch(function () { return {}; }), loadDispRates()]).then(function (z) {
      var hist = z[1] || {}, list = advSuggest(D, hist), at = 0; if (!list.length) return;
      // 전체를 한 번에 짰을 때 이 착지가 들어가는 묶음을 1순위로 (하나씩 고르다 좋은 묶음이 깨지지 않게)
      if (list.seed && list.seed.b <= ADV_MIX) {
        var pc = advPlanAll(D, hist).filter(function (c) { return c.sites.some(function (x) { return x.key === list.seed.key; }); })[0];
        if (pc && pc.sites.length > 1) {
          var w0 = list.why0, keyOf = function (ss) { return ss.map(function (x) { return x.key; }).sort().join('&'); }, pr = advRoute(pc.sites);
          list = list.filter(function (cd) { return keyOf(cd.trucks[0].stops) !== keyOf(pc.sites); });
          list.unshift({ trucks: [{ stops: pc.sites, route: pr }], why: [w0 || '', '전체를 한 번에 짰을 때 이 착지가 들어가는 묶음이에요 · 합치면 ' + (pc.sites.length - 1) + '대 줄어요' + (pr.why ? ' · ' + pr.why : '')].concat(pc.cost ? ['예상 운임 ' + won(pc.cost.total) + '원'] : []).filter(Boolean) });
        }
      }
      var left = advStops(D).length;
      modal({ wide: true, cls: 'modal-xl', eyebrow: D.tab + ' · ' + D.date + ' · 남은 착지 ' + left + '곳', title: 'AI 도움 · 배차 추천',
        body: '<div id="advBody"></div>',
        foot: '<button class="btn" data-close>닫기</button><button class="btn" id="advNext">다른 추천</button><button class="btn" id="advOk">수락</button><button class="btn btn-primary" id="advOkNext">수락하고 다음 추천</button>',
        onMount: function (m, close) {
          var hue = '#6D28D9', mapT = 0;
          var draw = function () {
            var c = list[at], st2 = dispState();
            c.trucks.forEach(function (t) { t.route = Object.assign({}, t.route, { km: t.stops[0].o && t.stops.every(function (s) { return s.g; }) ? routeLen(t.stops[0].o, t.stops.map(function (s) { return s.g; })) : t.route.km }); });
            $('#advBody', m).innerHTML = '<p class="muted small" style="margin:0 0 8px">추천 ' + (at + 1) + ' / ' + list.length + '</p><div class="adv-grid"><div>' + c.trucks.map(function (t, i) {
              var b = t.stops.reduce(function (a, s) { return a + s.b; }, 0), kg = t.stops.reduce(function (a, s) { return a + s.kg; }, 0);
              return '<div class="adv-truck' + (i === mapT ? ' on' : '') + '" data-advt="' + i + '"><div class="adv-h"><b>' + (c.trucks.length > 1 ? '새 호차 ' + (i + 1) : '새 호차') + '</b> · ' + won(b) + '번들 · ' + won(kg) + 'kg · ' + esc(autoTon(kg, b)) + (t.route.km != null ? ' · 직선 ' + Math.round(t.route.km) + 'km' : '') + '</div>' +
                '<table class="data adv-tb"><tbody>' + t.stops.map(function (s, k) { return '<tr><td><span class="dp-sn">' + (k + 1) + '</span></td><td class="left"><b>' + esc(s.fc) + '</b><div class="small muted">' + esc(s.addr) + '</div>' + (s.hours ? '<div class="small" style="color:#8A5A00">' + esc(s.hours) + '</div>' : '') + '</td><td class="num">' + won(s.b) + '번들</td><td class="num">' + won(s.kg) + 'kg</td><td class="adv-mv">' + (t.stops.length > 1 ? '<button type="button" data-up="' + i + '|' + k + '"' + (k ? '' : ' disabled') + ' title="앞으로">▲</button><button type="button" data-dn="' + i + '|' + k + '"' + (k < t.stops.length - 1 ? '' : ' disabled') + ' title="뒤로">▼</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
            }).join('') + '<ul class="adv-why">' + c.why.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') +
              (function () { var nog = []; c.trucks.forEach(function (t) { t.stops.forEach(function (s) { if (!s.g) nog.push(s.fc); }); }); return nog.length ? '<li class="err-text">⚠ 지도 위치를 못 찾은 곳: ' + esc(nog.join(', ')) + ' — 거리 대신 같은 구·시로만 판단했어요. 오더 표의 "위치 못 찾음"을 눌러 주소를 고치면 더 정확해져요.</li>' : ''; })() + (c.trucks[0].stops.length > 1 ? '<li class="muted">하차 순서는 ▲▼로 바꿀 수 있어요. 하차 가능시간은 직접 확인해 주세요.</li>' : '') + '</ul></div>' +
              '<div><div class="dp-map adv-map" id="advMap"><div class="muted small" style="padding:20px"><span class="spinner dark"></span> 지도 불러오는 중…</div></div></div></div>';
            var t = c.trucks[mapT] || c.trucks[0], p = findPlace(t.stops[0].from);
            var pts = [p && p.addr ? Object.assign({ label: '🏭', from: 1, title: p.name }, st2.geo[geoKey(p.addr)] || {}) : null].concat(t.stops.map(function (s, k) { return Object.assign({ label: String(k + 1), title: s.fc }, s.g || {}); }));
            var el = $('#advMap', m); drawRouteMap(el, pts, hue).catch(function (e) { el.innerHTML = '<div class="err-text small" style="padding:20px">' + esc(e.message) + '</div>'; });
            var mv = function (attr, d) { $$('[' + attr + ']', m).forEach(function (bt) { bt.onclick = function () { var q = bt.getAttribute(attr).split('|'), tr = c.trucks[+q[0]], k = +q[1], x = tr.stops[k]; tr.stops[k] = tr.stops[k + d]; tr.stops[k + d] = x; mapT = +q[0]; draw(); }; }); };
            mv('data-up', -1); mv('data-dn', 1);
            $$('[data-advt]', m).forEach(function (el2) { el2.onclick = function (e) { if (e.target.closest('button')) return; var i = +el2.dataset.advt; if (i !== mapT) { mapT = i; draw(); } }; });
            $('#advNext', m).disabled = list.length < 2;
          };
          var accept = function (more) { apply(list[at].trucks.map(function (t) { return t.stops.reduce(function (a, s) { return a.concat(s.os); }, []); })); close(); if (more) setTimeout(function () { openAdvisor(D, apply); }, 300); };
          $('#advNext', m).onclick = function () { at = (at + 1) % list.length; mapT = 0; draw(); };
          $('#advOk', m).onclick = function () { accept(false); };
          $('#advOkNext', m).onclick = function () { accept(true); };
          draw();
        } });
    }).catch(function (err) { toast(err.message, 'err'); });
  }
  /** 한 대에 착지 몇 곳까지: 기본 3곳, 모두 서로 가까우면(5km · 같은 구·시 10km) 4곳 */
  function advCapOk(ss) {
    if (ss.length <= ADV_STOPS) return true; if (ss.length > ADV_STOPS + 1 || !ss.every(function (s) { return s.g; })) return false;
    var reg = ss.every(function (s) { return s.reg === ss[0].reg; }), mp = 0;
    for (var i = 0; i < ss.length; i++) for (var j = i + 1; j < ss.length; j++) mp = Math.max(mp, hav(ss[i].g, ss[j].g));
    return mp <= ADV_KM || (reg && mp <= ADV_KM_REG);
  }
  /** 18번들 넘는 착지 → 오더 단위로 여러 대 (큰 오더부터, 16 → 안 되면 18까지) */
  function advSplitBig(site) {
    var bins = [], os = site.os.slice().sort(function (a, b) { return dispOrderB(b) - dispOrderB(a); });
    [ADV_MIX, ADV_ONE].some(function (cap) { bins = []; os.forEach(function (o) { var ob = dispOrderB(o), bin = bins.filter(function (x) { return x.b + ob <= cap; })[0]; if (!bin) { bin = { b: 0, os: [] }; bins.push(bin); } bin.b += ob; bin.os.push(o); }); return bins.length <= Math.ceil(site.b / ADV_ONE); });
    return bins.map(function (x, i) { return Object.assign({}, site, { key: site.key + '#' + i, os: x.os, b: dispBundles(x.os), kg: x.os.reduce(function (a, o) { return a + dispNum(o.d.kg); }, 0) }); });
  }
  var advCid = 0;
  function advCluster(sites, extra) { return Object.assign({ id: 'c' + (++advCid), sites: sites, ban: {} }, extra || {}); }
  /** 한 번에 짜기: 착지마다 한 대로 시작 → 합칠 수 있는 두 대 중 가장 좋은 쌍을 계속 합쳐요(가까울수록·운임 아낄수록·지난 기록 있을수록)
      clusters: 시작 묶음 (locked끼리는 서로 안 합침 · fixed는 안 합침) */
  function advPlan(D, clusters, hist) {
    var costMemo = {}, costOf = function (c) { var k = c.sites.map(function (s) { return s.key; }).sort().join('&'); if (!(k in costMemo)) costMemo[k] = advCost(D, c.sites.reduce(function (a, s) { return a.concat(s.os); }, [])); return costMemo[k]; };
    var sum = function (ss, f) { return ss.reduce(function (a, s) { return a + s[f]; }, 0); };
    var routeKm = function (ss) { var r = advRoute(ss); return r.km; };
    var evalMerge = function (A, B) {
      if (A.fixed || B.fixed || (A.locked && B.locked)) return null;
      if (A.sites[0].from !== B.sites[0].from) return null;
      if (A.sites.some(function (s) { return s.ban && s.ban[B.id]; }) || B.sites.some(function (s) { return s.ban && s.ban[A.id]; })) return null;
      var ss = A.sites.concat(B.sites); if (sum(ss, 'b') > ADV_MIX || sum(ss, 'kg') > ADV_KG || !advCapOk(ss)) return null;
      var r = advRoute(ss); if (!r.fit) return null;
      var gap = 0, allG = ss.every(function (s) { return s.g; });
      if (allG) { for (var i = 0; i < ss.length; i++) for (var j = i + 1; j < ss.length; j++) gap = Math.max(gap, hav(ss[i].g, ss[j].g)); } else gap = 6;
      var ka = routeKm(A.sites), kb = routeKm(B.sites), dsave = r.km != null && ka != null && kb != null ? ka + kb - r.km : 0;
      var ca = costOf(A), cb = costOf(B), cab = costOf({ sites: ss }), csave = ca && cb && cab ? ca.total + cb.total - cab.total : null;
      if (csave != null && csave <= 0) return null; // 합쳐서 비싸지면 안 합침
      var h = 0; A.sites.forEach(function (x) { B.sites.forEach(function (y) { x.fcs.forEach(function (f) { y.fcs.forEach(function (g) { h += hist[[f, g].sort().join('|')] || 0; }); }); }); });
      return { score: (csave || 0) + dsave * 1000 + h * 5000 - gap * 8000, sites: r.order };
    };
    var cs = clusters.slice();
    for (var guard = 0; guard < 400; guard++) {
      var best = null;
      for (var i = 0; i < cs.length; i++) for (var j = i + 1; j < cs.length; j++) { var m = evalMerge(cs[i], cs[j]); if (m && (!best || m.score > best.m.score)) best = { i: i, j: j, m: m }; }
      if (!best) break;
      var A = cs[best.i], B = cs[best.j];
      var M = advCluster(best.m.sites, { locked: A.locked || B.locked, keep: A.keep || B.keep });
      if (A.locked) M.id = A.id; else if (B.locked) M.id = B.id; // 이미 있던 호차 이름 유지
      cs.splice(best.j, 1); cs.splice(best.i, 1, M);
    }
    cs.forEach(function (c) { var r = advRoute(c.sites); if (!c.manual) c.sites = r.order; c.km = c.sites[0].o && c.sites.every(function (s) { return s.g; }) ? routeLen(c.sites[0].o, c.sites.map(function (s) { return s.g; })) : null; c.cost = costOf(c); c.b = sum(c.sites, 'b'); c.kg = sum(c.sites, 'kg'); });
    // 보기 좋게: 상차지에서 먼 호차부터
    var far = function (c) { return Math.max.apply(null, c.sites.map(function (s) { return s.g && s.o ? hav(s.o, s.g) : -1; })); };
    return cs.sort(function (a, b) { return (a.order != null && b.order != null) ? a.order - b.order : far(b) - far(a); });
  }
  /** 처음 계획: 큰 착지는 나눠서 고정, 17~18번들은 혼자 고정, 나머지는 합치기 */
  function advPlanAll(D, hist) {
    var init = [];
    advStops(D).forEach(function (s) {
      if (s.b > ADV_ONE) advSplitBig(s).forEach(function (x) { init.push(advCluster([x], { fixed: true })); });
      else init.push(advCluster([s], { fixed: s.b > ADV_MIX }));
    });
    return advPlan(D, init, hist);
  }
  function openPlanAll(D, apply) {
    if (!advStops(D).length) { toast('호차가 안 정해진 오더가 없어요.'); return; }
    var all = advStops(D), addrs = []; all.forEach(function (s) { addrs.push(s.addr); var p = findPlace(s.from); if (p && p.addr) addrs.push(p.addr); });
    Promise.all([advEnsureGeo(addrs), advHistory(D).catch(function () { return {}; }), loadDispRates()]).then(function (z) {
      var hist = z[1] || {}, plan = advPlanAll(D, hist), out = [], sel = 0, nSites = advStops(D).length;
      plan.forEach(function (c, i) { c.order = i; });
      modal({ wide: true, cls: 'modal-xl', eyebrow: D.tab + ' · ' + D.date, title: 'AI 한번에 짜기',
        body: '<div id="paBody"></div>',
        foot: '<button class="btn" data-close>닫기</button><button class="btn btn-primary" id="paApply">모두 적용</button>',
        onMount: function (m, close) {
          var label = function (i) { return '새 ' + (i + 1); };
          var draw = function () {
            var st2 = dispState(), money = !!st2.rates, tot = 0, totOk = true;
            plan.forEach(function (c, i) { c.order = i; c.b = c.sites.reduce(function (a, s) { return a + s.b; }, 0); c.kg = c.sites.reduce(function (a, s) { return a + s.kg; }, 0); c.km = c.sites[0].o && c.sites.every(function (s) { return s.g; }) ? routeLen(c.sites[0].o, c.sites.map(function (s) { return s.g; })) : null; c.cost = advCost(D, c.sites.reduce(function (a, s) { return a.concat(s.os); }, [])); if (c.cost) tot += c.cost.total; else totOk = false; });
            var nog = []; plan.forEach(function (c) { c.sites.forEach(function (s) { if (!s.g) nog.push(s.fc); }); });
            var head = '<p class="pa-sum">미배정 착지 <b>' + nSites + '곳</b> → <b>' + plan.length + '대</b>' + (money && tot ? ' · 예상 운임 ' + won(tot) + '원' + (totOk ? '' : ' (단가 없는 호차 제외)') : '') + '</p>' +
              (nog.length ? '<p class="err-text small" style="margin:0 0 8px">⚠ 지도 위치를 못 찾은 곳: ' + esc(nog.join(', ')) + ' — 거리 대신 같은 구·시로만 판단했어요.</p>' : '');
            var cards = plan.map(function (c, i) {
              var warn = (c.b > ADV_ONE ? ' <span class="err-text">' + ADV_ONE + '번들 넘음</span>' : c.b > ADV_MIX && c.sites.length > 1 ? ' <span class="err-text">16번들 넘음</span>' : '') + (c.kg > ADV_KG && c.sites.length > 1 ? ' <span class="err-text">10톤 넘음</span>' : '') + (!advCapOk(c.sites) ? ' <span class="err-text">착지 ' + c.sites.length + '곳</span>' : '');
              return '<div class="adv-truck' + (i === sel ? ' on' : '') + '" data-pat="' + i + '"><div class="adv-h"><b>' + label(i) + '</b> · ' + won(c.b) + '번들 · ' + won(c.kg) + 'kg · ' + esc(autoTon(c.kg, c.b)) + (c.km != null ? ' · 직선 ' + Math.round(c.km) + 'km' : '') + (money ? ' · ' + (c.cost ? won(c.cost.total) + '원' : '단가 없음') : '') + warn + '</div>' +
                '<table class="data adv-tb"><tbody>' + c.sites.map(function (s, k) { return '<tr><td><span class="dp-sn">' + (k + 1) + '</span></td><td class="left"><b>' + esc(s.fc) + '</b>' + (s.g ? '' : ' <span class="err-text small">⚠위치</span>') + '<div class="small muted">' + esc(s.addr) + '</div></td><td class="num">' + won(s.b) + '번들</td><td class="num">' + won(s.kg) + 'kg</td><td class="adv-mv">' + (c.sites.length > 1 ? '<button type="button" data-pup="' + i + '|' + k + '"' + (k ? '' : ' disabled') + '>▲</button><button type="button" data-pdn="' + i + '|' + k + '"' + (k < c.sites.length - 1 ? '' : ' disabled') + '>▼</button>' : '') + (c.fixed ? '' : '<button type="button" class="pa-x" data-px="' + i + '|' + k + '" title="이 호차에서 빼기">✕</button>') + '</td></tr>'; }).join('') + '</tbody></table></div>';
            }).join('');
            var opts = function (cur) { return '<option value="auto"' + (cur === 'auto' ? ' selected' : '') + '>자동 (가까운 호차 빈자리 또는 새 호차)</option><option value="new"' + (cur === 'new' ? ' selected' : '') + '>새 호차 혼자</option>' + plan.map(function (c, i) { return c.fixed ? '' : '<option value="' + c.id + '"' + (cur === c.id ? ' selected' : '') + '>' + label(i) + '에 넣기 (' + won(c.b) + '번들)</option>'; }).join(''); };
            var outHtml = out.length ? '<div class="pa-out"><div class="adv-h"><b>빠진 착지 ' + out.length + '곳</b> <span class="muted small">어디로 보낼지 고르고 [빠진 착지 다시 짜기]</span></div>' + out.map(function (x, k) { return '<div class="pa-orow"><b>' + esc(x.s.fc) + '</b> <span class="muted small">' + won(x.s.b) + '번들</span><select class="input input-sm" data-po="' + k + '">' + opts(x.to) + '</select></div>'; }).join('') + '<button class="btn btn-sm btn-primary" id="paRe" style="margin-top:8px">빠진 착지 다시 짜기</button></div>' : '';
            $('#paBody', m).innerHTML = head + '<div class="adv-grid"><div class="pa-list">' + outHtml + cards + '</div><div><div class="dp-map adv-map" id="paMap"><div class="muted small" style="padding:20px"><span class="spinner dark"></span> 지도 불러오는 중…</div></div></div></div>';
            var c = plan[sel] || plan[0];
            if (c) { var p = findPlace(c.sites[0].from); var pts = [p && p.addr ? Object.assign({ label: '🏭', from: 1, title: p.name }, st2.geo[geoKey(p.addr)] || {}) : null].concat(c.sites.map(function (s, k) { return Object.assign({ label: String(k + 1), title: s.fc }, s.g || {}); })); var el = $('#paMap', m); drawRouteMap(el, pts, '#6D28D9').catch(function (e) { el.innerHTML = '<div class="err-text small" style="padding:20px">' + esc(e.message) + '</div>'; }); }
            var mv = function (attr, d) { $$('[' + attr + ']', m).forEach(function (bt) { bt.onclick = function () { var q = bt.getAttribute(attr).split('|'), cl = plan[+q[0]], k = +q[1], x = cl.sites[k]; cl.sites[k] = cl.sites[k + d]; cl.sites[k + d] = x; cl.manual = true; sel = +q[0]; draw(); }; }); };
            mv('data-pup', -1); mv('data-pdn', 1);
            $$('[data-px]', m).forEach(function (bt) { bt.onclick = function () { var q = bt.dataset.px.split('|'), cl = plan[+q[0]], s = cl.sites.splice(+q[1], 1)[0]; s.ban = s.ban || {}; s.ban[cl.id] = 1; out.push({ s: s, to: 'auto' }); if (!cl.sites.length) plan.splice(+q[0], 1); sel = Math.min(sel, plan.length - 1); draw(); }; });
            $$('[data-po]', m).forEach(function (sl) { sl.onchange = function () { out[+sl.dataset.po].to = sl.value; }; });
            $$('[data-pat]', m).forEach(function (el2) { el2.onclick = function (e) { if (e.target.closest('button')) return; var i = +el2.dataset.pat; if (i !== sel) { sel = i; draw(); } }; });
            var re = $('#paRe', m); if (re) re.onclick = function () {
              var fresh = [];
              out.forEach(function (x) {
                if (x.to === 'new') { plan.push(advCluster([x.s], { locked: true, fixed: false, order: plan.length })); return; }
                var tgt = plan.filter(function (c) { return c.id === x.to; })[0];
                if (tgt) { tgt.sites.push(x.s); tgt.manual = true; return; }
                fresh.push(advCluster([x.s]));
              });
              if (fresh.length) {
                plan.forEach(function (c) { c.locked = true; });
                var res = advPlan(D, plan.concat(fresh), hist), keepOrder = plan.map(function (c) { return c.id; });
                // 원래 호차 순서 유지, 새로 생긴 호차는 뒤에
                plan = res.sort(function (a, b) { var ia = keepOrder.indexOf(a.id), ib = keepOrder.indexOf(b.id); return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib); });
              }
              out = []; draw();
            };
          };
          $('#paApply', m).onclick = function () {
            if (out.length && !confirm('빠진 착지 ' + out.length + '곳은 호차 없이 남겨요. 적용할까요?')) return;
            apply(plan.map(function (c) { return c.sites.reduce(function (a, s) { return a.concat(s.os); }, []); })); close();
          };
          draw();
        } });
    }).catch(function (err) { toast(err.message, 'err'); });
  }
  return {
    parse: function (text, tab) { return dispParse(text, dispIsKurly(tab)); },
    pasteHint: function () { return '동방 엑셀에서 C열(출발센터)부터 AF열까지 데이터만 복사해서 붙여넣으세요 (날짜별로 나눠 저장, 이미 있는 줄은 건너뜀)'; },
    addrFlag: destFlag,
    orderWarn: function (orders) { var dn = destDiffCount(orders); return dn ? ' <span class="small" style="color:#C0392B">주소록과 다른 주소 ' + dn + '줄</span>' : ''; },
    orderButtons: function () { return '<button class="btn btn-sm btn-ai" id="dpPlanAll" title="호차 안 정해진 오더 전체를 한 번에 짜요 (확인 후 적용)">✨ AI 한번에 짜기</button><button class="btn btn-sm btn-ai" id="dpAdvisor" title="호차 안 정해진 오더를 한 대씩 추천해요">✨ AI 도움</button>'; },
    bind: function (box, x) {
      if ($('#dpPlanAll')) $('#dpPlanAll').onclick = function () { openPlanAll(x.D, x.applyGroups); };
      if ($('#dpAdvisor')) $('#dpAdvisor').onclick = function () { openAdvisor(x.D, x.applyGroups); }; // 추천한 묶음마다 새 호차 (하차 순서대로 순번)
    }
  };
} });
