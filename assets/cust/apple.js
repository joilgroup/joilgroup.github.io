/* 애플 배차 (업체별 파일 · 초기 작업 · 새 업체 추가 방법은 assets/cust/README.md)
   용차는 앱·GPS 단말기가 안 돼서: 기사 문자 링크(go.html)에 상차지 출발 1번 + 하차지마다 도착 버튼 → 그 시각과 그때 위치 한 번 (서버 drv.event · 019)
   오더 양식(카톡)은 아직 몰라서 간단한 붙여넣기: 상차지 · 하차지 · 주소 · 하차가능시간 · 수량 · 품목 (탭으로 나눈 엑셀 줄 또는 / 로 나눈 글) */
(window.JOIL_CUST = window.JOIL_CUST || []).push({ name: '애플', make: function (H) {
  'use strict';
  var api = H.api, esc = H.esc, findPlace = H.findPlace, parseTsv = H.parseTsv, truckOrders = H.truckOrders, truckStops = H.truckStops, won = H.won;
  var COLS = ['from', 'fc', 'addr', 'hours', 'bundle', 'item'], HEAD = { from: /상차/, fc: /하차지|센터|도착/, addr: /주소/, hours: /시간/, bundle: /수량|파렛|plt|번들/i, item: /품목|item/i };
  function goUrl(tok) {
    var base = (window.JOIL_CONFIG && window.JOIL_CONFIG.DRIVER_URL) || location.href.split('#')[0].split('?')[0];
    return base.replace(/[#?].*$/, '').replace(/[^/]*$/, '') + 'go.html#' + tok;
  }
  function parse(text, tab, date) {
    var lines = String(text || '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    var rows = /\t/.test(text) ? parseTsv(text) : lines.map(function (l) { return l.split(/\s*\/\s*/); });
    rows = rows.filter(function (r) { return r.some(function (c) { return String(c || '').trim(); }); });
    if (!rows.length) return { items: [], warn: '붙여넣은 내용이 없어요.' };
    var idx = {}, head = rows[0].map(function (h) { return String(h || '').replace(/\s/g, ''); });
    if (head.some(function (h) { return /^(상차지?|하차지|주소)$/.test(h); })) { COLS.forEach(function (c) { for (var j = 0; j < head.length; j++) if (HEAD[c].test(head[j]) && !Object.keys(idx).some(function (k) { return idx[k] === j; })) { idx[c] = j; break; } }); rows = rows.slice(1); }
    else COLS.forEach(function (c, j) { idx[c] = j; });
    var items = [], bad = 0, seen = {};
    rows.forEach(function (r) {
      var d = {}; COLS.forEach(function (c) { d[c] = idx[c] == null ? '' : String(r[idx[c]] == null ? '' : r[idx[c]]).trim(); });
      if (!d.fc) { bad++; return; }
      var key = ['ap', date, d.from, d.fc, d.addr, d.bundle, d.item].join('|'), n = seen[key] = (seen[key] || 0) + 1;
      items.push({ date: date, key: n > 1 ? key + '#' + n : key, d: d });
    });
    return { items: items, warn: bad ? '하차지가 빈 ' + bad + '줄은 건너뛰었어요.' : '' };
  }
  /** 기사 문자 (짧게): 상차지 · 하차지 순서 · 출발·도착 버튼 링크 */
  function message(D, no) {
    var list = truckOrders(D, no); if (!list.length) return '';
    var t = D.trucks.filter(function (x) { return x.no === no; })[0] || {}, stops = truckStops(D, no), d = D.date.split('-'), q = 0;
    stops.forEach(function (s) { q += s.b; });
    var from = list[0].d.from || '', p = findPlace(from), out = ['[배차] ' + Number(d[1]) + '/' + Number(d[2]) + ' ' + no + '호차' + (t.car ? ' ' + t.car : '') + (q ? ' · ' + won(q) + '파렛트' : '')];
    out.push('상차: ' + ((p && p.name) || from || '-') + (p && p.addr ? ' (' + p.addr + ')' : '') + (p && p.time ? ' · ' + p.time : ''));
    out.push('하차 ' + stops.length + '곳');
    stops.forEach(function (s, i) { var a = String(s.d.addr || '').trim(), h = String(s.d.hours || '').trim(); out.push((i + 1) + ') ' + s.fc + (a ? ' · ' + a : '') + (h ? ' · ' + h : '')); });
    if (t.token) { out.push(''); out.push('👇 출발·도착 버튼, 인수증 올리기'); out.push(goUrl(t.token)); }
    return out.join('\n');
  }
  /** 배차 화면: 출발·도착 기록 (1분마다 다시 받기 · 화면을 다시 그릴 때마다 붙여요) */
  var EV = {};
  function evHtml(key, D) {
    var e = EV[key]; if (!e || !e.list) return '<div class="ap-ev muted small">출발·도착 기록 불러오는 중…</div>';
    var by = {}; e.list.forEach(function (x) { (by[x.no] = by[x.no] || []).push(x); });
    var nos = Object.keys(by).map(Number).sort(function (a, b) { return a - b; });
    var hm = function (x) { return esc(String(x.at).slice(11, 16)) + (x.lat ? ' <a href="https://map.kakao.com/link/map/' + encodeURIComponent(x.no + '호차') + ',' + x.lat + ',' + x.lng + '" target="_blank" rel="noopener" title="그때 위치">📍</a>' : ''); };
    return '<div class="ap-ev"><b>🚚 출발·도착 기록</b> <span class="muted small">기사가 문자 링크에서 누른 시각' + (e.at ? ' · ' + esc(e.at) + ' 확인' : '') + '</span>' + (nos.length ? '<ul>' + nos.map(function (no) {
      return '<li><b>' + no + '호차</b> ' + by[no].map(function (x) { return x.kind === 'dep' ? '출발 ' + hm(x) : '<span class="muted">→</span> ' + esc(x.fc || (x.stop + 1) + '번째') + ' 도착 ' + hm(x); }).join(' ') + '</li>'; }).join('') + '</ul>' : '<p class="muted small" style="margin:4px 0 0">아직 누른 기사가 없어요.</p>') + '</div>';
  }
  function bind(box, o) {
    var D = o.D, key = D && D.key; if (!key || !box) return;
    var old = box.querySelector('.ap-ev'); if (old) old.parentNode.removeChild(old);
    var put = function () { var el = box.querySelector('.ap-ev'), html = evHtml(key, D); if (el) el.outerHTML = html; else box.insertAdjacentHTML('afterbegin', html); };
    put();
    var e = EV[key] = EV[key] || {}; if (e.t && Date.now() - e.t < 60000 && e.date === D.date) return;
    e.t = Date.now(); e.date = D.date;
    api('dispatch.events', { cust: key, date: D.date }).then(function (r) { if (e.date !== D.date) return; e.list = r.events || []; var n = new Date(); e.at = ('0' + n.getHours()).slice(-2) + ':' + ('0' + n.getMinutes()).slice(-2); if (document.body.contains(box)) put(); })
      .catch(function () { e.t = 0; e.list = e.list || []; if (document.body.contains(box)) put(); }); // 서버가 예전이면 빈 기록
  }
  return {
    tabs: [{ name: '애플', suf: '', prefix: '애플' }],
    parse: parse,
    pasteHint: function () { return '한 줄에 오더 하나: 상차지 · 하차지 · 주소 · 하차가능시간 · 수량(파렛트) · 품목 (엑셀에서 복사하거나 / 로 나눠 적기, 제목 줄 있어도 돼요)'; },
    message: message,
    driverUrl: goUrl,
    bind: bind
  };
} });
