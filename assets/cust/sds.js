/* 삼다수 배차 (업체별 파일 · 새 업체 추가 방법은 assets/cust/README.md)
   메일 오더 표 → 하차지마다 18파렛트 = 1대 · 하차지 이름 연결 · 문자 양식 · 쿠팡(WF) 예약 · 인천항 생년월일 */
(window.JOIL_CUST = window.JOIL_CUST || []).push({ name: '삼다수', make: function (H) {
  'use strict';
  // app.js의 공용 도우미 (저장·화면·권한)
  var $ = H.$, $$ = H.$$, api = H.api, busy = H.busy, can = H.can, destEntry = H.destEntry, dispKind = H.dispKind, dispNum = H.dispNum;
  var dispPrep = H.dispPrep, dispRegion = H.dispRegion, dispSaveNow = H.dispSaveNow, dispSnap = H.dispSnap, dispState = H.dispState, drawDispDay = H.drawDispDay, drvBlack = H.drvBlack, esc = H.esc;
  var findPlace = H.findPlace, isPartner = H.isPartner, modal = H.modal, openOrderEdit = H.openOrderEdit, openOrderNote = H.openOrderNote, openTruckOrderEdit = H.openTruckOrderEdit, parseTsv = H.parseTsv, rateRows = H.rateRows;
  var toast = H.toast, truckCost = H.truckCost, truckCostCell = H.truckCostCell, truckInfo = H.truckInfo, truckNotes = H.truckNotes, truckOrders = H.truckOrders, truckStops = H.truckStops, won = H.won;
  /* ───────── 삼다수: 메일 오더 표 → 하차지마다 18파렛트 = 1대 (사용자의 구글시트 스크립트 '직송 오더 데이터 처리하기'와 같은 규칙) ───────── */
  var SDS_PLT = 18;
  var SDS_TABS = [{ name: '삼다수-대우', suf: '', prefix: '삼다수' }, { name: '삼다수-경인항', suf: '/경인항', prefix: '삼다수' }, { name: '삼다수-인천항', suf: '/인천항', prefix: '삼다수' }, { name: '삼다수-진해', suf: '/진해', prefix: '삼다수' }, { name: '삼다수-삼천포', suf: '/삼천포', prefix: '삼다수' }];
  var SDS_SIZES = [['s2', '2L', 2], ['s1', '1L', 1], ['s05', '0.5L', 0.5], ['s03', '0.33L', 0.3]];
  var SDS_CENTERS = [[/경인\s*1|대우/, '대우'], [/경인\s*2|경인항/, '경인항'], [/인천/, '인천항'], [/진해|창원/, '진해'], [/삼천포/, '삼천포']];
  /** 지방 탭(진해·삼천포): 하차지 이름 = 메일 비고 (시트 수식의 '창원이면 U열'과 같아요) */
  function sdsLocal(tab) { return /진해|창원|삼천포/.test(String(tab || '')); }
  function sdsIsWf(d) { return /쿠팡|WF\s*\d/i.test(String((d && d.fc) || '')); }
  function sdsCenter(v) { v = String(v || ''); for (var i = 0; i < SDS_CENTERS.length; i++) if (SDS_CENTERS[i][0].test(v)) return SDS_CENTERS[i][1]; return ''; }
  /** 용량 칸: '0.5L', '1.0L무', '0.33L무', '2L', '500ml' → 0.3 / 0.5 / 1 / 2 (단위가 있어야 용량으로 봐요) */
  function sdsSize(v) {
    var t = String(v || '').replace(/\s/g, ''), m = t.match(/^(\d+(?:\.\d+)?)(ml|mL|ML|L|l|ℓ|리터)/); if (!m) return 0;
    var n = Number(m[1]) / (/ml/i.test(m[2]) ? 1000 : 1);
    return n < 0.4 ? 0.3 : n < 0.75 ? 0.5 : n < 1.5 ? 1 : n <= 2.5 ? 2 : 0;
  }
  /** 비고에서 전화번호·담당자 이름을 떼고 주소만 (지도·길안내용) · 전화번호는 따로 */
  var SDS_TEL = /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/g;
  function sdsAddr(memo) {
    var s = String(memo || ''), i = s.search(SDS_TEL), a = (i === -1 ? s : s.slice(0, i)).replace(/\s+/g, ' ').trim().split(' ');
    if (i > 0 && /[가-힣]/.test(s.charAt(i - 1)) && a.length > 2 && /^[가-힣]+$/.test(a[a.length - 1])) a.pop(); // '홍길동010-…'처럼 번호에 붙은 이름은 무조건 빼요
    while (a.length > 2 && (/^(담당자?|연락처|번호|tel|TEL)[:：]?$/.test(a[a.length - 1]) || (/^[가-힣]{2,4}$/.test(a[a.length - 1]) && !/(층|동|호|로|길|리|읍|면|구|시|군|가|번지|도크|센터|빌딩|타워|문|앞)$/.test(a[a.length - 1])))) a.pop();
    return a.join(' ').replace(/[,\s]+$/, '');
  }
  function sdsTel(memo) { return (String(memo || '').match(SDS_TEL) || []).filter(function (v, i, l) { return l.indexOf(v) === i; }).join(' / '); }
  /** 메일에서 복사한 표(HTML): 합친 칸(colspan·rowspan)을 풀어서 칸 위치를 맞춰요 */
  function sdsHtmlGrid(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html'), best = null;
    Array.prototype.forEach.call(doc.querySelectorAll('table'), function (tb) { if (tb.querySelector('table')) return; if (!best || tb.rows.length > best.rows.length) best = tb; });
    if (!best) return null;
    var grid = [];
    Array.prototype.forEach.call(best.rows, function (tr, r) {
      grid[r] = grid[r] || []; var c = 0;
      Array.prototype.forEach.call(tr.cells, function (td) {
        while (grid[r][c] != null) c++;
        var v = td.textContent.replace(/\s+/g, ' ').trim(), cs = Math.min(50, td.colSpan || 1), rs = Math.min(50, td.rowSpan || 1);
        for (var i = 0; i < rs; i++) for (var j = 0; j < cs; j++) { grid[r + i] = grid[r + i] || []; grid[r + i][c + j] = v; }
        c += cs;
      });
    });
    return grid.map(function (row) { var o = []; for (var i = 0; i < row.length; i++) o.push(row[i] == null ? '' : String(row[i]).replace(/[\t\r\n]+/g, ' ')); return o.join('\t'); }).join('\n');
  }
  function sdsLabel(x) {
    if (x.gb) return x.normal && x.noLabel ? '섞여있음 광복' : x.noLabel ? '무라벨만 광복' : '광복';
    return x.normal && x.noLabel ? '섞여있음' : x.noLabel ? '무라벨만' : '';
  }
  /** 한 하차지의 제품 수량 → 차 한 대씩: 18 이상인 제품은 18씩 통째로, 나머지는 무라벨 2L부터 순서대로 18까지 섞어 채우기 */
  function sdsSplit(qty) {
    var order = []; ['noLabel', 'normal'].forEach(function (ty) { [2, 1, 0.5, 0.3].forEach(function (z) { [false, true].forEach(function (g) { var k = ty + '|' + z + '|' + (g ? 1 : 0); if (qty[k] > 0) order.push({ ty: ty, z: z, g: g, n: qty[k] }); }); }); });
    var full = [], rest = [], rows = [];
    order.forEach(function (p) { for (var i = 0; i < Math.floor(p.n / SDS_PLT); i++) full.push(Object.assign({}, p, { n: SDS_PLT })); if (p.n % SDS_PLT) rest.push(Object.assign({}, p, { n: p.n % SDS_PLT })); });
    var add = function (row, p, n) { row.plt += n; row.sz[p.z] = (row.sz[p.z] || 0) + n; row.info[p.ty] += n; if (p.g) row.info.gb += n; };
    var blank = function () { return { plt: 0, sz: {}, info: { normal: 0, noLabel: 0, gb: 0 } }; };
    full.forEach(function (p) { var r = blank(); add(r, p, p.n); rows.push(r); });
    var cur = blank();
    rest.forEach(function (p) { var left = p.n; while (left > 0) { var n = Math.min(left, SDS_PLT - cur.plt); add(cur, p, n); left -= n; if (cur.plt === SDS_PLT) { rows.push(cur); cur = blank(); } } });
    if (cur.plt) rows.push(cur);
    return rows;
  }
  /** 메일 표 → 오더 줄 (한 줄 = 차 한 대) · 날짜는 메일에 없어서 고른 날짜로 */
  function sdsParse(text, tab, date) {
    var rows = parseTsv(text); if (!rows.length) return { items: [], warn: '붙여넣은 내용이 없어요.' };
    var cell = function (r, c) { return c < 0 ? '' : String((rows[r] || [])[c] == null ? '' : rows[r][c]).trim(); };
    var si = -1; for (var r = 0; r < Math.min(rows.length, 15) && si === -1; r++) if (rows[r].some(function (v) { return sdsSize(v); })) si = r;
    if (si === -1) return { items: [], warn: '용량 제목 줄(0.5L·2.0L·1.0L무 같은 칸)을 찾지 못했어요. 메일 표를 제목 줄까지 통째로 복사해 주세요.' };
    // 제목 줄 위쪽의 '무라벨'·'광복' 구역: 합친 칸은 오른쪽으로 이어진 것으로 봐요
    var cols = [], memoCol = -1, center = '', width = Math.max.apply(null, rows.slice(0, si + 1).map(function (x) { return x.length; }));
    var sect = function (c) { var t = ''; for (var r = 0; r < si; r++) { var v = ''; for (var j = c; j >= 0 && !v; j--) v = cell(r, j); t += ' ' + v; } return t; };
    for (var c = 0; c < width; c++) { var z = sdsSize(cell(si, c)); if (!z) continue; var hd = cell(si, c) + ' ' + sect(c); cols.push({ c: c, z: z, ty: /무/.test(cell(si, c)) || /무\s*라\s*벨/.test(sect(c)) ? 'noLabel' : 'normal', g: /광복|80주년/.test(hd) }); }
    for (var r2 = 0; r2 <= si && memoCol === -1; r2++) for (var c2 = 0; c2 < width; c2++) if (/비고|주소/.test(cell(r2, c2))) { memoCol = c2; break; }
    for (var r3 = 0; r3 < si && !center; r3++) rows[r3].forEach(function (v) { if (!center && /센터/.test(v)) center = sdsCenter(v); });
    var nameCol = cols[0].c - 1, catCol = cols[0].c - 2, region = dispRegion(tab), local = sdsLocal(tab), items = [], seen = {}, skip = 0;
    for (var i = si + 1; i < rows.length; i++) {
      var cat = cell(i, catCol), name = cell(i, nameCol); if (!name || /총계|합계|소계/.test(cat + name) || /^PLT$/i.test(name)) continue;
      var qty = {}, tot = 0; cols.forEach(function (x) { var n = dispNum(String(cell(i, x.c)).replace(/^-$/, '')); if (n > 0) { var k = x.ty + '|' + x.z + '|' + (x.g ? 1 : 0); qty[k] = (qty[k] || 0) + n; tot += n; } });
      if (!tot) { skip++; continue; }
      var fc = cat === '온라인' || cat === '수도권' || !cat ? name : cat + '(' + name + ')', memo = memoCol === -1 ? '' : cell(i, memoCol);
      sdsSplit(qty).forEach(function (u) {
        var d = { from: region, cat: cat, fc: fc, item: sdsLabel(u.info), bundle: String(u.plt), memo: memo, addr: sdsAddr(memo), tel: sdsTel(memo), date: date, _n: items.length };
        SDS_SIZES.forEach(function (s) { if (u.sz[s[2]]) d[s[0]] = String(u.sz[s[2]]); });
        if (local) d.place = sdsAddr(memo) || memo;
        var k = seen[fc] = (seen[fc] || 0) + 1;
        items.push({ date: date, key: [date, 'SDS', region, fc, k, d.bundle, d.s03 || '', d.s05 || '', d.s1 || '', d.s2 || ''].join('|'), d: d });
      });
    }
    var warn = [];
    if (center && center !== region) warn.push('메일은 ' + center + ' 오더예요 — ' + tab + ' 탭이 맞나요?');
    if (skip) warn.push('수량이 없는 ' + skip + '줄은 건너뛰었어요.');
    if (!items.length) warn.push('읽을 하차지 줄이 없어요.');
    return { items: items, warn: warn.join(' ') };
  }
  /** 하차지 이름(인천백석동 등): 직접 연결해 둔 이름 > 하차지 주소록의 '단가표 도착명' > 지방 탭은 비고 */
  function sdsDest(d, tab) { var st = dispState(), map = st.dmap || (st.rates && st.rates.map) || {}, e = map[d.fc] ? null : destEntry(d.fc); return map[d.fc] || (e && e.rateTo) || (sdsLocal(tab) ? d.place || '' : ''); }
  function loadDispMap(force) { var st = dispState(); if (st.dmap && !force) return Promise.resolve(st.dmap); return api('dispatch.map').then(function (r) { st.dmap = r.map || {}; return st.dmap; }).catch(function () { return null; }); }
  function sdsSizeText(d) { return SDS_SIZES.filter(function (s) { return dispNum(d[s[0]]); }).map(function (s) { return s[1] + ' ' + won(dispNum(d[s[0]])); }).join(' · '); }
  /** 하차지 이름 연결 (분석 권한 · 매입 단가표의 '센터별 도착지'와 같은 곳에 저장) */
  function openSdsDest(fc, tab) {
    var st = dispState(), dests = {}; rateRows().forEach(function (r) { dests[r.to] = 1; });
    modal({ eyebrow: '삼다수 · 하차지 이름', title: fc,
      body: '<p class="muted small" style="margin:0 0 10px">이 대리점명이 오면 늘 이 하차지 이름(단가표의 도착)으로 보여요. 한 번만 연결하면 돼요.</p><div class="field"><label>하차지 이름 (예: 인천백석동)</label><input class="input" id="sdN" list="sdDl" value="' + esc(sdsDest({ fc: fc }, tab)) + '"><datalist id="sdDl">' + Object.keys(dests).sort().map(function (d) { return '<option value="' + esc(d) + '">'; }).join('') + '</datalist></div>',
      foot: '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="sdSave">저장</button>',
      onMount: function (m, close) {
        $('#sdN', m).focus();
        $('#sdSave', m).onclick = function () { var btn = this; busy(btn, true, '저장 중'); api('dispatch.mapSave', { fc: fc, dest: $('#sdN', m).value.trim() }).then(function (r) { st.rates = r; st.dmap = r.map; close(); drawDispDay(true); }).catch(function (err) { busy(btn, false); toast(err.message, 'err'); }); };
      } });
  }
  /** 생년월일(인천항 출입등록): 기사 풀에서 같은 기사 찾기 (서버 driverKey_와 같은 기준) */
  function sdsDrvKey(car, drv, ph) { var c = String(car || '').replace(/\s/g, ''); return c ? 'c:' + c : 'd:' + String(drv || '').replace(/\s/g, '') + '|' + String(ph || '').replace(/[^0-9]/g, ''); }
  function sdsDriverOf(t) { var k = sdsDrvKey(t.car, t.driver, t.phone); return (dispState().drivers || []).filter(function (v) { return sdsDrvKey(v.car, v.driver, v.phone) === k; })[0] || null; }
  function sdsBirthTab(tab) { return /인천항/.test(String(tab || '')); }
  function sdsWfTab(D) { return D.orders.some(function (o) { return sdsIsWf(o.d); }); }
  /** 삼다수 호차 문자 */
  function sdsMessage(D, no) {
    var stops = truckStops(D, no); if (!stops.length) return '';
    var out = [D.date + ' [' + dispRegion(D.tab) + '] ' + no + '호차'];
    truckNotes(D, no, 'drv').forEach(function (x) { out.push('⚠️ ' + (stops.length > 1 ? x.fc + ': ' : '') + x.text); });
    stops.forEach(function (s, i) {
      var dn = sdsDest(s.d, D.tab); out.push('');
      out.push((stops.length > 1 ? '하차지' + (i + 1) : '하차지') + ': ' + (dn ? dn + ' · ' : '') + s.fc);
      s.rows.forEach(function (o) { var sz = sdsSizeText(o.d); out.push(won(dispNum(o.d.bundle)) + 'PLT' + (o.d.item ? ' ' + o.d.item : '') + (sz ? ' (' + sz + ')' : '')); });
      if (s.d.addr) out.push('주소: ' + s.d.addr);
      if (s.d.tel) out.push('연락처: ' + s.d.tel);
      s.rows.filter(function (o) { return sdsIsWf(o.d); }).slice(0, 1).forEach(function (o) { out.push('쿠팡 예약: ' + (o.d.rsv || '(미입력)') + (o.d.rsvCode ? ' / 코드 ' + o.d.rsvCode : '')); });
    });
    return out.join('\n'); // 삼다수는 기사 링크·지도 없이 문자만
  }
  /** 오더 표 칸: 하차지 · 문자 · PLT · 수량 · 주소·연락처(쿠팡이면 예약) */
  function sdsOrdCells(o, tab) {
    var d = o.d, dn = sdsDest(d, tab), ca = can('analysis');
    return '<td class="left">' + (dn ? '<b>' + esc(dn) + '</b>' : '<span class="err-text small"' + (ca ? '' : ' title="분석 권한자가 연결해요"') + '>⚠ 연결 필요</span>') + (ca ? ' <button type="button" class="dp-edit" data-sdsdest="' + esc(d.fc) + '">' + (dn ? '바꾸기' : '연결') + '</button>' : '') + '</td>' +
      '<td class="left small">' + esc(d.item) + '</td><td class="num"><b>' + won(dispNum(d.bundle)) + '</b></td><td class="left small">' + esc(sdsSizeText(d)) + '</td>' +
      '<td class="left small"><div class="clip dp-addr" title="' + esc(d.memo || d.addr) + '">' + esc(d.addr) + '</div>' + (d.tel ? '<div class="muted">' + esc(d.tel) + '</div>' : '') +
      (sdsIsWf(d) ? '<div' + (d.rsv ? '' : ' style="color:var(--orange)"') + '>쿠팡 예약 ' + esc(d.rsv || '미입력') + (d.rsvCode ? ' / ' + esc(d.rsvCode) : '') + '</div>' : '') + '</td>';
  }
  var SDS_EDIT = [['bundle', '파렛트(PLT)'], ['item', '문자 (무라벨만·섞여있음 등)'], ['fc', '대리점명'], ['addr', '주소'], ['rsv', '쿠팡 예약시간'], ['rsvCode', '쿠팡 코드']];
  /* ── 삼다수 배차 표: 한 줄 = 차 한 대 (호차 번호·입차시간·톤수·상태 칸 없이 · 저장은 예전처럼 호차 단위) ──
     구분 | 상차지 | 하차지주소 | PLT | 금액 | 차량정보 | 운전원 | 연락처 | 대리점명 | 문자 | 블랙 | 쿠팡예약코드 | 쿠팡예약시간 | 생년월일 | 0.33L | 0.5L | 1L | 2.0L */
  var SDS_TRK = [['car', '차량정보'], ['driver', '운전원'], ['phone', '연락처']];
  var SDS_HEAD = ['구분', '상차지', '하차지주소', 'PLT', '금액', '차량정보', '운전원', '연락처', '대리점명', '문자', '블랙', '쿠팡예약코드', '쿠팡예약시간', '생년월일', '0.33L', '0.5L', '1L', '2.0L'];
  var SDS_COLS = ['s03', 's05', 's1', 's2'];
  function sdsCostOk() { return can('analysis') || isPartner(); } // 금액: 분석 권한자 · 협력사는 자기 탭만 (서버가 자기 탭만 보내요)
  /** 한 대(호차)의 줄 내용: 하차지가 둘 이상이면 줄바꿈으로 같이 */
  function sdsRow(D, no) {
    var t = truckInfo(D, no), os = truckOrders(D, no), d0 = (os[0] && os[0].d) || {}, wf = os.filter(function (o) { return sdsIsWf(o.d); })[0] || null, uniq = function (l) { return l.filter(function (v, i) { return v && l.indexOf(v) === i; }); };
    var sz = {}; SDS_COLS.forEach(function (k) { sz[k] = os.reduce(function (a, o) { return a + dispNum(o.d[k]); }, 0); });
    return { t: t, os: os, wf: wf, cat: uniq(os.map(function (o) { return o.d.cat; })).join(' · ') || dispKind(D), from: (findPlace(d0.from) || {}).name || d0.from || '', dest: uniq(os.map(function (o) { return sdsDest(o.d, D.tab); })), fcs: uniq(os.map(function (o) { return o.d.fc; })),
      addr: uniq(os.map(function (o) { return o.d.addr; })), tel: uniq(os.map(function (o) { return o.d.tel; })), item: uniq(os.map(function (o) { return o.d.item; })).join(' · '), plt: os.reduce(function (a, o) { return a + dispNum(o.d.bundle); }, 0), sz: sz, blk: drvBlack(t), dv: sdsDriverOf(t) };
  }
  function truckTable(D, ns) {
    var showCost = sdsCostOk(), xb = sdsBirthTab(D.tab) && !isPartner(), ca = can('analysis');
    return '<div class="table-wrap dp-tt-wrap"><table class="dp-tt sds-tt"><thead><tr>' + SDS_HEAD.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '<th></th></tr></thead>' +
      ns.map(function (no) {
        var r = sdsRow(D, no), t = r.t, key = D.tab + '|' + no, ok = String(t.car || t.driver || '').trim(), cost = showCost ? truckCost(D, no) : null;
        var rsv = function (f, ph) { return r.wf ? '<input class="input input-sm sds-rsv' + (r.wf.d[f] ? '' : ' sds-miss') + '" data-rsv="' + esc(D.tab + '|' + r.wf.id) + '" data-rk="' + f + '" value="' + esc(r.wf.d[f] || '') + '" placeholder="' + ph + '">' : ''; };
        return '<tbody class="tt-g sds-g"><tr' + (r.blk ? ' class="sds-black"' : '') + '>' +
          '<td class="sds-cat">' + esc(r.cat) + '</td><td>' + esc(r.from) + '</td>' +
          '<td class="left sds-addr">' + (r.dest.length ? '<div class="sds-dn">' + esc(r.dest.join(' / ')) + '</div>' : '<div class="sds-dn err-text"' + (ca ? '' : ' title="분석 권한자가 연결해요"') + '>⚠ 하차지 연결 필요</div>') +
            (ca && !isPartner() ? ' <button type="button" class="dp-edit" data-sdsdest="' + esc(r.fcs[0] || '') + '" data-sdst="' + esc(D.tab) + '">' + (r.dest.length ? '바꾸기' : '연결') + '</button>' : '') +
            '<div class="clip" title="' + esc(r.os.map(function (o) { return o.d.memo || o.d.addr; }).join('\n')) + '">' + esc(r.addr.join(' / ')) + '</div>' + (r.tel.length ? '<div class="clip muted small">' + esc(r.tel.join(' / ')) + '</div>' : '') + '</td>' +
          '<td class="num"><b>' + won(r.plt) + '</b></td>' +
          (showCost ? '<td class="tt-cost">' + truckCostCell(D, no, t, cost) + '</td>' : '<td class="muted">–</td>') +
          SDS_TRK.map(function (f) { return '<td class="tt-in' + (r.blk && f[0] === 'car' ? ' tt-blk' : '') + '"><input class="tt-input" data-tf="' + f[0] + '" data-tn="' + esc(key) + '" value="' + esc(t[f[0]] || '') + '" aria-label="' + f[1] + '"></td>'; }).join('') +
          '<td class="left"><b>' + esc(r.fcs.join(' / ')) + '</b>' + (r.item ? '<div class="small muted">' + esc(r.item) + '</div>' : '') + r.os.map(function (o) { return (o.noteIn && !isPartner() ? '<div class="tt-note in">[내부] ' + esc(o.noteIn) + '</div>' : '') + (o.noteDrv ? '<div class="tt-note drv">[기사] ' + esc(o.noteDrv) + '</div>' : ''); }).join('') + '</td>' +
          '<td><button class="btn btn-sm btn-primary" data-copy="' + esc(key) + '">문자</button></td>' +
          '<td class="sds-bk">' + (r.blk ? '<b class="sds-blk" title="' + esc('블랙(출입 금지)' + (r.blk.memo ? ' · ' + r.blk.memo : '')) + '">⛔</b>' : '') + '</td>' +
          '<td class="tt-in">' + rsv('rsvCode', '코드') + '</td><td class="tt-in">' + rsv('rsv', '예약시간') + '</td>' +
          '<td class="tt-in">' + (xb ? '<input class="input input-sm sds-birth' + (ok && !(r.dv && r.dv.birth) ? ' sds-miss' : '') + '" data-birth="' + esc(key) + '" value="' + esc((r.dv && r.dv.birth) || '') + '" placeholder="예: 800101" title="인천항 출입등록용 · 기사 풀에 저장돼요">' : '<span class="small">' + esc((!isPartner() && r.dv && r.dv.birth) || '') + '</span>') + '</td>' +
          SDS_COLS.map(function (k) { return '<td class="num">' + (r.sz[k] ? won(r.sz[k]) : '') + '</td>'; }).join('') +
          '<td class="tt-act sds-act"><button class="tt-more" data-more="' + esc(key) + '" title="더 보기 (줄에서 마우스 오른쪽 클릭해도 돼요)">⋯</button><span class="tt-hide">' +
            '<button data-preview="' + esc(key) + '">문자보기</button>' + (isPartner() ? '' : '<button data-sdsedit="' + esc(key) + '">오더수정</button><button data-tmove="' + esc(key) + '">오더변경</button><button data-sdsnote="' + esc(key) + '">공지 쓰기</button>') +
            '<button data-ask="' + esc(key) + '">문의하기</button><button data-xl="' + esc(key) + '">차량정보 복사</button>' + (ca ? '<button data-fare="' + esc(key) + '">운임 수정</button>' : '') + (isPartner() ? '' : '<button data-sdsdel="' + esc(key) + '">오더 지우기</button>') + '</span></td>' +
          '</tr></tbody>';
      }).join('') + '</table></div>';
  }
  /** 블랙 표시만 바로 고치기 (줄 색 · 차량정보 칸 · ⛔ 칸) */
  function blackMark(inp, v) {
    var tr = inp.closest('tr'), car = tr && tr.querySelector('[data-tf=car]'), bk = tr && tr.querySelector('.sds-bk'); if (!car) return;
    tr.classList.toggle('sds-black', !!v); car.parentNode.classList.toggle('tt-blk', !!v);
    if (bk) bk.innerHTML = v ? '<b class="sds-blk" title="' + esc('블랙(출입 금지)' + (v.memo ? ' · ' + v.memo : '')) + '">⛔</b>' : '';
  }
  /** 경고 알림에 쓸 이름: 하차지 이름(없으면 대리점명) · 호차 번호는 삼다수 표에 없어서 안 써요 */
  function blackLabel(D, no) { var r = sdsRow(D, no); return (r.dest.length ? r.dest : r.fcs).join(' / ') || '이 차'; }
  /** 엑셀로 복사 (삼다수 표와 같은 칸 순서 · 금액은 볼 수 있는 사람만 · 문자는 여러 줄 그대로) */
  function sheetRows(D, ns) {
    var showCost = sdsCostOk();
    return ns.map(function (no) {
      var r = sdsRow(D, no), t = r.t, c = showCost ? truckCost(D, no) : null, amt = c && c.total != null ? c.total + ['wait', 'support'].reduce(function (a, k) { return a + (Number(t[k]) || 0); }, 0) : '';
      return [r.cat, r.from, (r.dest.length ? r.dest.join(' / ') + '\n' : '') + r.addr.join(' / '), String(r.plt), showCost ? String(amt) : '', t.car || '', t.driver || '', t.phone || '', r.fcs.join(' / '), sdsMessage(D, no), r.blk ? '⛔' : '',
        r.wf ? r.wf.d.rsvCode || '' : '', r.wf ? r.wf.d.rsv || '' : '', (!isPartner() && r.dv && r.dv.birth) || ''].concat(SDS_COLS.map(function (k) { return r.sz[k] ? String(r.sz[k]) : ''; }));
    });
  }
  /** 삼다수 표의 버튼·입력칸: 하차지 이름 연결 · 쿠팡 예약 · 생년월일 */
  function bind(box, x0) {
    var st = x0.st, tn = x0.tn;
    $$('[data-sdsdest]', box).forEach(function (b) { b.onclick = function () { openSdsDest(b.dataset.sdsdest, b.dataset.sdst || st.tab); }; });
    var one = function (v) { var x = tn(v); return { x: x, os: truckOrders(x.D, x.no) }; };
    $$('[data-sdsedit]', box).forEach(function (b) { b.onclick = function () { var y = one(b.dataset.sdsedit); if (y.os.length === 1) openOrderEdit(y.x.D, y.os[0]); else openTruckOrderEdit(y.x.D, y.x.no); }; });
    $$('[data-sdsnote]', box).forEach(function (b) { b.onclick = function () { var y = one(b.dataset.sdsnote); if (y.os[0]) openOrderNote(y.x.D, y.os[0]); }; });
    $$('[data-sdsdel]', box).forEach(function (b) { b.onclick = function () { // 차 한 대 = 오더 줄 지우기 (다시 붙여넣으면 다시 들어와요)
      var y = one(b.dataset.sdsdel), X = y.x.D; if (!y.os.length || !confirm(y.os.map(function (o) { return o.d.fc + ' ' + o.d.bundle + 'PLT'; }).join(', ') + ' 줄을 지울까요? (다시 붙여넣으면 다시 들어와요)')) return;
      dispSaveNow().then(function () { return api('dispatch.deleteOrders', { cust: X.key, date: X.date, ids: y.os.map(function (o) { return o.id; }) }); })
        .then(function (r) { r = dispPrep(r, X.tab, X.date, X.key); r.base = dispSnap(r); st.tabs[X.tab] = r; drawDispDay(); toast('지웠어요.'); }).catch(function (err) { toast(err.message, 'err'); });
    }; });
    $$('[data-rsv]', box).forEach(function (inp) { inp.onchange = function () { // 쿠팡 예약시간·코드: 오더에 저장
      var p = inp.dataset.rsv.split('|'), X = st.tabs[p[0]], o = X && X.orders.filter(function (x) { return x.id === p[1]; })[0], k = inp.dataset.rk, v = inp.value.trim(), patch = {}; if (!o) return; patch[k] = v;
      api('dispatch.editOrder', { cust: X.key, date: X.date, id: o.id, patch: patch }).then(function () { o.d[k] = v; inp.classList.toggle('sds-miss', !v); toast('쿠팡 ' + (k === 'rsv' ? '예약시간' : '코드') + '을 저장했어요.'); }).catch(function (err) { toast(err.message, 'err'); });
    }; });
    $$('[data-birth]', box).forEach(function (inp) { inp.onchange = function () { // 생년월일: 기사 풀에 저장 (다음부터 자동)
      var x = tn(inp.dataset.birth), t = truckInfo(x.D, x.no), v = inp.value.trim(), m = sdsDriverOf(t);
      if (!String(t.car || t.driver || '').trim()) { inp.value = ''; toast('차량정보나 운전원을 먼저 넣으세요.', 'err'); return; }
      api('drivers.save', m ? { id: m.id, driver: Object.assign({}, m, { birth: v }) } : { id: '', driver: { car: t.car, driver: t.driver, phone: t.phone, ton: t.ton, birth: v } })
        .then(function (r) { st.drivers = r.drivers; toast((t.driver || t.car) + ' 기사님 생년월일을 기사 풀에 저장했어요.'); }).catch(function (err) { toast(err.message, 'err'); });
    }; });
  }
  return {
    tabs: SDS_TABS, ton: '18톤', noMap: true, autoTruck: true, fcLabel: '대리점명', orderEdit: SDS_EDIT,
    load: function () { return loadDispMap(); },
    destName: sdsDest,
    parse: sdsParse,
    pasteHtml: sdsHtmlGrid,
    pasteHint: function (st) { return '메일의 오더 표를 제목 줄(구분·무라벨·용량)까지 통째로 복사해서 붙여넣으세요. 하차지마다 18파렛트씩 한 대(배차 표 한 줄)로 나눠요 (' + esc(st.date) + ' 날짜로 들어가요, 이미 있는 줄은 건너뜀)'; },
    orderHead: function (orders, tb) { return orders.length + '대 · ' + won(tb) + '파렛트'; },
    ordHead: '<th class="left">대리점명</th><th class="left">하차지</th><th class="left">문자</th><th>PLT</th><th class="left">수량</th><th class="left">주소 · 연락처</th>',
    ordCells: sdsOrdCells,
    message: sdsMessage,
    truckTable: truckTable, sheetRows: sheetRows, blackMark: blackMark, blackLabel: blackLabel, noOrderTable: true, trkW: SDS_TRK.length, trkFields: SDS_TRK,
    truckLabel: function (D, no) { var os = truckOrders(D, no); return os.map(function (o) { return o.d.fc + ' ' + o.d.bundle + 'PLT'; }).join(' · ') || no + '호차'; },
    bind: bind
  };
} });
