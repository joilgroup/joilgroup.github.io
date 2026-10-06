/* JOIL 조일그룹 견적·실적 시스템 — 화면 로직 */
(function () {
  'use strict';

  var API_URL = (window.JOIL_CONFIG && window.JOIL_CONFIG.API_URL) || '';
  var DEMO = !API_URL;
  var app = document.getElementById('app');

  var state = {
    token: storage('get', 'joil-token'),
    user: null,
    pub: null,
    view: 'home',
    calc: { origin: '', dest: '', dieselMode: null, dieselPrice: '', baseTon: null, tons: null, result: null, specials: [], cust: '' },
    rateCusts: null,
    rates: { custs: null, sel: '', data: null, cmp: null, q: '', ton: '', custQ: '' },
    reqs: { list: null, status: '', biz: '', q: '', detail: null, data: null, blobs: {} },
    hist: { days: 30, type: '', userId: '', q: '', logs: null, users: null, detail: null, detailData: null },
    quotes: { q: '', status: '', list: null, detail: null, detailData: null },
    docs: { list: null, biz: '', cat: '', q: '', sel: {}, blobs: {} },
    companies: null, addr: null,
    info: { tab: 'diesel', range: 90, diesel: null, news: null, weather: null, newsKw: '', newsQ: '' },
    an: null,
    cal: null,
    bulk: { mode: 'one', origin: '', dests: '', pairsText: '', results: [], running: false, cancel: false, page: 0, sort: 'no', search: '', filter: 'all', detail: true, meta: null, opts: null },
    admin: { tab: 'basic', settings: null, keys: null, tariff: null, tariffDirty: false, settingsDirty: false, page: 0, users: null, logs: null }
  };

  /* ───────── 도구 ───────── */

  function storage(op, key, value) {
    try {
      if (op === 'get') return sessionStorage.getItem(key);
      if (op === 'set') sessionStorage.setItem(key, value);
      if (op === 'del') sessionStorage.removeItem(key);
    } catch (e) { /* 사생활 보호 모드 등 */ }
    return null;
  }
  function local(op, key, value) {
    try {
      if (op === 'get') return JSON.parse(localStorage.getItem(key) || 'null');
      if (op === 'set') localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* 무시 */ }
    return null;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function won(n) { return n == null || n === '' ? '–' : Number(n).toLocaleString('ko-KR'); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  /** 메뉴 권한: quote(견적 계산·조회기록·견적모음) / analysis(매출매입 분석) / admin */
  function can(perm) {
    var u = state.user; if (!u) return false;
    if (u.role === 'admin') return true;
    return (u.perms || ['quote']).indexOf(perm) !== -1;
  }
  function defaultView() { return can('quote') || can('analysis') || can('search') ? 'home' : 'none'; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* 서버 요청
   * - 조회성 요청(READ)은 오류·지연 시 1번 자동 재시도, 같은 요청이 동시에 겹치면 하나로 합침
   * - 저장·변경 요청은 중복 실행을 막기 위해 재시도하지 않음
   */
  var READ_ACTIONS = ['me', 'publicSettings', 'dieselPrice', 'admin.bootstrap', 'admin.getSettings', 'admin.getTariff', 'admin.listUsers', 'admin.getLogs', 'admin.cacheInfo', 'history.list', 'history.get', 'quotes.list', 'quotes.get', 'analysis.index', 'analysis.load', 'analysis.accessLog', 'admin.dieselHistory', 'docs.list', 'docs.get', 'addr.list', 'companies', 'diesel.recent', 'info.diesel', 'info.news', 'info.weather', 'rates.list', 'rates.get', 'reqs.list', 'reqs.get', 'reqs.file', 'notes.list', 'cal.all', 'staff.list', 'notice.list', 'custs.list', 'weekly.get', 'stock.quotes', 'stock.search', 'stock.chart', 'manual.list', 'manual.file', 'inq.list', 'owners.list'];
  var TIMEOUT_MS = 25000;
  var inflight = {};

  function sendOnce(req) {
    if (DEMO) return window.JoilDemo.call(req);
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, /^(quoteBatch|admin\.saveTariff|analysis\.upload|analysis\.load|docs\.upload|docs\.get|docs\.zip)$/.test(req.action) ? 120000 : TIMEOUT_MS) : null;
    // 캐시·쿠키가 끼어들지 않도록: 매번 고유 주소, 캐시 사용 안 함, 쿠키 안 보냄
    return fetch(API_URL + (API_URL.indexOf('?') === -1 ? '?' : '&') + '_t=' + Date.now() + Math.random().toString(36).slice(2, 6), {
      method: 'POST', body: JSON.stringify(req), cache: 'no-store', credentials: 'omit', redirect: 'follow',
      signal: ctrl ? ctrl.signal : undefined
    })
      .then(function (res) {
        if (!res.ok) throw retryable('서버 연결 오류 (' + res.status + ')');
        return res.text();
      })
      .then(function (text) {
        try { return JSON.parse(text); } catch (e) {
          throw retryable('서버가 잠시 응답하지 못했습니다. 잠시 후 다시 시도하세요.');
        }
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') throw retryable('서버 응답이 너무 늦습니다. 잠시 후 다시 시도하세요.');
        if (err && /Failed to fetch|NetworkError|Load failed/.test(err.message)) throw retryable('서버에 연결할 수 없습니다. 인터넷 연결을 확인하세요.');
        throw err;
      })
      .then(function (data) {
        if (timer) clearTimeout(timer);
        if (!data.ok) throw new Error(data.error || '알 수 없는 오류');
        return data;
      }, function (err) {
        if (timer) clearTimeout(timer);
        throw err;
      });
  }

  function retryable(msg) { var e = new Error(msg); e.retry = true; return e; }

  function api(action, payload) {
    var req = Object.assign({ action: action, token: state.token }, payload || {});
    var isRead = READ_ACTIONS.indexOf(action) !== -1;
    var key = isRead ? JSON.stringify(req) : null;
    if (key && inflight[key]) return inflight[key];

    var p = sendOnce(req).catch(function (err) {
      if (!isRead || !err.retry) throw err;
      return new Promise(function (r) { setTimeout(r, 900); }).then(function () { return sendOnce(req); });
    });
    p = p.catch(function (err) {
      var msg = (err && err.message) || String(err);
      if (/알 수 없는 요청/.test(msg)) msg = '서버 코드가 예전 버전입니다. 관리자가 Apps Script 코드를 최신으로 바꾸고 새 버전으로 배포해야 합니다. (SETUP.md "업데이트가 나왔을 때")';
      if (/로그인이 만료|로그인이 필요|사용이 중지/.test(msg) && action !== 'login') {
        clearSession();
        toast(msg, 'err');
        render();
      }
      throw new Error(msg);
    });
    if (key) {
      inflight[key] = p;
      var clear = function () { delete inflight[key]; };
      p.then(clear, clear);
    }
    return p;
  }


  function toast(msg, type) {
    var box = document.getElementById('toasts');
    var el = document.createElement('div');
    el.className = 'toast ' + (type || 'ok');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.classList.add('leave'); setTimeout(function () { el.remove(); }, 300); }, type === 'err' ? 4200 : 2600);
  }

  function modal(opts) {
    var wrap = document.createElement('div');
    wrap.className = 'backdrop';
    wrap.innerHTML =
      '<div class="modal ' + (opts.wide ? 'wide' : '') + '" role="dialog" aria-modal="true">' +
      '<div class="head"><div class="eyebrow">' + esc(opts.eyebrow || '안내') + '</div><h2>' + esc(opts.title) + '</h2></div>' +
      '<div class="body">' + opts.body + '</div>' +
      '<div class="foot">' + (opts.foot || '<button class="btn btn-primary" data-close>확인</button>') + '</div></div>';
    document.body.appendChild(wrap);
    function close() { wrap.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape' && !opts.locked) close(); }
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap && !opts.locked) close();
      if (e.target.closest('[data-close]')) close();
    });
    if (opts.onMount) opts.onMount(wrap.querySelector('.modal'), close);
    var first = wrap.querySelector('input, textarea, select');
    if (first) setTimeout(function () { first.focus(); }, 60);
    return close;
  }

  function busy(btn, on, label) {
    if (!btn) return;
    if (on) {
      btn.dataset.label = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>' + esc(label || '처리 중…');
    } else {
      btn.disabled = false;
      if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
    }
  }

  function countUp(el, target) {
    if (target == null) return;
    var start = performance.now(), dur = 650;
    function step(t) {
      var p = Math.min(1, (t - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = won(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(step); else el.textContent = won(target);
    }
    requestAnimationFrame(step);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    var ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } finally { ta.remove(); }
    return Promise.resolve();
  }

  function downloadCsv(filename, rows) {
    var csv = rows.map(function (r) {
      return r.map(function (c) {
        c = c == null ? '' : String(c);
        return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
      }).join(',');
    }).join('\r\n');
    saveBlob(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), filename);
  }

  function saveBlob(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  /* ───────── 세션 ───────── */

  function clearSession() {
    state.token = null; state.user = null; state.pub = null;
    state.admin = { tab: 'basic', loaded: false, settings: null, keys: null, tariff: null, tariffDirty: false, settingsDirty: false, page: 0, users: null, logs: null, cache: null };
    state.calc.result = null;
    state.calc.baseTon = null;
    state.bulk.results = []; state.bulk.meta = null; state.bulk.cancel = true; state.bulk.recordId = null;
    state.calc.recordId = null;
    state.hist = { days: 30, type: '', userId: '', q: '', logs: null, users: null, detail: null, detailData: null };
    state.quotes = { q: '', status: '', list: null, detail: null, detailData: null };
    state.docs = { list: null, biz: '', cat: '', q: '', sel: {}, blobs: {} };
    state.companies = null; state.addr = null; state.rateCusts = null;
    state.rates = { custs: null, sel: '', data: null, cmp: null, q: '', ton: '', custQ: '' };
    state.reqs = { list: null, status: '', biz: '', q: '', detail: null, data: null, blobs: {} };
    state.info = { tab: 'diesel', range: 90, diesel: null, news: null, weather: null, newsKw: '', newsQ: '' };
    state.an = newAnState();
    state.cal = newCalState(); state.notices = null; state.custs = null; state.custView = null; state.srch = null; state.manuals = null; state.inqs = null; state.owners = null; state.manView = null; state.inqView = null; state.rptView = null;
    storage('del', 'joil-token');
    routing.last = null;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* 무시 */ }
  }

  function afterLogin(settings) {
    return (settings ? Promise.resolve({ settings: settings }) : api('publicSettings')).then(function (r) {
      state.pub = r.settings;
      var saved = local('get', 'joil-tons');
      state.calc.tons = Array.isArray(saved) ? saved.filter(function (t) { return state.pub.tons.indexOf(t) !== -1; }) : state.pub.tons.slice();
      if (!state.calc.tons.length) state.calc.tons = state.pub.tons.slice();
      state.calc.dieselMode = state.pub.fuelMode === 'auto' ? 'auto' : 'manual';
      state.calc.dieselPrice = state.pub.manualPrice;
      state.calc.baseTon = state.pub.tons.indexOf(state.calc.baseTon) !== -1 ? state.calc.baseTon : state.pub.baseTon;
      routing.last = null;
      if (location.hash.length > 2) applyRoute(location.hash); // 새로고침해도 보던 화면 그대로
      render();
      if (state.user.mustChange) openChangePassword(true);
    });
  }


  /* ───────── 뒤로가기 (브라우저 기록) ─────────
   * 화면이 바뀔 때마다 주소 끝(#/info/diesel 같은)에 기록 → 뒤로/앞으로 버튼·마우스 측면 버튼으로 이전 화면 */
  var routing = { last: null, restoring: false, lastSub: '', typingAt: 0, pushAt: 0 };
  document.addEventListener('input', function (e) { if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'checkbox') routing.typingAt = Date.now(); }, true);
  var pick = function (o) { var r = {}; Object.keys(o).forEach(function (k) { var v = o[k]; if (v != null && v !== '' && v !== false && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)) r[k] = v; }); return r; };
  /** 화면 안에서 고른 것 (검색 조건·필터·선택) — 뒤로가기로 되돌릴 수 있게 */
  var SUB = {
    search: { get: function () { var st = srState(), f = {}; Object.keys(st.f).forEach(function (k) { if (st.f[k]) f[k] = st.f[k]; }); return pick({ f: f, x: st.exactW ? 1 : 0, p: st.period !== 'all' ? st.period : '' }); },
      set: function (o) { var st = srState(); st.f = o.f || {}; st.exactW = !!o.x; st.period = o.p || 'all'; st.limit = 200; } },
    analysis: { get: function () { var an = state.an; if (!an || !an.rows) return {}; return pick({ a: an.f.from, b: an.f.to, z: an.f.biz, s: an.f.sel, d: an.dim !== 'cust' ? an.dim : '', c: an.cmp !== 'prev' ? an.cmp : '' }); },
      set: function (o) { var an = state.an; if (!an) return; if (o.a) an.f.from = o.a; if (o.b) an.f.to = o.b; an.f.biz = o.z || []; an.f.sel = o.s || {}; an.dim = o.d || 'cust'; an.cmp = o.c || 'prev'; an.detailPage = 0; an.groupLimit = 50; } },
    quotes: { get: function () { var q = state.quotes; return q.detail ? {} : pick({ s: q.status, q: q.q }); }, set: function (o) { var q = state.quotes; q.status = o.s || ''; q.q = o.q || ''; } },
    reqs: { get: function () { var r = state.reqs; return r.detail ? {} : pick({ s: r.status, b: r.biz, q: r.q }); }, set: function (o) { var r = state.reqs; r.status = o.s || ''; r.biz = o.b || ''; r.q = o.q || ''; } },
    docs: { get: function () { var d = state.docs; return pick({ b: d.biz, c: d.cat, q: d.q }); }, set: function (o) { var d = state.docs; d.biz = o.b || ''; d.cat = o.c || ''; d.q = o.q || ''; } },
    history: { get: function () { var h = state.hist; return h.detail ? {} : pick({ d: h.days !== 30 ? h.days : '', t: h.type, u: h.userId, q: h.q }); },
      set: function (o) { var h = state.hist, nd = o.d || 30; if (h.days !== nd || h.type !== (o.t || '') || h.userId !== (o.u || '') || h.q !== (o.q || '')) h.logs = null; h.days = nd; h.type = o.t || ''; h.userId = o.u || ''; h.q = o.q || ''; } },
    rates: { get: function () { var r = state.rates; return pick({ c: r.sel, q: r.q }); }, set: function (o) { var r = state.rates; if ((o.c || '') !== r.sel) { r.sel = o.c || ''; r.data = null; r.cmp = null; } r.q = o.q || ''; } },
    info: { get: function () { var i = state.info; return i.tab === 'news' ? pick({ k: i.newsKw }) : {}; }, set: function (o) { state.info.newsKw = o.k || ''; } },
    inq: { get: function () { var i = state.inqView || {}; return pick({ s: i.st, q: i.q, m: i.mine ? 1 : 0 }); }, set: function (o) { var i = state.inqView = state.inqView || { limit: 100 }; i.st = o.s || ''; i.q = o.q || ''; i.mine = !!o.m; } },
    cal: { get: function () { var c = state.cal; return c.tab === 'leave' ? pick({ y: c.year, o: c.otm, p: c.person }) : c.tab === 'weekly' ? pick({ w: c.wk }) : c.tab === 'tasks' ? pick({ m: c.mine ? 1 : 0 }) : pick({ ym: c.ym, m: c.mine ? 1 : 0 }); },
      set: function (o) { var c = state.cal; if (o.y) c.year = o.y; if (o.o) c.otm = o.o; c.person = o.p || ''; if (o.w) c.wk = o.w; if (o.ym) c.ym = o.ym; c.mine = !!o.m; } }
  };
  function subOf(v) { var h = SUB[v]; if (!h) return ''; try { var o = h.get(); return Object.keys(o).length ? JSON.stringify(o) : ''; } catch (e) { return ''; } }
  function routeOf() {
    var v = state.view, p = [v], s = '';
    if (v === 'info') s = state.info.tab;
    else if (v === 'cal') s = state.cal.tab;
    else if (v === 'admin') s = state.admin.tab;
    else if (v === 'quotes') s = state.quotes.detail;
    else if (v === 'reqs') s = state.reqs.detail;
    else if (v === 'history') s = state.hist.detail;
    else if (v === 'custs') s = state.custView && state.custView.sel;
    else if (v === 'manual') s = state.manView && state.manView.sel;
    if (s) p.push(s);
    var sub = subOf(v);
    return '#/' + p.map(function (x) { return encodeURIComponent(x); }).join('/') + (sub ? '?' + encodeURIComponent(sub) : '');
  }
  function syncRoute() {
    if (!state.user || !state.pub || routing.restoring) return;
    var r = routeOf(); if (r === routing.last) return;
    var base = r.split('?')[0], lastBase = routing.last && routing.last.split('?')[0], sub = r.split('?')[1] || '', now = Date.now();
    // 같은 화면에서: 처음 조건이 정해지는 순간·글자 치는 중이면 기록을 덮어쓰기 (한 글자마다 쌓이지 않게)
    var replace = routing.last == null || (base === lastBase && (!routing.lastSub || (now - routing.typingAt < 1500 && now - routing.pushAt < 4000 && routing.typedLast)));
    try { if (replace) history.replaceState({ r: r }, '', r); else history.pushState({ r: r }, '', r); } catch (e) { /* 무시 */ }
    if (!replace) routing.pushAt = now;
    routing.typedLast = now - routing.typingAt < 1500;
    routing.last = r; routing.lastSub = sub;
  }
  /** 주소 → 화면 상태. 갈 수 없는 화면이면 false */
  function applyRoute(r) {
    var qi = String(r || '').indexOf('?'), subS = qi === -1 ? '' : String(r).slice(qi + 1);
    r = qi === -1 ? r : String(r).slice(0, qi);
    var p = String(r || '').replace(/^#\/?/, '').split('/').filter(Boolean).map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } });
    var v = p[0], s = p[1] || '';
    if (!v || (v !== 'help' && !allViews().some(function (n) { return n[0] === v; }))) return false;
    state.view = v;
    if (v === 'info' && s) state.info.tab = s;
    if (v === 'cal' && s) state.cal.tab = s;
    if (v === 'admin' && s) state.admin.tab = s;
    if (v === 'quotes' && (state.quotes.detail || '') !== s) { state.quotes.detail = s || null; state.quotes.detailData = null; if (!s) state.quotes.list = null; }
    if (v === 'reqs' && (state.reqs.detail || '') !== s) { state.reqs.detail = s || null; state.reqs.data = null; if (!s) state.reqs.list = null; }
    if (v === 'history' && (state.hist.detail || '') !== s) { state.hist.detail = s || null; state.hist.detailData = null; }
    if (v === 'custs') { state.custView = state.custView || { q: '', sel: '' }; state.custView.sel = s; }
    if (v === 'manual') { state.manView = state.manView || { q: '', sel: '' }; state.manView.sel = s; }
    if (SUB[v]) { var so = {}; if (subS) { try { so = JSON.parse(decodeURIComponent(subS)); } catch (e) { so = {}; } } try { SUB[v].set(so); } catch (e) { /* 무시 */ } }
    return true;
  }
  window.addEventListener('popstate', function (e) {
    if (!state.user || !state.pub) return;
    $$('.backdrop').forEach(function (b) { b.remove(); }); // 열린 창은 닫기
    var pop = $('.nav-pop'); if (pop) pop.remove();
    var r = (e.state && e.state.r) || location.hash;
    routing.restoring = true;
    try { if (applyRoute(r)) render(); } finally { routing.restoring = false; }
    routing.last = routeOf(); routing.lastSub = routing.last.split('?')[1] || '';
    if (routing.last !== r) { try { history.replaceState({ r: routing.last }, '', routing.last); } catch (er) { /* 무시 */ } }
  });

  /* ───────── 렌더 ───────── */

  /** 상단 메뉴: 단독 메뉴 [view, 이름] 또는 묶음 { g, label, items } (권한 없는 항목은 빠짐) */
  function navModel() {
    var q = can('quote'), any = q || can('analysis') || can('search'), out = [];
    var grp = function (g, label, items) { items = items.filter(Boolean); if (items.length === 1) out.push(items[0]); else if (items.length) out.push({ g: g, label: label, items: items }); };
    if (any) out.push(['home', '홈']);
    if (q) grp('quote', '견적', [['calc', '단건 계산'], ['bulk', '대량 계산'], ['reqs', '견적접수'], ['quotes', '견적모음'], ['history', '조회기록']]);
    grp('data', '업체·자료', [can('search') && ['search', '배차검색'], q && ['custs', '거래처'], q && ['manual', '업무 매뉴얼'], q && ['owners', '업무 담당표'], q && ['inq', '문의 기록'], q && ['rates', '업체단가'], q && ['docs', '서류함']]);
    if (any) grp('info', '일정·정보', [['cal', '일정'], ['info', '물류정보']]);
    if (can('analysis')) grp('an', '분석', [['analysis', '매출매입 분석'], ['report', '팀 월간 보고서']]);
    if (state.user.role === 'admin') out.push(['admin', '관리자']);
    return out;
  }
  /** 갈 수 있는 화면 전체 (주소 지킴이용) */
  function navItems() {
    var out = [];
    navModel().forEach(function (n) { if (n.items) out = out.concat(n.items); else out.push(n); });
    return out;
  }
  function allViews() { return navItems(); }

  function render() {
    clearTimeout(stockTimer);
    if (!state.user) return renderLogin();
    if (state.pub && state.view !== 'help' && !allViews().some(function (n) { return n[0] === state.view; })) state.view = defaultView();
    if (!state.pub) { app.innerHTML = '<div class="login-wrap"><div class="muted">불러오는 중…</div></div>'; return; }
    app.innerHTML =
      '<header class="topbar"><div class="stripe-bar"></div><div class="row">' +
      '<div class="brand"><span class="logo"></span><span class="brand-txt"><b>JOIL</b><small>조일그룹 견적·실적 시스템</small></span></div>' +
      '<nav class="nav">' +
      navModel().map(function (n) {
        if (!n.items) return '<button data-view="' + n[0] + '" class="' + (state.view === n[0] ? 'on' : '') + '">' + n[1] + '</button>';
        var cur = n.items.filter(function (x) { return x[0] === state.view; })[0];
        return '<button type="button" class="nav-grp' + (cur ? ' on' : '') + '" data-g="' + n.g + '">' + n.label + (cur ? '<small>' + cur[1] + '</small>' : '') + ' ▾</button>';
      }).join('') +
      '</nav><div class="spacer"></div>' +
      '<div class="user-chip">' + (DEMO ? '<span class="badge region">데모</span>' : '') +
      (state.user.role === 'admin' ? '<span class="role-badge">ADMIN</span>' : '') +
      '<span class="avatar" title="' + esc(state.user.name + ' (' + state.user.id + ')') + '">' + esc(String(state.user.name || state.user.id).charAt(0)) + '</span>' +
      '<span class="name">' + esc(state.user.name) + '</span>' +
      '<button class="btn btn-ghost btn-sm' + (state.view === 'help' ? ' on' : '') + '" data-act="help">도움말</button>' +
      '<button class="btn btn-ghost btn-sm" data-act="pw">비밀번호</button>' +
      '<button class="btn btn-sm" data-act="logout">로그아웃</button></div>' +
      '</div></header><main id="main"></main>';

    // 묶음 메뉴: 마우스를 올리면 아래로 펼침 (터치는 눌러서)
    var popT = null, popG = null, popAt = 0;
    var closePop = function () { var o = $('.nav-pop'); if (o) o.remove(); popG = null; $$('.nav-grp').forEach(function (x) { x.classList.remove('open'); }); };
    var openPop = function (btn) {
      clearTimeout(popT);
      if (popG === btn.dataset.g && $('.nav-pop')) return;
      closePop();
      var n = navModel().filter(function (x) { return x.g === btn.dataset.g; })[0]; if (!n) return;
      var r = btn.getBoundingClientRect(), pop = document.createElement('div');
      pop.className = 'nav-pop'; popG = n.g; popAt = Date.now(); btn.classList.add('open');
      pop.innerHTML = n.items.map(function (x) { return '<button data-view="' + x[0] + '" class="' + (state.view === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('');
      pop.style.top = (r.bottom + 4) + 'px'; pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 180)) + 'px';
      document.body.appendChild(pop);
      pop.onmouseenter = function () { clearTimeout(popT); };
      pop.onmouseleave = function () { popT = setTimeout(closePop, 250); };
      $$('button', pop).forEach(navGo);
    };
    $$('.nav-grp').forEach(function (g) {
      g.onmouseenter = function () { openPop(g); };
      g.onmouseleave = function () { popT = setTimeout(closePop, 250); };
      g.onclick = function (e) { e.stopPropagation(); if (popG === g.dataset.g && $('.nav-pop')) { if (Date.now() - popAt > 500) closePop(); } else openPop(g); }; // 터치: 마우스 올림과 눌림이 같이 오면 열린 채로
    });
    if (!window.__navPopBound) { window.__navPopBound = true; document.addEventListener('click', function (e) { if (!e.target.closest || !e.target.closest('.nav-pop')) { var o = document.querySelector('.nav-pop'); if (o) o.remove(); } }); window.addEventListener('scroll', function () { var o = document.querySelector('.nav-pop'); if (o) o.remove(); }, { passive: true }); }
    $$('.nav button[data-view]').forEach(navGo);
    function navGo(b) {
      b.onclick = function () {
        if (state.view === 'admin' && b.dataset.view !== 'admin' && (state.admin.tariffDirty || state.admin.settingsDirty || (state.admin.anMap && state.admin.anMap.dirty) || (state.admin.anRules && state.admin.anRules.dirty) || state.admin.companyDirty) &&
          !confirm('저장하지 않은 관리자 변경사항이 있습니다. 이동할까요? (변경사항은 화면에 남아 있습니다)')) return;
        // 같은 메뉴를 다시 누르면 상세 화면에서 목록으로
        if (state.view === b.dataset.view) {
          if (state.view === 'history') { state.hist.detail = null; state.hist.logs = null; }
          if (state.view === 'quotes') { state.quotes.detail = null; state.quotes.list = null; }
          if (state.view === 'docs') state.docs.list = null;
          if (state.view === 'reqs') { state.reqs.detail = null; state.reqs.list = null; }
          if (state.view === 'custs' && state.custView) { state.custView.sel = ''; state.custs = null; }
        }
        if (b.dataset.view === 'history' && state.view !== 'history') state.hist.logs = null;
        closePop();
        state.view = b.dataset.view; render();
      };
    }
    $('[data-act="logout"]').onclick = function () {
      api('logout').catch(function () { });
      clearSession(); render();
    };
    $('[data-act="pw"]').onclick = function () { openChangePassword(false); };
    $('[data-act="help"]').onclick = function () { state.view = 'help'; render(); window.scrollTo(0, 0); };
    $('.topbar .brand').onclick = function () { if (state.view !== 'home' && navItems().some(function (n) { return n[0] === 'home'; })) { state.view = 'home'; render(); } };

    if (state.view === 'none') {
      $('#main').innerHTML = '<div class="card empty"><div><div class="big-stripes"></div><h3>사용할 수 있는 메뉴가 없어요</h3><p class="muted" style="margin:0">관리자에게 메뉴 권한을 요청하세요.</p></div></div>';
      return;
    }
    if (state.view === 'admin' && state.user.role === 'admin') renderAdmin();
    else if (state.view === 'analysis') renderAnalysis();
    else if (state.view === 'bulk') renderBulk();
    else if (state.view === 'history') renderHistory();
    else if (state.view === 'quotes') renderQuotes();
    else if (state.view === 'docs') renderDocs();
    else if (state.view === 'rates') renderRates();
    else if (state.view === 'reqs') renderReqs();
    else if (state.view === 'help') renderHelp();
    else if (state.view === 'home') renderHome();
    else if (state.view === 'info') renderInfo();
    else if (state.view === 'cal') renderCal();
    else if (state.view === 'custs') renderCusts();
    else if (state.view === 'search') renderSearch();
    else if (state.view === 'manual') renderManual();
    else if (state.view === 'inq') renderInq();
    else if (state.view === 'owners') renderOwners();
    else if (state.view === 'report') renderReport();
    else renderCalc();
    syncRoute();
  }

  /* ───────── 로그인 ───────── */

  function renderLogin() {
    app.innerHTML =
      '<div class="login-wrap"><div class="card login-card"><div class="stripe-bar"></div><div class="inner">' +
      '<div class="brand-big"><span class="logo"></span><div><h1>JOIL</h1><p>조일그룹 견적·실적 시스템</p></div></div>' +
      (DEMO ? '<div class="demo-banner"><b>데모 모드</b><span>서버가 연결되지 않아 임의 단가로 동작합니다.<br>아이디 <b>admin</b> / 비밀번호 <b>demo1234</b></span></div>' : '') +
      '<form id="loginForm">' +
      '<div class="field"><label for="lid">아이디</label><input class="input" id="lid" autocomplete="username" required></div>' +
      '<div class="field"><label for="lpw">비밀번호</label><input class="input" id="lpw" type="password" autocomplete="current-password" required></div>' +
      '<div class="section-gap"></div>' +
      '<button class="btn btn-primary btn-lg" type="submit">로그인</button>' +
      '<p class="hint" style="text-align:center;margin:16px 0 0">계정이 없으면 관리자에게 발급을 요청하세요.</p>' +
      '</form></div></div></div>';
    $('#lid').focus();
    $('#loginForm').onsubmit = function (e) {
      e.preventDefault();
      var btn = e.target.querySelector('button[type=submit]');
      busy(btn, true, '확인 중…');
      api('login', { id: $('#lid').value, password: $('#lpw').value }).then(function (r) {
        state.token = r.token; state.user = r.user;
        storage('set', 'joil-token', r.token);
        state.view = defaultView();
        return afterLogin(r.settings);
      }).catch(function (err) {
        busy(btn, false);
        toast(err.message, 'err');
        $('#lpw').value = ''; $('#lpw').focus();
      });
    };
  }

  function openChangePassword(forced) {
    modal({
      eyebrow: forced ? '첫 로그인' : '계정',
      title: forced ? '새 비밀번호를 설정하세요' : '비밀번호 변경',
      locked: forced,
      body:
        (forced ? '<p class="muted small" style="margin:0 0 14px">임시 비밀번호로 로그인했습니다. 계속하려면 비밀번호를 바꿔 주세요.</p>' : '') +
        '<div class="field"><label>현재 비밀번호</label><input class="input" type="password" id="pwCur" autocomplete="current-password"></div>' +
        '<div class="field"><label>새 비밀번호</label><input class="input" type="password" id="pwNew" autocomplete="new-password"><span class="hint">영문 + 숫자 포함 8자 이상</span></div>' +
        '<div class="field"><label>새 비밀번호 확인</label><input class="input" type="password" id="pwNew2" autocomplete="new-password"></div>',
      foot: (forced ? '' : '<button class="btn" data-close>취소</button>') + '<button class="btn btn-primary" id="pwSave">변경</button>',
      onMount: function (m, close) {
        $('#pwSave', m).onclick = function () {
          var a = $('#pwNew', m).value, b = $('#pwNew2', m).value;
          if (a !== b) return toast('새 비밀번호가 서로 다릅니다.', 'err');
          var btn = this;
          busy(btn, true);
          api('changePassword', { current: $('#pwCur', m).value, next: a }).then(function () {
            var wasForced = state.user.mustChange;
            state.user.mustChange = false;
            close(); toast('비밀번호를 변경했습니다.');
            if (wasForced) render();
          }).catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
        };
      }
    });
  }

  /* ───────── 견적 공통 입력 (단건·대량 공용) ───────── */

  function optionsHtml() {
    var c = state.calc;
    var mrOn = prefs().mr;
    return '<div class="row-between" style="margin-bottom:10px"><div class="eyebrow" style="margin:0">Milk-run · 밀크런 (유류비·통행료)</div>' +
      '<label class="toggle small"><input type="checkbox" id="mrOn"' + (mrOn ? ' checked' : '') + '><span class="track"></span>' + (mrOn ? (state.pub.roundTrip ? '왕복' : '편도') + ' 계산' : '계산 안 함') + '</label></div>' +
      '<div id="mrOpts" class="' + (mrOn ? '' : 'hidden') + '">' +
      '<div class="opt-grid">' +
      '<div class="field"><label for="baseTon">기준 톤수</label><select class="input" id="baseTon">' + state.pub.tons.map(function (t) {
        return '<option' + (t === c.baseTon ? ' selected' : '') + '>' + esc(t) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>경유가</label><div class="segmented" id="dieselSeg"><button type="button" data-m="auto" class="' + (c.dieselMode === 'auto' ? 'on' : '') + '">자동</button><button type="button" data-m="manual" class="' + (c.dieselMode === 'manual' ? 'on' : '') + '">직접</button></div></div>' +
      '</div>' +
      '<div class="field ' + (c.dieselMode === 'manual' ? '' : 'hidden') + '" id="dieselField"><input class="input num" id="dieselPrice" type="number" min="0" step="1" value="' + esc(c.dieselPrice) + '" placeholder="원/L" aria-label="경유가 원/L"><span class="hint">원/L 기준 · 밀크런 유류비 계산에만 쓰입니다</span></div>' +
      '<p class="hint ' + (c.dieselMode === 'auto' ? '' : 'hidden') + '" id="dieselHint" style="margin:-4px 0 14px">관리자 설정의 자동 조회(오피넷) 또는 기본값을 사용합니다.</p>' +
      '</div>' + (mrOn ? '' : '<div style="height:10px"></div>') +
      '<div class="row-between" style="margin-bottom:10px"><div class="eyebrow" style="margin:0">Tonnage · 표시할 톤수</div>' +
      '<div><button type="button" class="btn btn-ghost btn-sm" id="tonAll">전체</button><button type="button" class="btn btn-ghost btn-sm" id="tonNone">해제</button></div></div>' +
      '<div class="chips" id="tonChips">' + state.pub.tons.map(function (t) {
        return '<button type="button" class="chip ' + (c.tons.indexOf(t) !== -1 ? 'on' : '') + '" data-t="' + esc(t) + '">' + esc(t) + '</button>';
      }).join('') + '</div>' + specialsHtml();
  }

  /** 특수 추가운임 고르기 (관리자가 금액을 넣은 항목만) + 업체 기준 */
  function specialsHtml() {
    var c = state.calc, list = (state.pub.specials || []).filter(function (sp) { return sp.set; });
    c.specials = (c.specials || []).filter(function (id) { return list.some(function (sp) { return sp.id === id; }); });
    if (!list.length) return state.user.role === 'admin' ? '<p class="hint" style="margin:14px 0 0">특수 추가운임(냉동·리프트 등)은 <b>관리자 → 특수 운임</b>에서 금액을 넣으면 여기서 고를 수 있어요.</p>' : '';
    return '<div class="row-between" style="margin:16px 0 10px;flex-wrap:wrap;gap:8px"><div class="eyebrow" style="margin:0">Special · 특수 추가운임</div>' +
      '<select class="input input-sm" id="spCust" style="width:auto" title="업체별로 다르게 정한 특수운임이 있으면 그 기준으로 계산">' + custOptions() + '</select></div>' +
      '<div class="chips" id="spChips">' + list.map(function (sp) {
        return '<button type="button" class="chip sp-chip ' + (c.specials.indexOf(sp.id) !== -1 ? 'on' : '') + '" data-sp="' + esc(sp.id) + '">' + esc(sp.name) + (sp.mode === 'percent' ? ' %' : '') + '</button>';
      }).join('') + '</div>' + (c.specials.length ? '<p class="hint" style="margin:8px 0 0">고른 특수운임이 톤수별 금액에 더해져요.</p>' : '');
  }
  function custOptions() {
    var c = state.calc, custs = (state.rateCusts || []).filter(function (x) { return x.hasSpecial; });
    return '<option value="">회사 기준</option>' +
      custs.map(function (x) { return '<option value="' + esc(x.cust) + '"' + (c.cust === x.cust ? ' selected' : '') + '>' + esc(x.cust) + ' 기준</option>'; }).join('') +
      (c.cust && !custs.some(function (x) { return x.cust === c.cust; }) ? '<option value="' + esc(c.cust) + '" selected>' + esc(c.cust) + ' 기준</option>' : '');
  }
  function ensureRateCusts(force) {
    if ((state.rateCusts && !force) || state.rateCustsLoading || !can('quote')) return;
    state.rateCustsLoading = true;
    api('rates.list').then(function (r) {
      state.rateCusts = r.custs;
      var sel = $('#spCust'); if (sel) sel.innerHTML = custOptions();
    }).catch(function () { state.rateCusts = state.rateCusts || []; }).then(function () { state.rateCustsLoading = false; });
  }
  function bindSpecials() {
    var c = state.calc;
    $$('#spChips .chip').forEach(function (ch) {
      ch.onclick = function () {
        var id = ch.dataset.sp, i = c.specials.indexOf(id);
        if (i === -1) c.specials.push(id); else c.specials.splice(i, 1);
        ch.classList.toggle('on', i === -1);
      };
    });
    var sel = $('#spCust'); if (sel) sel.onchange = function () { c.cust = this.value; };
  }

  function bindOptions(onTonsChange) {
    var c = state.calc;
    $('#baseTon').onchange = function () { c.baseTon = this.value; };
    $('#mrOn').onchange = function () {
      setPref('mr', this.checked);
      $('#mrOpts').classList.toggle('hidden', !this.checked);
      this.nextElementSibling.nextSibling.textContent = this.checked ? (state.pub.roundTrip ? '왕복' : '편도') + ' 계산' : '계산 안 함';
      onTonsChange();
    };
    $('#dieselPrice').oninput = function () { c.dieselPrice = this.value; };
    $$('#dieselSeg button').forEach(function (b) {
      b.onclick = function () {
        c.dieselMode = b.dataset.m;
        $$('#dieselSeg button').forEach(function (x) { x.classList.toggle('on', x === b); });
        $('#dieselField').classList.toggle('hidden', c.dieselMode !== 'manual');
        $('#dieselHint').classList.toggle('hidden', c.dieselMode !== 'auto');
      };
    });
    function setTons(list) {
      c.tons = list;
      local('set', 'joil-tons', list);
      $$('#tonChips .chip').forEach(function (ch) { ch.classList.toggle('on', list.indexOf(ch.dataset.t) !== -1); });
      onTonsChange();
    }
    $$('#tonChips .chip').forEach(function (ch) {
      ch.onclick = function () {
        var t = ch.dataset.t, list = c.tons.slice(), i = list.indexOf(t);
        if (i === -1) list.push(t); else list.splice(i, 1);
        setTons(state.pub.tons.filter(function (x) { return list.indexOf(x) !== -1; }));
      };
    });
    $('#tonAll').onclick = function () { setTons(state.pub.tons.slice()); };
    $('#tonNone').onclick = function () { setTons([]); };
    bindSpecials();
    ensureRateCusts();
  }

  function quoteOptions() {
    var c = state.calc;
    return { dieselMode: c.dieselMode, dieselPrice: Number(c.dieselPrice), baseTon: c.baseTon, specials: (c.specials || []).slice(), cust: c.specials && c.specials.length ? c.cust || '' : '' };
  }

  function checkOptions() {
    var c = state.calc;
    if (prefs().mr && c.dieselMode === 'manual' && !(Number(c.dieselPrice) > 0)) { toast('경유가를 입력하세요.', 'err'); return false; }
    return true;
  }

  function regionText(r) {
    return r.regionHits.length ? r.regionHits.map(function (h) { return h.point.replace('지', '') + '·' + h.name + ' ' + won(h.amount); }).join(', ') : '';
  }

  /* ───────── 엑셀 (.xlsx) ───────── */

  var xlsxLoading = null;
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxLoading) return xlsxLoading;
    xlsxLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = function () { resolve(window.XLSX); };
      s.onerror = function () { xlsxLoading = null; reject(new Error('엑셀 기능을 불러오지 못했습니다. 인터넷 연결을 확인하세요.')); };
      document.head.appendChild(s);
    });
    return xlsxLoading;
  }

  /** sheets: [{ name, rows: [[...]], widths: [..], moneyFrom: 헤더 다음 줄부터 숫자 칸에 #,##0 }] */
  function downloadXlsx(filename, sheets) {
    return loadXlsx().then(function (X) {
      var wb = X.utils.book_new();
      sheets.forEach(function (sh) {
        var ws = X.utils.aoa_to_sheet(sh.rows);
        if (sh.widths) ws['!cols'] = sh.widths.map(function (w) { return { wch: w }; });
        Object.keys(ws).forEach(function (addr) {
          if (addr.charAt(0) === '!') return;
          var cell = ws[addr];
          if (cell.t === 'n' && Math.abs(cell.v) >= 1000) cell.z = '#,##0';
        });
        X.utils.book_append_sheet(wb, ws, sh.name);
      });
      // writeFile 대신 직접 내려받기 링크를 만들어 파일 이름이 확실히 적용되도록
      var data = X.write(wb, { bookType: 'xlsx', type: 'array' });
      saveBlob(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
    });
  }

  /* ───────── 단건 계산 ───────── */

  function renderCalc() {
    var c = state.calc;
    $('#main').innerHTML =
      '<div class="calc-grid">' +
      '<form class="card" id="calcForm" autocomplete="off">' +
      '<div class="eyebrow">Route · 경로</div><h2 style="margin-bottom:18px">단건 견적</h2>' +
      '<div class="route-inputs">' +
      '<div class="field"><label for="origin"><span class="pin from"></span>상차지</label><input class="input" id="origin" list="addrList" placeholder="예) 경기 평택시 포승읍 평택항로 …" value="' + esc(c.origin) + '"></div>' +
      '<button type="button" class="swap-btn" id="swap" title="상차지·하차지 바꾸기" aria-label="상차지와 하차지 바꾸기">⇅</button>' +
      '<div class="field"><label for="dest"><span class="pin to"></span>하차지</label><input class="input" id="dest" list="addrList" placeholder="예) 부산 강서구 녹산산단 …" value="' + esc(c.dest) + '"></div>' +
      '</div><div class="section-gap"></div>' +
      optionsHtml() +
      '<div class="section-gap"></div><div class="section-gap"></div>' +
      '<button class="btn btn-accent btn-lg" type="submit" id="calcBtn">견적 계산하기</button>' +
      '</form>' +
      '<div id="result"></div></div>';

    $('#origin').oninput = function () { c.origin = this.value; };
    $('#dest').oninput = function () { c.dest = this.value; };
    $('#swap').onclick = function () {
      var o = c.origin; c.origin = c.dest; c.dest = o;
      $('#origin').value = c.origin; $('#dest').value = c.dest;
    };
    bindOptions(function () { if (c.result) renderResult(false); });
    ensureAddrList();

    $('#calcForm').onsubmit = function (e) {
      e.preventDefault();
      if (!c.origin.trim() || !c.dest.trim()) return toast('상차지와 하차지를 모두 입력하세요.', 'err');
      if (!checkOptions()) return;
      var btn = $('#calcBtn');
      busy(btn, true, '경로 조회 중…');
      api('quote', Object.assign({ origin: c.origin, dest: c.dest }, quoteOptions()))
        .then(function (r) {
          if (!r.result.milkrun) throw new Error('서버 코드가 예전 버전입니다. 관리자가 Apps Script 코드를 최신으로 바꾸고 새 버전으로 배포해야 합니다. (SETUP.md "업데이트가 나왔을 때")');
          c.result = r.result; c.recordId = r.recordId || null; c.adj = newAdj(); c.adjEdit = false; renderResult(true);
          addrRemember([[c.origin.trim(), r.result.origin.address], [c.dest.trim(), r.result.dest.address]]);
        })
        .catch(function (err) { toast(err.message, 'err'); })
        .then(function () { busy(btn, false); });
    };

    if (c.result) renderResult(false); else renderEmpty();
  }

  function renderEmpty() {
    $('#result').innerHTML =
      '<div class="card empty" style="--i:1"><div><div class="big-stripes"></div>' +
      '<h3>주소를 넣고 계산해 보세요</h3>' +
      '<p class="muted" style="margin:0">톤수별 운임과 밀크런 유류비·통행료가 한 번에 나옵니다.<br>여러 곳을 한꺼번에 계산하려면 위쪽 <b>대량 계산</b>을 이용하세요.</p>' +
      (DEMO ? '<p class="hint" style="margin-top:14px">데모 모드: 서울, 평택, 부산, 강릉, 목포 같은 도시명으로 시험할 수 있어요.</p>' : '') +
      '</div></div>';
  }

  function milkrunCard(r, i) {
    var m = r.milkrun;
    return '<div class="card milkrun" style="--i:' + i + '">' +
      '<div class="row-between" style="margin-bottom:14px;flex-wrap:wrap"><div><div class="eyebrow">Milk-run · 밀크런</div>' +
      '<h3>기준 ' + esc(m.ton) + ' · ' + (m.roundTrip ? '왕복' : '편도') + '</h3></div>' +
      '<div class="mr-total"><span class="k">유류비 + 통행료</span><span class="num" data-total="' + m.total + '">' + won(m.total) + '</span><span class="small">원</span></div></div>' +
      '<div class="stats">' +
      '<div class="stat"><div class="k">운행 거리</div><div class="v num">' + m.distanceKm + '<span class="small"> km</span></div></div>' +
      '<div class="stat"><div class="k">연비</div><div class="v num">' + m.kmPerL + '<span class="small"> km/L</span></div><div class="s">' + m.liters + 'L 소모</div></div>' +
      '<div class="stat"><div class="k">경유가</div><div class="v num">' + won(m.dieselPrice) + '<span class="small"> 원/L</span></div><div class="s">' + esc(r.dieselSource || '') + '</div></div>' +
      '<div class="stat"><div class="k">유류비</div><div class="v num">' + won(m.fuel) + '<span class="small"> 원</span></div></div>' +
      '<div class="stat"><div class="k">통행료 (' + m.tollClass + '종)</div><div class="v num">' + won(m.toll) + '<span class="small"> 원</span></div></div>' +
      '</div></div>';
  }

  /* ───────── 금액 조정 (행·열·칸) ─────────
   * adj = { rows: { 번호: 금액 }, cols: { 톤수: 금액 }, cells: { '번호|톤수': 최종 금액 } }
   * 최종 금액 = 칸 직접 입력값 ?? (기본 금액 + 행 조정 + 열 조정)
   */
  function newAdj() { return { rows: {}, cols: {}, cells: {} }; }
  function adjOf(h) {
    if (!h.adj) h.adj = newAdj();
    ['rows', 'cols', 'cells'].forEach(function (k) { if (!h.adj[k]) h.adj[k] = {}; });
    return h.adj;
  }
  function adjN(adj) { return adj ? Object.keys(adj.rows || {}).length + Object.keys(adj.cols || {}).length + Object.keys(adj.cells || {}).length : 0; }
  function adjCalc(adj, no, ton, base) { return base + ((adj && adj.rows && adj.rows[no]) || 0) + ((adj && adj.cols && adj.cols[ton]) || 0); }
  function adjPrice(adj, no, ton, base) {
    if (base == null) return null;
    var k = no + '|' + ton;
    if (adj && adj.cells && adj.cells.hasOwnProperty(k)) return adj.cells[k];
    return adjCalc(adj, no, ton, base);
  }
  function specialNames(r) { return (r.specials || []).map(function (sp) { return sp.name; }).join('·') + ((r.specials || []).some(function (sp) { return sp.cust; }) ? ' (' + r.specials[0].cust + ')' : ''); }
  function specialText(r, tons) {
    return (r.specials || []).map(function (sp) {
      var v = tons.filter(function (t) { return Number((sp.values || {})[t]); }).map(function (t) { return t + ' ' + (sp.mode === 'percent' ? sp.values[t] + '%' : '+' + won(sp.values[t])); });
      return sp.name + (sp.cust ? '(' + sp.cust + ')' : '') + ': ' + (v.length ? v.join(', ') : '해당 톤수 금액 없음');
    }).join(' / ');
  }
  function signWon(v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + won(Math.abs(v)); }
  /** 톤수 금액 칸 (보기·조정 모드 공용) */
  function adjTd(adj, edit, no, ton, base, cls) {
    var v = adjPrice(adj, no, ton, base), k = no + '|' + ton;
    var fixed = !!(adj && adj.cells && adj.cells.hasOwnProperty(k)), moved = !fixed && v !== base;
    var tip = fixed ? '직접 입력 · 계산값 ' + won(adjCalc(adj, no, ton, base)) : moved ? '기본 ' + won(base) + ' · 조정 ' + signWon(v - base) : '';
    var c = (cls || '') + (fixed ? ' adj-fix' : moved ? ' adj-on' : '');
    if (edit) return '<td class="' + c + '"' + (tip ? ' title="' + esc(tip) + '"' : '') + '><input class="adj-in adj-cell num" data-k="' + esc(k) + '" value="' + won(v) + '" inputmode="numeric"></td>';
    return '<td class="' + c + '"' + (tip ? ' title="' + esc(tip) + '"' : '') + '>' + won(v) + '</td>';
  }
  /** 보기 설정: 할증 칸 / 밀크런 (기억) */
  function prefs() { var p = local('get', 'joil-prefs') || {}; return { sur: p.sur !== false, mr: p.mr !== false }; }
  function setPref(k, v) { var p = prefs(); p[k] = v; local('set', 'joil-prefs', p); }
  function prefToggles() {
    var p = prefs();
    return '<button type="button" class="chip' + (p.sur ? ' on' : '') + '" data-pref="sur">할증 칸</button>' +
      '<button type="button" class="chip' + (p.mr ? ' on' : '') + '" data-pref="mr">밀크런</button>';
  }
  function bindPrefToggles(box, redraw) {
    $$('[data-pref]', box).forEach(function (b) {
      b.onclick = function () {
        setPref(b.dataset.pref, !prefs()[b.dataset.pref]);
        var sw = $('#mrOn'); // 옵션 칸의 밀크런 스위치도 맞춤
        if (sw && b.dataset.pref === 'mr') { sw.checked = prefs().mr; $('#mrOpts').classList.toggle('hidden', !sw.checked); sw.nextElementSibling.nextSibling.textContent = sw.checked ? (state.pub.roundTrip ? '왕복' : '편도') + ' 계산' : '계산 안 함'; }
        keepView(box, redraw);
      };
    });
  }
  /** 다시 그려도 가로 스크롤 · 화면 위치 · 입력 중인 칸을 그대로 */
  function keepView(box, redraw) {
    var wrap = box.querySelector('.bulk-table, .table-wrap'), sl = wrap ? wrap.scrollLeft : 0, st = wrap ? wrap.scrollTop : 0, y = window.scrollY;
    var a = document.activeElement, key = null;
    if (a && box.contains(a) && a.classList.contains('adj-in')) key = a.classList.contains('adj-cell') ? '.adj-cell[data-k="' + a.dataset.k + '"]' : a.classList.contains('adj-col') ? '.adj-col[data-ton="' + a.dataset.ton + '"]' : '.adj-row[data-no="' + a.dataset.no + '"]';
    redraw();
    var w2 = box.querySelector('.bulk-table, .table-wrap'); if (w2) { w2.scrollLeft = sl; w2.scrollTop = st; }
    window.scrollTo(window.scrollX, y);
    if (key) { var el = box.querySelector(key.replace(/"([^"]*)"/, function (m, v) { return '"' + (window.CSS && CSS.escape ? CSS.escape(v) : v) + '"'; })); if (el) { el.focus({ preventScroll: true }); el.select(); } }
  }
  function adjColTag(adj, ton) { var v = adj && adj.cols && adj.cols[ton]; return v ? '<span class="adj-tag">' + signWon(v) + '</span>' : ''; }
  function adjRowTd(adj, edit, no) {
    var v = (adj && adj.rows && adj.rows[no]) || 0;
    if (edit) return '<td class="adj-rowc"><input class="adj-in adj-row num" data-no="' + no + '" value="' + (v ? signWon(v).replace('−', '-') : '') + '" placeholder="±0" inputmode="numeric"></td>';
    return '<td class="adj-rowc num">' + (v ? '<span class="adj-tag">' + signWon(v) + '</span>' : '<span class="muted">–</span>') + '</td>';
  }
  function adjColInputs(adj, tons) {
    return tons.map(function (t) {
      var v = (adj.cols && adj.cols[t]) || 0;
      return '<th class="adj-colc"><input class="adj-in adj-col num" data-ton="' + esc(t) + '" value="' + (v ? signWon(v).replace('−', '-') : '') + '" placeholder="±0" inputmode="numeric"></th>';
    }).join('');
  }
  function parseWon(s) { s = String(s == null ? '' : s).replace(/[,\s원+]/g, '').replace('−', '-'); if (s === '' || s === '-') return null; var n = Math.round(Number(s)); return isFinite(n) ? n : NaN; }
  /** 조정 입력칸 연결. baseOf(no, ton) → 기본 금액 */
  function bindAdj(box, adj, baseOf, done0) {
    var done = function (k) { setTimeout(function () { if (document.body.contains(box)) done0(k); }, 0); };
    $$('.adj-col', box).forEach(function (el) {
      el.onchange = function () { var v = parseWon(el.value); if (isNaN(v)) return toast('숫자로 입력하세요.', 'err'); if (v) adj.cols[el.dataset.ton] = v; else delete adj.cols[el.dataset.ton]; done('col'); };
    });
    $$('.adj-row', box).forEach(function (el) {
      el.onchange = function () { var v = parseWon(el.value); if (isNaN(v)) return toast('숫자로 입력하세요.', 'err'); if (v) adj.rows[el.dataset.no] = v; else delete adj.rows[el.dataset.no]; done('row'); };
    });
    $$('.adj-cell', box).forEach(function (el) {
      el.onchange = function () {
        var k = el.dataset.k, p = k.split('|'), base = baseOf(p[0], p.slice(1).join('|')), v = parseWon(el.value);
        if (isNaN(v)) return toast('숫자로 입력하세요.', 'err');
        if (v == null || v === adjCalc(adj, p[0], p.slice(1).join('|'), base)) delete adj.cells[k]; else adj.cells[k] = v;
        done('cell');
      };
    });
    $$('.adj-in', box).forEach(function (el) {
      el.onfocus = function () { el.select(); };
      el.onkeydown = function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        // 엑셀처럼 Enter = 아래 칸
        var list = el.classList.contains('adj-cell') ? $$('.adj-cell', box).filter(function (x) { return x.dataset.k.split('|').slice(1).join('|') === el.dataset.k.split('|').slice(1).join('|'); })
          : el.classList.contains('adj-row') ? $$('.adj-row', box) : $$('.adj-col', box);
        var nx = list[list.indexOf(el) + 1];
        if (nx) nx.focus(); else el.blur();
      };
    });
  }
  /** 조정 내용 요약 (기록용) */
  function adjNote(prev, next) {
    prev = prev || newAdj(); next = next || newAdj();
    var out = [];
    var keys = function (o) { return Object.keys(o || {}); };
    keys(Object.assign({}, prev.cols, next.cols)).forEach(function (t) { var a = (prev.cols || {})[t] || 0, b = (next.cols || {})[t] || 0; if (a !== b) out.push(t + ' 열 ' + (b ? signWon(b) : '해제')); });
    keys(Object.assign({}, prev.rows, next.rows)).forEach(function (n) { var a = (prev.rows || {})[n] || 0, b = (next.rows || {})[n] || 0; if (a !== b) out.push(n + '번 행 ' + (b ? signWon(b) : '해제')); });
    var cp = keys(prev.cells), cn = keys(next.cells), ch = 0;
    keys(Object.assign({}, prev.cells, next.cells)).forEach(function (k) { if ((prev.cells || {})[k] !== (next.cells || {})[k]) ch++; });
    if (ch) out.push('칸 직접 입력 ' + ch + '곳 변경 (' + cn.length + '곳 적용 중)');
    if (!out.length) return '변경 없음';
    var s = out.slice(0, 8).join(', ');
    return out.length > 8 ? s + ' 외 ' + (out.length - 8) + '건' : s;
  }
  function adjToolbar(h, edit) {
    var n = adjN(h.adj);
    return '<button type="button" class="btn btn-sm' + (edit ? ' btn-primary' : '') + '" data-act="adjEdit">' + (edit ? '조정 끝내기' : '금액 조정') + '</button>' +
      (n ? '<span class="adj-count">조정 ' + n + '개</span><button type="button" class="btn btn-sm btn-ghost" data-act="adjReset">조정 초기화</button>' : '');
  }
  function bindAdjToolbar(box, h, redraw, changed) {
    var e = $('[data-act="adjEdit"]', box); if (e) e.onclick = function () { h.adjEdit = !h.adjEdit; redraw(); };
    var r = $('[data-act="adjReset"]', box); if (r) r.onclick = function () { if (!confirm('모든 금액 조정을 지울까요?')) return; var a = adjOf(h); a.rows = {}; a.cols = {}; a.cells = {}; changed(); redraw(); };
  }

  function renderResult(animate) {
    renderSingleView(state.calc.result, $('#result'), {
      tons: state.calc.tons, animate: animate, recordId: state.calc.recordId, emptyHint: '왼쪽에서 톤수를 골라 주세요.', hold: state.calc
    });
  }

  /**
   * 단건 결과 화면 (계산 직후 · 조회기록 상세 · 견적모음 상세 공용)
   * opts: { tons, animate, recordId(있으면 "견적으로 저장" 버튼), emptyHint }
   */
  function renderSingleView(r, box, opts) {
    var rows = r.rows.filter(function (row) { return opts.tons.indexOf(row.ton) !== -1; });
    var hold = opts.hold || (opts.hold = {}), adj = adjOf(hold), edit = !!hold.adjEdit;
    var spN = (r.specials || []).length, pf = prefs();
    var showRow = edit || !!adj.rows[1];
    var redraw = function () { renderSingleView(r, box, Object.assign({}, opts, { animate: false })); };
    var onAdj = opts.onAdj || function () { };
    var regionHtml = r.regionHits.length
      ? r.regionHits.map(function (h) { return '<span class="badge region">' + esc(h.point.replace('지', '')) + '·' + esc(h.name) + ' +' + won(h.amount) + '</span>'; }).join('')
      : '<span class="muted">없음</span>';
    var dirHtml = r.direction === '하행'
      ? '<span class="badge down">▼ 하행' + (r.downhillApplied ? ' +' + r.downhillPercent + '%' : '') + '</span>' + (r.downhillApplied ? '' : '<div class="s">할증 미적용</div>')
      : '<span class="badge up">▲ 상행</span>';

    var html =
      '<div class="card summary" style="--i:0">' +
      '<div class="route"><div class="place"><div class="lbl"><span class="pin from"></span>상차지</div><div class="addr">' + esc(r.origin.address) + '</div></div>' +
      '<div class="arrow">→</div>' +
      '<div class="place"><div class="lbl"><span class="pin to"></span>하차지</div><div class="addr">' + esc(r.dest.address) + '</div></div></div>' +
      '<div class="stats">' +
      '<div class="stat"><div class="k">거리</div><div class="v num">' + r.distanceKm + '<span class="small"> km</span></div><div class="s">요금 기준 ' + r.km + 'km</div></div>' +
      '<div class="stat"><div class="k">방향</div><div class="v" style="font-size:15px">' + dirHtml + '</div></div>' +
      '<div class="stat wide"><div class="k">지역 할증 (합산 ' + won(r.regionTotal) + '원)</div><div class="v" style="font-size:14px;font-weight:600">' + regionHtml + '</div></div>' +
      '</div></div>';

    if (r.overMax) {
      html += '<div class="over-max" style="margin-top:16px;animation:rise .45s var(--ease) both"><h3>' + r.maxKm + 'km 초과 — 별도 문의</h3>' +
        '<p class="muted" style="margin:0">요금 기준 거리 ' + r.km + 'km는 타리프 범위를 넘어 톤수별 자동 견적을 낼 수 없습니다. (밀크런 정보는 아래 참고)</p></div>';
    } else {
      html +=
        '<div class="card" style="--i:1;margin-top:16px">' +
        '<div class="row-between" style="margin-bottom:14px;flex-wrap:wrap"><div><div class="eyebrow">Quote · 톤수별 견적</div><h3>' + rows.length + '개 톤수</h3></div>' +
        '<div class="actions">' + '<span class="chips view-tg">' + prefToggles() + '</span>' + adjToolbar(hold, edit) + (opts.recordId ? '<button class="btn btn-sm btn-primary" data-act="saveQuote">견적으로 저장</button>' : '') +
        '<button class="btn btn-sm" data-act="qdoc">견적서</button><button class="btn btn-sm" data-act="copy">회신 문구 복사</button><button class="btn btn-sm" data-act="xlsx">엑셀 저장</button></div></div>' +
        (rows.length ? '<div class="table-wrap"><table class="data qrow' + (edit ? ' adj-editing' : '') + '"><thead><tr>' +
          '<th>거리</th>' + rows.map(function (row) { return '<th>' + esc(row.ton) + adjColTag(adj, row.ton) + '</th>'; }).join('') + (showRow ? '<th>행 조정</th>' : '') +
          (pf.sur ? '<th class="sur">지역할증</th><th class="sur">하행</th>' + (spN ? '<th class="sur">특수운임</th>' : '') : '') +
          '</tr>' + (edit ? '<tr class="adj-head"><th class="adj-lbl">열 조정 →</th>' + adjColInputs(adj, rows.map(function (x) { return x.ton; })) + '<th colspan="' + ((showRow ? 1 : 0) + (pf.sur ? 2 + (spN ? 1 : 0) : 0) || 1) + '"></th></tr>' : '') + '</thead><tbody><tr>' +
          '<td class="num">' + r.distanceKm + '<span class="muted small">km</span></td>' +
          rows.map(function (row) {
            return adjN(adj) || edit ? adjTd(adj, edit, 1, row.ton, row.total, 'total num') : '<td class="total"><span class="num" data-total="' + row.total + '">' + won(row.total) + '</span></td>';
          }).join('') + (showRow ? adjRowTd(adj, edit, 1) : '') +
          (pf.sur ? '<td class="num sur" title="' + esc(regionText(r)) + '">' + (r.regionTotal ? won(r.regionTotal) : '<span class="muted">–</span>') + '</td>' +
            '<td class="num sur">' + (r.downhillApplied ? r.downhillPercent + '%' : '<span class="muted">–</span>') + '</td>' +
            (spN ? '<td class="sp-cell sur" title="' + esc(specialText(r, opts.tons)) + '">' + esc(specialNames(r)) + '</td>' : '') : '') +
          '</tr></tbody></table></div>' + (spN ? '<p class="hint sp-legend">특수운임 · ' + esc(specialText(r, rows.map(function (x) { return x.ton; }))) + '</p>' : '') + (edit ? '<p class="hint adj-hint">금액 칸을 고치면 그 칸만 직접 입력값으로 고정돼요 · 열 조정은 그 톤수에, 행 조정은 모든 톤수에 더해져요 (빼려면 -5000)</p>' : '')
          : '<p class="muted" style="margin:0">선택된 톤수가 없습니다. ' + esc(opts.emptyHint || '') + '</p>') +
        '<p class="hint" style="margin:14px 0 0">톤수별 금액 = 기본타리프 + 기본타리프 × 하행 + 지역할증 (금액 단위 반올림) · 유류비·통행료는 아래 밀크런에 따로 표시 · 엑셀에는 계산식이 들어갑니다</p>' +
        '</div>';
    }
    if (pf.mr) html += '<div style="margin-top:16px">' + milkrunCard(r, 2) + '</div>';

    box.innerHTML = html;
    if (!opts.animate) $$('.card, tr', box).forEach(function (el) { el.style.animation = 'none'; });
    else $$('[data-total]', box).forEach(function (el) { countUp(el, Number(el.dataset.total)); });

    var copyBtn = $('[data-act="copy"]', box), xBtn = $('[data-act="xlsx"]', box), sBtn = $('[data-act="saveQuote"]', box);
    if (sBtn) sBtn.onclick = function () { openSaveQuote(opts.recordId, { name: '', client: '' }, adj); };
    bindAdjToolbar(box, hold, function () { keepView(box, redraw); }, onAdj);
    bindPrefToggles(box, redraw);
    bindAdj(box, adj, function (no, ton) { var x = r.rows.filter(function (y) { return y.ton === ton; })[0]; return x ? x.total : 0; }, function () { onAdj(); keepView(box, redraw); });
    var qdBtn = $('[data-act="qdoc"]', box);
    if (qdBtn) qdBtn.onclick = function () {
      openQuoteDoc({ type: '단건', items: [{ no: 1, result: r }], adj: adj, tons: opts.tons, client: opts.client || '', meta: { baseTon: r.milkrun.ton, roundTrip: r.milkrun.roundTrip, diesel: { price: r.milkrun.dieselPrice } } });
    };
    if (copyBtn) copyBtn.onclick = function () {
      copyText(quoteText(r, rows.map(function (x) { return { ton: x.ton, total: adjPrice(adj, 1, x.ton, x.total) }; }))).then(function () { toast('회신 문구를 복사했습니다.'); });
    };
    if (xBtn) xBtn.onclick = function () {
      exportResultsXlsx(xBtn, [{ no: 1, status: 'ok', result: r }], { adj: adj,
        tons: rows.map(function (x) { return x.ton; }), title: '운임 견적 · ' + r.origin.address + ' → ' + r.dest.address,
        fileName: 'JOIL_견적_' + (opts.fileDate || today()) + '.xlsx', meta: { baseTon: r.milkrun.ton, diesel: { price: r.milkrun.dieselPrice, source: r.dieselSource || '' } }, roundTrip: r.milkrun.roundTrip
      });
    };
  }

  function quoteText(r, rows) {
    var lines = [
      '[운임 견적] ' + today(),
      '상차지: ' + r.origin.address,
      '하차지: ' + r.dest.address,
      '운행거리: 약 ' + r.distanceKm + 'km',
      ''
    ];
    rows.forEach(function (row) { lines.push('· ' + row.ton + ': ' + won(row.total) + '원'); });
    if (state.pub.quoteFooter) { lines.push(''); lines.push(state.pub.quoteFooter); }
    return lines.join('\n');
  }

  /* ───────── 대량 계산 ───────── */

  var BULK_CHUNK = 20;      // 한 번 요청에 보내는 경로 수
  var BULK_PARALLEL = 3;    // 동시에 보내는 요청 수
  var BULK_PAGE = 100;      // 결과 표 한 페이지 줄 수

  function parseBulk() {
    var b = state.bulk;
    var pairs = [], bad = 0;
    function lines(text) { return String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean); }
    if (b.mode === 'one') {
      var o = b.origin.trim();
      lines(b.dests).forEach(function (d) {
        var cell = d.split('\t').filter(function (x) { return x.trim(); });
        d = (cell.length ? cell[cell.length - 1] : d).trim();
        if (/^(하차지|도착지|주소)$/.test(d)) return;
        pairs.push({ origin: o, dest: d });
      });
    } else {
      lines(b.pairsText).forEach(function (l, i) {
        var cells = l.split('\t').map(function (x) { return x.trim(); }).filter(Boolean);
        if (cells.length < 2 && l.indexOf('|') !== -1) cells = l.split('|').map(function (x) { return x.trim(); }).filter(Boolean);
        if (i === 0 && cells.length >= 2 && /상차|출발/.test(cells[0]) && /하차|도착/.test(cells[1])) return;
        if (cells.length < 2) { bad++; return; }
        pairs.push({ origin: cells[cells.length - 2], dest: cells[cells.length - 1] });
      });
    }
    return { pairs: pairs, bad: bad };
  }

  function renderBulk() {
    var b = state.bulk, c = state.calc;
    $('#main').innerHTML =
      '<div class="card" id="bulkForm">' +
      '<div class="row-between" style="flex-wrap:wrap;margin-bottom:18px"><div><div class="eyebrow">Batch · 대량 계산</div><h2>여러 경로 한 번에 계산</h2>' +
      '<p class="muted small" style="margin:6px 0 0">최대 <b>' + won(state.pub.maxRows) + '건</b> · 한 번 조회한 주소와 경로는 저장돼서 다음부터 더 빨라집니다.</p></div>' +
      '<div class="segmented" id="modeSeg"><button type="button" data-m="one" class="' + (b.mode === 'one' ? 'on' : '') + '">상차지 1곳 → 여러 하차지</button><button type="button" data-m="pairs" class="' + (b.mode === 'pairs' ? 'on' : '') + '">상·하차지 2열 붙여넣기</button></div></div>' +
      '<div class="bulk-grid"><div>' +
      (b.mode === 'one'
        ? '<div class="field"><label for="bOrigin"><span class="pin from"></span>상차지</label><input class="input" id="bOrigin" list="addrList" value="' + esc(b.origin) + '" placeholder="예) 경기 평택시 포승읍 평택항로 …"></div>' +
          '<div class="field"><label for="bDests"><span class="pin to"></span>하차지 목록 <span class="muted">(한 줄에 하나, 엑셀 열 복사 가능)</span></label><textarea class="input" id="bDests" placeholder="부산 강서구 녹산산단321로 …&#10;대구 달서구 성서공단로 …&#10;광주 광산구 하남산단 …">' + esc(b.dests) + '</textarea></div>'
        : '<div class="field"><label for="bPairs">엑셀에서 <b>상차지 · 하차지</b> 두 열을 복사해 붙여넣으세요</label><textarea class="input" id="bPairs" placeholder="경기 평택시 …&#9;부산 강서구 …&#10;인천 서구 …&#9;대구 달서구 …">' + esc(b.pairsText) + '</textarea>' +
          '<span class="hint">칸 구분은 탭(엑셀 복사) 또는 | 기호 · 첫 줄이 "상차지/하차지" 제목이면 건너뜁니다</span></div>') +
      '<p class="hint" id="bulkCount" style="margin:-4px 0 0"></p>' +
      '</div><div>' + optionsHtml() +
      '<div class="section-gap"></div><div class="section-gap"></div>' +
      '<div class="actions"><button class="btn btn-accent btn-lg" id="bulkRun" style="flex:1">대량 계산 시작</button>' +
      '<button class="btn btn-lg hidden" id="bulkStop" style="flex:0 0 auto;width:auto">중지</button></div>' +
      '</div></div>' +
      '<div id="bulkProgress" class="progress-wrap hidden"><div class="progress"><div class="bar" id="bulkBar"></div></div><div class="row-between small"><span id="bulkProgText"></span><span class="muted" id="bulkEta"></span></div></div>' +
      '</div>' +
      '<div id="bulkResult" style="margin-top:16px"></div>';

    $$('#modeSeg button').forEach(function (btn) {
      btn.onclick = function () { if (b.running) return; b.mode = btn.dataset.m; renderBulk(); };
    });
    if (b.mode === 'one') {
      $('#bOrigin').oninput = function () { b.origin = this.value; updateCount(); };
      $('#bDests').oninput = function () { b.dests = this.value; updateCount(); };
    } else {
      $('#bPairs').oninput = function () { b.pairsText = this.value; b.client = ''; updateCount(); };
    }
    bindOptions(function () { if (b.results.length) renderBulkResult(); });
    ensureAddrList();
    $('#bulkRun').onclick = function () { startBulk(); };
    $('#bulkStop').onclick = function () { b.cancel = true; this.disabled = true; this.textContent = '중지하는 중…'; };

    function updateCount() {
      var p = parseBulk(), max = Number(state.pub.maxRows) || 1000;
      $('#bulkCount').innerHTML = p.pairs.length
        ? '<b>' + won(p.pairs.length) + '건</b> 인식' + (p.bad ? ' · <span style="color:var(--red)">형식 오류 ' + p.bad + '줄 제외</span>' : '') +
          (p.pairs.length > max ? ' · <span style="color:var(--red)">최대 ' + won(max) + '건을 넘었습니다</span>' : '')
        : (p.bad ? '<span style="color:var(--red)">상차지와 하차지 두 칸이 있는 줄이 없습니다</span>' : '');
    }
    updateCount();
    setRunning(b.running);
    if (b.results.length) renderBulkResult();
  }

  function setRunning(on) {
    var run = $('#bulkRun'), stop = $('#bulkStop');
    if (!run) return;
    run.disabled = on;
    run.innerHTML = on ? '<span class="spinner"></span>계산 중…' : '대량 계산 시작';
    stop.classList.toggle('hidden', !on);
    $('#bulkProgress').classList.toggle('hidden', !on && !state.bulk.results.length);
    $$('#bulkForm input, #bulkForm textarea, #bulkForm select').forEach(function (el) { el.disabled = on; });
  }

  function startBulk() {
    var b = state.bulk;
    if (b.running) return;
    var p = parseBulk(), max = Number(state.pub.maxRows) || 1000;
    if (b.mode === 'one' && !b.origin.trim()) return toast('상차지를 입력하세요.', 'err');
    if (!p.pairs.length) return toast('계산할 경로가 없습니다.', 'err');
    if (p.pairs.length > max) return toast('최대 ' + won(max) + '건까지 계산할 수 있습니다.', 'err');
    if (!checkOptions()) return;
    b.results = p.pairs.map(function (pair, i) { return { no: i + 1, origin: pair.origin, dest: pair.dest, status: 'wait' }; });
    b.page = 0; b.search = ''; b.sort = 'no';
    b.opts = quoteOptions();
    b.meta = null;
    b.recordId = 'B' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    b.adj = newAdj(); b.adjEdit = false;
    runBulk(b.results.slice(), true);
  }

  function retryFailed() {
    var b = state.bulk;
    var rows = b.results.filter(function (r) { return r.status !== 'ok'; });
    if (!rows.length) return;
    rows.forEach(function (r) { r.status = 'wait'; r.error = null; });
    runBulk(rows, false);
  }

  function runBulk(rows, isNew) {
    var b = state.bulk;
    var chunks = [];
    for (var i = 0; i < rows.length; i += BULK_CHUNK) chunks.push(rows.slice(i, i + BULK_CHUNK));
    b.running = true; b.cancel = false;
    b.startedAt = Date.now();
    var done = 0, next = 0, total = rows.length;
    setRunning(true);
    $('#bulkResult').innerHTML = '';
    progress();

    function progress() {
      var pct = total ? Math.round(done / total * 100) : 0;
      var bar = $('#bulkBar'); if (!bar) return;
      bar.style.width = pct + '%';
      var ok = b.results.filter(function (r) { return r.status === 'ok'; }).length;
      var fail = b.results.filter(function (r) { return r.status === 'error'; }).length;
      $('#bulkProgText').innerHTML = '<b>' + won(done) + '</b> / ' + won(total) + '건 (' + pct + '%) · 성공 ' + won(ok) + ' · 실패 ' + won(fail);
      var sec = (Date.now() - b.startedAt) / 1000;
      $('#bulkEta').textContent = done && done < total ? '남은 시간 약 ' + Math.max(1, Math.round(sec / done * (total - done))) + '초' : (done >= total ? Math.round(sec) + '초 걸림' : '');
    }

    function worker(loop) {
      if (b.cancel || next >= chunks.length) return Promise.resolve();
      var idx = next++;
      var chunk = chunks[idx];
      var payload = Object.assign({
        pairs: chunk.map(function (r) { return { no: r.no, origin: r.origin, dest: r.dest }; }),
        batch: { id: b.recordId, index: isNew ? idx : -1, total: chunks.length, count: b.results.length }
      }, b.opts);
      return api('quoteBatch', payload).then(function (res) {
        b.meta = b.meta || { diesel: res.diesel, baseTon: res.baseTon };
        res.items.forEach(function (it, j) {
          var row = chunk[j];
          if (it.error) { row.status = 'error'; row.error = it.error; row.result = null; }
          else { row.status = 'ok'; row.error = null; row.result = it.result; }
        });
      }).catch(function (err) {
        chunk.forEach(function (row) { row.status = 'error'; row.error = err.message; });
        if (/로그인|사용이 중지|관리자/.test(err.message)) b.cancel = true;
      }).then(function () {
        done += chunk.length;
        progress();
        return loop ? worker(true) : null;
      });
    }

    // 첫 묶음을 먼저 보내서(조회 기록 1줄) 끝나면 나머지를 동시에
    var first = worker(false);
    first.then(function () {
      var ws = [];
      for (var k = 0; k < BULK_PARALLEL; k++) ws.push(worker(true));
      return Promise.all(ws);
    }).then(function () {
      b.running = false;
      rows.forEach(function (r) { if (r.status === 'wait') { r.status = 'error'; r.error = '중지됨'; } });
      if (state.view !== 'bulk') return;
      setRunning(false);
      progress();
      renderBulkResult(true);
      var fail = b.results.filter(function (r) { return r.status !== 'ok'; }).length;
      toast(b.cancel ? '계산을 중지했습니다.' : fail ? '완료 · 실패 ' + fail + '건은 다시 시도할 수 있어요.' : '모든 경로를 계산했습니다.', fail && !b.cancel ? 'err' : 'ok');
    });
  }

  function bulkView(b) {
    var q = (b.search || '').trim();
    var list = b.results.filter(function (r) {
      if (b.filter === 'fail' && r.status === 'ok') return false;
      if (!q) return true;
      var t = r.origin + ' ' + r.dest + (r.result ? ' ' + r.result.origin.address + ' ' + r.result.dest.address : '');
      return t.indexOf(q) !== -1;
    });
    var key = b.sort || 'no';
    var dist = function (r) { return r.result ? r.result.distanceKm : Infinity; };
    list.sort(function (x, y) {
      if (key === 'kmAsc') return dist(x) - dist(y);
      if (key === 'kmDesc') return (y.result ? y.result.distanceKm : -1) - (x.result ? x.result.distanceKm : -1);
      if (key === 'mrDesc') return (y.result ? y.result.milkrun.total : -1) - (x.result ? x.result.milkrun.total : -1);
      return x.no - y.no;
    });
    return list;
  }

  function renderBulkResult(animate) {
    var box = $('#bulkResult');
    if (!box) return;
    renderBulkView(state.bulk, box, {
      live: true, animate: animate, tons: state.calc.tons, roundTrip: state.pub.roundTrip, recordId: state.bulk.recordId, client: state.bulk.client || '',
      emptyHint: '표시할 톤수를 위에서 골라 주세요.'
    });
  }

  /**
   * 대량 결과 표 (계산 직후 · 조회기록 상세 · 견적모음 상세 공용)
   * b: { results, meta, page, sort, search, filter, detail, running }
   * opts: { live(실패 재계산 가능), animate, tons, roundTrip, recordId, emptyHint, fileDate, who }
   */
  function renderBulkView(b, box, opts) {
    var again = function () { renderBulkView(b, box, Object.assign({}, opts, { animate: false })); };
    var all = b.results;
    var okRows = all.filter(function (r) { return r.status === 'ok'; });
    var fail = all.length - okRows.length;
    var avg = okRows.length ? Math.round(okRows.reduce(function (s, r) { return s + r.result.distanceKm; }, 0) / okRows.length) : 0;
    var tons = opts.tons;
    var list = bulkView(b);
    var pages = Math.max(1, Math.ceil(list.length / BULK_PAGE));
    if (b.page >= pages) b.page = 0;
    var pageRows = list.slice(b.page * BULK_PAGE, (b.page + 1) * BULK_PAGE);
    var meta = b.meta || {};
    var mrTon = meta.baseTon || '';
    var adj = adjOf(b), edit = !!b.adjEdit && !b.running, onAdj = opts.onAdj || function () { };
    var showRow = edit || Object.keys(adj.rows).length > 0;
    var hasSp = all.some(function (x) { return x.result && (x.result.specials || []).length; });
    var pf = prefs(), nSur = pf.sur ? 2 + (hasSp ? 1 : 0) : 0, nMr = pf.mr ? 3 : 0, two = !!(nSur || nMr), rs = two ? ' rowspan="2"' : '';

    var head1 = '<tr><th class="sticky c0"' + rs + '>#</th><th class="sticky c1 left"' + rs + '>상차지</th><th class="sticky c2 left"' + rs + '>하차지</th><th' + rs + '>거리</th>' +
      tons.map(function (t) { return '<th' + rs + ' class="grp">' + esc(t) + adjColTag(adj, t) + '</th>'; }).join('') + (showRow ? '<th' + rs + ' class="adj-rowc">행 조정</th>' : '') +
      (nSur ? '<th colspan="' + nSur + '" class="grp sur">할증</th>' : '') + (nMr ? '<th colspan="3" class="grp mr">밀크런 · ' + esc(mrTon) + ' ' + (opts.roundTrip ? '왕복' : '편도') + '</th>' : '') + '</tr>';
    var head2 = (two ? '<tr>' + (nSur ? '<th class="sur">지역</th><th class="sur">하행</th>' + (hasSp ? '<th class="sur">특수</th>' : '') : '') + (nMr ? '<th class="mr">유류비</th><th class="mr">통행료</th><th class="mr">합계</th>' : '') + '</tr>' : '') +
      (edit ? '<tr class="adj-head' + (two ? ' r3' : ' r2') + '"><th class="sticky c0"></th><th class="sticky c1"></th><th class="sticky c2 adj-lbl">열 조정 → 그 톤수 전체에 더하기</th><th class="adj-lbl small">(빼기 -)</th>' + adjColInputs(adj, tons) + '<th colspan="' + ((showRow ? 1 : 0) + nSur + nMr || 1) + '"></th></tr>' : '');
    var colCount = 4 + tons.length + (showRow ? 1 : 0) + nSur + nMr;

    var body = pageRows.map(function (row) {
      var start = '<td class="sticky c0 muted num">' + row.no + (row.added ? '<div class="added-tag" title="' + esc(row.added.at + ' · ' + row.added.by) + '">추가</div>' : '') + '</td>';
      if (row.status !== 'ok') {
        return '<tr class="err">' + start + '<td class="sticky c1"><div class="addr-in">' + esc(row.origin) + '</div></td>' +
          '<td class="sticky c2"><div class="addr-in">' + esc(row.dest) + '</div></td>' +
          '<td colspan="' + (colCount - 3) + '" class="left err-msg">⚠ ' + esc(row.error || '대기 중') + '</td></tr>';
      }
      var r = row.result, m = r.milkrun;
      var byTon = {};
      r.rows.forEach(function (x) { byTon[x.ton] = x; });
      return '<tr>' + start +
        '<td class="sticky c1"><div class="addr">' + esc(r.origin.address) + '</div>' + (r.origin.address !== row.origin ? '<div class="addr-in">' + esc(row.origin) + '</div>' : '') + '</td>' +
        '<td class="sticky c2"><div class="addr">' + esc(r.dest.address) + '</div>' + (r.dest.address !== row.dest ? '<div class="addr-in">' + esc(row.dest) + '</div>' : '') + '</td>' +
        '<td class="num">' + r.distanceKm + '<span class="muted small">km</span></td>' +
        tons.map(function (t) {
          var x = byTon[t];
          if (r.overMax) return '<td class="muted small">별도 문의</td>';
          if (!x || x.total == null) return '<td>–</td>';
          return adjTd(adj, edit, row.no, t, x.total, 'num strong total-cell');
        }).join('') + (showRow ? adjRowTd(adj, edit, row.no) : '') +
        (nSur ? '<td class="num sur" title="' + esc(regionText(r)) + '">' + (r.regionTotal ? won(r.regionTotal) : '<span class="muted">–</span>') + '</td>' +
          '<td class="num sur">' + (r.downhillApplied ? r.downhillPercent + '%' : '<span class="muted">–</span>') + '</td>' +
          (hasSp ? '<td class="sp-cell small sur" title="' + esc(specialText(r, tons)) + '">' + ((r.specials || []).length ? esc(specialNames(r)) : '<span class="muted">–</span>') + '</td>' : '') : '') +
        (nMr ? '<td class="num mr">' + won(m.fuel) + '</td><td class="num mr">' + won(m.toll) + '</td><td class="num mr strong">' + won(m.total) + '</td>' : '') + '</tr>';
    }).join('');

    box.innerHTML =
      '<div class="card" style="--i:0">' +
      '<div class="row-between" style="flex-wrap:wrap;margin-bottom:14px"><div><div class="eyebrow">Result · 대량 결과</div>' +
      '<h3>' + won(all.length) + '건 · <span style="color:var(--green)">성공 ' + won(okRows.length) + '</span>' + (fail ? ' · <span style="color:var(--red)">실패 ' + won(fail) + '</span>' : '') + '</h3>' +
      '<p class="muted small" style="margin:4px 0 0">평균 거리 ' + won(avg) + 'km' + (meta.diesel ? ' · 경유가 ' + won(meta.diesel.price) + '원/L (' + esc(meta.diesel.source) + ')' : '') + ' · 톤수별 금액 = 기본타리프 + 기본타리프 × 하행 + 지역할증</p></div>' +
      '<div class="actions">' + (opts.live && fail && !b.running ? '<button class="btn btn-sm btn-danger" data-act="retry">실패 ' + won(fail) + '건 다시 계산</button>' : '') +
      (opts.recordId && !b.running ? '<button class="btn btn-sm" data-act="saveQuote">견적으로 저장</button>' : '') +
      (!b.running && okRows.length ? '<button class="btn btn-sm" data-act="qdoc">견적서</button>' : '') +
      '<button class="btn btn-sm btn-primary" data-act="xlsx"' + (okRows.length ? '' : ' disabled') + '>엑셀 다운로드</button></div></div>' +
      '<div class="toolbar">' +
      '<input class="input input-sm" data-el="search" placeholder="주소 검색" value="' + esc(b.search || '') + '" style="max-width:240px">' +
      '<select class="input input-sm" data-el="sort" style="width:auto"><option value="no">입력 순서</option><option value="kmAsc">거리 가까운 순</option><option value="kmDesc">거리 먼 순</option><option value="mrDesc">밀크런 금액 큰 순</option></select>' +
      '<div class="segmented" data-el="filter"><button type="button" data-f="all" class="' + (b.filter !== 'fail' ? 'on' : '') + '">전체</button><button type="button" data-f="fail" class="' + (b.filter === 'fail' ? 'on' : '') + '">실패만</button></div>' +
      '<div class="chips view-tg">' + prefToggles() + '</div>' +
      (!b.running && okRows.length ? '<div class="actions adj-bar">' + adjToolbar(b, edit) + '</div>' : '') +
      '</div>' + (edit ? '<p class="hint adj-hint">금액 칸을 고치면 그 칸만 직접 입력값으로 고정돼요 · 행 조정은 그 경로 모든 톤수, 열 조정은 그 톤수 모든 경로에 더해져요 · 입력 후 Enter</p>' : '') +
      (tons.length ? '' : '<p class="hint" style="margin:0 0 10px">' + esc(opts.emptyHint || '') + '</p>') +
      '<div class="bulk-table"><table class="data bulk' + (edit ? ' adj-editing' : '') + '"><thead>' + head1 + head2 + '</thead><tbody>' + (body || '<tr><td colspan="' + colCount + '" class="left muted" style="padding:24px">조건에 맞는 결과가 없습니다.</td></tr>') + '</tbody></table></div>' +
      (pages > 1 ? '<div class="pager" style="margin-top:12px">' + Array.apply(null, { length: pages }).map(function (_, p) {
        return '<button data-p="' + p + '" class="' + (p === b.page ? 'on' : '') + '">' + (p * BULK_PAGE + 1) + '–' + Math.min(list.length, (p + 1) * BULK_PAGE) + '</button>';
      }).join('') + '</div>' : '') +
      '</div>';

    if (!opts.animate) $$('.card', box).forEach(function (el) { el.style.animation = 'none'; });
    var sortEl = $('[data-el="sort"]', box);
    sortEl.value = b.sort || 'no';
    sortEl.onchange = function () { b.sort = this.value; b.page = 0; again(); };
    var st;
    $('[data-el="search"]', box).oninput = function () {
      var v = this.value; clearTimeout(st);
      st = setTimeout(function () { b.search = v; b.page = 0; again(); var el = $('[data-el="search"]', box); el.focus(); el.setSelectionRange(v.length, v.length); }, 250);
    };
    $$('[data-el="filter"] button', box).forEach(function (x) { x.onclick = function () { b.filter = x.dataset.f; b.page = 0; again(); }; });
    $$('.pager button', box).forEach(function (x) { x.onclick = function () { b.page = Number(x.dataset.p); again(); box.scrollIntoView({ behavior: 'smooth', block: 'start' }); }; });
    var rt = $('[data-act="retry"]', box); if (rt) rt.onclick = retryFailed;
    var sv = $('[data-act="saveQuote"]', box); if (sv) sv.onclick = function () { openSaveQuote(opts.recordId, { name: '', client: opts.client || '' }, adj); };
    bindAdjToolbar(box, b, function () { keepView(box, again); }, onAdj);
    bindPrefToggles(box, again);
    var byNo = {}; all.forEach(function (x) { if (x.result) byNo[x.no] = x.result; });
    bindAdj(box, adj, function (no, ton) { var rr = byNo[no], x = rr && rr.rows.filter(function (y) { return y.ton === ton; })[0]; return x ? x.total : 0; }, function () { onAdj(); keepView(box, again); });
    $('[data-act="xlsx"]', box).onclick = function () { exportBulk(this, b, opts); };
    var qd = $('[data-act="qdoc"]', box);
    if (qd) qd.onclick = function () {
      var first = okRows[0] && okRows[0].result.milkrun;
      openQuoteDoc({ type: '대량', items: bulkView(Object.assign({}, b, { filter: 'all', search: '' })), adj: adj, tons: tons, client: opts.client || '',
        meta: { baseTon: meta.baseTon || (first && first.ton), roundTrip: first ? first.roundTrip : opts.roundTrip, diesel: meta.diesel || (first && { price: first.dieselPrice }) } });
    };
  }

  function exportBulk(btn, b, opts) {
    exportResultsXlsx(btn, b.results, {
      tons: opts.tons, adj: b.adj, title: '대량 운임 견적 · ' + won(b.results.length) + '건', meta: b.meta || {}, roundTrip: opts.roundTrip, when: opts.when, who: opts.who,
      fileName: 'JOIL_대량견적_' + (opts.fileDate || today()) + '_' + b.results.length + '건.xlsx'
    });
  }


  /* ───────── 견적으로 저장 ───────── */

  var QUOTE_STATUS = ['작성', '제출', '수주', '미수주'];

  function statusPill(st) {
    return '<span class="qstatus s-' + (QUOTE_STATUS.indexOf(st) + 1) + '">' + esc(st || '작성') + '</span>';
  }

  function quoteFieldsHtml(q) {
    return '<div class="field"><label>견적명 <span style="color:var(--red)">*</span></label><input class="input" data-f="name" maxlength="100" value="' + esc(q.name || '') + '" placeholder="예) A견적 · 평택→전국 5톤"></div>' +
      '<div class="field"><label>거래처</label><input class="input" data-f="client" maxlength="100" value="' + esc(q.client || '') + '" placeholder="예) 쿠팡, 삼다수"></div>' +
      '<div class="field"><label>진행 상태</label><div class="segmented" data-f="status">' + QUOTE_STATUS.map(function (st) {
        return '<button type="button" data-v="' + st + '" class="' + ((q.status || '작성') === st ? 'on' : '') + '">' + st + '</button>';
      }).join('') + '</div></div>' +
      '<div class="field"><label>메모</label><textarea class="input memo" data-f="memo" maxlength="2000" placeholder="조건, 특이사항, 제출 금액 등">' + esc(q.memo || '') + '</textarea></div>';
  }

  function bindQuoteFields(root) {
    $$('[data-f="status"] button', root).forEach(function (b) {
      b.onclick = function () { $$('[data-f="status"] button', root).forEach(function (x) { x.classList.toggle('on', x === b); }); };
    });
    return function () {
      var on = $('[data-f="status"] button.on', root);
      return { name: $('[data-f="name"]', root).value.trim(), client: $('[data-f="client"]', root).value.trim(), memo: $('[data-f="memo"]', root).value, status: on ? on.dataset.v : '작성' };
    };
  }

  function openSaveQuote(recordId, defaults, adj) {
    var hasAdj = adjN(adj) > 0;
    modal({
      eyebrow: '견적모음', title: '견적으로 저장',
      body: '<p class="muted small" style="margin:0 0 14px">지금 보이는 결과(그때 금액 그대로)를 견적모음에 보관합니다. 기간 제한 없이 남아요.' + (hasAdj ? ' <b>금액 조정 ' + adjN(adj) + '개도 같이 저장돼요.</b>' : '') + '</p>' + quoteFieldsHtml(defaults || {}),
      foot: '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="qSave">저장</button>',
      onMount: function (m, close) {
        var read = bindQuoteFields(m);
        $('#qSave', m).onclick = function () {
          var f = read();
          if (!f.name) return toast('견적명을 입력하세요.', 'err');
          var btn = this; busy(btn, true, '저장 중…');
          api('quotes.save', Object.assign({ recordId: recordId }, f, hasAdj ? { adj: adj, adjNote: adjNote(null, adj) } : {})).then(function () {
            close();
            state.quotes.list = null;
            toast('견적모음에 저장했습니다.');
          }).catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
        };
      }
    });
  }

  /* ───────── 스냅샷 보기 (조회기록·견적모음 상세 공용) ───────── */

  function snapshotInfoHtml(meta) {
    return '<div class="snap-info">' +
      '<span><b>조회</b> ' + esc(meta.at) + '</span>' +
      '<span><b>조회자</b> ' + esc(meta.user ? meta.user.name + ' (' + meta.user.id + ')' : '') + '</span>' +
      '<span><b>밀크런</b> ' + esc(meta.baseTon || '') + ' · ' + (meta.roundTrip ? '왕복' : '편도') + '</span>' +
      '<span><b>경유가</b> ' + (meta.diesel ? won(meta.diesel.price) + '원/L (' + esc(meta.diesel.source) + ')' : '–') + '</span>' +
      '<span><b>단가 기준</b> ' + (meta.ver ? '타리프 버전 ' + esc(meta.ver.slice(0, 7)) + (meta.verAt ? ' (' + esc(String(meta.verAt).slice(0, 10)) + '부터)' : '') : '<span class="muted">' + esc(meta.verNote || '버전 기록 이전') + '</span>') + '</span>' +
      '</div>';
  }

  /** 스냅샷 본문을 box에 그립니다. 금액은 저장 당시 그대로. */
  function renderSnapshot(meta, items, box, holder, recordId, client, extra) {
    var tons = meta.tons || state.pub.tons;
    var onAdj = extra && extra.onAdj;
    adjOf(holder);
    var fileDate = String(meta.at || '').slice(0, 10) || today();
    if (meta.type === '단건') {
      var it = items[0];
      if (!it || !it.result) { box.innerHTML = '<div class="card muted">결과가 없습니다.</div>'; return; }
      renderSingleView(it.result, box, { tons: tons, animate: false, recordId: recordId, fileDate: fileDate, client: client, hold: holder, onAdj: onAdj });
      return;
    }
    if (!holder.bulk) {
      holder.bulk = {
        results: items.map(function (x) { return { no: x.no, origin: x.origin, dest: x.dest, status: x.result ? 'ok' : 'error', result: x.result, error: x.error, added: x.added }; }),
        meta: { baseTon: meta.baseTon, diesel: meta.diesel }, page: 0, sort: 'no', search: '', filter: 'all', detail: true, running: false
      };
    }
    holder.bulk.adj = holder.adj; // 같은 조정 객체를 같이 씀
    renderBulkView(holder.bulk, box, {
      live: false, animate: false, tons: tons, roundTrip: meta.roundTrip, recordId: recordId, fileDate: fileDate, client: client, onAdj: onAdj,
      when: meta.at, who: meta.user ? meta.user.name + ' (' + meta.user.id + ')' : ''
    });
  }

  /** 그때 경로 그대로 현재 단가로 다시 계산 → 단건/대량 화면으로 이동해서 바로 실행 */
  function recalcNow(meta, items) {
    if (meta.type === '단건') {
      var it = items[0];
      state.calc.origin = it.origin; state.calc.dest = it.dest;
      if (state.pub.tons.indexOf(meta.baseTon) !== -1) state.calc.baseTon = meta.baseTon;
      state.calc.result = null;
      state.view = 'calc'; render();
      $('#calcForm').requestSubmit ? $('#calcForm').requestSubmit() : $('#calcBtn').click();
      return;
    }
    var b = state.bulk;
    if (b.running) return toast('대량 계산이 진행 중입니다. 끝난 뒤 다시 시도하세요.', 'err');
    b.mode = 'pairs';
    b.pairsText = items.map(function (x) { return x.origin + '\t' + x.dest; }).join('\n');
    if (state.pub.tons.indexOf(meta.baseTon) !== -1) state.calc.baseTon = meta.baseTon;
    b.results = [];
    state.view = 'bulk'; render();
    startBulk();
  }

  /* ───────── 조회기록 ───────── */

  function renderHistory() {
    syncRoute();
    var h = state.hist;
    if (h.detail) return renderHistoryDetail();
    var isAdmin = state.user.role === 'admin';
    $('#main').innerHTML =
      '<div class="card">' +
      '<div class="row-between" style="flex-wrap:wrap;margin-bottom:14px"><div><div class="eyebrow">History · 조회기록</div><h2>' + (isAdmin ? '전체 조회기록' : '내 조회기록') + '</h2>' +
      '<p class="muted small" style="margin:6px 0 0">상세보기에서 그때 결과를 그대로 다시 볼 수 있어요. 상세 내용은 조회 후 <b>' + esc(state.pub.retentionDays || 90) + '일</b>간 보관되고, 견적모음에 저장하면 계속 남습니다.</p></div>' +
      '<button class="btn btn-sm" id="hReload">새로고침</button></div>' +
      '<div class="toolbar">' +
      '<div class="segmented" id="hDays">' + [[7, '7일'], [30, '30일'], [90, '90일'], [0, '전체']].map(function (d) {
        return '<button type="button" data-d="' + d[0] + '" class="' + (h.days === d[0] ? 'on' : '') + '">' + d[1] + '</button>';
      }).join('') + '</div>' +
      '<select class="input input-sm" id="hType" style="width:auto"><option value="">단건+대량</option><option value="단건">단건</option><option value="대량">대량</option></select>' +
      (isAdmin ? '<select class="input input-sm" id="hUser" style="width:auto"><option value="">전체 사용자</option>' + (h.users || []).map(function (u) {
        return '<option value="' + esc(u.id) + '">' + esc(u.name) + ' (' + esc(u.id) + ')</option>';
      }).join('') + '</select>' : '') +
      '<input class="input input-sm" id="hSearch" placeholder="주소·이름 검색 후 Enter" value="' + esc(h.q) + '" style="max-width:260px">' +
      '</div><div id="hList"></div></div>';

    $('#hType').value = h.type;
    if (isAdmin) $('#hUser').value = h.userId;
    $$('#hDays button').forEach(function (b) { b.onclick = function () { h.days = Number(b.dataset.d); loadHistory(); }; });
    $('#hType').onchange = function () { h.type = this.value; loadHistory(); };
    if (isAdmin) $('#hUser').onchange = function () { h.userId = this.value; loadHistory(); };
    $('#hSearch').onkeydown = function (e) { if (e.key === 'Enter') { h.q = this.value.trim(); loadHistory(); } };
    $('#hReload').onclick = function () { loadHistory(); };
    if (h.logs) drawHistoryList(); else loadHistory();
  }

  function loadHistory() {
    syncRoute();
    var h = state.hist;
    $$('#hDays button').forEach(function (b) { b.classList.toggle('on', Number(b.dataset.d) === h.days); });
    var list = $('#hList'); if (list) list.innerHTML = '<p class="muted"><span class="spinner dark"></span> 불러오는 중…</p>';
    api('history.list', { days: h.days, type: h.type, userId: h.userId, q: h.q }).then(function (r) {
      h.logs = r.logs;
      if (r.users) {
        var hadUsers = !!h.users; h.users = r.users;
        if (!hadUsers && state.view === 'history' && !h.detail) return renderHistory();
      }
      if (state.view === 'history' && !h.detail) drawHistoryList();
    }).catch(function (err) {
      var l = $('#hList'); if (l) l.innerHTML = '<p style="color:var(--red)">' + esc(err.message) + '</p>';
    });
  }

  function drawHistoryList() {
    var h = state.hist, isAdmin = state.user.role === 'admin';
    var list = $('#hList'); if (!list) return;
    if (!h.logs.length) { list.innerHTML = '<p class="muted" style="margin:18px 0 4px">조건에 맞는 기록이 없습니다.</p>'; return; }
    list.innerHTML = '<div class="table-wrap"><table class="data hist"><thead><tr><th>일시</th>' + (isAdmin ? '<th class="left">사용자</th>' : '') +
      '<th class="left">종류</th><th class="left">상차지</th><th class="left">하차지</th><th>거리</th><th></th></tr></thead><tbody>' +
      h.logs.map(function (l, i) {
        var type = l.type || (/^대량/.test(l.note || '') ? '대량' : '단건');
        return '<tr style="--i:' + Math.min(i, 20) + '"><td class="small muted">' + esc(l.at) + '</td>' +
          (isAdmin ? '<td class="left">' + esc(l.name) + ' <span class="muted small">' + esc(l.id) + '</span></td>' : '') +
          '<td class="left"><span class="badge ' + (type === '대량' ? 'down' : 'up') + '">' + type + (type === '대량' && l.count ? ' ' + won(l.count) + '건' : '') + '</span></td>' +
          '<td class="left wrap">' + esc(l.from) + '</td><td class="left wrap">' + esc(l.to) + '</td>' +
          '<td class="num">' + (l.km === '' || l.km == null ? '–' : esc(l.km) + 'km') + '</td>' +
          '<td><div class="actions" style="justify-content:flex-end;flex-wrap:nowrap">' +
          (l.hasSnapshot
            ? '<button class="btn btn-sm" data-open="' + esc(l.recordId) + '">상세보기</button><button class="btn btn-sm btn-ghost" data-save="' + esc(l.recordId) + '">견적 저장</button>'
            : '<span class="small muted">' + (l.recordId ? '보관 기간 지남' : '상세 없음') + '</span>') +
          '</div></td></tr>';
      }).join('') + '</tbody></table></div>' +
      (h.logs.length >= 300 ? '<p class="hint">최근 300건까지 표시합니다. 기간이나 검색으로 좁혀 보세요.</p>' : '');
    $$('[data-open]', list).forEach(function (b) { b.onclick = function () { h.detail = b.dataset.open; h.detailData = null; renderHistory(); window.scrollTo(0, 0); }; });
    $$('[data-save]', list).forEach(function (b) { b.onclick = function () { openSaveQuote(b.dataset.save, {}); }; });
  }

  function renderHistoryDetail() {
    var h = state.hist;
    $('#main').innerHTML =
      '<div class="row-between" style="margin-bottom:14px;flex-wrap:wrap"><button class="btn btn-sm" id="hBack">← 조회기록</button><div class="actions" id="hActs"></div></div>' +
      '<div id="hHead"></div><div id="hBody"><div class="card muted"><span class="spinner dark"></span> 그때 결과를 불러오는 중…</div></div>';
    $('#hBack').onclick = function () { h.detail = null; h.detailData = null; renderHistory(); };
    var id = h.detail;
    var show = function (d) {
      if (state.view !== 'history' || h.detail !== id) return;
      $('#hHead').innerHTML = '<div class="card" style="margin-bottom:16px"><div class="eyebrow">Snapshot · 그때 결과</div><h3>' +
        esc(d.meta.type === '대량' ? '대량 ' + won(d.items.length) + '건 · ' + d.log.from : d.log.from + ' → ' + d.log.to) + '</h3>' + snapshotInfoHtml(d.meta) +
        '<p class="hint" style="margin:10px 0 0">아래 금액은 조회 당시 단가 기준입니다. 지금 단가로 보려면 "현재 단가로 다시 계산"을 누르세요.</p></div>';
      $('#hActs').innerHTML = '<button class="btn btn-sm" id="hRecalc">현재 단가로 다시 계산</button>';
      $('#hRecalc').onclick = function () { recalcNow(d.meta, d.items); };
      renderSnapshot(d.meta, d.items, $('#hBody'), d, id);
    };
    if (h.detailData) return show(h.detailData);
    api('history.get', { recordId: id }).then(function (d) { h.detailData = d; show(d); }).catch(function (err) {
      if (h.detail === id) $('#hBody').innerHTML = '<div class="card"><p style="margin:0">' + esc(err.message) + '</p></div>';
    });
  }

  /* ───────── 견적모음 ───────── */

  function renderQuotes() {
    syncRoute();
    var qs = state.quotes;
    if (qs.detail) return renderQuoteDetail();
    var isAdmin = state.user.role === 'admin';
    $('#main').innerHTML =
      '<div class="card">' +
      '<div class="row-between" style="flex-wrap:wrap;margin-bottom:14px"><div><div class="eyebrow">Quotes · 견적모음</div><h2>' + (isAdmin ? '전체 견적모음' : '내 견적모음') + '</h2>' +
      '<p class="muted small" style="margin:6px 0 0">계산 결과나 조회기록에서 <b>견적으로 저장</b>한 것들이 여기에 쌓입니다. 저장 당시 금액 그대로 보관돼요.</p></div>' +
      '<button class="btn btn-sm" id="qReload">새로고침</button></div>' +
      '<div class="toolbar">' +
      '<div class="segmented" id="qStatus">' + [''].concat(QUOTE_STATUS).map(function (st) {
        return '<button type="button" data-s="' + st + '" class="' + (qs.status === st ? 'on' : '') + '">' + (st || '전체') + '</button>';
      }).join('') + '</div>' +
      '<input class="input input-sm" id="qSearch" placeholder="견적명·거래처·메모·주소 검색" value="' + esc(qs.q) + '" style="max-width:280px">' +
      '</div><div id="qList"></div></div>';
    $$('#qStatus button').forEach(function (b) {
      b.onclick = function () { qs.status = b.dataset.s; $$('#qStatus button').forEach(function (x) { x.classList.toggle('on', x === b); }); drawQuoteList(); };
    });
    var st;
    $('#qSearch').oninput = function () { var v = this.value; clearTimeout(st); st = setTimeout(function () { qs.q = v.trim(); drawQuoteList(); }, 200); };
    $('#qReload').onclick = function () { qs.list = null; loadQuotes(); };
    if (qs.list) drawQuoteList(); else loadQuotes();
  }

  function loadQuotes() {
    var l = $('#qList'); if (l) l.innerHTML = '<p class="muted"><span class="spinner dark"></span> 불러오는 중…</p>';
    api('quotes.list').then(function (r) {
      state.quotes.list = r.quotes;
      if (state.view === 'quotes' && !state.quotes.detail) drawQuoteList();
    }).catch(function (err) { var x = $('#qList'); if (x) x.innerHTML = '<p style="color:var(--red)">' + esc(err.message) + '</p>'; });
  }

  function drawQuoteList() {
    syncRoute();
    var qs = state.quotes, isAdmin = state.user.role === 'admin';
    var list = $('#qList'); if (!list || !qs.list) return;
    var q = qs.q;
    var items = qs.list.filter(function (x) {
      if (qs.status && x.status !== qs.status) return false;
      return !q || (x.name + ' ' + x.client + ' ' + x.memo + ' ' + x.from + ' ' + x.to + ' ' + x.userName).indexOf(q) !== -1;
    });
    var counts = {};
    qs.list.forEach(function (x) { counts[x.status] = (counts[x.status] || 0) + 1; });
    $$('#qStatus button').forEach(function (b) {
      var n = b.dataset.s ? counts[b.dataset.s] || 0 : qs.list.length;
      b.innerHTML = (b.dataset.s || '전체') + ' <span class="cnt">' + n + '</span>';
    });
    if (!items.length) { list.innerHTML = '<p class="muted" style="margin:18px 0 4px">' + (qs.list.length ? '조건에 맞는 견적이 없습니다.' : '아직 저장한 견적이 없어요. 계산 결과에서 <b>견적으로 저장</b>을 눌러 보세요.') + '</p>'; return; }
    list.innerHTML = '<div class="qgrid">' + items.map(function (x, i) {
      return '<button class="qcard" style="--i:' + Math.min(i, 12) + '" data-id="' + esc(x.id) + '">' +
        '<div class="row-between"><span class="qname">' + esc(x.name) + '</span>' + statusPill(x.status) + '</div>' +
        (x.client ? '<div class="qclient">' + esc(x.client) + '</div>' : '') +
        '<div class="qroute"><span class="pin from"></span>' + esc(x.from) + '<br><span class="pin to"></span>' + esc(x.to) + '</div>' +
        (x.memo ? '<div class="qmemo">' + esc(x.memo) + '</div>' : '') +
        '<div class="qfoot"><span class="badge ' + (x.type === '대량' ? 'down' : 'up') + '">' + esc(x.type) + (x.type === '대량' ? ' ' + won(x.count) + '건' : '') + '</span>' +
        '<span>' + (isAdmin ? esc(x.userName) + ' · ' : '') + esc(String(x.savedAt).slice(0, 10)) + '</span></div></button>';
    }).join('') + '</div>';
    $$('.qcard', list).forEach(function (c) { c.onclick = function () { qs.detail = c.dataset.id; qs.detailData = null; renderQuotes(); window.scrollTo(0, 0); }; });
  }

  /** 저장된 견적에 구간 추가 (견적 낼 때 기준 그대로 계산) */
  function openAddRoutes(id, d, done) {
    var first = (d.items[0] || {}).origin || '';
    modal({
      eyebrow: '견적모음', title: '구간 추가 · ' + d.quote.name,
      body: '<p class="muted small" style="margin:0 0 12px">' + (d.meta.ver
        ? '이 견적을 낼 때의 <b>타리프·할증 기준</b>(버전 ' + esc(d.meta.ver.slice(0, 7)) + ')과 같은 밀크런 기준·경유가로 계산해서 마지막 행에 붙여요. 지금 타리프가 바뀌었어도 그때 기준으로 계산돼요.'
        : '이 견적은 버전 기록 기능이 생기기 전에 저장돼서, 추가 구간은 <b>지금 타리프 기준</b>으로 계산돼요.') +
        ' 열 조정(예: 5톤 +10,000)은 새 구간에도 자동으로 적용돼요.</p>' +
        '<div class="field"><label>상차지 <span class="muted">(아래 줄에 하차지만 쓰면 이 상차지를 써요)</span></label><input class="input" id="arO" list="addrList" value="' + esc(first) + '"></div>' +
        '<div class="field"><label>추가할 구간 <span class="muted">(한 줄에 하나 · 하차지만, 또는 엑셀 2열 "상차지 ⇥ 하차지")</span></label><textarea class="input" id="arL" rows="6" placeholder="인천 서구 …&#10;경기 평택시 …&#9;대구 달서구 …"></textarea></div>' +
        '<p class="hint" id="arCnt" style="margin:0"></p>',
      foot: '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="arGo">계산해서 추가</button>',
      onMount: function (m, close) {
        ensureAddrList();
        var parse = function () {
          var o = $('#arO', m).value.trim();
          return $('#arL', m).value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
            var p = l.split(/\t|\s*\|\s*/);
            return p.length >= 2 && p[1].trim() ? { origin: p[0].trim(), dest: p[1].trim() } : { origin: o, dest: p[0].trim() };
          });
        };
        $('#arL', m).oninput = function () { var n = parse().length; $('#arCnt', m).textContent = n ? n + '건' : ''; };
        $('#arGo', m).onclick = function () {
          var pairs = parse();
          if (!pairs.length) return toast('추가할 구간을 입력하세요.', 'err');
          if (pairs.some(function (p) { return !p.origin; })) return toast('상차지를 입력하세요.', 'err');
          if (pairs.length > 200) return toast('한 번에 200건까지 추가할 수 있어요.', 'err');
          var btn = this, failed = [], added = 0, i = 0, last = null;
          busy(btn, true, '계산 중… 0/' + pairs.length);
          var step = function () {
            if (i >= pairs.length) return Promise.resolve();
            var chunk = pairs.slice(i, i + 20); i += chunk.length;
            return api('quotes.addRoutes', { id: id, pairs: chunk }).then(function (r) {
              last = r; added += r.added.length; failed = failed.concat(r.failed);
              btn.innerHTML = '<span class="spinner"></span>계산 중… ' + i + '/' + pairs.length;
              return step();
            });
          };
          step().then(function () {
            if (last) { d.items = last.items; d.meta = last.meta; d.quote = last.quote; d.adjLog = last.adjLog; state.quotes.list = null; }
            close(); done();
            toast(added + '건을 추가했어요.' + (failed.length ? ' 실패 ' + failed.length + '건' : ''), failed.length ? 'err' : 'ok');
            if (failed.length) modal({ eyebrow: '구간 추가', title: '추가하지 못한 구간 ' + failed.length + '건', body: '<ul class="small">' + failed.map(function (f) { return '<li>' + esc(f.origin) + ' → ' + esc(f.dest) + '<br><span class="err-text">' + esc(f.error) + '</span></li>'; }).join('') + '</ul><p class="hint">주소를 고쳐서 다시 추가해 주세요.</p>' });
          }).catch(function (err) {
            busy(btn, false); toast(err.message, 'err');
            if (last) { d.items = last.items; d.meta = last.meta; d.quote = last.quote; d.adjLog = last.adjLog; done(); }
          });
        };
      }
    });
  }

  function renderQuoteDetail() {
    var qs = state.quotes, id = qs.detail;
    $('#main').innerHTML =
      '<div class="row-between" style="margin-bottom:14px;flex-wrap:wrap"><button class="btn btn-sm" id="qBack">← 견적모음</button><div class="actions" id="qActs"></div></div>' +
      '<div id="qHead"><div class="card muted"><span class="spinner dark"></span> 견적을 불러오는 중…</div></div><div id="qLink" style="margin-top:16px"></div><div id="qBody" style="margin-top:16px"></div>';
    $('#qBack').onclick = function () {
      var d0 = qs.detailData;
      if (d0 && adjDirty(d0) && !confirm('저장하지 않은 금액 조정이 있습니다. 나갈까요?')) return;
      qs.detail = null; qs.detailData = null; renderQuotes();
    };
    var adjKey = function (a) { a = a || newAdj(); return JSON.stringify({ rows: a.rows || {}, cols: a.cols || {}, cells: a.cells || {} }); };
    var adjDirty = function (d) { return adjKey(d.adj) !== d.adjSaved; };
    var refreshAdj = function (d) {
      var el = $('#qAdjSave'); if (!el) return;
      el.innerHTML = adjDirty(d) ? '<span class="adj-dirty">저장 안 된 조정</span><button class="btn btn-sm" id="qAdjUndo">되돌리기</button><button class="btn btn-sm btn-accent" id="qAdjBtn">조정 저장</button>' : '';
      if (!adjDirty(d)) return;
      $('#qAdjUndo').onclick = function () {
        var saved = JSON.parse(d.adjSaved), a = adjOf(d); a.rows = saved.rows; a.cols = saved.cols; a.cells = saved.cells;
        renderSnapshot(d.meta, d.items, $('#qBody'), d, null, d.quote.client, { onAdj: function () { refreshAdj(d); } }); refreshAdj(d);
      };
      $('#qAdjBtn').onclick = function () {
        var btn = this, note = adjNote(JSON.parse(d.adjSaved), d.adj); busy(btn, true, '저장 중…');
        api('quotes.update', { id: id, patch: { adj: adjN(d.adj) ? d.adj : null, adjNote: note } }).then(function (r) {
          d.quote = r.quote; d.adjSaved = adjKey(d.adj); qs.list = null;
          (d.adjLog = d.adjLog || []).push({ at: today() + ' ' + new Date().toTimeString().slice(0, 5), by: state.user.name, note: note });
          toast('금액 조정을 저장했습니다.'); show(d);
        }).catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
      };
    };
    var show = function (d) {
      if (state.view !== 'quotes' || qs.detail !== id) return;
      var q = d.quote;
      if (d.adjSaved == null) { adjOf(d); d.adjSaved = adjKey(d.adj); }
      var logs = (d.adjLog || []).slice().reverse();
      $('#qHead').innerHTML = '<div class="card qdetail">' +
        '<div class="row-between" style="flex-wrap:wrap;margin-bottom:12px"><div><div class="eyebrow">Quote · 저장된 견적</div><h2>' + esc(q.name) + '</h2></div>' + statusPill(q.status) + '</div>' +
        '<div class="qedit"><div>' + quoteFieldsHtml(q) + '</div>' +
        '<div class="qmeta"><div><b>저장</b> ' + esc(q.savedAt) + ' · ' + esc(q.userName) + '</div>' + (q.updatedAt && q.updatedAt !== q.savedAt ? '<div><b>수정</b> ' + esc(q.updatedAt) + '</div>' : '') +
        snapshotInfoHtml(d.meta) +
        (logs.length ? '<details class="adj-log"><summary>변경 기록 ' + logs.length + '건</summary><ul>' + logs.map(function (l) { return '<li><span class="muted small">' + esc(String(l.at).slice(0, 16)) + ' · ' + esc(String(l.by).replace(/ \(.*\)$/, '')) + '</span><br>' + esc(l.note) + '</li>'; }).join('') + '</ul></details>' : '') +
        '</div></div>' +
        '<div class="actions" style="justify-content:flex-end;margin-top:6px"><button class="btn btn-sm btn-danger" id="qDel">삭제</button><button class="btn btn-sm btn-primary" id="qUpd">변경 저장</button></div></div>';
      var read = bindQuoteFields($('#qHead'));
      $('#qUpd').onclick = function () {
        var f = read(); if (!f.name) return toast('견적명을 입력하세요.', 'err');
        var btn = this; busy(btn, true, '저장 중…');
        api('quotes.update', { id: id, patch: f }).then(function (r) {
          d.quote = r.quote; qs.list = null; toast('변경사항을 저장했습니다.'); show(d);
        }).catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
      };
      $('#qDel').onclick = function () {
        if (!confirm('"' + q.name + '" 견적을 삭제할까요? 되돌릴 수 없습니다.')) return;
        var btn = this; busy(btn, true, '삭제 중…');
        api('quotes.delete', { id: id }).then(function () {
          qs.detail = null; qs.detailData = null; qs.list = null; toast('삭제했습니다.'); renderQuotes();
        }).catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
      };
      $('#qActs').innerHTML = '<span id="qAdjSave" class="actions"></span><button class="btn btn-sm" id="qAdd">＋ 구간 추가</button><button class="btn btn-sm" id="qRecalc">현재 단가로 다시 계산</button>';
      $('#qRecalc').onclick = function () { recalcNow(d.meta, d.items); };
      $('#qAdd').onclick = function () { openAddRoutes(id, d, function () { d.bulk = null; d.drawn = false; show(d); }); };
      if (!d.drawn) { renderSnapshot(d.meta, d.items, $('#qBody'), d, null, q.client, { onAdj: function () { refreshAdj(d); } }); d.drawn = true; drawQuoteLink(d, $('#qLink')); }
      refreshAdj(d);
    };
    if (qs.detailData) { qs.detailData.drawn = false; return show(qs.detailData); }
    api('quotes.get', { id: id }).then(function (d) { qs.detailData = d; show(d); }).catch(function (err) {
      if (qs.detail === id) $('#qHead').innerHTML = '<div class="card"><p style="margin:0">' + esc(err.message) + '</p></div>';
    });
  }

  /* ───────── 매출매입 분석: 데이터 ───────── */
  /*
   * 행 형식(서버 저장): [날짜, 매출처, 발지, 착지, 중량, 매출후불, 매입후불, 차량번호, 기사명, 차량전화, 기타1, 비고]
   * 브라우저에서 덧붙임: [12]=사업자, [13]=표시 매출처, [14]=숨김 여부, [15]=구분('' 운송 / '__x' 제외 / 분류 이름)
   */
  var AN_COLS = ['날짜', '매출처', '발지', '착지', '중량', '매출후불', '매입후불', '차량번호', '기사명', '차량전화', '기타1', '비고'];
  var AN_REQUIRED = ['날짜', '매출처', '매출후불', '매입후불'];
  var C = { date: 0, cust: 1, from: 2, to: 3, weight: 4, sales: 5, buys: 6, car: 7, driver: 8, phone: 9, etc: 10, note: 11, biz: 12, disp: 13, hidden: 14, cat: 15 };
  var AN_SALES_COLOR = '#2A9DB0', AN_BUYS_COLOR = '#D2601A'; // 검증된 2색 (색약·대비 통과)

  function newAnState() {
    return {
      index: null, mapping: {}, businesses: [], rows: null, loading: false, loaded: 0, total: 0, error: null,
      f: { from: '', to: '', biz: [], sel: {}, q: '' }, dim: 'cust', sort: { key: 'sales', dir: -1 }, groupLimit: 50, groupQ: '',
      detailPage: 0, detailSort: -1, view: 'month',
      cmp: 'prev', trendMode: 'profit', routeWeight: true, minN: 90, alert: { drop: 3, minSales: 1000000 },
      anom: { kind: 'buy', th: 20, minN: 3, limit: 30 }
    };
  }

  function b64FromBytes(bytes) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function bytesFromB64(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function gzipToB64(text) {
    if (!window.CompressionStream) return Promise.reject(new Error('이 브라우저는 압축 기능을 지원하지 않아요. 최신 크롬이나 엣지를 사용하세요.'));
    var stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Response(stream).arrayBuffer().then(function (buf) { return b64FromBytes(new Uint8Array(buf)); });
  }
  function gunzipB64(b64) {
    if (!window.DecompressionStream) return Promise.reject(new Error('이 브라우저는 압축 해제를 지원하지 않아요. 최신 크롬이나 엣지를 사용하세요.'));
    var stream = new Blob([bytesFromB64(b64)]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }

  /** 구글 시트가 "2026-05"를 날짜로 바꿔 버리므로, 월·사업자는 항상 키("사업자|YYYY-MM")에서 꺼냄 */
  function normAnIndex(list) {
    return (list || []).map(function (x) {
      var parts = String(x.key).split('|');
      x.biz = parts[0]; x.month = parts[1];
      return x;
    }).filter(function (x) { return /^\d{4}-\d{2}$/.test(x.month); });
  }

  function anDisplay(raw) {
    var m = state.an.mapping[raw];
    return m && m.display ? m.display : raw;
  }
  function applyMapping() {
    var an = state.an;
    if (!an.rows) return;
    for (var i = 0; i < an.rows.length; i++) {
      var r = an.rows[i], m = an.mapping[r[C.cust]];
      r[C.disp] = m && m.display ? m.display : r[C.cust];
      r[C.hidden] = !!(m && m.hidden);
    }
  }

  /** 목록 + 전체 데이터 불러오기 (12개 묶음씩 3개 동시) */
  function loadAnalysis(force) {
    var an = state.an;
    if (an.loading) return an.loading;
    if (an.rows && !force) return Promise.resolve();
    an.error = null;
    an.loading = api('analysis.index').then(function (r) {
      an.index = normAnIndex(r.index); an.businesses = r.businesses || ['조일물류', '명일로지스', '조일로지스'];
      an.mapping = {};
      (r.mapping || []).forEach(function (m) { an.mapping[m.raw] = m; });
      an.rules = r.rules || [];
      an.notes = r.notes || [];
      var keys = an.index.map(function (x) { return x.key; });
      an.total = keys.length; an.loaded = 0;
      var batches = [];
      for (var i = 0; i < keys.length; i += 12) batches.push(keys.slice(i, i + 12));
      var rows = [], next = 0;
      function work() {
        if (next >= batches.length) return Promise.resolve();
        var batch = batches[next++];
        return api('analysis.load', { keys: batch }).then(function (res) {
          return Promise.all(batch.map(function (k) {
            if (!res.data[k]) return null;
            return gunzipB64(res.data[k]).then(function (text) {
              var biz = k.split('|')[0];
              JSON.parse(text).forEach(function (row) { row[C.biz] = biz; rows.push(row); });
            });
          }));
        }).then(function () {
          an.loaded += batch.length;
          var p = $('#anProg'); if (p) p.textContent = an.loaded + ' / ' + an.total;
          return work();
        });
      }
      return Promise.all([work(), work(), work()]).then(function () {
        an.rows = rows;
        applyMapping();
        applyRules();
        var months = anMonths();
        if (!an.f.to || months.indexOf(an.f.to) === -1) { an.f.to = months[months.length - 1] || ''; }
        if (!an.f.from || months.indexOf(an.f.from) === -1) { an.f.from = an.f.to; }
      });
    }).then(function () { an.loading = false; }, function (err) { an.loading = false; an.error = err.message; throw err; });
    return an.loading;
  }

  function anMonths() {
    var set = {};
    (state.an.index || []).forEach(function (x) { set[x.month] = true; });
    return Object.keys(set).sort();
  }

  /* ───────── 매출매입 분석: 엑셀 읽기 ───────── */

  function anNum(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return v;
    var n = Number(String(v).replace(/[,\s원]/g, ''));
    return isFinite(n) ? n : NaN;
  }
  function anDate(v, X) {
    if (v == null || v === '') return '';
    if (v instanceof Date) return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2) + '-' + ('0' + v.getDate()).slice(-2);
    if (typeof v === 'number' && X && X.SSF) {
      var d = X.SSF.parse_date_code(v);
      if (d) return d.y + '-' + ('0' + d.m).slice(-2) + '-' + ('0' + d.d).slice(-2);
    }
    var m = String(v).match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
    return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : null;
  }
  function guessBiz(name) {
    if (/명일/.test(name)) return '명일로지스';
    if (/로지스/.test(name)) return '조일로지스';
    if (/조일|물류/.test(name)) return '조일물류';
    return '';
  }

  /** 엑셀 파일 하나 → { rows, months, sums, totalRow, warnings } */
  function parseAnFile(file) {
    return Promise.all([loadXlsx(), file.arrayBuffer()]).then(function (res) {
      var X = res[0];
      var wb = X.read(new Uint8Array(res[1]), { type: 'array', cellDates: true });
      var ws = wb.Sheets[wb.SheetNames[0]];
      var grid = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
      var hi = -1;
      for (var i = 0; i < Math.min(grid.length, 20); i++) {
        var row = grid[i].map(function (c) { return String(c).trim(); });
        if (row.indexOf('날짜') !== -1 && row.indexOf('매출처') !== -1) { hi = i; break; }
      }
      if (hi === -1) throw new Error('"날짜", "매출처" 제목이 있는 줄을 찾지 못했습니다.');
      var head = grid[hi].map(function (c) { return String(c).trim(); });
      var idx = AN_COLS.map(function (c) { return head.indexOf(c); });
      var missing = AN_REQUIRED.filter(function (c) { return head.indexOf(c) === -1; });
      if (missing.length) throw new Error('필수 열이 없습니다: ' + missing.join(', '));
      var warnings = [];
      var optMissing = AN_COLS.filter(function (c, k) { return idx[k] === -1; });
      if (optMissing.length) warnings.push('없는 열(빈칸으로 저장): ' + optMissing.join(', '));

      var rows = [], totalRow = null, badDate = 0, badNum = 0;
      for (var r = hi + 1; r < grid.length; r++) {
        var g = grid[r];
        var dateRaw = g[idx[0]];
        var vals = idx.map(function (k) { return k === -1 ? '' : g[k]; });
        if (dateRaw === '' || dateRaw == null) {
          // 날짜 없는 줄: 합계 줄인지 확인
          if (anNum(vals[5]) || anNum(vals[6])) totalRow = { sales: anNum(vals[5]), buys: anNum(vals[6]) };
          continue;
        }
        var d = anDate(dateRaw, X);
        if (!d) { badDate++; continue; }
        var s = anNum(vals[5]), b = anNum(vals[6]);
        if (isNaN(s) || isNaN(b)) { badNum++; s = isNaN(s) ? 0 : s; b = isNaN(b) ? 0 : b; }
        rows.push([d, String(vals[1]), String(vals[2]), String(vals[3]), String(vals[4]), s, b, String(vals[7]), String(vals[8]), String(vals[9]), String(vals[10]), String(vals[11])]);
      }
      if (badDate) warnings.push('날짜를 읽지 못한 ' + badDate + '줄은 제외했어요.');
      if (badNum) warnings.push('금액이 숫자가 아닌 ' + badNum + '줄은 0원으로 처리했어요.');
      var sums = rows.reduce(function (a, x) { a.sales += x[5]; a.buys += x[6]; return a; }, { sales: 0, buys: 0 });
      var months = {};
      rows.forEach(function (x) { var m = x[0].slice(0, 7); months[m] = (months[m] || 0) + 1; });
      return { rows: rows, sums: sums, totalRow: totalRow, months: months, warnings: warnings };
    });
  }

  /* ───────── 관리자: 분석 데이터 ───────── */

  function adminAnData() {
    var a = state.admin, up = a.anUpload || (a.anUpload = { files: [] });
    var body = $('#adminBody');
    var idx = state.an.index;
    body.innerHTML =
      '<div class="card" style="margin-bottom:16px"><div class="eyebrow">Upload · 분석 데이터</div><h2>매출매입 엑셀 올리기</h2>' +
      '<p class="muted small" style="margin:6px 0 16px">전산에서 받은 사업자별 월 엑셀을 그대로 올리세요. <b>같은 사업자·같은 달을 다시 올리면 덮어씁니다.</b> 파일 맨 아래 합계 줄과 자동으로 대조해요.</p>' +
      '<label class="dropzone" id="anDrop"><input type="file" id="anFile" accept=".xlsx,.xls,.csv" multiple hidden>' +
      '<div class="big-stripes"></div><b>엑셀 파일을 여기에 끌어다 놓거나 눌러서 고르세요</b><span class="hint">여러 개를 한 번에 올릴 수 있어요 · 열: ' + AN_COLS.join(', ') + '</span></label>' +
      '<div id="anFiles"></div></div>' +
      '<div class="card" style="--i:1;margin-bottom:16px"><div class="row-between" style="flex-wrap:wrap;margin-bottom:12px"><h3>저장된 데이터</h3><button class="btn btn-sm" id="anIdxReload">새로고침</button></div><div id="anIdx">' +
      (idx ? '' : '<p class="muted"><span class="spinner dark"></span> 불러오는 중…</p>') + '</div></div>' +
      '<div class="card" style="--i:2"><div class="row-between" style="margin-bottom:12px"><h3>분석 화면 접속 기록</h3><button class="btn btn-sm" id="anLogLoad">불러오기</button></div><div id="anLog" class="muted small">누가 언제 분석 데이터를 열었는지 보여줍니다.</div></div>';

    var input = $('#anFile'), drop = $('#anDrop');
    input.onchange = function () { addFiles(this.files); this.value = ''; };
    drop.ondragover = function (e) { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = function () { drop.classList.remove('over'); };
    drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); };
    $('#anIdxReload').onclick = function () { state.an.index = null; adminAnData(); };
    $('#anLogLoad').onclick = function () {
      var btn = this; busy(btn, true, '불러오는 중…');
      api('analysis.accessLog').then(function (r) {
        $('#anLog').innerHTML = r.logs.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>일시</th><th class="left">사용자</th></tr></thead><tbody>' +
          r.logs.map(function (l) { return '<tr><td class="small muted">' + esc(l.at) + '</td><td class="left">' + esc(l.name) + ' <span class="muted small">' + esc(l.id) + '</span></td></tr>'; }).join('') +
          '</tbody></table></div>' : '기록이 없습니다.';
      }).catch(function (err) { toast(err.message, 'err'); }).then(function () { busy(btn, false); });
    };

    function addFiles(list) {
      Array.prototype.slice.call(list).forEach(function (file) {
        var item = { file: file, name: file.name, biz: guessBiz(file.name), status: 'parsing' };
        up.files.push(item);
        parseAnFile(file).then(function (p) { item.parsed = p; item.status = 'ready'; }, function (err) { item.status = 'error'; item.error = err.message; })
          .then(drawFiles);
      });
      drawFiles();
    }

    function drawFiles() {
      var box = $('#anFiles'); if (!box) return;
      var existing = {};
      (state.an.index || []).forEach(function (x) { existing[x.key] = x; });
      if (!up.files.length) { box.innerHTML = ''; return; }
      box.innerHTML = '<div class="anfiles">' + up.files.map(function (it, i) {
        var p = it.parsed, html = '<div class="anfile ' + it.status + '"><div class="row-between" style="flex-wrap:wrap;gap:8px"><b class="fname">' + esc(it.name) + '</b>' +
          '<div class="actions"><select class="input input-sm" data-biz="' + i + '" style="width:auto"' + (it.status === 'done' ? ' disabled' : '') + '><option value="">사업자 선택</option>' +
          (state.an.businesses.length ? state.an.businesses : ['조일물류', '명일로지스', '조일로지스']).map(function (b) { return '<option' + (it.biz === b ? ' selected' : '') + '>' + b + '</option>'; }).join('') +
          '</select><button class="btn btn-ghost btn-sm" data-rm="' + i + '" title="목록에서 빼기">✕</button></div></div>';
        if (it.status === 'parsing') html += '<p class="muted small"><span class="spinner dark"></span> 읽는 중…</p>';
        if (it.status === 'error') html += '<p class="err-text">⚠ ' + esc(it.error) + '</p>';
        if (p) {
          var tot = p.totalRow;
          var okS = tot && tot.sales === p.sums.sales, okB = tot && tot.buys === p.sums.buys;
          var months = Object.keys(p.months).sort();
          html += '<div class="anfile-stats"><span><b>' + won(p.rows.length) + '</b>건</span><span>' + months.map(function (m) {
            var ex = it.biz && existing[it.biz + '|' + m];
            return esc(m) + (ex ? ' <span class="badge down">덮어씀</span>' : '');
          }).join(', ') + '</span><span>매출 <b class="num">' + won(p.sums.sales) + '</b></span><span>매입 <b class="num">' + won(p.sums.buys) + '</b></span>' +
            (tot ? '<span class="' + (okS && okB ? 'ok-text' : 'err-text') + '">' + (okS && okB ? '✓ 합계 줄과 일치' : '⚠ 합계 줄과 다름 (파일 합계 매출 ' + won(tot.sales) + ' / 매입 ' + won(tot.buys) + ')') + '</span>' : '<span class="muted">합계 줄 없음</span>') +
            '</div>' + (p.warnings.length ? '<p class="hint" style="margin:6px 0 0">' + p.warnings.map(esc).join('<br>') + '</p>' : '');
        }
        if (it.status === 'done') html += '<p class="ok-text small" style="margin:6px 0 0">✓ 업로드 완료</p>';
        if (it.status === 'uploading') html += '<p class="muted small" style="margin:6px 0 0"><span class="spinner dark"></span> 올리는 중…</p>';
        if (it.upErr) html += '<p class="err-text small">⚠ ' + esc(it.upErr) + '</p>';
        return html + '</div>';
      }).join('') + '</div>' +
        '<div class="actions" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="anClear">목록 비우기</button><button class="btn btn-accent" id="anUp">업로드</button></div>';
      $$('[data-biz]', box).forEach(function (sel) { sel.onchange = function () { up.files[this.dataset.biz].biz = this.value; drawFiles(); }; });
      $$('[data-rm]', box).forEach(function (b) { b.onclick = function () { up.files.splice(Number(b.dataset.rm), 1); drawFiles(); }; });
      $('#anClear').onclick = function () { up.files = []; drawFiles(); };
      $('#anUp').onclick = function () { uploadAll(this); };
    }

    function uploadAll(btn) {
      var todo = up.files.filter(function (it) { return it.status === 'ready'; });
      if (!todo.length) return toast('올릴 파일이 없습니다.', 'err');
      if (todo.some(function (it) { return !it.biz; })) return toast('모든 파일의 사업자를 선택하세요.', 'err');
      var mismatch = todo.filter(function (it) { var t = it.parsed.totalRow; return t && (t.sales !== it.parsed.sums.sales || t.buys !== it.parsed.sums.buys); });
      if (mismatch.length && !confirm('합계 줄과 다른 파일이 ' + mismatch.length + '개 있습니다. 그래도 올릴까요?')) return;
      busy(btn, true, '업로드 중…');
      var chain = Promise.resolve();
      todo.forEach(function (it) {
        chain = chain.then(function () {
          it.status = 'uploading'; it.upErr = null; drawFiles();
          var byMonth = {};
          it.parsed.rows.forEach(function (r) { (byMonth[r[0].slice(0, 7)] = byMonth[r[0].slice(0, 7)] || []).push(r); });
          var c2 = Promise.resolve();
          Object.keys(byMonth).sort().forEach(function (m) {
            c2 = c2.then(function () {
              return gzipToB64(JSON.stringify(byMonth[m])).then(function (b64) {
                var sum = byMonth[m].reduce(function (a, r) { a.s += r[5]; a.b += r[6]; return a; }, { s: 0, b: 0 });
                return api('analysis.upload', { biz: it.biz, month: m, data: b64, count: byMonth[m].length, sales: sum.s, buys: sum.b, fileName: it.name });
              });
            });
          });
          return c2.then(function () { it.status = 'done'; }, function (err) { it.status = 'ready'; it.upErr = err.message; });
        });
      });
      chain.then(function () {
        busy(btn, false);
        state.an.rows = null; state.an.index = null; // 분석 화면이 새로 불러오도록
        var failed = todo.filter(function (it) { return it.upErr; }).length;
        toast(failed ? '일부 파일이 실패했어요. 확인 후 다시 시도하세요.' : '업로드했습니다.', failed ? 'err' : 'ok');
        loadIndex();
      });
    }

    function loadIndex() {
      api('analysis.index').then(function (r) {
        state.an.index = normAnIndex(r.index); state.an.businesses = r.businesses;
        state.an.mapping = {}; (r.mapping || []).forEach(function (m) { state.an.mapping[m.raw] = m; });
        state.an.rules = r.rules || [];
        drawIndex(); drawFiles();
      }).catch(function (err) { var x = $('#anIdx'); if (x) x.innerHTML = '<p class="err-text">' + esc(err.message) + '</p>'; });
    }

    function drawIndex() {
      var box = $('#anIdx'); if (!box) return;
      var list = (state.an.index || []).slice().sort(function (x, y) { return x.month < y.month ? 1 : x.month > y.month ? -1 : x.biz < y.biz ? -1 : 1; });
      if (!list.length) { box.innerHTML = '<p class="muted">아직 올린 데이터가 없습니다.</p>'; return; }
      var tot = list.reduce(function (a, x) { a.c += x.count; a.s += x.sales; a.b += x.buys; return a; }, { c: 0, s: 0, b: 0 });
      box.innerHTML = '<p class="muted small" style="margin:0 0 10px">' + list.length + '묶음 · 총 ' + won(tot.c) + '건 · 매출 ' + won(tot.s) + '원 · 매입 ' + won(tot.b) + '원</p>' +
        '<div class="table-wrap"><table class="data"><thead><tr><th>월</th><th class="left">사업자</th><th>건수</th><th>매출</th><th>매입</th><th>이익률</th><th class="left">파일 · 올린 사람</th><th></th></tr></thead><tbody>' +
        list.map(function (x) {
          var rate = x.sales ? ((x.sales - x.buys) / x.sales * 100).toFixed(1) + '%' : '–';
          return '<tr><td class="ton">' + esc(x.month) + '</td><td class="left">' + esc(x.biz) + '</td><td class="num">' + won(x.count) + '</td><td class="num">' + won(x.sales) + '</td><td class="num">' + won(x.buys) + '</td><td class="num">' + rate + '</td>' +
            '<td class="left small muted wrap">' + esc(x.fileName) + '<br>' + esc(x.uploadedAt) + ' · ' + esc(x.uploader) + '</td>' +
            '<td><button class="btn btn-sm btn-danger" data-del="' + esc(x.key) + '">삭제</button></td></tr>';
        }).join('') + '</tbody></table></div>';
      $$('[data-del]', box).forEach(function (b) {
        b.onclick = function () {
          if (!confirm(b.dataset.del.replace('|', ' ') + ' 데이터를 삭제할까요?')) return;
          busy(b, true, '…');
          api('analysis.delete', { key: b.dataset.del }).then(function () { toast('삭제했습니다.'); state.an.rows = null; loadIndex(); })
            .catch(function (err) { busy(b, false); toast(err.message, 'err'); });
        };
      });
    }

    drawFiles();
    if (idx) drawIndex(); else loadIndex();
  }

  /* ───────── 관리자: 매출처 설정 ───────── */

  function adminAnMap() {
    var body = $('#adminBody'), an = state.an, a = state.admin;
    if (!an.rows) {
      body.innerHTML = '<div class="card"><span class="spinner dark"></span> 매출처 목록을 만들려고 전체 데이터를 불러오는 중… <span id="anProg" class="muted"></span></div>';
      loadAnalysis().then(function () { if (state.view === 'admin' && a.tab === 'anmap') adminAnMap(); })
        .catch(function (err) { body.innerHTML = '<div class="card"><p class="err-text">' + esc(err.message) + '</p></div>'; });
      return;
    }
    var mm = a.anMap || (a.anMap = { edits: {}, q: '', filter: 'all', dirty: false });
    // 원본 매출처별 통계
    var stats = {};
    an.rows.forEach(function (r) {
      var s = stats[r[C.cust]] || (stats[r[C.cust]] = { raw: r[C.cust], n: 0, sales: 0, buys: 0, first: r[C.date], last: r[C.date] });
      s.n++; s.sales += r[C.sales]; s.buys += r[C.buys];
      if (r[C.date] < s.first) s.first = r[C.date];
      if (r[C.date] > s.last) s.last = r[C.date];
    });
    var list = Object.keys(stats).map(function (k) { return stats[k]; }).sort(function (x, y) { return y.sales - x.sales; });
    function cur(raw) {
      var e = mm.edits[raw], m = an.mapping[raw] || {};
      return e || { display: m.display || '', hidden: !!m.hidden };
    }
    var groupCount = {};
    list.forEach(function (s) { var d = cur(s.raw).display || s.raw; groupCount[d] = (groupCount[d] || 0) + 1; });

    body.innerHTML =
      '<div class="card"><div class="eyebrow">Customers · 매출처 설정</div><h2>매출처 표시 이름 · 묶기 · 숨기기</h2>' +
      '<p class="muted small" style="margin:6px 0 14px">업로드된 데이터의 <b>모든 매출처</b>가 나와요. 표시 이름을 정하면 분석 화면에서 그 이름으로 보이고, <b>서로 다른 매출처라도 표시 이름이 같으면 합쳐서</b> 집계돼요. 숨김을 켜면 분석에서 빠집니다.</p>' +
      '<div class="toolbar"><input class="input input-sm" id="mapQ" placeholder="매출처·표시 이름 검색" value="' + esc(mm.q) + '" style="max-width:260px">' +
      '<div class="segmented" id="mapF">' + [['all', '전체'], ['set', '이름 정함'], ['unset', '안 정함'], ['hidden', '숨김'], ['merged', '묶인 것']].map(function (x) {
        return '<button type="button" data-f="' + x[0] + '" class="' + (mm.filter === x[0] ? 'on' : '') + '">' + x[1] + '</button>';
      }).join('') + '</div>' +
      '<button class="btn btn-sm" id="mapStrip" title="표시 이름이 비어 있는 매출처에 (담당 ○○○) 표기를 뺀 이름을 채웁니다">담당자 표기 뺀 이름으로 채우기</button></div>' +
      '<div class="bulk-table" style="max-height:62vh"><table class="data bulk mapt"><thead><tr><th class="left">원본 매출처</th><th>건수</th><th>매출</th><th>매입</th><th class="left">기간</th><th class="left">표시 이름</th><th>숨김</th></tr></thead><tbody id="mapBody"></tbody></table></div>' +
      '<div class="save-bar"><span class="small muted" id="mapDirty" style="margin-right:auto"></span><button class="btn btn-accent" id="mapSave">저장</button></div></div>';

    function visible() {
      var q = mm.q.trim();
      return list.filter(function (s) {
        var c = cur(s.raw), d = c.display || s.raw;
        if (q && (s.raw + ' ' + c.display).indexOf(q) === -1) return false;
        if (mm.filter === 'set' && !c.display) return false;
        if (mm.filter === 'unset' && c.display) return false;
        if (mm.filter === 'hidden' && !c.hidden) return false;
        if (mm.filter === 'merged' && groupCount[d] < 2) return false;
        return true;
      });
    }
    function drawRows() {
      groupCount = {};
      list.forEach(function (s) { var d = cur(s.raw).display || s.raw; groupCount[d] = (groupCount[d] || 0) + 1; });
      var rows = visible();
      $('#mapBody').innerHTML = rows.map(function (s, i) {
        var c = cur(s.raw), d = c.display || s.raw;
        return '<tr class="' + (c.hidden ? 'muted-row' : '') + '"><td class="left wrap"><div class="addr">' + esc(s.raw) + '</div></td>' +
          '<td class="num">' + won(s.n) + '</td><td class="num">' + won(s.sales) + '</td><td class="num">' + won(s.buys) + '</td>' +
          '<td class="left small muted">' + esc(s.first.slice(0, 7)) + (s.first.slice(0, 7) !== s.last.slice(0, 7) ? ' ~ ' + esc(s.last.slice(0, 7)) : '') + '</td>' +
          '<td class="left"><input class="input input-sm" data-raw="' + i + '" value="' + esc(c.display) + '" placeholder="' + esc(s.raw) + '" style="min-width:220px">' +
          (groupCount[d] > 1 ? '<span class="badge region" style="margin-left:6px">' + groupCount[d] + '곳 합침</span>' : '') + '</td>' +
          '<td><label class="toggle"><input type="checkbox" data-hide="' + i + '"' + (c.hidden ? ' checked' : '') + '><span class="track"></span></label></td></tr>';
      }).join('') || '<tr><td colspan="7" class="left muted" style="padding:20px">조건에 맞는 매출처가 없습니다.</td></tr>';
      $$('#mapBody [data-raw]').forEach(function (inp) {
        inp.onchange = function () {
          var raw = rows[this.dataset.raw].raw, v = this.value.trim();
          if (v === cur(raw).display) return;
          edit(raw, { display: v }); redraw();
        };
      });
      $$('#mapBody [data-hide]').forEach(function (cb) {
        cb.onchange = function () { edit(rows[this.dataset.hide].raw, { hidden: this.checked }); redraw(); };
      });
      $('#mapDirty').innerHTML = (mm.dirty ? '<span class="dirty-dot"></span>저장하지 않은 변경사항 · ' : '') + list.length + '개 매출처 → 표시 ' + Object.keys(groupCount).length + '개';
    }
    function edit(raw, patch) {
      mm.edits[raw] = Object.assign({}, cur(raw), patch);
      mm.dirty = true;
    }
    // 입력칸에서 포커스가 빠지며 다시 그리는 경우가 겹치지 않도록 한 박자 늦게
    var redrawTimer = null;
    function redraw() { clearTimeout(redrawTimer); redrawTimer = setTimeout(drawRows, 0); }
    var st;
    $('#mapQ').oninput = function () { var v = this.value; clearTimeout(st); st = setTimeout(function () { mm.q = v; drawRows(); }, 200); };
    $$('#mapF button').forEach(function (b) { b.onclick = function () { mm.filter = b.dataset.f; $$('#mapF button').forEach(function (x) { x.classList.toggle('on', x === b); }); drawRows(); }; });
    $('#mapStrip').onclick = function () {
      var n = 0;
      list.forEach(function (s) {
        if (cur(s.raw).display) return;
        var cleaned = s.raw.replace(/\s*[-=]?\s*\(\s*담당[^)]*\)\s*$/, '').trim();
        if (cleaned && cleaned !== s.raw) { edit(s.raw, { display: cleaned }); n++; }
      });
      toast(n ? n + '곳의 표시 이름을 채웠어요. 확인 후 저장하세요.' : '바꿀 매출처가 없습니다.');
      drawRows();
    };
    $('#mapSave').onclick = function () {
      var btn = this;
      var focused = document.activeElement;
      if (focused && focused.dataset && focused.dataset.raw != null && focused.onchange) focused.onchange();
      var all = {};
      Object.keys(an.mapping).forEach(function (k) { all[k] = an.mapping[k]; });
      Object.keys(mm.edits).forEach(function (k) { all[k] = { raw: k, display: mm.edits[k].display, hidden: mm.edits[k].hidden }; });
      var payload = Object.keys(all).map(function (k) { return { raw: k, display: all[k].display || '', hidden: !!all[k].hidden }; })
        .filter(function (m) { return m.display || m.hidden; });
      busy(btn, true, '저장 중…');
      api('analysis.saveMap', { map: payload }).then(function () {
        an.mapping = {}; payload.forEach(function (m) { an.mapping[m.raw] = m; });
        mm.edits = {}; mm.dirty = false;
        applyMapping();
        toast('매출처 설정을 저장했습니다.');
        busy(btn, false); drawRows();
      }).catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
    };
    drawRows();
  }

  /* ───────── 분석: 제외·분류 규칙 ───────── */

  var RULE_FIELDS = [['any', '아무 칸'], ['cust', '매출처'], ['from', '발지'], ['to', '착지'], ['weight', '중량'], ['car', '차량번호'], ['driver', '기사명'], ['etc', '기타1'], ['note', '비고']];
  var RULE_MODES = [['eq', '정확히 같음'], ['contains', '포함'], ['starts', '으로 시작']];
  var RULE_ANY = [C.cust, C.from, C.to, C.weight, C.car, C.driver, C.etc, C.note];

  function ruleMatch(rule, r) {
    if (rule.on === false || !rule.word) return false;
    if (rule.biz && r[C.biz] !== rule.biz) return false;
    var w = String(rule.word).trim();
    var test = function (v) {
      v = String(v == null ? '' : v).trim();
      return rule.mode === 'eq' ? v === w : rule.mode === 'starts' ? v.indexOf(w) === 0 : v.indexOf(w) !== -1;
    };
    if (rule.field === 'any') return RULE_ANY.some(function (i) { return test(r[i]); });
    return test(r[C[rule.field]]);
  }

  /** 행 구분: '' = 운송, '__x' = 제외, 그 외 = 분류 이름. 위 규칙부터 먼저 걸린 것 하나만 적용 */
  function ruleOf(rules, r) {
    for (var i = 0; i < rules.length; i++) if (ruleMatch(rules[i], r)) return rules[i].action === 'class' ? rules[i].cat : '__x';
    return '';
  }

  function applyRules() {
    var an = state.an, rules = an.rules || [];
    if (!an.rows) return;
    for (var i = 0; i < an.rows.length; i++) an.rows[i][C.cat] = ruleOf(rules, an.rows[i]);
    an.hasCats = rules.some(function (r) { return r.on !== false && r.action === 'class'; });
  }

  function adminAnRules() {
    var body = $('#adminBody'), an = state.an, a = state.admin;
    if (!an.rows) {
      body.innerHTML = '<div class="card"><span class="spinner dark"></span> 규칙을 미리 볼 데이터를 불러오는 중… <span id="anProg" class="muted"></span></div>';
      loadAnalysis().then(function () { if (state.view === 'admin' && a.tab === 'anrule') adminAnRules(); })
        .catch(function (err) { body.innerHTML = '<div class="card"><p class="err-text">' + esc(err.message) + '</p></div>'; });
      return;
    }
    var ed = a.anRules || (a.anRules = { rules: clone(an.rules || []), dirty: false, open: -1 });
    body.innerHTML =
      '<div class="card"><div class="eyebrow">Rules · 제외 · 분류 규칙</div><h2>보고에서 뺄 항목 · 따로 볼 항목</h2>' +
      '<p class="muted small" style="margin:6px 0 14px">인건비·창고비·대여료처럼 운송 실적이 아닌 행을 <b>제외</b>하거나, <b>분류</b>(예: 부대비용)로 따로 모아 볼 수 있어요. ' +
      '원본은 그대로 두고 보여줄 때만 적용돼서, 지난 데이터와 앞으로 올릴 데이터 모두에 똑같이 적용되고 언제든 되돌릴 수 있어요. ' +
      '<b>위에 있는 규칙부터</b> 검사해서 처음 걸린 규칙 하나만 적용돼요. 분석 화면에는 제외 사실이 표시되지 않아요.</p>' +
      '<div id="ruleSum" class="rule-sum"></div><div id="ruleList"></div>' +
      '<button class="btn" id="ruleAdd" style="margin-top:12px">+ 규칙 추가</button>' +
      '<div class="save-bar"><span class="small muted" id="ruleDirty" style="margin-right:auto"></span><button class="btn btn-accent" id="ruleSave">저장</button></div></div>';

    function stats() {
      // 규칙마다 "이 규칙 때문에" 걸린 행 (앞 규칙에 먼저 걸린 건 제외)
      var per = ed.rules.map(function () { return { n: 0, s: 0, b: 0, rows: [] }; }), tot = { x: { n: 0, s: 0, b: 0 }, c: { n: 0, s: 0, b: 0 } };
      an.rows.forEach(function (r) {
        for (var i = 0; i < ed.rules.length; i++) {
          if (ruleMatch(ed.rules[i], r)) {
            var p = per[i]; p.n++; p.s += r[C.sales]; p.b += r[C.buys]; if (p.rows.length < 30) p.rows.push(r);
            var t = ed.rules[i].action === 'class' ? tot.c : tot.x; t.n++; t.s += r[C.sales]; t.b += r[C.buys];
            break;
          }
        }
      });
      return { per: per, tot: tot };
    }
    function draw() {
      var st = stats();
      $('#ruleSum').innerHTML = '<span><b>제외</b> ' + won(st.tot.x.n) + '건 · 매출 ' + won(st.tot.x.s) + ' · 매입 ' + won(st.tot.x.b) + '</span>' +
        '<span><b>분류</b> ' + won(st.tot.c.n) + '건 · 매출 ' + won(st.tot.c.s) + ' · 매입 ' + won(st.tot.c.b) + '</span>' +
        '<span class="muted">전체 ' + won(an.rows.length) + '건 기준 · 숨긴 매출처 포함</span>';
      $('#ruleList').innerHTML = ed.rules.length ? ed.rules.map(function (rule, i) {
        var p = st.per[i];
        return '<div class="rulebox' + (rule.on === false ? ' off' : '') + '" data-i="' + i + '">' +
          '<div class="rulerow">' +
          '<label class="toggle" title="켜기/끄기"><input type="checkbox" data-f="on"' + (rule.on !== false ? ' checked' : '') + '><span class="track"></span></label>' +
          '<select class="input input-sm" data-f="field">' + RULE_FIELDS.map(function (o) { return '<option value="' + o[0] + '"' + (rule.field === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
          '<span class="muted small">이(가)</span>' +
          '<input class="input input-sm" data-f="word" value="' + esc(rule.word || '') + '" placeholder="단어 (예: 인건비)" style="min-width:150px;flex:1">' +
          '<select class="input input-sm" data-f="mode">' + RULE_MODES.map(function (o) { return '<option value="' + o[0] + '"' + (rule.mode === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
          '<span class="muted small">이면</span>' +
          '<select class="input input-sm" data-f="action"><option value="exclude"' + (rule.action !== 'class' ? ' selected' : '') + '>제외</option><option value="class"' + (rule.action === 'class' ? ' selected' : '') + '>분류</option></select>' +
          (rule.action === 'class' ? '<input class="input input-sm" data-f="cat" value="' + esc(rule.cat || '') + '" placeholder="분류 이름 (예: 부대비용)" style="width:150px">' : '') +
          '<select class="input input-sm" data-f="biz"><option value="">모든 사업자</option>' + an.businesses.map(function (b) { return '<option' + (rule.biz === b ? ' selected' : '') + '>' + esc(b) + '</option>'; }).join('') + '</select>' +
          '<span class="rule-ctl"><button class="btn btn-ghost btn-sm" data-mv="-1" title="위로">↑</button><button class="btn btn-ghost btn-sm" data-mv="1" title="아래로">↓</button><button class="btn btn-ghost btn-sm btn-danger" data-del title="삭제">✕</button></span>' +
          '</div>' +
          '<div class="rulemeta"><input class="input input-sm" data-f="memo" value="' + esc(rule.memo || '') + '" placeholder="메모 (왜 빼는지)" style="flex:1;min-width:180px">' +
          '<button class="btn btn-sm" data-peek>' + (rule.word ? '걸리는 행 <b>' + won(p.n) + '건</b> · 매출 ' + won(p.s) + ' · 매입 ' + won(p.b) : '단어를 입력하세요') + ' ' + (ed.open === i ? '▲' : '▼') + '</button></div>' +
          (ed.open === i && p.rows.length ? '<div class="bulk-table" style="max-height:300px;margin-top:8px"><table class="data bulk"><thead><tr><th class="left">날짜</th><th class="left">사업자</th><th class="left">매출처</th><th class="left">발지</th><th class="left">착지</th><th class="left">중량</th><th>매출</th><th>매입</th><th class="left">차량번호</th><th class="left">기타1</th><th class="left">비고</th></tr></thead><tbody>' +
            p.rows.map(function (r) { return '<tr><td class="left small">' + esc(r[C.date]) + '</td><td class="left small">' + esc(r[C.biz]) + '</td><td class="left wrap">' + esc(r[C.cust]) + '</td><td class="left wrap">' + esc(r[C.from]) + '</td><td class="left wrap">' + esc(r[C.to]) + '</td><td class="left">' + esc(r[C.weight]) + '</td><td class="num">' + won(r[C.sales]) + '</td><td class="num">' + won(r[C.buys]) + '</td><td class="left">' + esc(r[C.car]) + '</td><td class="left small wrap">' + esc(r[C.etc]) + '</td><td class="left small wrap">' + esc(r[C.note]) + '</td></tr>'; }).join('') +
            '</tbody></table></div>' + (p.n > 30 ? '<p class="hint" style="margin:6px 0 0">앞의 30건만 보여요.</p>' : '') : '') +
          '</div>';
      }).join('') : '<p class="muted" style="margin:6px 0">아직 규칙이 없어요. "+ 규칙 추가"를 눌러 보세요. 예) 착지가 "인건비"와 <b>정확히 같음</b>이면 제외</p>';
      $('#ruleDirty').innerHTML = (ed.dirty ? '<span class="dirty-dot"></span>저장하지 않은 변경사항 · ' : '') + ed.rules.length + '개 규칙';
      bind();
    }
    var t;
    function later() { clearTimeout(t); t = setTimeout(draw, 0); }
    function bind() {
      $$('#ruleList .rulebox').forEach(function (box) {
        var i = Number(box.dataset.i), rule = ed.rules[i];
        $$('[data-f]', box).forEach(function (el) {
          var ev = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'onchange' : 'onchange';
          el[ev] = function () {
            var f = el.dataset.f, v = el.type === 'checkbox' ? el.checked : el.value;
            if (rule[f] === v) return;
            rule[f] = v; ed.dirty = true;
            if (f !== 'memo') later(); else $('#ruleDirty').innerHTML = '<span class="dirty-dot"></span>저장하지 않은 변경사항 · ' + ed.rules.length + '개 규칙';
          };
        });
        $('[data-peek]', box).onclick = function () { ed.open = ed.open === i ? -1 : i; draw(); };
        $('[data-del]', box).onclick = function () { if (!confirm('이 규칙을 삭제할까요?')) return; ed.rules.splice(i, 1); ed.dirty = true; ed.open = -1; draw(); };
        $$('[data-mv]', box).forEach(function (b) {
          b.onclick = function () {
            var j = i + Number(b.dataset.mv); if (j < 0 || j >= ed.rules.length) return;
            var tmp = ed.rules[i]; ed.rules[i] = ed.rules[j]; ed.rules[j] = tmp; ed.dirty = true; ed.open = -1; draw();
          };
        });
      });
    }
    $('#ruleAdd').onclick = function () { ed.rules.push({ on: true, field: 'to', mode: 'eq', word: '', action: 'exclude', cat: '', biz: '', memo: '' }); ed.dirty = true; draw(); var w = $$('#ruleList [data-f="word"]'); if (w.length) w[w.length - 1].focus(); };
    $('#ruleSave').onclick = function () {
      var btn = this, fe = document.activeElement;
      if (fe && fe.dataset && fe.dataset.f && fe.onchange) fe.onchange();
      if (ed.rules.some(function (r) { return !String(r.word || '').trim(); })) return toast('단어가 비어 있는 규칙이 있어요.', 'err');
      if (ed.rules.some(function (r) { return r.action === 'class' && !String(r.cat || '').trim(); })) return toast('분류 규칙에는 분류 이름을 넣어 주세요.', 'err');
      busy(btn, true, '저장 중…');
      api('analysis.saveRules', { rules: ed.rules }).then(function (r) {
        an.rules = r.rules; ed.rules = clone(r.rules); ed.dirty = false;
        applyRules(); toast('규칙을 저장했습니다. 분석 화면에 바로 반영돼요.'); busy(btn, false); draw();
      }).catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
    };
    draw();
  }

  /* ───────── 관리자: 유가 기록 ───────── */

  function adminDiesel() {
    var a = state.admin, body = $('#adminBody');
    var dz = a.diesel || (a.diesel = { rows: null, status: null, range: 90 });
    if (!dz.rows) {
      body.innerHTML = '<div class="card"><span class="spinner dark"></span> 유가 기록 불러오는 중…</div>';
      api('admin.dieselHistory').then(function (r) { dz.rows = r.rows; dz.status = r.status; if (state.view === 'admin' && a.tab === 'diesel') adminDiesel(); })
        .catch(function (err) { body.innerHTML = '<div class="card"><p class="err-text">' + esc(err.message) + '</p></div>'; });
      return;
    }
    var st = dz.status || {}, rows = dz.rows;
    var shown = dz.range ? rows.slice(-dz.range) : rows;
    var data = shown.map(function (r) { return { d: r[0], p: Number(r[1]) }; });
    var prev = rows.length > 1 ? rows[rows.length - 2][1] : null, last = rows.length ? rows[rows.length - 1][1] : null;
    var diff = last != null && prev != null ? last - prev : null;
    body.innerHTML =
      '<div class="card" style="margin-bottom:16px"><div class="row-between" style="flex-wrap:wrap;gap:10px"><div><div class="eyebrow">Diesel · 유가 기록</div><h2>전국 평균 경유가</h2></div>' +
      '<div class="actions"><button class="btn btn-sm" id="dzNow"' + (st.hasKey ? '' : ' disabled') + '>지금 오피넷에서 받기</button><label class="btn btn-sm" for="dzFile">과거 유가 엑셀 가져오기</label><input type="file" id="dzFile" accept=".xlsx,.xls,.csv" hidden></div></div>' +
      '<div class="dz-head"><div class="dz-price"><span class="num">' + (last != null ? won(Math.round(last)) : '–') + '</span><span class="small">원/L</span>' +
      (diff != null ? '<span class="dz-diff ' + (diff > 0 ? 'up' : diff < 0 ? 'down' : '') + '">' + (diff > 0 ? '▲ ' : diff < 0 ? '▼ ' : '') + Math.abs(diff).toFixed(2) + '</span>' : '') + '</div>' +
      '<div class="dz-meta"><span><b>마지막 기록</b> ' + esc(st.last || '없음') + '</span><span><b>기록</b> ' + won(st.count || 0) + '일' + (st.first ? ' (' + esc(st.first) + '부터)' : '') + '</span>' +
      '<span><b>매일 자동 기록</b> ' + (st.triggerOn ? '<span class="status-pill ok">켜짐 · 매일 아침 7시</span>' : st.triggerOn === false ? '<span class="status-pill no">꺼짐</span>' : '<span class="status-pill no">권한 승인 필요</span>') + '</span>' +
      '<span><b>오피넷 키</b> ' + (st.hasKey ? '설정됨' : '<span class="err-text">없음 (API 키 탭)</span>') + '</span></div></div>' +
      (st.triggerOn ? '' : '<p class="notice">매일 자동 기록을 켜려면: 구글 시트 메뉴 <b>조일그룹 시스템 → 유가 자동 기록 켜기</b>를 한 번 누르세요. (또는 Apps Script 편집기에서 <code>installDieselTrigger</code> 실행) 권한 승인 창이 뜨면 허용하면 돼요.</p>') +
      '</div>' +
      '<div class="card" style="margin-bottom:16px"><div class="row-between" style="flex-wrap:wrap;gap:10px;margin-bottom:6px"><h3>추이</h3><div class="segmented" id="dzRange">' +
      [[30, '1개월'], [90, '3개월'], [365, '1년'], [1095, '3년'], [0, '전체']].map(function (x) { return '<button type="button" data-r="' + x[0] + '" class="' + (dz.range === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
      (data.length > 1 ? priceChart(data) : '<p class="muted">기록이 2일 이상 쌓이면 그래프가 보여요. 과거 유가 엑셀을 가져오면 바로 볼 수 있어요.</p>') + '</div>' +
      '<div class="card"><h3 style="margin-bottom:10px">최근 기록</h3>' +
      (rows.length ? '<div class="table-wrap"><table class="data"><thead><tr><th class="left">날짜</th><th>경유 (원/L)</th><th>전일 대비</th><th class="left">출처</th></tr></thead><tbody>' +
        rows.slice(-30).reverse().map(function (r, i, arr) {
          var pv = arr[i + 1] ? arr[i + 1][1] : null, df = pv != null ? r[1] - pv : null;
          return '<tr><td class="left">' + esc(r[0]) + '</td><td class="num">' + Number(r[1]).toFixed(2) + '</td><td class="num ' + (df > 0 ? 'neg' : '') + '">' + (df == null ? '–' : (df > 0 ? '+' : '') + df.toFixed(2)) + '</td><td class="left small muted">' + esc(r[2]) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="muted">아직 기록이 없어요.</p>') +
      '<p class="hint" style="margin:10px 0 0">견적 계산의 밀크런 유류비는 경유가 "자동"일 때 이 기록의 가장 최근 값을 써요. (계산할 때마다 오피넷을 부르지 않음) · 오피넷 API는 최근 7일치만 주므로, 그보다 오래된 값은 오피넷 사이트 <b>유가통계</b>에서 엑셀로 내려받아 "과거 유가 엑셀 가져오기"로 넣어 주세요.</p></div>';

    $$('#dzRange button').forEach(function (b) { b.onclick = function () { dz.range = Number(b.dataset.r); adminDiesel(); }; });
    if (data.length > 1) bindChartHover(body.querySelectorAll('.card')[1], data, function (d) { return '<b>' + d.d + '</b><br>경유 ' + d.p.toFixed(2) + '원/L'; });
    $('#dzNow').onclick = function () {
      var btn = this; busy(btn, true, '받는 중…');
      api('admin.dieselRecordNow').then(function (r) { dz.rows = r.rows; dz.status = r.status; toast('최근 7일치 경유가를 기록했어요.'); adminDiesel(); })
        .catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
    };
    $('#dzFile').onchange = function () {
      var file = this.files[0]; this.value = '';
      if (!file) return;
      Promise.all([loadXlsx(), file.arrayBuffer()]).then(function (res) {
        var X = res[0], wb = X.read(new Uint8Array(res[1]), { type: 'array', cellDates: true });
        var grid = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
        var hi = -1, dc = -1, pc = -1;
        for (var i = 0; i < Math.min(grid.length, 30) && hi === -1; i++) {
          var h = grid[i].map(function (c) { return String(c).replace(/\s/g, ''); });
          var p = h.findIndex(function (c) { return /경유/.test(c) && !/등유|실내/.test(c); });
          if (p !== -1) { hi = i; pc = p; dc = h.findIndex(function (c) { return /날짜|일자|구분|기간|일시/.test(c); }); if (dc === -1) dc = 0; }
        }
        if (hi === -1) throw new Error('"경유" 열이 있는 제목 줄을 찾지 못했어요.');
        var out = [];
        grid.slice(hi + 1).forEach(function (r) {
          var d = anDate(r[dc], X), v = anNum(r[pc]);
          if (d && v > 0) out.push([d, v]);
        });
        if (!out.length) throw new Error('날짜와 경유가를 읽지 못했어요.');
        if (!confirm(out.length + '일치 (' + out[0][0] + ' ~ ' + out[out.length - 1][0] + ') 경유가를 가져올까요? 같은 날짜는 덮어써요.')) return null;
        return api('admin.dieselImport', { rows: out });
      }).then(function (r) {
        if (!r) return;
        toast(r.count + '일치를 가져왔어요.'); dz.rows = null; adminDiesel();
      }).catch(function (err) { toast(err.message, 'err'); });
    };
  }

  /** 날짜 축 선 그래프: 7일 넘게 비어 있는 구간은 선을 끊음 */
  function priceChart(data) {
    var W = chartW(760), H = 260, L = 50, R = 16, T = 14, B = 26;
    var day = function (d) { return Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000; };
    var t0 = day(data[0].d), t1 = day(data[data.length - 1].d);
    var vals = data.map(function (d) { return d.p; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var pad = Math.max(10, (hi - lo) * 0.1); lo = Math.floor((lo - pad) / 10) * 10; hi = Math.ceil((hi + pad) / 10) * 10;
    var x = function (d) { return t1 === t0 ? (L + W - R) / 2 : L + (W - L - R) * (day(d) - t0) / (t1 - t0); };
    var y = function (v) { return T + (H - T - B) * (1 - (v - lo) / (hi - lo)); };
    var ticks = [0, .25, .5, .75, 1].map(function (k) { return Math.round(lo + (hi - lo) * k); });
    var grid = ticks.map(function (t) { return '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t) + '" y2="' + y(t) + '" class="gridl"/><text x="' + (L - 6) + '" y="' + (y(t) + 4) + '" class="axis" text-anchor="end">' + won(t) + '</text>'; }).join('');
    var segs = [], cur = [];
    data.forEach(function (d, i) {
      if (i && day(d.d) - day(data[i - 1].d) > 7) { segs.push(cur); cur = []; }
      cur.push(d);
    });
    segs.push(cur);
    var lines = segs.map(function (sg) {
      var path = sg.map(function (d, i) { return (i ? 'L' : 'M') + x(d.d).toFixed(1) + ',' + y(d.p).toFixed(1); }).join('');
      var area = sg.length > 1 ? '<path d="' + path + 'L' + x(sg[sg.length - 1].d).toFixed(1) + ',' + y(lo) + 'L' + x(sg[0].d).toFixed(1) + ',' + y(lo) + 'Z" fill="' + AN_SALES_COLOR + '" opacity=".1"/>' : '';
      return area + '<path d="' + path + '" fill="none" stroke="' + AN_SALES_COLOR + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
        (sg.length === 1 ? '<circle cx="' + x(sg[0].d) + '" cy="' + y(sg[0].p) + '" r="2.5" fill="' + AN_SALES_COLOR + '"/>' : '');
    }).join('');
    // 날짜 눈금: 기간 길이에 맞춰 6~8개
    var labels = '', span = t1 - t0, nTicks = 7;
    for (var k = 0; k <= nTicks; k++) {
      var td = new Date((t0 + span * k / nTicks) * 86400000), ds = td.toISOString().slice(0, 10);
      labels += '<text x="' + x(ds) + '" y="' + (H - 8) + '" class="axis" text-anchor="' + (k === 0 ? 'start' : k === nTicks ? 'end' : 'middle') + '">' + (span > 400 ? ds.slice(2, 7).replace('-', '.') : ds.slice(2).replace(/-/g, '.')) + '</text>';
    }
    var last = data[data.length - 1];
    var hits = data.map(function (d, i) {
      var x0 = i ? (x(data[i - 1].d) + x(d.d)) / 2 : L, x1 = i < data.length - 1 ? (x(d.d) + x(data[i + 1].d)) / 2 : W - R;
      return '<rect class="hit" data-i="' + i + '" x="' + x0 + '" y="' + T + '" width="' + Math.max(1, x1 - x0) + '" height="' + (H - T - B) + '" fill="transparent"/>';
    }).join('');
    return '<div class="chartbox"><svg viewBox="0 0 ' + W + ' ' + H + '" class="chart" role="img" aria-label="전국 평균 경유가 추이">' + grid + lines +
      '<circle cx="' + x(last.d) + '" cy="' + y(last.p) + '" r="4.5" fill="' + AN_SALES_COLOR + '" stroke="var(--panel)" stroke-width="2"/>' +
      '<text x="' + (x(last.d) - 8) + '" y="' + (y(last.p) - 10) + '" class="vlabel" text-anchor="end">' + last.p.toFixed(2) + '</text>' +
      labels + hits + '</svg><div class="tip hidden"></div></div>';
  }

  /* ───────── 분석: 단가 이상치 (A1 매입이 비싼 오더 · A4 매출이 싼 오더) ───────── */
  /*
   * 같은 발지+착지+중량 오더들의 보통 단가(중앙값)와 비교합니다. 기준 데이터는 기간과 무관하게 전체 데이터
   * (숨긴 매출처·제외/분류 규칙은 반영), 표시는 지금 걸려 있는 필터 안의 오더만.
   */
  var anomalyCache = null;
  function median(arr) {
    var a = arr.slice().sort(function (x, y) { return x - y; }), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function anomalyBase() {
    var an = state.an, key = an.rows.length + '|' + JSON.stringify(an.rules || []) + '|' + JSON.stringify(an.mapping);
    if (anomalyCache && anomalyCache.key === key) return anomalyCache;
    var g = {};
    an.rows.forEach(function (r) {
      if (r[C.hidden] || r[C.cat]) return;
      var k = r[C.from] + '\u0001' + r[C.to] + '\u0001' + r[C.weight];
      var x = g[k] || (g[k] = { buys: [], sales: [] });
      if (r[C.buys] > 0) x.buys.push(r[C.buys]);
      if (r[C.sales] > 0) x.sales.push(r[C.sales]);
    });
    var base = {};
    Object.keys(g).forEach(function (k) {
      base[k] = { nb: g[k].buys.length, ns: g[k].sales.length, mb: g[k].buys.length ? median(g[k].buys) : 0, ms: g[k].sales.length ? median(g[k].sales) : 0 };
    });
    anomalyCache = { key: key, base: base };
    return anomalyCache;
  }
  function findAnomalies(kind, rows) {
    var an = state.an, set = an.anom, base = anomalyBase().base, th = set.th / 100, out = [];
    rows.forEach(function (r) {
      if (r[C.cat]) return;
      var b = base[r[C.from] + '\u0001' + r[C.to] + '\u0001' + r[C.weight]];
      if (!b) return;
      if (kind === 'buy') {
        if (!(r[C.buys] > 0) || b.nb - 1 < set.minN) return;
        if (r[C.buys] > b.mb * (1 + th)) out.push({ r: r, base: b.mb, n: b.nb, diff: r[C.buys] - b.mb, ratio: (r[C.buys] / b.mb - 1) * 100 });
      } else {
        if (!(r[C.sales] > 0) || b.ns - 1 < set.minN) return;
        if (r[C.sales] < b.ms * (1 - th)) out.push({ r: r, base: b.ms, n: b.ns, diff: b.ms - r[C.sales], ratio: (r[C.sales] / b.ms - 1) * 100 });
      }
    });
    return out.sort(function (a, b) { return b.diff - a.diff; });
  }

  function drawAnomalies(rows) {
    var an = state.an, set = an.anom, box = $('#anAnom');
    if (!box) return;
    if (an.showExcluded) { box.innerHTML = ''; return; }
    var kind = set.kind;
    var list = findAnomalies(kind, rows);
    var total = list.reduce(function (s, x) { return s + x.diff; }, 0);
    var shown = list.slice(0, set.limit);
    var isBuy = kind === 'buy';
    box.innerHTML = '<div class="card anom-card">' +
      '<div class="row-between" style="flex-wrap:wrap;gap:10px;margin-bottom:10px"><div><div class="eyebrow">Outliers · 단가 이상치</div>' +
      '<h3>' + (isBuy ? '매입이 평소보다 비싼 오더' : '매출이 평소보다 싼 오더') + ' <span class="' + (list.length ? 'neg' : 'muted') + '">' + won(list.length) + '건</span>' +
      (list.length ? ' <span class="small muted">· ' + (isBuy ? '평소보다 더 나간 매입' : '평소보다 덜 받은 매출') + ' 합계 ' + won(Math.round(total)) + '원</span>' : '') + '</h3></div>' +
      '<div class="actions" style="align-items:center"><div class="segmented" id="anomKind"><button type="button" data-k="buy" class="' + (isBuy ? 'on' : '') + '">매입 비싼 오더</button><button type="button" data-k="sell" class="' + (!isBuy ? 'on' : '') + '">매출 싼 오더</button></div>' +
      '<span class="small">기준 ±<input class="input input-sm num" id="anomTh" type="number" min="5" max="200" step="5" value="' + set.th + '" style="width:62px">%</span>' +
      '<span class="small">비교 오더 <select class="input input-sm" id="anomMin" style="width:auto">' + [2, 3, 5, 10].map(function (n) { return '<option value="' + n + '"' + (set.minN === n ? ' selected' : '') + '>' + n + '건↑</option>'; }).join('') + '</select></span>' +
      '<button class="btn btn-sm" id="anomX"' + (list.length ? '' : ' disabled') + '>엑셀</button></div></div>' +
      (list.length ? '<div class="bulk-table" style="max-height:520px"><table class="data bulk"><thead><tr><th class="left">날짜</th><th class="left">매출처</th><th class="left">경로 · 중량</th>' +
        '<th>' + (isBuy ? '매입' : '매출') + '</th><th>보통 단가</th><th>차이</th><th>벗어난 정도</th><th>' + (isBuy ? '매출' : '매입') + '</th><th class="left">기사 · 차량</th><th class="left">비고</th></tr></thead><tbody>' +
        shown.map(function (x) {
          var r = x.r;
          return '<tr><td class="left small">' + esc(r[C.date]) + '</td><td class="left wrap">' + esc(r[C.disp]) + '</td>' +
            '<td class="left wrap"><span class="route"><span>' + esc(r[C.from]) + '</span><i>→</i><span>' + esc(r[C.to]) + '</span><em>' + esc(r[C.weight] || '-') + '</em></span><div class="addr-in">비교 ' + (x.n - 1) + '건</div></td>' +
            '<td class="num strong">' + won(isBuy ? r[C.buys] : r[C.sales]) + '</td><td class="num muted">' + won(Math.round(x.base)) + '</td>' +
            '<td class="num neg">' + (isBuy ? '+' : '−') + won(Math.round(x.diff)) + '</td><td class="num"><span class="dl bad">' + (x.ratio > 0 ? '+' : '') + x.ratio.toFixed(0) + '%</span></td>' +
            '<td class="num">' + won(isBuy ? r[C.sales] : r[C.buys]) + '</td><td class="left small">' + esc(r[C.driver]) + ' ' + esc(r[C.car]) + '</td><td class="left small wrap">' + esc([r[C.etc], r[C.note]].filter(Boolean).join(' · ')) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        (list.length > shown.length ? '<div style="text-align:center;margin-top:10px"><button class="btn btn-sm" id="anomMore">더 보기 (' + won(list.length - shown.length) + '건 남음)</button></div>' : '')
        : '<p class="muted" style="margin:0">지금 조건에서는 기준을 벗어난 오더가 없어요.</p>') +
      '<p class="hint" style="margin:8px 0 0">보통 단가 = 같은 발지·착지·중량 오더들의 중앙값 (전체 기간 기준). 대기·경유·수작업 같은 추가 요금이 붙은 오더도 걸릴 수 있으니 비고를 함께 보세요.</p></div>';
    // 입력칸 포커스가 빠지면서 다시 그리기가 겹치지 않도록 한 박자 늦게
    var later = function () { clearTimeout(an.anomTimer); an.anomTimer = setTimeout(function () { drawAnomalies(rows); }, 0); };
    $$('#anomKind button').forEach(function (b) { b.onclick = function () { set.kind = b.dataset.k; set.limit = 30; later(); }; });
    $('#anomTh').onchange = function () { set.th = Math.min(200, Math.max(5, Number(this.value) || 20)); later(); };
    $('#anomMin').onchange = function () { set.minN = Number(this.value); later(); };
    var more = $('#anomMore'); if (more) more.onclick = function () { set.limit += 100; drawAnomalies(rows); };
    var ax = $('#anomX'); if (ax) ax.onclick = function () {
      var btn = this; busy(btn, true, '…');
      downloadXlsx('JOIL_단가이상치_' + (isBuy ? '매입' : '매출') + '_' + an.f.from + '_' + an.f.to + '.xlsx', [{
        name: isBuy ? '매입 비싼 오더' : '매출 싼 오더', widths: [11, 10, 26, 18, 18, 8, 12, 12, 12, 9, 12, 10, 12, 20, 20],
        rows: [['날짜', '사업자', '매출처', '발지', '착지', '중량', isBuy ? '매입' : '매출', '보통 단가', '차이', '벗어난 정도(%)', isBuy ? '매출' : '매입', '기사명', '차량번호', '기타1', '비고']].concat(list.map(function (x) {
          var r = x.r;
          return [r[C.date], r[C.biz], r[C.disp], r[C.from], r[C.to], r[C.weight], isBuy ? r[C.buys] : r[C.sales], Math.round(x.base), Math.round(x.diff), Math.round(x.ratio), isBuy ? r[C.sales] : r[C.buys], r[C.driver], r[C.car], r[C.etc], r[C.note]];
        }))
      }]).catch(function (err) { toast(err.message, 'err'); }).then(function () { busy(btn, false); });
    };
  }

  /* ───────── 분석: 매출처 상세 카드 (A2) ───────── */

  function openCustCard(name) {
    var an = state.an, f = an.f;
    // 이 매출처만 (다른 선택 조건은 무시, 사업자·검색·분류 설정은 반영)
    var saveSel = f.sel;
    f.sel = { cust: [name] };
    var allRows = anFilter(null, { from: '', to: '' });
    var rows = anFilter(null);
    var cr = cmpRange(), cmpRows = rangeHasData(cr) ? anFilter(null, { from: cr.from, to: cr.to }) : null;
    f.sel = saveSel;
    var t = agg(rows), c = cmpRows ? agg(cmpRows) : null;
    var byM = {};
    allRows.forEach(function (r) { var m = r[C.date].slice(0, 7); var x = byM[m] || (byM[m] = { s: 0, b: 0, n: 0 }); x.s += r[C.sales]; x.b += r[C.buys]; x.n++; });
    var have = Object.keys(byM).sort(), months = [];
    if (have.length) for (var mm = have[have.length - 1], k = 0; k < 24 && mm >= have[0]; k++, mm = addMonths(mm, -1)) months.unshift(mm);
    var mk = function (m) { var x = byM[m] || { s: 0, b: 0, n: 0 }; return { m: m, s: x.s, b: x.b, n: x.n, p: x.s - x.b, rate: pct(x.s - x.b, x.s), has: !!byM[m] }; };
    var data = attachNotes(months.map(function (m) { var d = mk(m); d.ly = mk(addMonths(m, -12)); return d; }), [name]);
    // 경로 조합 (선택 기간)
    var g = {};
    rows.forEach(function (r) {
      var key = r[C.from] + '\u0001' + r[C.to] + '\u0001' + r[C.weight];
      var x = g[key] || (g[key] = { from: r[C.from], to: r[C.to], w: r[C.weight], n: 0, s: 0, b: 0 });
      x.n++; x.s += r[C.sales]; x.b += r[C.buys];
    });
    var routes = Object.keys(g).map(function (k) { var x = g[k]; x.p = x.s - x.b; x.r = pct(x.p, x.s); return x; });
    var top = routes.slice().sort(function (a, b) { return b.n - a.n || b.p - a.p; }).slice(0, 10);
    var loss = routes.filter(function (x) { return x.p < 0; }).sort(function (a, b) { return a.p - b.p; }).slice(0, 10);
    var routeTable = function (list, empty) {
      if (!list.length) return '<p class="muted small" style="margin:0">' + empty + '</p>';
      return '<table class="data grp mini"><thead><tr><th class="left">경로 · 중량</th><th>건수</th><th>이익</th><th>이익률</th></tr></thead><tbody>' +
        list.map(function (x) {
          return '<tr><td class="left wrap"><span class="route"><span>' + esc(x.from) + '</span><i>→</i><span>' + esc(x.to) + '</span><em>' + esc(x.w || '-') + '</em></span></td><td class="num">' + won(x.n) + '</td>' +
            '<td class="num' + (x.p < 0 ? ' neg' : '') + '">' + won(x.p) + '</td><td class="num' + (x.r != null && x.r < 0 ? ' neg' : '') + '">' + pctText(x.r) + '</td></tr>';
        }).join('') + '</tbody></table>';
    };
    var period = f.from === f.to ? f.from : f.from + ' ~ ' + f.to;
    modal({
      wide: true, eyebrow: '매출처 상세 · ' + period, title: name,
      body:
        '<div class="kpis mini">' + [
          ['이익', won(t.p) + '원', t.p < 0, c && deltaHtml(deltaPct(t.p, c.p), '%', true)],
          ['이익률', pctText(t.r), t.r != null && t.r < 0, c && (t.r != null && c.r != null ? deltaHtml(t.r - c.r, '%p', true) : '')],
          ['매출', won(t.s) + '원', false, c && deltaHtml(deltaPct(t.s, c.s), '%', true)],
          ['건수', won(t.n) + '건', false, c && deltaHtml(deltaPct(t.n, c.n), '%', true)]
        ].map(function (k) { return '<div class="kpi"><div class="k">' + k[0] + '</div><div class="v num' + (k[2] ? ' neg' : '') + '">' + k[1] + '</div><div class="s">' + (k[3] ? k[3] + ' <span class="muted">' + esc(cr.label) + ' 대비</span>' : '') + '</div></div>'; }).join('') + '</div>' +
        '<div class="cc-charts"><div id="ccTrend"><div class="row-between"><h3>월별 이익</h3><div class="legend"><span><i style="background:' + AN_SALES_COLOR + '"></i>이익</span><span><i style="background:' + AN_BUYS_COLOR + '"></i>손실</span><span><i class="ly"></i>전년 같은 달</span></div></div>' + profitChart(data) + '</div>' +
        '<div id="ccRate"><h3>월별 이익률</h3>' + lineChart(data) + '</div></div>' +
        (function () {
          var ns = (an.notes || []).filter(function (n) { return n.cust === name || n.cust === '(전체)'; });
          return '<div class="cc-notes"><div class="row-between"><h3>📌 단가 변경 기록 <span class="muted small">' + ns.length + '건</span></h3><button class="btn btn-sm" id="ccNoteAdd">＋ 기록 추가</button></div>' +
            (ns.length ? '<ul class="note-tl">' + ns.map(function (n) { return '<li><b>' + esc(n.month) + '</b> <span class="note-kind k-' + NOTE_KINDS.indexOf(n.kind) + '">' + esc(n.kind) + '</span> ' + esc(noteText(n, n.cust === '(전체)').replace('[' + n.kind + '] ', '')) + (n.basis ? ' <span class="muted small">· ' + esc(n.basis) + '</span>' : '') + '</li>'; }).join('') + '</ul>'
              : '<p class="muted small" style="margin:6px 0 0">재계약·유가연동처럼 단가가 바뀐 때를 적어 두면 그래프에 📌로 표시돼요.</p>') + '</div>';
        })() +
        '<div class="cc-routes"><div><h3>주력 경로 <span class="muted small">건수 많은 순 · ' + esc(period) + '</span></h3>' + routeTable(top, '이 기간에 오더가 없어요.') + '</div>' +
        '<div><h3>손실 경로 <span class="muted small">손실 큰 순</span></h3>' + routeTable(loss, '손실 난 경로가 없어요. 👍') + '</div></div>',
      foot: '<button class="btn" data-close>닫기</button><button class="btn btn-primary" id="ccFilter">이 매출처로 걸러 보기</button>',
      onMount: function (m, close) {
        bindChartHover($('#ccTrend', m), data, function (d) { return '<b>' + d.m + '</b><br>이익 ' + won(d.p) + ' · ' + pctText(d.rate) + '<br>매출 ' + won(d.s) + '<br>' + won(d.n) + '건' + (d.ly.has ? '<br><span style="opacity:.75">전년: 이익 ' + won(d.ly.p) + '</span>' : ''); });
        bindChartHover($('#ccRate', m), data, function (d) { return '<b>' + d.m + '</b><br>이익률 ' + pctText(d.rate); });
        $('#ccNoteAdd', m).onclick = function () { close(); editNote({ cust: name }, function () { openCustCard(name); }); };
        $('#ccFilter', m).onclick = function () { f.sel = { cust: [name] }; an.dim = 'route'; an.sort = { key: 'profit', dir: 1 }; close(); renderAnalysis(); };
      }
    });
  }

  /* ───────── 분석: 월간 보고서 (A3) ───────── */

  function openReport() {
    var an = state.an, f = an.f;
    var period = f.from === f.to ? f.from : f.from + ' ~ ' + f.to;
    var rows = anFilter(null), t = agg(rows);
    var cr = cmpRange(), hasCmp = rangeHasData(cr), c = hasCmp ? agg(anFilter(null, { from: cr.from, to: cr.to })) : null;
    var yr = { from: addMonths(f.from, -12), to: addMonths(f.to, -12) }, hasYoy = an.cmp !== 'yoy' && rangeHasData(yr);
    var y = hasYoy ? agg(anFilter(null, { from: yr.from, to: yr.to })) : null;
    var byKey = function (getter, list) {
      var g = {};
      list.forEach(function (r) { var k = getter(r), x = g[k] || (g[k] = { k: k, n: 0, s: 0, b: 0 }); x.n++; x.s += r[C.sales]; x.b += r[C.buys]; });
      return Object.keys(g).map(function (k) { var x = g[k]; x.p = x.s - x.b; x.r = pct(x.p, x.s); return x; });
    };
    var bizRows = byKey(function (r) { return r[C.biz]; }, rows).sort(function (a, b) { return b.s - a.s; });
    var custs = byKey(function (r) { return r[C.disp]; }, rows);
    var topP = custs.slice().sort(function (a, b) { return b.p - a.p; }).slice(0, 10);
    var lowP = custs.filter(function (x) { return x.p < 0 || (x.r != null && x.r < 3); }).sort(function (a, b) { return a.p - b.p; }).slice(0, 10);
    // 확인해 볼 곳
    var watch = [];
    if (hasCmp) {
      var prevC = {}; byKey(function (r) { return r[C.disp]; }, anFilter(null, { from: cr.from, to: cr.to })).forEach(function (x) { prevC[x.k] = x; });
      watch = custs.map(function (x) { var p = prevC[x.k]; if (!p) return null; x.cr = p.r; x.dr = x.r != null && p.r != null ? x.r - p.r : null; x.turned = p.p > 0 && x.p < 0; return x; })
        .filter(function (x) { return x && x.s >= an.alert.minSales && (x.turned || (x.dr != null && x.dr <= -an.alert.drop)); })
        .sort(function (a, b) { return a.dr - b.dr; }).slice(0, 10);
    }
    var buyAnom = findAnomalies('buy', rows), sellAnom = findAnomalies('sell', rows);
    var sumDiff = function (l) { return Math.round(l.reduce(function (s, x) { return s + x.diff; }, 0)); };
    // 월별 (최근 12개월)
    var all = anFilter(null, { from: '', to: '' }), byM = {};
    all.forEach(function (r) { var m = r[C.date].slice(0, 7); var x = byM[m] || (byM[m] = { s: 0, b: 0, n: 0 }); x.s += r[C.sales]; x.b += r[C.buys]; x.n++; });
    var months = [];
    for (var mm = f.to, k = 0; k < 12; k++, mm = addMonths(mm, -1)) months.unshift(mm);
    var mk = function (m) { var x = byM[m] || { s: 0, b: 0, n: 0 }; return { m: m, s: x.s, b: x.b, n: x.n, p: x.s - x.b, rate: pct(x.s - x.b, x.s), has: !!byM[m] }; };
    var data = attachNotes(months.map(function (m) { var d = mk(m); d.ly = mk(addMonths(m, -12)); return d; }), (f.sel.cust || []).length ? f.sel.cust : null);
    var scope = [];
    if (f.biz.length) scope.push('사업자: ' + f.biz.join(', '));
    Object.keys(f.sel).forEach(function (kk) { if ((f.sel[kk] || []).length) scope.push(dimDef(kk)[1] + ': ' + f.sel[kk].join(', ')); });
    if (f.q) scope.push('검색: ' + f.q);
    var cmpCell = function (cur, prev, unit, goodUp, isRate) {
      if (prev == null) return '<td class="num muted">–</td>';
      return '<td class="num">' + (isRate ? pctText(prev) : won(prev)) + ' ' + deltaHtml(isRate ? (cur != null ? cur - prev : null) : deltaPct(cur, prev), unit, goodUp) + '</td>';
    };
    var tbl = function (list, cols) {
      return '<table class="data rpt"><thead><tr>' + cols.map(function (c2) { return '<th class="' + (c2[2] ? 'left' : '') + '">' + c2[0] + '</th>'; }).join('') + '</tr></thead><tbody>' +
        list.map(function (x) { return '<tr>' + cols.map(function (c2) { return c2[1](x); }).join('') + '</tr>'; }).join('') + '</tbody></table>';
    };
    var numCell = function (v, neg) { return '<td class="num' + (neg ? ' neg' : '') + '">' + v + '</td>'; };
    var html =
      '<div class="rpt-bar no-print"><span class="muted small">보고서 미리보기 · 인쇄 창에서 "PDF로 저장"을 고르면 PDF가 돼요</span><span class="spacer"></span>' +
      '<button class="btn btn-sm" id="rptX">엑셀</button><button class="btn btn-sm btn-primary" id="rptPrint">인쇄 / PDF 저장</button><button class="btn btn-sm" id="rptClose">닫기</button></div>' +
      '<div class="rpt-page">' +
      '<header class="rpt-head"><div class="stripe-bar"></div><div class="rpt-title"><div><div class="eyebrow">Monthly Report · 매출매입 보고</div><h1>' + esc(period) + ' 매출 · 매입 · 이익 보고</h1>' +
      '<p class="muted small">' + esc(scope.length ? scope.join(' · ') : '전체 사업자 · 전체 매출처') + ' · 작성 ' + esc(today()) + ' · ' + esc(state.user.name) + '</p></div><span class="logo"></span></div></header>' +
      '<section><h2>1. 요약</h2><table class="data rpt"><thead><tr><th class="left">항목</th><th>' + esc(period) + '</th><th>' + (hasCmp ? esc(cr.label) + ' 대비' : '비교') + '</th>' + (hasYoy ? '<th>전년 같은 기간 대비</th>' : '') + '</tr></thead><tbody>' +
      [['이익', t.p, c && c.p, y && y.p, '%', true], ['이익률', t.r, c && c.r, y && y.r, '%p', true, true], ['매출', t.s, c && c.s, y && y.s, '%', true], ['매입', t.b, c && c.b, y && y.b, '%', false], ['건수', t.n, c && c.n, y && y.n, '%', true]].map(function (r) {
        return '<tr><td class="left strong">' + r[0] + '</td>' + numCell(r[6] ? pctText(r[1]) : won(r[1]) + (r[0] === '건수' ? '건' : '원'), r[1] < 0) + cmpCell(r[1], c ? r[2] : null, r[4], r[5], r[6]) + (hasYoy ? cmpCell(r[1], r[3], r[4], r[5], r[6]) : '') + '</tr>';
      }).join('') + '</tbody></table></section>' +
      '<section><h2>2. 사업자별</h2>' + tbl(bizRows, [['사업자', function (x) { return '<td class="left strong">' + esc(x.k) + '</td>'; }, 1], ['건수', function (x) { return numCell(won(x.n)); }], ['매출', function (x) { return numCell(won(x.s)); }], ['매입', function (x) { return numCell(won(x.b)); }], ['이익', function (x) { return numCell(won(x.p), x.p < 0); }], ['이익률', function (x) { return numCell(pctText(x.r), x.r < 0); }]]) + '</section>' +
      '<section class="rpt-charts"><div><h2>3. 월별 이익 (최근 12개월)</h2><div class="legend"><span><i style="background:' + AN_SALES_COLOR + '"></i>이익</span><span><i style="background:' + AN_BUYS_COLOR + '"></i>손실</span><span><i class="ly"></i>전년 같은 달</span></div>' + profitChart(data) + '</div>' +
      '<div><h2>월별 이익률</h2>' + lineChart(data) + '</div></section>' +
      (hasCmp ? '<section><h2>4. 확인해 볼 곳 <span class="small muted">' + esc(cr.label) + '보다 이익률 ' + an.alert.drop + '%p 이상 하락 또는 적자 전환</span></h2>' +
        (watch.length ? tbl(watch, [['매출처', function (x) { return '<td class="left">' + (x.turned ? '<b class="neg">[적자 전환]</b> ' : '') + esc(x.k) + '</td>'; }, 1], ['이익률', function (x) { return numCell(pctText(x.r), x.r < 0); }], [esc(cr.label), function (x) { return numCell(pctText(x.cr)); }], ['변화', function (x) { return '<td class="num">' + deltaHtml(x.dr, '%p', true) + '</td>'; }], ['이익', function (x) { return numCell(won(x.p), x.p < 0); }], ['매출', function (x) { return numCell(won(x.s)); }]]) : '<p class="muted">해당하는 매출처가 없습니다.</p>') + '</section>' : '') +
      '<section class="rpt-two"><div><h2>' + (hasCmp ? '5' : '4') + '. 이익 상위 10</h2>' + tbl(topP, [['매출처', function (x) { return '<td class="left">' + esc(x.k) + '</td>'; }, 1], ['이익', function (x) { return numCell(won(x.p), x.p < 0); }], ['이익률', function (x) { return numCell(pctText(x.r)); }], ['건수', function (x) { return numCell(won(x.n)); }]]) + '</div>' +
      '<div><h2>' + (hasCmp ? '6' : '5') + '. 손실 · 저마진 10 <span class="small muted">이익률 3% 미만</span></h2>' + (lowP.length ? tbl(lowP, [['매출처', function (x) { return '<td class="left">' + esc(x.k) + '</td>'; }, 1], ['이익', function (x) { return numCell(won(x.p), x.p < 0); }], ['이익률', function (x) { return numCell(pctText(x.r), x.r < 0); }], ['건수', function (x) { return numCell(won(x.n)); }]]) : '<p class="muted">없습니다.</p>') + '</div></section>' +
      '<section><h2>' + (hasCmp ? '7' : '6') + '. 단가 이상치 <span class="small muted">같은 경로·중량 보통 단가 대비 ±' + an.anom.th + '%</span></h2>' +
      '<table class="data rpt"><tbody><tr><td class="left">매입이 평소보다 비싼 오더</td><td class="num">' + won(buyAnom.length) + '건</td><td class="num neg">+' + won(sumDiff(buyAnom)) + '원</td></tr>' +
      '<tr><td class="left">매출이 평소보다 싼 오더</td><td class="num">' + won(sellAnom.length) + '건</td><td class="num neg">−' + won(sumDiff(sellAnom)) + '원</td></tr></tbody></table>' +
      (buyAnom.length ? '<p class="small muted" style="margin:8px 0 4px">매입 초과 상위 5건</p>' + tbl(buyAnom.slice(0, 5), [['날짜', function (x) { return '<td class="left small">' + esc(x.r[C.date]) + '</td>'; }, 1], ['매출처', function (x) { return '<td class="left">' + esc(x.r[C.disp]) + '</td>'; }, 1], ['경로', function (x) { return '<td class="left">' + esc(x.r[C.from] + ' → ' + x.r[C.to] + ' · ' + x.r[C.weight]) + '</td>'; }, 1], ['매입', function (x) { return numCell(won(x.r[C.buys])); }], ['보통', function (x) { return numCell(won(Math.round(x.base))); }], ['기사', function (x) { return '<td class="left small">' + esc(x.r[C.driver]) + '</td>'; }, 1]]) : '') +
      '</section>' +
      (function () {
        var ns = notesBetween(hasCmp ? cr.from : f.from, f.to, null).filter(function (n) { return !(f.sel.cust || []).length || n.cust === '(전체)' || f.sel.cust.indexOf(n.cust) !== -1; });
        return ns.length ? '<section><h2>단가 변경 기록 <span class="small muted">' + esc(hasCmp ? cr.from : f.from) + ' ~ ' + esc(f.to) + '</span></h2>' +
          tbl(ns, [['적용 월', function (x) { return '<td class="left">' + esc(x.month) + '</td>'; }, 1], ['매출처', function (x) { return '<td class="left">' + esc(x.cust) + '</td>'; }, 1], ['구분', function (x) { return '<td class="left">' + esc(x.kind) + '</td>'; }, 1],
            ['변동', function (x) { return '<td class="left strong">' + esc((x.target !== '매출' ? x.target + ' ' : '') + x.change) + '</td>'; }, 1], ['내용', function (x) { return '<td class="left">' + esc((noteRoute(x) ? '(' + noteRoute(x) + ') ' : '') + x.memo) + '</td>'; }, 1]]) + '</section>' : '';
      })() +
      '<footer class="rpt-foot muted small">조일그룹 견적·실적 시스템 · 이익 = 매출후불 − 매입후불</footer></div>';
    var wrap = document.createElement('div');
    wrap.id = 'report';
    wrap.innerHTML = html;
    document.body.appendChild(wrap);
    document.body.classList.add('report-open');
    window.scrollTo(0, 0);
    function close() { wrap.remove(); document.body.classList.remove('report-open'); }
    $('#rptClose').onclick = close;
    $('#rptPrint').onclick = function () { window.print(); };
    $('#rptX').onclick = function () {
      var btn = this; busy(btn, true, '…');
      var custRows = custs.slice().sort(function (a, b) { return b.p - a.p; });
      var sheets = [
        { name: '요약', widths: [12, 18, 18, 18], rows: [['항목', period, hasCmp ? cr.label : '', hasYoy ? '전년 같은 기간' : '']].concat([['이익', t.p, c && c.p, y && y.p], ['이익률(%)', t.r == null ? '' : +t.r.toFixed(1), c && c.r != null ? +c.r.toFixed(1) : '', y && y.r != null ? +y.r.toFixed(1) : ''], ['매출', t.s, c && c.s, y && y.s], ['매입', t.b, c && c.b, y && y.b], ['건수', t.n, c && c.n, y && y.n]].map(function (r) { return r.map(function (v) { return v == null || v === false ? '' : v; }); })).concat([[], ['범위', scope.join(' · ') || '전체'], ['작성', today() + ' ' + state.user.name]]) },
        { name: '사업자별', widths: [14, 8, 15, 15, 15, 9], rows: [['사업자', '건수', '매출', '매입', '이익', '이익률(%)']].concat(bizRows.map(function (x) { return [x.k, x.n, x.s, x.b, x.p, x.r == null ? '' : +x.r.toFixed(1)]; })) },
        { name: '월별', widths: [10, 15, 15, 15, 9, 8], rows: [['월', '매출', '매입', '이익', '이익률(%)', '건수']].concat(data.map(function (d) { return [d.m, d.s, d.b, d.p, d.rate == null ? '' : +d.rate.toFixed(1), d.n]; })) },
        { name: '매출처별', widths: [32, 8, 15, 15, 15, 9], rows: [['매출처', '건수', '매출', '매입', '이익', '이익률(%)']].concat(custRows.map(function (x) { return [x.k, x.n, x.s, x.b, x.p, x.r == null ? '' : +x.r.toFixed(1)]; })) }
      ];
      if (hasCmp) sheets.push({ name: '확인해 볼 곳', widths: [32, 9, 12, 10, 15, 15], rows: [['매출처', '이익률(%)', cr.label + '(%)', '변화(%p)', '이익', '매출']].concat(watch.map(function (x) { return [(x.turned ? '[적자 전환] ' : '') + x.k, x.r == null ? '' : +x.r.toFixed(1), x.cr == null ? '' : +x.cr.toFixed(1), x.dr == null ? '' : +x.dr.toFixed(1), x.p, x.s]; })) });
      sheets.push({ name: '단가 이상치', widths: [8, 11, 26, 18, 18, 8, 12, 12, 12, 10], rows: [['구분', '날짜', '매출처', '발지', '착지', '중량', '금액', '보통 단가', '차이', '기사명']].concat(buyAnom.map(function (x) { return ['매입 비쌈', x.r[C.date], x.r[C.disp], x.r[C.from], x.r[C.to], x.r[C.weight], x.r[C.buys], Math.round(x.base), Math.round(x.diff), x.r[C.driver]]; })).concat(sellAnom.map(function (x) { return ['매출 쌈', x.r[C.date], x.r[C.disp], x.r[C.from], x.r[C.to], x.r[C.weight], x.r[C.sales], Math.round(x.base), Math.round(x.diff), x.r[C.driver]]; })) });
      downloadXlsx('JOIL_매출매입보고_' + period.replace(/ ~ /, '_') + '.xlsx', sheets).catch(function (err) { toast(err.message, 'err'); }).then(function () { busy(btn, false); });
    };
  }

  /* ───────── 분석: 단가 변경 기록 (비고) ───────── */

  var NOTE_KINDS = ['유가연동', '재계약', '신규', '인하', '기사 운임', '기타'];
  var NOTE_BASIS = ['계약서', '메일', '구두', '내부'];
  /** 그 달 · 그 매출처(들)에 해당하는 기록. custs 가 없으면 전체 */
  function notesFor(month, custs) {
    return (state.an.notes || []).filter(function (n) {
      return n.month === month && (!custs || !custs.length || n.cust === '(전체)' || custs.indexOf(n.cust) !== -1);
    });
  }
  function notesBetween(from, to, cust) {
    return (state.an.notes || []).filter(function (n) { return n.month >= from && n.month <= to && (!cust || n.cust === cust || n.cust === '(전체)'); });
  }
  function attachNotes(data, custs) { data.forEach(function (d) { d.notes = notesFor(d.m, custs); }); return data; }
  function noteRoute(n) { return ([n.from, n.to].filter(Boolean).join('→') + ' ' + (n.weight || '')).trim(); }
  function noteText(n, withCust) {
    return (withCust ? n.cust + ' ' : '') + '[' + n.kind + '] ' + (n.target && n.target !== '매출' ? n.target + ' ' : '') + (n.change || '') + (noteRoute(n) ? ' (' + noteRoute(n) + ')' : '') + (n.memo ? ' · ' + n.memo : '');
  }
  function noteBadge(n) {
    return '<span class="note-badge" title="' + esc(n.month + ' ' + noteText(n, true) + (n.basis ? ' · 근거: ' + n.basis : '')) + '">📌 ' + esc(n.month.slice(5).replace(/^0/, '') + '월 ' + n.kind + (n.change ? ' ' + n.change : '')) + '</span>';
  }
  function notesTip(d) {
    return d && d.notes && d.notes.length ? '<div class="tip-notes">' + d.notes.map(function (n) { return '📌 ' + esc(noteText(n, true)); }).join('<br>') + '</div>' : '';
  }
  /** 막대·선 그래프 위 깃발 (x 좌표, 위·아래 끝) */
  function noteMark(x, top, bottom) {
    return '<line x1="' + x + '" x2="' + x + '" y1="' + top + '" y2="' + bottom + '" class="note-line"/><text x="' + x + '" y="' + (top + 10) + '" text-anchor="middle" class="note-pin">📌</text>';
  }

  /** 단가 변경 기록 목록 (분석 화면 → "단가 변경 기록") */
  function openNotes(preCust) {
    var an = state.an, q = preCust || '', kind = '';
    modal({
      wide: true, eyebrow: '매출매입 분석', title: '단가 변경 기록',
      body: '<p class="muted small" style="margin:0 0 10px">재계약·유가연동·구두 합의처럼 매출매입 엑셀에는 없는 단가 변경을 적어 두면, 그래프에 📌로 표시되고 "확인해 볼 곳"·매출처 상세·월간 보고서에도 같이 나와요.</p>' +
        '<div class="toolbar"><input class="input input-sm" id="ntQ" placeholder="매출처·내용 검색" value="' + esc(q) + '" style="max-width:220px">' +
        '<select class="input input-sm" id="ntK" style="width:auto"><option value="">모든 구분</option>' + NOTE_KINDS.map(function (k) { return '<option>' + k + '</option>'; }).join('') + '</select>' +
        '<span class="spacer"></span><button class="btn btn-sm" id="ntTpl">엑셀 양식</button><label class="btn btn-sm" for="ntFile">엑셀로 한꺼번에 올리기</label><input type="file" id="ntFile" accept=".xlsx,.xls,.csv" hidden>' +
        '<button class="btn btn-sm" id="ntX">엑셀 내려받기</button><button class="btn btn-sm btn-primary" id="ntAdd">＋ 기록 추가</button></div>' +
        '<div id="ntList"></div>',
      foot: '<button class="btn" data-close>닫기</button>',
      onMount: function (m, close) {
        var draw = function () {
          var list = (an.notes || []).filter(function (n) { return (!kind || n.kind === kind) && (!q || (n.cust + ' ' + n.memo + ' ' + n.change + ' ' + noteRoute(n)).indexOf(q) !== -1); });
          $('#ntList', m).innerHTML = list.length ? '<div class="table-wrap"><table class="data notes-table"><thead><tr><th class="left">적용 월</th><th class="left">매출처</th><th class="left">구분</th><th class="left">대상</th><th class="left">변동</th><th class="left">경로 한정</th><th class="left">근거</th><th class="left">내용</th><th class="left">작성</th><th></th></tr></thead><tbody>' +
            list.map(function (n) {
              return '<tr><td class="left strong">' + esc(n.month) + '</td><td class="left">' + esc(n.cust) + '</td><td class="left"><span class="note-kind k-' + NOTE_KINDS.indexOf(n.kind) + '">' + esc(n.kind) + '</span></td><td class="left small">' + esc(n.target) + '</td>' +
                '<td class="left strong">' + esc(n.change) + '</td><td class="left small">' + esc(noteRoute(n) || '–') + '</td><td class="left small">' + esc(n.basis || '–') + '</td><td class="left small wrap">' + esc(n.memo) + '</td>' +
                '<td class="left small muted">' + esc(String(n.by).replace(/ \(.*\)$/, '')) + '<br>' + esc(String(n.at).slice(0, 10)) + '</td>' +
                '<td class="nowrap"><button class="btn btn-sm btn-ghost" data-e="' + esc(n.id) + '">수정</button><button class="btn btn-sm btn-ghost" data-d="' + esc(n.id) + '">삭제</button></td></tr>';
            }).join('') + '</tbody></table></div>' : '<p class="muted" style="margin:14px 0">' + ((an.notes || []).length ? '조건에 맞는 기록이 없어요.' : '아직 기록이 없어요. "＋ 기록 추가"로 첫 기록을 남겨 보세요.') + '</p>';
          $$('[data-e]', m).forEach(function (b) { b.onclick = function () { editNote(an.notes.filter(function (n) { return n.id === b.dataset.e; })[0], draw); }; });
          $$('[data-d]', m).forEach(function (b) {
            b.onclick = function () {
              if (!confirm('이 기록을 지울까요?')) return;
              api('notes.delete', { id: b.dataset.d }).then(function (r) { an.notes = r.notes; draw(); redrawAnalysisNotes(); }).catch(function (err) { toast(err.message, 'err'); });
            };
          });
        };
        var st; $('#ntQ', m).oninput = function () { var v = this.value; clearTimeout(st); st = setTimeout(function () { q = v.trim(); draw(); }, 200); };
        $('#ntK', m).onchange = function () { kind = this.value; draw(); };
        $('#ntAdd', m).onclick = function () { editNote({ cust: preCust || '' }, draw); };
        $('#ntTpl', m).onclick = function () {
          var btn = this; busy(btn, true, '…');
          downloadXlsx('JOIL_단가변경기록_양식.xlsx', [{ name: '단가변경', widths: [11, 24, 11, 10, 16, 9, 18, 18, 9, 40], rows: [['적용 월', '매출처', '구분', '대상', '변동', '근거', '발지', '착지', '중량', '내용'],
            ['2026-07', '화인', '유가연동', '매출', '+3.2%', '계약서', '', '', '', '← 예시 줄 (지우고 쓰세요)'], ['2026-05', '삼다수', '재계약', '매출', '5톤 +20,000', '구두', '제주', '', '5톤', '김부장님 통화 합의']] },
            { name: '안내', widths: [90], rows: [['적용 월: 2026-07 처럼 (그 달부터 적용)'], ['매출처: 분석 화면의 표시 이름 (모든 매출처는 "(전체)")'], ['구분: ' + NOTE_KINDS.join(' / ')], ['대상: 매출 / 매입 / 매출·매입'], ['근거: ' + NOTE_BASIS.join(' / ')], ['발지·착지·중량: 특정 경로만 바뀐 경우에만 (나머지는 비워 두기)']] }])
            .catch(function (err) { toast(err.message, 'err'); }).then(function () { busy(btn, false); });
        };
        $('#ntX', m).onclick = function () {
          var btn = this; busy(btn, true, '…');
          downloadXlsx('JOIL_단가변경기록_' + today() + '.xlsx', [{ name: '단가변경', widths: [11, 24, 11, 10, 16, 9, 18, 18, 9, 40, 16, 17], rows: [['적용 월', '매출처', '구분', '대상', '변동', '근거', '발지', '착지', '중량', '내용', '작성자', '작성일시']].concat((an.notes || []).map(function (n) {
            return [n.month, n.cust, n.kind, n.target, n.change, n.basis, n.from, n.to, n.weight, n.memo, String(n.by).replace(/ \(.*\)$/, ''), n.at];
          })) }]).catch(function (err) { toast(err.message, 'err'); }).then(function () { busy(btn, false); });
        };
        $('#ntFile', m).onchange = function () {
          var file = this.files[0]; this.value = ''; if (!file) return;
          Promise.all([loadXlsx(), file.arrayBuffer()]).then(function (res) {
            var X = res[0], wb = X.read(new Uint8Array(res[1]), { type: 'array', cellDates: true });
            var grid = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames.filter(function (n) { return /단가|변경/.test(n); })[0] || wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
            var hi = grid.findIndex(function (r) { return r.some(function (c) { return /적용/.test(String(c)); }) && r.some(function (c) { return /매출처/.test(String(c)); }); });
            if (hi === -1) throw new Error('"적용 월 · 매출처" 제목 줄을 찾지 못했어요. 양식을 내려받아 써 주세요.');
            var h = grid[hi].map(function (c) { return String(c).replace(/\s/g, ''); });
            var col = function (re) { return h.findIndex(function (c) { return re.test(c); }); };
            var c = { month: col(/적용/), cust: col(/매출처/), kind: col(/구분/), target: col(/대상/), change: col(/변동/), basis: col(/근거/), from: col(/발지|상차/), to: col(/착지|하차/), weight: col(/중량|톤/), memo: col(/내용|메모|비고/) };
            var g = function (r, k) { return c[k] === -1 ? '' : String(r[c[k]] == null ? '' : r[c[k]]).trim(); };
            var rows = grid.slice(hi + 1).filter(function (r) { return g(r, 'cust') && !/예시/.test(g(r, 'memo')); }).map(function (r) {
              var mv = r[c.month], month = mv instanceof Date ? mv.getFullYear() + '-' + ('0' + (mv.getMonth() + 1)).slice(-2) : (String(mv).match(/(\d{4})\D*(\d{1,2})/) || []).slice(1).map(function (x, i) { return i ? ('0' + x).slice(-2) : x; }).join('-');
              return { month: month, cust: g(r, 'cust'), kind: g(r, 'kind'), target: g(r, 'target') || '매출', change: g(r, 'change'), basis: g(r, 'basis'), from: g(r, 'from'), to: g(r, 'to'), weight: g(r, 'weight'), memo: g(r, 'memo') };
            });
            if (!rows.length) throw new Error('올릴 기록이 없어요.');
            if (!confirm(rows.length + '개 기록을 추가할까요?')) return null;
            return api('notes.import', { rows: rows });
          }).then(function (r) { if (!r) return; an.notes = r.notes; toast(r.count + '개 기록을 추가했어요.'); draw(); redrawAnalysisNotes(); })
            .catch(function (err) { toast(err.message, 'err'); });
        };
        draw();
      }
    });
  }

  /** 기록 추가·수정 */
  function editNote(n, after) {
    var an = state.an, isNew = !n.id;
    var custs = {};
    (an.rows || []).forEach(function (r) { if (!r[C.hidden]) custs[r[C.disp]] = (custs[r[C.disp]] || 0) + r[C.sales]; });
    var custList = ['(전체)'].concat(Object.keys(custs).sort(function (a, b) { return custs[b] - custs[a]; }));
    var ms = anMonths(), lastM = ms[ms.length - 1] || today().slice(0, 7);
    modal({
      eyebrow: '단가 변경 기록', title: isNew ? '기록 추가' : '기록 수정',
      body: '<div class="qd-two"><div class="field"><label>매출처 <span style="color:var(--red)">*</span></label><input class="input" id="neC" list="neCs" value="' + esc(n.cust || '') + '" placeholder="이름 일부 입력"><datalist id="neCs">' + custList.slice(0, 3000).map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist></div>' +
        '<div class="field"><label>적용 시작 월 <span style="color:var(--red)">*</span></label><input class="input" id="neM" type="month" value="' + esc(n.month || lastM) + '"></div></div>' +
        '<div class="field"><label>구분</label><div class="segmented" id="neK">' + NOTE_KINDS.map(function (k) { return '<button type="button" data-v="' + k + '" class="' + ((n.kind || '유가연동') === k ? 'on' : '') + '">' + k + '</button>'; }).join('') + '</div></div>' +
        '<div class="qd-two"><div class="field"><label>대상</label><div class="segmented" id="neT">' + ['매출', '매입', '매출·매입'].map(function (k) { return '<button type="button" data-v="' + k + '" class="' + ((n.target || '매출') === k ? 'on' : '') + '">' + k + '</button>'; }).join('') + '</div></div>' +
        '<div class="field"><label>근거</label><div class="segmented" id="neB"><button type="button" data-v="" class="' + (!n.basis ? 'on' : '') + '">없음</button>' + NOTE_BASIS.map(function (k) { return '<button type="button" data-v="' + k + '" class="' + (n.basis === k ? 'on' : '') + '">' + k + '</button>'; }).join('') + '</div></div></div>' +
        '<div class="field"><label>변동 <span class="muted">(예: +3.2%, 5톤 +20,000, 단가 650,000 → 680,000)</span></label><input class="input" id="neV" maxlength="100" value="' + esc(n.change || '') + '"></div>' +
        '<details class="ne-route"' + (n.from || n.to || n.weight ? ' open' : '') + '><summary>특정 경로·중량만 바뀐 경우</summary><div class="qd-three"><div class="field"><label>발지</label><input class="input" id="neF" list="neFs" value="' + esc(n.from || '') + '"></div>' +
        '<div class="field"><label>착지</label><input class="input" id="neTo" list="neTs" value="' + esc(n.to || '') + '"></div><div class="field"><label>중량</label><input class="input" id="neW" list="neWs" value="' + esc(n.weight || '') + '"></div></div>' +
        '<datalist id="neFs"></datalist><datalist id="neTs"></datalist><datalist id="neWs"></datalist></details>' +
        '<div class="field"><label>내용</label><textarea class="input memo" id="neMemo" maxlength="1000" placeholder="예) 3분기 유가연동 인상분, 10월 청구분부터 반영">' + esc(n.memo || '') + '</textarea></div>',
      foot: '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="neSave">저장</button>',
      onMount: function (m, close) {
        ['#neK', '#neT', '#neB'].forEach(function (id) { $$(id + ' button', m).forEach(function (b) { b.onclick = function () { $$(id + ' button', m).forEach(function (x) { x.classList.toggle('on', x === b); }); }; }); });
        var fillRoute = function () {
          var c = $('#neC', m).value.trim(), f = {}, t = {}, w = {};
          (an.rows || []).forEach(function (r) { if (r[C.disp] === c) { f[r[C.from]] = 1; t[r[C.to]] = 1; w[r[C.weight]] = 1; } });
          var opt = function (o) { return Object.keys(o).filter(Boolean).slice(0, 500).map(function (x) { return '<option value="' + esc(x) + '">'; }).join(''); };
          $('#neFs', m).innerHTML = opt(f); $('#neTs', m).innerHTML = opt(t); $('#neWs', m).innerHTML = opt(w);
        };
        $('#neC', m).onchange = fillRoute; fillRoute();
        $('#neSave', m).onclick = function () {
          var v = function (id) { return $(id, m).value.trim(); };
          var note = { cust: v('#neC'), month: v('#neM'), kind: $('#neK button.on', m).dataset.v, target: $('#neT button.on', m).dataset.v, basis: $('#neB button.on', m).dataset.v,
            change: v('#neV'), from: v('#neF'), to: v('#neTo'), weight: v('#neW'), memo: v('#neMemo') };
          if (!note.cust) return toast('매출처를 입력하세요.', 'err');
          if (note.cust !== '(전체)' && !custs[note.cust] && !confirm('"' + note.cust + '"은 분석 데이터에 없는 이름이에요. 그래도 저장할까요?')) return;
          var btn = this; busy(btn, true, '저장 중…');
          api('notes.save', { id: n.id || '', note: note }).then(function (r) {
            an.notes = r.notes; close(); toast('기록을 저장했어요.'); if (after) after(); redrawAnalysisNotes();
          }).catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
        };
      }
    });
  }
  /** 기록이 바뀌면 분석 화면 그래프·확인해 볼 곳을 다시 그림 */
  function redrawAnalysisNotes() { if (state.view === 'analysis' && state.an.rows && $('#anTrend')) renderAnalysis(); }

  /* ───────── 매출매입 분석 화면 ───────── */

  var AN_DIMS = [
    ['cust', '매출처', function (r) { return r[C.disp]; }],
    ['biz', '사업자', function (r) { return r[C.biz]; }],
    ['month', '월', function (r) { return r[C.date].slice(0, 7); }],
    ['from', '발지', function (r) { return r[C.from]; }],
    ['to', '착지', function (r) { return r[C.to]; }],
    ['driver', '기사명', function (r) { return r[C.driver]; }],
    ['car', '차량번호', function (r) { return r[C.car]; }],
    ['weight', '중량', function (r) { return r[C.weight]; }],
    ['cat', '구분', function (r) { return r[C.cat] && r[C.cat] !== '__x' ? r[C.cat] : '운송'; }],
    ['route', '경로 조합', function (r) { return r[C.from] + ' → ' + r[C.to] + (state.an.routeWeight ? ' · ' + r[C.weight] : ''); }]
  ];

  /* ── 비교 기간 (직전 같은 길이 / 전년 같은 기간) ── */
  function addMonths(m, k) {
    var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + k;
    y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12;
    return y + '-' + ('0' + (mo + 1)).slice(-2);
  }
  function monthSpan(from, to) { return (+to.slice(0, 4) - +from.slice(0, 4)) * 12 + (+to.slice(5, 7) - +from.slice(5, 7)) + 1; }
  function cmpRange() {
    var f = state.an.f, back = state.an.cmp === 'yoy' ? 12 : monthSpan(f.from, f.to);
    return { from: addMonths(f.from, -back), to: addMonths(f.to, -back), label: state.an.cmp === 'yoy' ? '전년 같은 기간' : (back === 1 ? '전월' : '직전 ' + back + '개월') };
  }
  function rangeHasData(r) { return anMonths().some(function (m) { return m >= r.from && m <= r.to; }); }
  function agg(rows) {
    var a = { n: rows.length, s: 0, b: 0 };
    rows.forEach(function (r) { a.s += r[C.sales]; a.b += r[C.buys]; });
    a.p = a.s - a.b; a.r = pct(a.p, a.s);
    return a;
  }
  function deltaPct(cur, prev) { return prev ? (cur - prev) / Math.abs(prev) * 100 : null; }
  function deltaHtml(v, unit, goodUp) {
    if (v == null || !isFinite(v)) return '<span class="dl">비교 없음</span>';
    var up = v > 0.05, down = v < -0.05;
    var cls = up ? (goodUp ? 'good' : 'bad') : down ? (goodUp ? 'bad' : 'good') : '';
    return '<span class="dl ' + cls + '">' + (up ? '▲ ' : down ? '▼ ' : '') + Math.abs(v).toFixed(1) + unit + '</span>';
  }
  function dimDef(key) { return AN_DIMS.filter(function (d) { return d[0] === key; })[0]; }

  function shortWon(n) {
    var a = Math.abs(n), sign = n < 0 ? '-' : '';
    if (a >= 1e8) return sign + (a / 1e8).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0$/, '') + '억';
    if (a >= 1e4) return sign + Math.round(a / 1e4).toLocaleString('ko-KR') + '만';
    return sign + Math.round(a).toLocaleString('ko-KR');
  }
  function pct(p, s) { return s ? (p / s * 100) : null; }
  function pctText(v) { return v == null ? '–' : v.toFixed(1) + '%'; }

  /** 필터 적용 (excludeDim: 해당 차원 선택은 빼고 — 순위표가 선택지를 계속 보여주도록) */
  function anFilter(excludeDim, opts) {
    var an = state.an, f = an.f, out = [];
    var catsOnly = !!(opts && opts.catsOnly);
    var fFrom = opts && opts.hasOwnProperty('from') ? opts.from : f.from;
    var fTo = opts && opts.hasOwnProperty('to') ? opts.to : f.to;
    var bizSet = f.biz.length ? f.biz : null;
    var sel = {};
    Object.keys(f.sel).forEach(function (k) { if (k !== excludeDim && f.sel[k] && f.sel[k].length) sel[k] = f.sel[k]; });
    var selKeys = Object.keys(sel), getters = {};
    selKeys.forEach(function (k) { getters[k] = dimDef(k)[2]; });
    var q = f.q.trim();
    for (var i = 0; i < an.rows.length; i++) {
      var r = an.rows[i];
      if (r[C.hidden]) continue;
      var cat = r[C.cat];
      if (an.showExcluded) { if (cat !== '__x') continue; }
      else {
        if (cat === '__x') continue;
        if (catsOnly ? !cat : (cat && !f.withCats)) continue;
      }
      var m = r[C.date].slice(0, 7);
      if (fFrom && m < fFrom) continue;
      if (fTo && m > fTo) continue;
      if (bizSet && bizSet.indexOf(r[C.biz]) === -1) continue;
      var ok = true;
      for (var j = 0; j < selKeys.length; j++) { if (sel[selKeys[j]].indexOf(getters[selKeys[j]](r)) === -1) { ok = false; break; } }
      if (!ok) continue;
      if (q && (r[C.disp] + ' ' + r[C.from] + ' ' + r[C.to] + ' ' + r[C.driver] + ' ' + r[C.car] + ' ' + r[C.weight] + ' ' + r[C.etc] + ' ' + r[C.note]).indexOf(q) === -1) continue;
      out.push(r);
    }
    return out;
  }

  function renderAnalysis() {
    var an = state.an;
    var main = $('#main');
    if (state.user.mustChange) { main.innerHTML = '<div class="card muted">비밀번호를 바꾸면 분석 화면이 열립니다.</div>'; return; }
    if (!an.rows) {
      main.innerHTML = '<div class="card empty"><div><div class="big-stripes"></div><h3>분석 데이터를 불러오는 중…</h3><p class="muted" style="margin:0"><span class="spinner dark"></span> <span id="anProg"></span></p></div></div>';
      loadAnalysis().then(function () { if (state.view === 'analysis') renderAnalysis(); }).catch(function (err) {
        if (state.view !== 'analysis') return;
        main.innerHTML = '<div class="card"><p class="err-text" style="margin:0 0 12px">' + esc(err.message) + '</p><button class="btn btn-primary btn-sm" id="anRetry">다시 불러오기</button></div>';
        $('#anRetry').onclick = function () { renderAnalysis(); };
      });
      return;
    }
    if (!an.rows.length) {
      main.innerHTML = '<div class="card empty"><div><div class="big-stripes"></div><h3>아직 분석 데이터가 없어요</h3><p class="muted" style="margin:0">' +
        (state.user.role === 'admin' ? '관리자 → 분석 데이터에서 매출매입 엑셀을 올려 주세요.' : '관리자가 데이터를 올리면 여기서 볼 수 있어요.') + '</p></div></div>';
      return;
    }
    var months = anMonths();
    var f = an.f;
    main.innerHTML =
      '<div class="card anfilter">' +
      '<div class="row-between" style="flex-wrap:wrap;gap:10px;margin-bottom:12px"><div><div class="eyebrow">Analysis · 매출매입 분석</div><h2>매출 · 매입 · 이익</h2></div>' +
      '<div class="actions"><button class="btn btn-sm" id="anNotes">📌 단가 변경 기록' + ((an.notes || []).length ? ' <span class="cnt">' + an.notes.length + '</span>' : '') + '</button><button class="btn btn-sm btn-primary" id="anReport">월간 보고서</button><button class="btn btn-sm" id="anReset">필터 초기화</button><button class="btn btn-sm" id="anReload">데이터 새로고침</button></div></div>' +
      '<div class="anfilter-row">' +
      '<div class="fgroup"><span class="flabel">기간</span><select class="input input-sm" id="anFrom">' + months.map(function (m) { return '<option' + (m === f.from ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select>' +
      '<span class="muted">~</span><select class="input input-sm" id="anTo">' + months.map(function (m) { return '<option' + (m === f.to ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select>' +
      '<div class="segmented" id="anQuick"><button type="button" data-n="1">최근 1개월</button><button type="button" data-n="3">3개월</button><button type="button" data-n="12">12개월</button><button type="button" data-n="0">전체</button></div></div>' +
      '<div class="fgroup"><span class="flabel">사업자</span><div class="chips" id="anBiz">' + an.businesses.map(function (b) {
        return '<button type="button" class="chip ' + (f.biz.indexOf(b) !== -1 ? 'on' : '') + '" data-b="' + esc(b) + '">' + esc(b) + '</button>';
      }).join('') + '</div></div>' +
      '<div class="fgroup"><span class="flabel">매출처</span><button class="btn btn-sm" id="anCustPick">' + ((f.sel.cust || []).length ? (f.sel.cust || []).length + '곳 선택됨' : '전체 · 고르기') + '</button></div>' +
      (an.hasCats || state.user.role === 'admin' ? '<div class="fgroup"><span class="flabel">보기</span><div class="chips">' +
        (an.hasCats ? '<button type="button" class="chip ' + (f.withCats ? 'on' : '') + '" id="anWithCats">분류 항목 포함</button>' : '') +
        (state.user.role === 'admin' ? '<button type="button" class="chip ' + (an.showExcluded ? 'on' : '') + '" id="anShowX" title="관리자만 보이는 버튼">제외된 행만 보기</button>' : '') +
        '</div></div>' : '') +
      '</div><div id="anChips" class="anchips"></div></div>' +
      (an.showExcluded ? '<p class="notice" style="margin-top:16px">지금은 <b>제외 규칙에 걸린 행만</b> 보고 있어요. (관리자 확인용) 다시 누르면 원래대로 돌아가요.</p>' : '') +
      '<div id="anKpi" class="kpis"></div><div id="anAlerts"></div><div id="anCats"></div>' +
      '<div class="an-charts"><div class="card" id="anTrend"></div><div class="card" id="anRate"></div></div>' +
      '<div class="card" id="anGroup" style="margin-top:16px"></div>' +
      '<div id="anAnom" style="margin-top:16px"></div>' +
      '<div class="card" id="anDetail" style="margin-top:16px"></div>';

    $('#anFrom').onchange = function () { f.from = this.value; if (f.to < f.from) f.to = f.from; refresh(); };
    $('#anTo').onchange = function () { f.to = this.value; if (f.from > f.to) f.from = f.to; refresh(); };
    $$('#anQuick button').forEach(function (b) {
      b.onclick = function () {
        var n = Number(b.dataset.n), last = months[months.length - 1];
        f.to = last; f.from = n ? months[Math.max(0, months.length - n)] : months[0];
        refresh();
      };
    });
    $$('#anBiz .chip').forEach(function (c) {
      c.onclick = function () { var i = f.biz.indexOf(c.dataset.b); if (i === -1) f.biz.push(c.dataset.b); else f.biz.splice(i, 1); refresh(); };
    });
    $('#anCustPick').onclick = openCustPicker;
    $('#anReport').onclick = openReport;
    $('#anNotes').onclick = function () { openNotes(''); };
    var wc = $('#anWithCats'); if (wc) wc.onclick = function () { f.withCats = !f.withCats; refresh(); };
    var sx = $('#anShowX'); if (sx) sx.onclick = function () { an.showExcluded = !an.showExcluded; refresh(); };
    $('#anReset').onclick = function () { f.biz = []; f.sel = {}; f.q = ''; f.to = months[months.length - 1]; f.from = f.to; an.detailPage = 0; refresh(); };
    $('#anReload').onclick = function () { an.rows = null; renderAnalysis(); };

    function refresh() {
      an.detailPage = 0; an.groupLimit = 50;
      renderAnalysis();
    }
    drawAnalysisBody();
  }

  function drawAnalysisBody() {
    syncRoute();
    var an = state.an, f = an.f;
    $('#anFrom').value = f.from; $('#anTo').value = f.to;
    // 선택 칩
    var chips = [];
    Object.keys(f.sel).forEach(function (k) {
      (f.sel[k] || []).forEach(function (v) { chips.push('<button class="fchip" data-k="' + k + '" data-v="' + esc(v) + '"><b>' + esc(dimDef(k)[1]) + '</b> ' + esc(v || '(빈칸)') + ' ✕</button>'); });
    });
    if (f.q) chips.push('<button class="fchip" data-q="1"><b>검색</b> ' + esc(f.q) + ' ✕</button>');
    $('#anChips').innerHTML = chips.length ? chips.join('') : '<span class="hint">아래 순위표의 행을 누르면 그 항목으로 걸러져요. (예: 업체 → 발지 → 기사 순으로 좁혀 보기)</span>';
    $$('#anChips .fchip').forEach(function (c) {
      c.onclick = function () {
        if (c.dataset.q) f.q = '';
        else { var arr = f.sel[c.dataset.k]; arr.splice(arr.indexOf(c.dataset.v), 1); }
        an.detailPage = 0; renderAnalysis();
      };
    });

    var rows = anFilter(null);
    var t = agg(rows);
    var cr = cmpRange(), hasCmp = rangeHasData(cr);
    var c = hasCmp ? agg(anFilter(null, { from: cr.from, to: cr.to })) : null;
    var period = f.from === f.to ? f.from : f.from + ' ~ ' + f.to;
    var cmpText = cr.label + ' (' + (cr.from === cr.to ? cr.from : cr.from + ' ~ ' + cr.to) + ')';
    $('#anKpi').innerHTML = [
      ['이익', won(t.p) + '원', t.p < 0, c && deltaHtml(deltaPct(t.p, c.p), '%', true), c && won(c.p)],
      ['이익률', pctText(t.r), t.r != null && t.r < 0, c && (t.r != null && c.r != null ? deltaHtml(t.r - c.r, '%p', true) : deltaHtml(null)), c && pctText(c.r)],
      ['매출', won(t.s) + '원', false, c && deltaHtml(deltaPct(t.s, c.s), '%', true), c && won(c.s)],
      ['매입', won(t.b) + '원', false, c && deltaHtml(deltaPct(t.b, c.b), '%', false), c && won(c.b)],
      ['건수', won(t.n) + '건', false, c && deltaHtml(deltaPct(t.n, c.n), '%', true), c && won(c.n)]
    ].map(function (k, i) {
      return '<div class="card kpi' + (i < 2 ? ' main' : '') + '" style="--i:' + i + '"><div class="k">' + k[0] + '</div><div class="v num' + (k[2] ? ' neg' : '') + '">' + k[1] + '</div>' +
        '<div class="s">' + (hasCmp ? k[3] + ' <span class="muted">' + esc(cr.label) + ' ' + k[4] + '</span>' : esc(period)) + '</div></div>';
    }).join('') + '<div class="kpi-cmp"><span class="small muted">' + esc(period) + ' 기준 · 비교:</span><div class="segmented" id="anCmp">' +
      '<button type="button" data-c="prev" class="' + (an.cmp === 'prev' ? 'on' : '') + '">직전 기간</button><button type="button" data-c="yoy" class="' + (an.cmp === 'yoy' ? 'on' : '') + '">전년 같은 기간</button></div>' +
      '<span class="small muted">' + esc(cmpText) + (hasCmp ? '' : ' · <b>비교할 데이터가 없어요</b>') + '</span></div>';
    $$('#anCmp button').forEach(function (b) { b.onclick = function () { an.cmp = b.dataset.c; var y = window.scrollY; renderAnalysis(); window.scrollTo(0, y); }; });
    drawAlerts(cr, hasCmp);

    drawCats();
    if (an.dim === 'cat' && !(an.hasCats && f.withCats)) an.dim = 'cust';
    drawTrend();
    drawGroup();
    drawAnomalies(rows);
    drawDetail(rows);
  }

  /** 분류 규칙으로 따로 모은 항목 (분류 항목 포함을 끈 상태에서만) */
  function drawCats() {
    var an = state.an, box = $('#anCats');
    if (!box) return;
    if (!an.hasCats || an.f.withCats || an.showExcluded) { box.innerHTML = ''; return; }
    var g = {}, t = { n: 0, s: 0, b: 0 };
    anFilter(null, { catsOnly: true }).forEach(function (r) {
      var x = g[r[C.cat]] || (g[r[C.cat]] = { k: r[C.cat], n: 0, s: 0, b: 0 });
      x.n++; x.s += r[C.sales]; x.b += r[C.buys]; t.n++; t.s += r[C.sales]; t.b += r[C.buys];
    });
    var list = Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return b.s - a.s; });
    if (!list.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="card cats-card"><div class="row-between" style="flex-wrap:wrap;gap:8px;margin-bottom:8px"><div><div class="eyebrow">Other · 따로 분류한 항목</div><h3>위 숫자에 포함되지 않은 항목</h3></div>' +
      '<span class="small muted">"분류 항목 포함"을 켜면 운송과 합쳐서 볼 수 있어요</span></div>' +
      '<div class="table-wrap"><table class="data"><thead><tr><th class="left">구분</th><th>건수</th><th>매출</th><th>매입</th><th>이익</th></tr></thead><tbody>' +
      list.map(function (x) { return '<tr><td class="left ton">' + esc(x.k) + '</td><td class="num">' + won(x.n) + '</td><td class="num">' + won(x.s) + '</td><td class="num">' + won(x.b) + '</td><td class="num' + (x.s - x.b < 0 ? ' neg' : '') + '">' + won(x.s - x.b) + '</td></tr>'; }).join('') +
      (list.length > 1 ? '<tr class="sum"><td class="left">합계</td><td class="num">' + won(t.n) + '</td><td class="num">' + won(t.s) + '</td><td class="num">' + won(t.b) + '</td><td class="num">' + won(t.s - t.b) + '</td></tr>' : '') +
      '</tbody></table></div></div>';
  }

  /** 월별 추이: 기간 필터는 무시하고 전체 월을 보여줘서 흐름을 볼 수 있게 (선택 기간은 강조) */
  function drawTrend() {
    var an = state.an;
    var all = anFilter(null, { from: '', to: '' });
    var byM = {};
    all.forEach(function (r) { var m = r[C.date].slice(0, 7); var x = byM[m] || (byM[m] = { s: 0, b: 0, n: 0 }); x.s += r[C.sales]; x.b += r[C.buys]; x.n++; });
    // 데이터가 없는 달도 빈칸으로 넣어서 실제 시간 간격대로 보이게 (최근 24개월)
    var have = anMonths(), months = [];
    if (have.length) {
      var lastM = have[have.length - 1], firstM = have[0];
      for (var mm = lastM, k = 0; k < 24 && mm >= firstM; k++, mm = addMonths(mm, -1)) months.unshift(mm);
    }
    var mk = function (m) { var x = byM[m] || { s: 0, b: 0, n: 0 }; return { m: m, s: x.s, b: x.b, n: x.n, p: x.s - x.b, rate: pct(x.s - x.b, x.s), has: !!byM[m] }; };
    var data = attachNotes(months.map(function (m) { var d = mk(m); d.ly = mk(addMonths(m, -12)); return d; }), (an.f.sel.cust || []).length ? an.f.sel.cust : null);
    var profitMode = an.trendMode !== 'sb';
    $('#anTrend').innerHTML = '<div class="row-between" style="flex-wrap:wrap;gap:8px;margin-bottom:6px"><div><div class="eyebrow">Trend · 월별 추이</div><h3>' + (profitMode ? '월별 이익' : '월별 매출 · 매입') + '</h3></div>' +
      '<div class="actions" style="align-items:center"><div class="legend">' + (profitMode
        ? '<span><i style="background:' + AN_SALES_COLOR + '"></i>이익</span><span><i style="background:' + AN_BUYS_COLOR + '"></i>손실</span><span><i class="ly"></i>전년 같은 달</span>'
        : '<span><i style="background:' + AN_SALES_COLOR + '"></i>매출</span><span><i style="background:' + AN_BUYS_COLOR + '"></i>매입</span>') + '</div>' +
      '<div class="segmented" id="anTrendMode"><button type="button" data-m="profit" class="' + (profitMode ? 'on' : '') + '">이익</button><button type="button" data-m="sb" class="' + (!profitMode ? 'on' : '') + '">매출·매입</button></div></div></div>' +
      (profitMode ? profitChart(data) : columnChart(data)) + '<p class="hint" style="margin:6px 0 0">' + months.length + '개월 · 기간 외 조건(사업자·매출처 등)은 반영 · 선택 기간은 진하게</p>';
    $('#anRate').innerHTML = '<div class="eyebrow">Margin · 이익률</div><h3 style="margin-bottom:6px">월별 이익률</h3>' + lineChart(data) +
      '<p class="hint" style="margin:6px 0 0">이익률 = (매출 − 매입) ÷ 매출</p>';
    $$('#anTrendMode button').forEach(function (b) { b.onclick = function () { an.trendMode = b.dataset.m; drawTrend(); }; });
    var lyText = function (d) { return d.ly.has ? '<br><span style="opacity:.75">전년 ' + d.ly.m + ': 이익 ' + won(d.ly.p) + ' · ' + pctText(d.ly.rate) + '</span>' : ''; };
    bindChartHover($('#anTrend'), data, function (d) {
      return '<b>' + d.m + '</b><br><i style="background:' + AN_SALES_COLOR + '"></i>매출 ' + won(d.s) + '<br><i style="background:' + AN_BUYS_COLOR + '"></i>매입 ' + won(d.b) +
        '<br>이익 ' + won(d.p) + ' · ' + pctText(d.rate) + '<br>' + won(d.n) + '건' + lyText(d);
    });
    bindChartHover($('#anRate'), data, function (d) { return '<b>' + d.m + '</b><br>이익률 ' + pctText(d.rate) + '<br>이익 ' + won(d.p) + lyText(d); });
  }

  /** 휴대폰처럼 좁은 화면에서는 차트 폭을 줄여 글자가 너무 작아지지 않게 */
  function chartW(w) { var vw = window.innerWidth || 1000; return vw < 640 ? Math.min(w, 420) : w; }

  /** 월별 이익 막대 (손실은 아래로) + 전년 같은 달 이익 표시(가로 눈금) */
  function profitChart(data) {
    var W = chartW(640), H = 240, L = 52, R = 8, T = 10, B = 26;
    var vals = [];
    data.forEach(function (d) { vals.push(d.p); if (d.ly.has) vals.push(d.ly.p); });
    var maxV = niceMax(Math.max.apply(null, vals.concat([1]))), minV = Math.min.apply(null, vals.concat([0]));
    minV = minV < 0 ? -niceMax(-minV) : 0;
    var n = data.length, band = (W - L - R) / Math.max(n, 1), bw = Math.min(24, Math.max(4, band * 0.55));
    var y = function (v) { return T + (H - T - B) * (maxV - v) / (maxV - minV); };
    var f = state.an.f;
    var ticks = [];
    for (var k = 0; k <= 4; k++) ticks.push(minV + (maxV - minV) * k / 4);
    var grid = ticks.map(function (v) { return '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="gridl"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" class="axis" text-anchor="end">' + shortWon(v) + '</text>'; }).join('');
    var bars = data.map(function (d, i) {
      var cx = L + band * i + band / 2, x0 = cx - bw / 2, inRange = d.m >= f.from && d.m <= f.to, op = inRange ? 1 : 0.35;
      var out = '';
      if (d.has && d.p !== 0) {
        var top = y(Math.max(d.p, 0)), bot = y(Math.min(d.p, 0)), h = bot - top, r = Math.min(4, bw / 2, h);
        var c = d.p >= 0 ? AN_SALES_COLOR : AN_BUYS_COLOR;
        out += d.p >= 0
          ? '<path d="M' + x0 + ',' + bot + 'V' + (top + r) + 'Q' + x0 + ',' + top + ' ' + (x0 + r) + ',' + top + 'H' + (x0 + bw - r) + 'Q' + (x0 + bw) + ',' + top + ' ' + (x0 + bw) + ',' + (top + r) + 'V' + bot + 'Z" fill="' + c + '" opacity="' + op + '"/>'
          : '<path d="M' + x0 + ',' + top + 'V' + (bot - r) + 'Q' + x0 + ',' + bot + ' ' + (x0 + r) + ',' + bot + 'H' + (x0 + bw - r) + 'Q' + (x0 + bw) + ',' + bot + ' ' + (x0 + bw) + ',' + (bot - r) + 'V' + top + 'Z" fill="' + c + '" opacity="' + op + '"/>';
      }
      if (d.ly.has) out += '<line x1="' + (cx - bw / 2 - 3) + '" x2="' + (cx + bw / 2 + 3) + '" y1="' + y(d.ly.p) + '" y2="' + y(d.ly.p) + '" class="lymark"/>';
      if (d.notes && d.notes.length) out += noteMark(cx, T, H - B);
      var lbl = (n <= 12 || i % Math.ceil(n / 12) === 0) ? '<text x="' + cx + '" y="' + (H - 8) + '" class="axis" text-anchor="middle">' + d.m.slice(2).replace('-', '.') + '</text>' : '';
      return out + lbl + '<rect class="hit" data-i="' + i + '" x="' + (L + band * i) + '" y="' + T + '" width="' + band + '" height="' + (H - T - B) + '" fill="transparent"/>';
    }).join('');
    return '<div class="chartbox"><svg viewBox="0 0 ' + W + ' ' + H + '" class="chart" role="img" aria-label="월별 이익 막대 차트">' + grid +
      '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '" class="base"/>' + bars + '</svg><div class="tip hidden"></div></div>';
  }

  /** 비교 기간보다 이익률이 눈에 띄게 떨어졌거나 적자로 돌아선 매출처 */
  function drawAlerts(cr, hasCmp) {
    var an = state.an, box = $('#anAlerts'), al = an.alert;
    if (!box) return;
    if (!hasCmp || an.showExcluded) { box.innerHTML = ''; return; }
    var cur = {}, prev = {};
    var add = function (map, r) { var k = r[C.disp], x = map[k] || (map[k] = { k: k, n: 0, s: 0, b: 0 }); x.n++; x.s += r[C.sales]; x.b += r[C.buys]; };
    anFilter('cust').forEach(function (r) { add(cur, r); });
    anFilter('cust', { from: cr.from, to: cr.to }).forEach(function (r) { add(prev, r); });
    var sel = an.f.sel.cust || [];
    var list = Object.keys(cur).map(function (k) {
      var a = cur[k], b = prev[k];
      a.p = a.s - a.b; a.r = pct(a.p, a.s);
      if (!b) return null;
      b.p = b.s - b.b; b.r = pct(b.p, b.s);
      a.cr = b.r; a.cp = b.p; a.dr = a.r != null && b.r != null ? a.r - b.r : null; a.dp = a.p - b.p;
      a.turned = b.p > 0 && a.p < 0;
      return a;
    }).filter(function (x) {
      return x && (!sel.length || sel.indexOf(x.k) !== -1) && x.s >= al.minSales && (x.turned || (x.dr != null && x.dr <= -al.drop));
    }).sort(function (a, b) { return (a.turned === b.turned ? 0 : a.turned ? -1 : 1) || a.dr - b.dr; });
    box.innerHTML = '<div class="card alerts-card">' +
      '<div class="row-between" style="flex-wrap:wrap;gap:10px;margin-bottom:10px"><div><div class="eyebrow">Watch · 확인해 볼 곳</div><h3>' + esc(cr.label) + '보다 이익률이 떨어진 매출처 ' +
      '<span class="' + (list.length ? 'neg' : 'muted') + '">' + list.length + '곳</span></h3></div>' +
      '<div class="actions small" style="align-items:center">이익률 <input class="input input-sm num" id="alDrop" type="number" min="0" step="0.5" value="' + al.drop + '" style="width:64px">%p 이상 하락 · 매출 <select class="input input-sm" id="alMin" style="width:auto">' +
      [[0, '전체'], [500000, '50만↑'], [1000000, '100만↑'], [5000000, '500만↑'], [10000000, '1,000만↑']].map(function (o) { return '<option value="' + o[0] + '"' + (al.minSales === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div></div>' +
      (list.length ? '<div class="table-wrap"><table class="data grp"><thead><tr><th class="left">매출처</th><th>이익률</th><th>' + esc(cr.label) + '</th><th>변화</th><th>이익</th><th>이익 증감</th><th>매출</th><th>건수</th></tr></thead><tbody>' +
        list.slice(0, 15).map(function (x) {
          return '<tr class="pick" data-k="' + esc(x.k) + '"><td class="left wrap">' + (x.turned ? '<span class="badge down">적자 전환</span> ' : '') + esc(x.k) + ' <button class="cc-btn" data-cc="' + esc(x.k) + '">상세</button>' +
            notesBetween(cr.from, an.f.to, x.k).map(noteBadge).join('') + '</td>' +
            '<td class="num' + (x.r < 0 ? ' neg' : '') + '">' + pctText(x.r) + '</td><td class="num muted">' + pctText(x.cr) + '</td>' +
            '<td class="num">' + deltaHtml(x.dr, '%p', true) + '</td><td class="num' + (x.p < 0 ? ' neg' : '') + '">' + won(x.p) + '</td>' +
            '<td class="num' + (x.dp < 0 ? ' neg' : '') + '">' + (x.dp > 0 ? '+' : '') + won(x.dp) + '</td><td class="num">' + won(x.s) + '</td><td class="num">' + won(x.n) + '</td></tr>';
        }).join('') + '</tbody></table></div>' + (list.length > 15 ? '<p class="hint" style="margin:6px 0 0">상위 15곳만 표시 · 아래 순위표에서 "이익률 하락 큰 순"으로 전체를 볼 수 있어요.</p>' : '') +
        '<p class="hint" style="margin:8px 0 0">행을 누르면 그 매출처로 걸러져서, 아래 "경로 조합" 탭에서 어느 경로에서 손실이 났는지 바로 볼 수 있어요.</p>'
        : '<p class="muted" style="margin:0">조건에 해당하는 매출처가 없어요. 👍</p>') + '</div>';
    var later = function () { clearTimeout(an.alertTimer); an.alertTimer = setTimeout(function () { drawAlerts(cr, hasCmp); }, 0); };
    $('#alDrop').onchange = function () { al.drop = Math.max(0, Number(this.value) || 0); later(); };
    $('#alMin').onchange = function () { al.minSales = Number(this.value); later(); };
    $$('#anAlerts [data-cc]').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); openCustCard(b.dataset.cc); }; });
    $$('#anAlerts tr.pick').forEach(function (tr) {
      tr.onclick = function () { an.f.sel.cust = [tr.dataset.k]; an.dim = 'route'; an.sort = { key: 'profit', dir: 1 }; an.detailPage = 0; renderAnalysis(); var g = $('#anGroup'); if (g) g.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    });
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }

  function columnChart(data) {
    var W = chartW(640), H = 240, L = 52, R = 8, T = 10, B = 26;
    var max = niceMax(Math.max.apply(null, data.map(function (d) { return Math.max(d.s, d.b); }).concat([1])));
    var n = data.length, band = (W - L - R) / Math.max(n, 1);
    var bw = Math.min(16, Math.max(3, (band - 8) / 2));
    var y = function (v) { return T + (H - T - B) * (1 - Math.max(0, v) / max); };
    var f = state.an.f;
    var grid = [0, 0.25, 0.5, 0.75, 1].map(function (k) {
      var v = max * k, yy = y(v);
      return '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" class="gridl"/><text x="' + (L - 6) + '" y="' + (yy + 4) + '" class="axis" text-anchor="end">' + shortWon(v) + '</text>';
    }).join('');
    var bars = data.map(function (d, i) {
      var cx = L + band * i + band / 2, inRange = (!f.from || d.m >= f.from) && (!f.to || d.m <= f.to);
      var op = inRange ? 1 : 0.35;
      var col = function (v, x, c) {
        var top = y(v), h = Math.max(0, y(0) - top);
        if (h <= 0) return '';
        var r = Math.min(4, bw / 2, h);
        return '<path d="M' + x + ',' + y(0) + 'V' + (top + r) + 'Q' + x + ',' + top + ' ' + (x + r) + ',' + top + 'H' + (x + bw - r) + 'Q' + (x + bw) + ',' + top + ' ' + (x + bw) + ',' + (top + r) + 'V' + y(0) + 'Z" fill="' + c + '" opacity="' + op + '"/>';
      };
      var lbl = (n <= 12 || i % Math.ceil(n / 12) === 0) ? '<text x="' + cx + '" y="' + (H - 8) + '" class="axis" text-anchor="middle">' + d.m.slice(2).replace('-', '.') + '</text>' : '';
      return col(d.s, cx - bw - 1, AN_SALES_COLOR) + col(d.b, cx + 1, AN_BUYS_COLOR) + lbl +
        '<rect class="hit" data-i="' + i + '" x="' + (L + band * i) + '" y="' + T + '" width="' + band + '" height="' + (H - T - B) + '" fill="transparent"/>';
    }).join('');
    return '<div class="chartbox"><svg viewBox="0 0 ' + W + ' ' + H + '" class="chart" role="img" aria-label="월별 매출 매입 막대 차트">' + grid + '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '" class="base"/>' + bars + '</svg><div class="tip hidden"></div></div>';
  }

  function lineChart(data) {
    var W = 360, H = 240, L = 40, R = 14, T = 14, B = 26;
    var vals = data.map(function (d) { return d.rate; }).filter(function (v) { return v != null; });
    var lo = Math.min.apply(null, vals.concat([0])), hi = Math.max.apply(null, vals.concat([5]));
    lo = Math.floor(lo / 5) * 5; hi = Math.ceil(hi / 5) * 5; if (hi === lo) hi = lo + 5;
    var n = data.length, step = (W - L - R) / Math.max(n - 1, 1);
    var x = function (i) { return n === 1 ? (L + W - R) / 2 : L + step * i; };
    var y = function (v) { return T + (H - T - B) * (1 - (v - lo) / (hi - lo)); };
    var ticks = [];
    for (var t = lo; t <= hi; t += Math.max(5, Math.ceil((hi - lo) / 4 / 5) * 5)) ticks.push(t);
    var grid = ticks.map(function (t) { return '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t) + '" y2="' + y(t) + '" class="' + (t === 0 ? 'base' : 'gridl') + '"/><text x="' + (L - 6) + '" y="' + (y(t) + 4) + '" class="axis" text-anchor="end">' + t + '%</text>'; }).join('');
    var path = '', pts = '';
    var gap = true;
    data.forEach(function (d, i) {
      if (d.rate == null) { gap = true; return; }
      path += (gap ? 'M' : 'L') + x(i) + ',' + y(d.rate);
      gap = false;
    });
    var dots = data.map(function (d, i) { return d.rate == null ? '' : '<circle cx="' + x(i) + '" cy="' + y(d.rate) + '" r="2.5" fill="var(--ink-2)"/>'; }).join('');
    var lastI = -1; data.forEach(function (d, i) { if (d.rate != null) lastI = i; });
    if (lastI >= 0) {
      var d = data[lastI];
      pts = '<circle cx="' + x(lastI) + '" cy="' + y(d.rate) + '" r="4.5" fill="var(--ink)" stroke="var(--panel)" stroke-width="2"/>' +
        '<text x="' + Math.min(x(lastI), W - R - 2) + '" y="' + (y(d.rate) - 10) + '" class="vlabel" text-anchor="end">' + d.rate.toFixed(1) + '%</text>';
    }
    var labels = data.map(function (d, i) { return (n <= 6 || i % Math.ceil(n / 6) === 0) ? '<text x="' + x(i) + '" y="' + (H - 8) + '" class="axis" text-anchor="middle">' + d.m.slice(2).replace('-', '.') + '</text>' : ''; }).join('');
    var hits = data.map(function (d, i) { var w = step || (W - L - R); return (d.notes && d.notes.length ? noteMark(x(i), T, H - B) : '') + '<rect class="hit" data-i="' + i + '" x="' + (x(i) - w / 2) + '" y="' + T + '" width="' + w + '" height="' + (H - T - B) + '" fill="transparent"/>'; }).join('');
    return '<div class="chartbox"><svg viewBox="0 0 ' + W + ' ' + H + '" class="chart" role="img" aria-label="월별 이익률 선 차트">' + grid +
      '<path d="' + path + '" fill="none" stroke="var(--ink-2)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' + (n <= 36 ? dots : '') + pts + labels + hits + '</svg><div class="tip hidden"></div></div>';
  }

  function bindChartHover(card, data, fmt) {
    var box = $('.chartbox', card), tip = $('.tip', card);
    if (!box) return;
    $$('.hit', box).forEach(function (h) {
      h.onmouseenter = function () { h.setAttribute('fill', 'rgba(30,28,25,.05)'); tip.innerHTML = fmt(data[h.dataset.i]) + notesTip(data[h.dataset.i]); tip.classList.remove('hidden'); };
      h.onmousemove = function (e) {
        var rc = box.getBoundingClientRect(), x = e.clientX - rc.left, yy = e.clientY - rc.top;
        tip.style.left = Math.min(x + 14, rc.width - tip.offsetWidth - 4) + 'px';
        tip.style.top = Math.max(0, yy - tip.offsetHeight - 10) + 'px';
      };
      h.onmouseleave = function () { h.setAttribute('fill', 'transparent'); tip.classList.add('hidden'); };
    });
  }

  var SORT_PRESETS = [['profit', -1, '이익 높은 순'], ['rate', 1, '이익률 낮은 순'], ['profit', 1, '손실 큰 순'], ['drate', 1, '이익률 하락 큰 순'], ['n', -1, '건수 많은 순']];

  function drawGroup() {
    var an = state.an, f = an.f, dim = an.dim, def = dimDef(dim);
    var isRoute = dim === 'route';
    var group = function (rows) {
      var g = {};
      rows.forEach(function (r) {
        var k = def[2](r), x = g[k];
        if (!x) { x = g[k] = { k: k, n: 0, s: 0, b: 0 }; if (isRoute) x.parts = [r[C.from], r[C.to], r[C.weight]]; }
        x.n++; x.s += r[C.sales]; x.b += r[C.buys];
      });
      return g;
    };
    var g = group(anFilter(dim)); // 같은 차원의 선택은 빼고 집계 → 선택하지 않은 항목도 계속 보임
    var cr = cmpRange(), hasCmp = dim !== 'month' && rangeHasData(cr);
    var pg = hasCmp ? group(anFilter(dim, { from: cr.from, to: cr.to })) : {};
    var total = 0;
    var list = Object.keys(g).map(function (k) {
      var x = g[k]; x.p = x.s - x.b; x.r = pct(x.p, x.s); x.u = x.n ? x.p / x.n : 0; total += x.s;
      var y = pg[k];
      if (y) { var yr = pct(y.s - y.b, y.s); x.cr = yr; x.dr = x.r != null && yr != null ? x.r - yr : null; x.dp = x.p - (y.s - y.b); }
      return x;
    }).filter(function (x) { return x.n >= an.minN; });
    var sk = an.sort.key, dir = an.sort.dir;
    var val = function (x) {
      return sk === 'name' ? x.k : sk === 'n' ? x.n : sk === 'buys' ? x.b : sk === 'profit' ? x.p : sk === 'unit' ? x.u :
        sk === 'rate' ? (x.r == null ? (dir > 0 ? 1e9 : -1e9) : x.r) : sk === 'drate' ? (x.dr == null ? (dir > 0 ? 1e9 : -1e9) : x.dr) : x.s;
    };
    list.sort(function (a, b) { var va = val(a), vb = val(b); return (va < vb ? -1 : va > vb ? 1 : 0) * dir; });
    var gq = an.groupQ.trim();
    if (gq) list = list.filter(function (x) { return String(x.k).indexOf(gq) !== -1; });
    var selected = isRoute ? [] : (f.sel[dim] || []);
    var shown = list.slice(0, an.groupLimit);
    var maxAbs = Math.max.apply(null, list.map(function (x) { return Math.abs(x.p); }).concat([1]));
    var th = function (key, label, left) {
      var on = sk === key;
      return '<th class="sortable' + (left ? ' left' : '') + (on ? ' on' : '') + '" data-sort="' + key + '">' + label + (on ? (dir < 0 ? ' ▼' : ' ▲') : '') + '</th>';
    };
    var presetOn = function (p) { return p[0] === sk && p[1] === dir; };
    $('#anGroup').innerHTML =
      '<div class="row-between" style="flex-wrap:wrap;gap:10px;margin-bottom:12px"><div><div class="eyebrow">Ranking · 묶어 보기</div><h3>' + esc(def[1]) + '별 ' + (isRoute ? '수익' : '순위') + ' <span class="muted small">' + won(list.length) + '개</span></h3></div>' +
      '<div class="actions"><input class="input input-sm" id="anGQ" placeholder="' + esc(def[1]) + ' 찾기" value="' + esc(an.groupQ) + '" style="width:200px"><button class="btn btn-sm" id="anGX">엑셀</button></div></div>' +
      '<div class="tabs-line" id="anDims">' + AN_DIMS.filter(function (d) { return d[0] !== 'cat' || (an.hasCats && f.withCats); }).map(function (d) { return '<button type="button" data-d="' + d[0] + '" class="' + (d[0] === dim ? 'on' : '') + '">' + d[1] + ((f.sel[d[0]] || []).length ? ' <span class="cnt">' + f.sel[d[0]].length + '</span>' : '') + '</button>'; }).join('') + '</div>' +
      '<div class="toolbar">' +
      '<div class="chips" id="anPresets">' + SORT_PRESETS.filter(function (p) { return p[0] !== 'drate' || hasCmp; }).map(function (p, i) { return '<button type="button" class="chip' + (presetOn(p) ? ' on' : '') + '" data-pi="' + SORT_PRESETS.indexOf(p) + '">' + p[2] + '</button>'; }).join('') + '</div>' +
      '<span class="small muted" style="margin-left:auto">최소 건수</span><select class="input input-sm" id="anMinN" style="width:auto">' + [1, 30, 60, 90].map(function (n) { return '<option' + (an.minN === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select>' +
      (isRoute ? '<label class="toggle small"><input type="checkbox" id="anRouteW"' + (an.routeWeight ? ' checked' : '') + '><span class="track"></span>중량까지 나누기</label>' : '') +
      '</div>' +
      '<div class="table-wrap"><table class="data grp"><thead><tr>' + th('name', esc(def[1]), true) + th('n', '건수') + th('sales', '매출') + th('buys', '매입') + th('profit', '이익') + th('rate', '이익률') +
      (hasCmp ? th('drate', '이익률 변화') : '') + '<th class="left" style="width:15%">이익 크기</th></tr></thead><tbody>' +
      (shown.map(function (x) {
        var on = selected.indexOf(x.k) !== -1;
        var name = isRoute
          ? '<span class="route"><span>' + esc(x.parts[0] || '(빈칸)') + '</span><i>→</i><span>' + esc(x.parts[1] || '(빈칸)') + '</span>' + (an.routeWeight ? '<em>' + esc(x.parts[2] || '-') + '</em>' : '') + '</span>'
          : '<span class="pickbox">' + (on ? '✓' : '') + '</span>' + esc(x.k || '(빈칸)') + (dim === 'cust' ? ' <button class="cc-btn" data-cc="' + esc(x.k) + '" title="매출처 상세">상세</button>' : '');
        return '<tr class="pick' + (on ? ' picked' : '') + '" data-k="' + esc(x.k) + '"><td class="left wrap">' + name + '</td><td class="num">' + won(x.n) + '</td><td class="num">' + won(x.s) + '</td><td class="num">' + won(x.b) + '</td>' +
          '<td class="num strong' + (x.p < 0 ? ' neg' : '') + '">' + won(x.p) + '</td><td class="num' + (x.r != null && x.r < 0 ? ' neg' : '') + '">' + pctText(x.r) + '</td>' +
          (hasCmp ? '<td class="num" title="' + esc(cr.label) + ' ' + pctText(x.cr) + '">' + (x.dr == null ? '<span class="dl">신규</span>' : deltaHtml(x.dr, '%p', true)) + '</td>' : '') +
          '<td class="left"><div class="pbar"><i class="' + (x.p < 0 ? 'loss' : '') + '" style="width:' + (Math.abs(x.p) / maxAbs * 100).toFixed(1) + '%"></i></div></td></tr>';
      }).join('') || '<tr><td colspan="9" class="left muted" style="padding:20px">조건에 맞는 데이터가 없습니다.</td></tr>') +
      '</tbody></table></div>' +
      (list.length > shown.length ? '<div style="text-align:center;margin-top:10px"><button class="btn btn-sm" id="anMore">더 보기 (' + won(list.length - shown.length) + '개 남음)</button></div>' : '') +
      '<p class="hint" style="margin:10px 0 0">' + (isRoute
        ? '발지 → 착지' + (an.routeWeight ? ' → 중량' : '') + ' 조합별로 묶었어요. 매출처를 먼저 고르면 "그 업체가 주로 주는 오더"와 "어디서 손실이 나는지"가 보여요. 행을 누르면 그 조합으로 걸러져요.'
        : '행을 누르면 그 ' + esc(def[1]) + '(으)로 걸러지고, 다시 누르면 풀려요. 여러 개를 고를 수 있어요.') +
      (hasCmp ? ' · 이익률 변화는 ' + esc(cr.label) + ' 대비' : '') + '</p>';

    $$('#anDims button').forEach(function (b) { b.onclick = function () { an.dim = b.dataset.d; an.groupLimit = 50; an.groupQ = ''; drawGroup(); }; });
    $$('#anPresets .chip').forEach(function (c) { c.onclick = function () { var p = SORT_PRESETS[c.dataset.pi]; an.sort = { key: p[0], dir: p[1] }; drawGroup(); }; });
    $('#anMinN').onchange = function () { an.minN = Number(this.value); drawGroup(); };
    var rw = $('#anRouteW'); if (rw) rw.onchange = function () { an.routeWeight = this.checked; drawGroup(); };
    $$('#anGroup th[data-sort]').forEach(function (h) {
      h.onclick = function () { var k = h.dataset.sort; if (an.sort.key === k) an.sort.dir *= -1; else { an.sort.key = k; an.sort.dir = k === 'name' ? 1 : -1; } drawGroup(); };
    });
    var partsOf = {};
    list.forEach(function (x) { if (x.parts) partsOf[x.k] = x.parts; });
    $$('#anGroup [data-cc]').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); openCustCard(b.dataset.cc); }; });
    $$('#anGroup tr.pick').forEach(function (tr) {
      tr.onclick = function () {
        var k = tr.dataset.k;
        if (dim === 'month') { f.from = k; f.to = k; renderAnalysis(); return; }
        if (dim === 'biz') { var bi = f.biz.indexOf(k); if (bi === -1) f.biz.push(k); else f.biz.splice(bi, 1); renderAnalysis(); return; }
        if (isRoute) {
          var pt = partsOf[k];
          f.sel.from = [pt[0]]; f.sel.to = [pt[1]];
          if (an.routeWeight) f.sel.weight = [pt[2]];
          an.dim = 'driver';
        } else {
          var arr = f.sel[dim] || (f.sel[dim] = []), i = arr.indexOf(k);
          if (i === -1) arr.push(k); else arr.splice(i, 1);
        }
        an.detailPage = 0;
        var y = window.scrollY; renderAnalysis(); window.scrollTo(0, y);
      };
    });
    var st;
    $('#anGQ').oninput = function () { var v = this.value; clearTimeout(st); st = setTimeout(function () { an.groupQ = v; drawGroup(); var el = $('#anGQ'); el.focus(); el.setSelectionRange(v.length, v.length); }, 200); };
    var more = $('#anMore'); if (more) more.onclick = function () { an.groupLimit += 100; drawGroup(); };
    $('#anGX').onclick = function () {
      var btn = this; busy(btn, true, '…');
      var head = isRoute ? ['발지', '착지', '중량', '건수', '매출', '매입', '이익', '이익률(%)'] : [def[1], '건수', '매출', '매입', '이익', '이익률(%)'];
      if (hasCmp) head.push(cr.label + ' 이익률(%)', '이익률 변화(%p)');
      downloadXlsx('JOIL_분석_' + def[1] + '별_' + f.from + '_' + f.to + '.xlsx', [{
        name: def[1] + '별', widths: isRoute ? [24, 24, 10, 8, 14, 14, 14, 9, 12, 12, 12] : [36, 8, 14, 14, 14, 9, 12, 12, 12],
        rows: [head].concat(list.map(function (x) {
          var row = (isRoute ? [x.parts[0], x.parts[1], an.routeWeight ? x.parts[2] : '(전체)'] : [x.k]).concat([x.n, x.s, x.b, x.p, x.r == null ? '' : Math.round(x.r * 10) / 10]);
          if (hasCmp) row.push(x.cr == null ? '' : Math.round(x.cr * 10) / 10, x.dr == null ? '' : Math.round(x.dr * 10) / 10);
          return row;
        }))
      }]).catch(function (err) { toast(err.message, 'err'); }).then(function () { busy(btn, false); });
    };
  }

  function drawDetail(rows) {
    var an = state.an, PAGE_N = 100, f = an.f;
    var sorted = rows.slice().sort(function (a, b) { return (a[C.date] < b[C.date] ? -1 : a[C.date] > b[C.date] ? 1 : 0) * an.detailSort; });
    var pages = Math.max(1, Math.ceil(sorted.length / PAGE_N));
    if (an.detailPage >= pages) an.detailPage = 0;
    var page = sorted.slice(an.detailPage * PAGE_N, (an.detailPage + 1) * PAGE_N);
    var heads = ['날짜', '매출처', '발지', '착지', '중량', '매출', '매입', '이익', '차량번호', '기사명', '차량전화', '기타1', '비고'];
    $('#anDetail').innerHTML =
      '<div class="row-between" style="flex-wrap:wrap;gap:10px;margin-bottom:12px"><div><div class="eyebrow">Rows · 상세 내역</div><h3>' + won(rows.length) + '건</h3></div>' +
      '<div class="actions"><button class="btn btn-sm" id="anDSort">날짜 ' + (an.detailSort < 0 ? '최신순 ▼' : '오래된순 ▲') + '</button><button class="btn btn-sm btn-primary" id="anDX"' + (rows.length ? '' : ' disabled') + '>엑셀 다운로드 (' + won(rows.length) + '건)</button></div></div>' +
      '<div class="bulk-table" style="max-height:64vh"><table class="data bulk detailt"><thead><tr>' + heads.map(function (h, i) { return '<th class="' + (i < 5 || i > 7 ? 'left' : '') + '">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (page.map(function (r) {
        var p = r[C.sales] - r[C.buys];
        return '<tr><td class="left small">' + esc(r[C.date]) + '</td><td class="left wrap">' + esc(r[C.disp]) + '</td>' +
          '<td class="left wrap">' + esc(r[C.from]) + '</td><td class="left wrap">' + esc(r[C.to]) + '</td><td class="left">' + esc(r[C.weight]) + '</td>' +
          '<td class="num">' + won(r[C.sales]) + '</td><td class="num">' + won(r[C.buys]) + '</td><td class="num' + (p < 0 ? ' neg' : '') + '">' + won(p) + '</td>' +
          '<td class="left">' + esc(r[C.car]) + '</td><td class="left">' + esc(r[C.driver]) + '</td><td class="left small">' + esc(r[C.phone]) + '</td><td class="left small wrap">' + esc(r[C.etc]) + '</td><td class="left small wrap">' + esc(r[C.note]) + '</td></tr>';
      }).join('') || '<tr><td colspan="13" class="left muted" style="padding:20px">조건에 맞는 내역이 없습니다.</td></tr>') +
      '</tbody></table></div>' +
      (pages > 1 ? '<div class="pager" style="margin-top:12px">' + pagerButtons(an.detailPage, pages) + '</div>' : '');
    $('#anDSort').onclick = function () { an.detailSort *= -1; an.detailPage = 0; drawDetail(rows); };
    $$('#anDetail .pager button').forEach(function (b) { b.onclick = function () { an.detailPage = Number(b.dataset.p); drawDetail(rows); $('#anDetail').scrollIntoView({ block: 'start' }); }; });
    $('#anDX').onclick = function () {
      var btn = this; busy(btn, true, '만드는 중…');
      var body = sorted.map(function (r) { return [r[C.date], r[C.biz], r[C.disp], r[C.cust], r[C.from], r[C.to], r[C.weight], r[C.sales], r[C.buys], r[C.sales] - r[C.buys], r[C.car], r[C.driver], r[C.phone], r[C.etc], r[C.note]]; });
      var cond = [['항목', '값'], ['기간', f.from + ' ~ ' + f.to], ['사업자', f.biz.join(', ') || '전체'], ['검색', f.q || '-']];
      Object.keys(f.sel).forEach(function (k) { if ((f.sel[k] || []).length) cond.push([dimDef(k)[1], f.sel[k].join(', ')]); });
      cond.push(['내려받은 사람', state.user.name + ' (' + state.user.id + ')'], ['내려받은 시각', new Date().toLocaleString('ko-KR')]);
      downloadXlsx('JOIL_분석내역_' + f.from + '_' + f.to + '_' + rows.length + '건.xlsx', [
        { name: '상세 내역', widths: [11, 10, 26, 30, 16, 16, 8, 12, 12, 12, 13, 8, 14, 16, 20], rows: [['날짜', '사업자', '매출처(표시)', '매출처(원본)', '발지', '착지', '중량', '매출후불', '매입후불', '이익', '차량번호', '기사명', '차량전화', '기타1', '비고']].concat(body) },
        { name: '조건', widths: [14, 60], rows: cond }
      ]).catch(function (err) { toast(err.message, 'err'); }).then(function () { busy(btn, false); });
    };
  }

  function pagerButtons(cur, pages) {
    var out = [], push = function (p) { out.push('<button data-p="' + p + '" class="' + (p === cur ? 'on' : '') + '">' + (p + 1) + '</button>'); };
    for (var p = 0; p < pages; p++) {
      if (p === 0 || p === pages - 1 || Math.abs(p - cur) <= 2) push(p);
      else if (out[out.length - 1] !== '<span class="muted">…</span>') out.push('<span class="muted">…</span>');
    }
    return out.join('');
  }

  function openCustPicker() {
    var an = state.an, f = an.f;
    var saved = f.sel.cust;
    f.sel.cust = [];
    var rows = anFilter('cust');
    f.sel.cust = saved;
    var g = {};
    rows.forEach(function (r) { var x = g[r[C.disp]] || (g[r[C.disp]] = { k: r[C.disp], s: 0, n: 0 }); x.s += r[C.sales]; x.n++; });
    var list = Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return b.s - a.s; });
    var picked = (f.sel.cust || []).slice();
    modal({
      wide: true, eyebrow: '필터', title: '매출처 고르기',
      body: '<input class="input input-sm" id="cpQ" placeholder="매출처 검색" style="margin-bottom:10px"><div class="row-between small" style="margin-bottom:8px"><span class="muted" id="cpN"></span><span><button class="btn btn-ghost btn-sm" id="cpAll">보이는 것 모두 선택</button><button class="btn btn-ghost btn-sm" id="cpNone">선택 해제</button></span></div><div class="cplist" id="cpList"></div>',
      foot: '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="cpOk">적용</button>',
      onMount: function (m, close) {
        var q = '';
        function draw() {
          var vis = list.filter(function (x) { return !q || x.k.indexOf(q) !== -1; });
          $('#cpList', m).innerHTML = vis.map(function (x) {
            var on = picked.indexOf(x.k) !== -1;
            return '<label class="cpitem' + (on ? ' on' : '') + '"><input type="checkbox" data-k="' + esc(x.k) + '"' + (on ? ' checked' : '') + '><span class="nm">' + esc(x.k) + '</span><span class="muted small num">' + shortWon(x.s) + ' · ' + won(x.n) + '건</span></label>';
          }).join('') || '<p class="muted">없습니다.</p>';
          $('#cpN', m).textContent = picked.length ? picked.length + '곳 선택됨' : '선택 없음 = 전체';
          $$('#cpList input', m).forEach(function (cb) {
            cb.onchange = function () { var i = picked.indexOf(cb.dataset.k); if (cb.checked && i === -1) picked.push(cb.dataset.k); if (!cb.checked && i !== -1) picked.splice(i, 1); draw(); };
          });
          return vis;
        }
        var vis = draw();
        $('#cpQ', m).oninput = function () { q = this.value.trim(); vis = draw(); };
        $('#cpAll', m).onclick = function () { vis.forEach(function (x) { if (picked.indexOf(x.k) === -1) picked.push(x.k); }); vis = draw(); };
        $('#cpNone', m).onclick = function () { picked = []; vis = draw(); };
        $('#cpOk', m).onclick = function () { f.sel.cust = picked; an.detailPage = 0; close(); renderAnalysis(); };
      }
    });
  }

  /* ───────── 관리자 ───────── */

  var ADMIN_TABS = [
    ['basic', '기본 설정', 'var(--orange)'],
    ['region', '지역 할증', 'var(--yellow)'],
    ['tariff', '타리프 단가', 'var(--red)'],
    ['special', '특수 운임', 'var(--orange)'],
    ['users', '계정 관리', 'var(--cyan)'],
    ['staff', '직원 목록', 'var(--green)'],
    ['andata', '분석 데이터', 'var(--green)'],
    ['anmap', '매출처 설정', 'var(--yellow)'],
    ['anrule', '분석 규칙', 'var(--red)'],
    ['diesel', '유가 기록', 'var(--cyan)'],
    ['company', '회사 정보', 'var(--green)'],
    ['keys', 'API 키', 'var(--ink-2)']
  ];

  function loadAdmin(force) {
    var a = state.admin;
    if (a.loaded && !force) return Promise.resolve();
    return api('admin.bootstrap').then(function (r) {
      if (!a.settingsDirty) a.settings = r.settings;
      a.keys = r.keys; a.users = r.users; a.logs = r.logs; a.cache = r.cache; a.tariffWarn = r.tariffWarn;
      a.loaded = true;
      loadTariff(); // 타리프는 크니까 뒤에서 미리 받아 둠
    });
  }

  function loadTariff() {
    var a = state.admin;
    if (a.tariff) return Promise.resolve();
    return api('admin.getTariff').then(function (r) {
      if (!a.tariff) { a.tariff = r.tariff; a.tariffOrig = clone(r.tariff); }
    });
  }

  function renderAdmin() {
    var a = state.admin;
    $('#main').innerHTML =
      '<div class="admin-grid"><nav class="card rail">' + ADMIN_TABS.map(function (t) {
        return '<button data-tab="' + t[0] + '" class="' + (a.tab === t[0] ? 'on' : '') + '"><span class="dot" style="--c:' + t[2] + '"></span>' + t[1] + '</button>';
      }).join('') + '</nav><section id="adminBody"></section></div>';
    $$('.rail button').forEach(function (b) {
      b.onclick = function () {
        a.tab = b.dataset.tab;
        $$('.rail button').forEach(function (x) { x.classList.toggle('on', x === b); });
        showAdminTab();
      };
    });
    showAdminTab();
  }

  function adminLoading(msg) {
    $('#adminBody').innerHTML = '<div class="card"><div class="row-between"><span class="muted"><span class="spinner dark"></span> ' + esc(msg) + '</span></div>' +
      '<p class="hint" style="margin:10px 0 0">서버가 한동안 쉬었다가 처음 깨어날 때는 몇 초 더 걸릴 수 있어요.</p></div>';
  }

  /* ── 관리자: 직원 목록 (사업자·부서·메일) ── */
  var BIZ_NAMES = ['조일물류', '명일로지스', '조일로지스'];
  function adminStaff() {
    var a = state.admin, body = $('#adminBody');
    if (!a.staff) {
      body.innerHTML = '<div class="card muted"><span class="spinner dark"></span> 직원 목록 불러오는 중…</div>';
      api('staff.list').then(function (r) { a.staff = r.staff; a.staffAcc = r.accounts; a.staffDirty = false; if (state.admin.tab === 'staff') adminStaff(); })
        .catch(function (err) { body.innerHTML = '<div class="card"><p class="err-text" style="margin:0">' + esc(err.message) + '</p></div>'; });
      return;
    }
    var acc = a.staffAcc || [];
    var opt = function (list, v, empty) { return (empty != null ? '<option value="">' + empty + '</option>' : '') + list.map(function (x) { var val = x[0], lab = x[1]; return '<option value="' + esc(val) + '"' + (val === v ? ' selected' : '') + '>' + esc(lab) + '</option>'; }).join(''); };
    body.innerHTML = '<div class="card"><div class="row-between" style="flex-wrap:wrap;gap:10px"><div><div class="eyebrow">Staff · 직원 목록</div><h2>직원 목록</h2></div>' +
      '<div class="actions"><button class="btn btn-sm" id="stAdd">＋ 직원 추가</button><button class="btn btn-sm btn-primary" id="stSave"' + (a.staffDirty ? '' : ' disabled') + '>저장</button></div></div>' +
      '<p class="muted small" style="margin:6px 0 12px">사업자·부서는 <b>시간외근무일지</b>에, 메일은 <b>주간 업무 요약</b>에 쓰여요. 사이트 계정이 있는 직원은 "계정"을 골라 연결하세요 (연결하면 계정 이름도 직원 이름으로 맞춰지고, 예전 기록도 한 사람으로 합쳐 보여요). 계정이 없어도 휴가·근무를 기록할 수 있어요.</p>' +
      '<div class="table-wrap"><table class="data staff-table"><thead><tr><th class="left">이름</th><th class="left">사업자</th><th class="left">부서</th><th class="left">팀</th><th class="left">이메일</th><th class="left">사이트 계정</th><th>재직</th><th>주간 요약 받기</th><th></th></tr></thead><tbody>' +
      a.staff.map(function (s, i) {
        return '<tr class="' + (s.active === false ? 'muted-row' : '') + '"><td><input class="input input-sm" data-i="' + i + '" data-f="name" value="' + esc(s.name) + '" maxlength="30" placeholder="이름" style="min-width:96px"></td>' +
          '<td><select class="input input-sm" data-i="' + i + '" data-f="biz" style="min-width:128px">' + opt(BIZ_NAMES.map(function (b) { return [b, b]; }), s.biz, '–') + '</select></td>' +
          '<td><input class="input input-sm" data-i="' + i + '" data-f="dept" value="' + esc(s.dept) + '" maxlength="30" placeholder="예) 운영부" style="width:110px"></td>' +
          '<td><input class="input input-sm" data-i="' + i + '" data-f="team" value="' + esc(s.team || '') + '" maxlength="30" placeholder="예) 일반팀" style="width:96px"></td>' +
          '<td><input class="input input-sm" data-i="' + i + '" data-f="email" value="' + esc(s.email) + '" maxlength="100" placeholder="name@jo-il.com" style="min-width:170px"></td>' +
          '<td><select class="input input-sm" data-i="' + i + '" data-f="account" style="min-width:150px">' + opt(acc.map(function (u) { return [u.id, u.name + ' (' + u.id + ')' + (u.active ? '' : ' · 중지')]; }), s.account, '없음') + '</select></td>' +
          '<td><input type="checkbox" data-i="' + i + '" data-f="active"' + (s.active !== false ? ' checked' : '') + '></td>' +
          '<td><input type="checkbox" data-i="' + i + '" data-f="weekly"' + (s.weekly ? ' checked' : '') + (s.email ? '' : ' disabled title="메일을 먼저 넣으세요"') + '></td>' +
          '<td><button class="btn btn-sm btn-ghost" data-del="' + i + '">삭제</button></td></tr>';
      }).join('') + (a.staff.length ? '' : '<tr><td colspan="9" class="muted left" style="padding:16px">아직 없어요. "＋ 직원 추가"로 넣으세요.</td></tr>') + '</tbody></table></div>' +
      '<p class="hint" style="margin:10px 0 0">퇴사한 직원은 지우지 말고 "재직"을 끄면 지난 기록은 그대로 남아요 · 주간 요약 메일은 매주 월요일 오전 8시 (서버 메뉴 "주간 요약 메일 켜기"를 한 번 실행해야 해요)</p></div>';
    var dirty = function () { a.staffDirty = true; $('#stSave').disabled = false; };
    $$('[data-f]', body).forEach(function (el) {
      el.onchange = function () {
        var s = a.staff[+el.dataset.i], f = el.dataset.f;
        s[f] = el.type === 'checkbox' ? el.checked : el.value.trim();
        if (f === 'account' && s.account && !s.name) { var u = acc.filter(function (x) { return x.id === s.account; })[0]; if (u) s.name = u.name; adminStaff(); }
        if (f === 'email') { var w = $('[data-i="' + el.dataset.i + '"][data-f="weekly"]', body); w.disabled = !s.email; if (!s.email) { w.checked = false; s.weekly = false; } }
        dirty();
      };
    });
    $$('[data-del]', body).forEach(function (b) { b.onclick = function () { var s = a.staff[+b.dataset.del]; if (!confirm('"' + (s.name || '이름 없음') + '"을(를) 목록에서 지울까요? (퇴사자는 "재직"만 끄는 걸 추천해요)')) return; a.staff.splice(+b.dataset.del, 1); dirty(); adminStaff(); }; });
    $('#stAdd').onclick = function () { a.staff.push({ id: '', name: '', biz: '', dept: '', team: '', email: '', account: '', active: true, weekly: false }); dirty(); adminStaff(); var ins = $$('[data-f="name"]', body); if (ins.length) ins[ins.length - 1].focus(); };
    $('#stSave').onclick = function () {
      var btn = this; busy(btn, true, '저장 중…');
      api('staff.save', { staff: a.staff }).then(function (r) { a.staff = r.staff; a.staffDirty = false; state.cal.data = null; toast('직원 목록을 저장했어요.'); adminStaff(); })
        .catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
    };
  }

  function showAdminTab() {
    syncRoute();
    var a = state.admin, tab = a.tab;
    var views = { basic: adminBasic, region: adminRegion, tariff: adminTariff, users: adminUsers, keys: adminKeys, andata: adminAnData, anmap: adminAnMap, anrule: adminAnRules, diesel: adminDiesel, company: adminCompany, special: adminSpecials, staff: adminStaff };
    var ready = a.loaded && (tab !== 'tariff' || a.tariff);
    if (ready) {
      views[tab]();
      return;
    }
    adminLoading(tab === 'tariff' && a.loaded ? '타리프 불러오는 중…' : '관리자 정보 불러오는 중…');
    loadAdmin().then(function () { return tab === 'tariff' ? loadTariff() : null; }).then(function () {
      if (state.view === 'admin' && state.admin.tab === tab) views[tab]();
    }).catch(function (err) {
      if (state.view !== 'admin' || state.admin.tab !== tab) return;
      $('#adminBody').innerHTML = '<div class="card"><p style="margin:0 0 14px">' + esc(err.message) + '</p><button class="btn btn-primary btn-sm" id="adminRetry">다시 불러오기</button></div>';
      $('#adminRetry').onclick = showAdminTab;
    });
  }

  function saveBar(dirty, label) {
    return '<div class="save-bar"><span class="small muted" style="margin-right:auto">' +
      (dirty ? '<span class="dirty-dot"></span>저장하지 않은 변경사항' : '변경사항 없음') + '</span>' +
      '<button class="btn btn-accent" id="saveBtn">' + esc(label || '저장') + '</button></div>';
  }

  function saveSettings(btn) {
    var a = state.admin;
    busy(btn, true, '저장 중…');
    return api('admin.saveSettings', { settings: a.settings }).then(function (r) {
      a.settings = r.settings; a.settingsDirty = false;
      return api('publicSettings');
    }).then(function (r) {
      state.pub = r.settings;
      state.calc.tons = state.calc.tons.filter(function (t) { return state.pub.tons.indexOf(t) !== -1; });
      state.calc.baseTon = state.pub.baseTon;
      state.calc.result = null;
      toast('설정을 저장했습니다.');
      renderAdmin();
    }).catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
  }

  function bindDirty(root, onChange) {
    $$('input, select, textarea', root).forEach(function (el) {
      el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', function () {
        onChange(el);
        state.admin.settingsDirty = true;
        var d = $('.save-bar .small');
        if (d) d.innerHTML = '<span class="dirty-dot"></span>저장하지 않은 변경사항';
      });
    });
  }

  function toggleHtml(id, checked, label) {
    return '<label class="toggle"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '><span class="track"></span>' + esc(label) + '</label>';
  }

  function adminBasic() {
    var s = state.admin.settings;
    var body = $('#adminBody');
    body.innerHTML =
      '<div class="card">' +
      '<div class="eyebrow">Settings · 기본 설정</div><h2 style="margin-bottom:22px">계산 규칙</h2>' +

      '<div class="group"><div class="group-head"><h3>하행 할증</h3>' + toggleHtml('dhOn', s.downhill.enabled, '사용') + '</div>' +
      '<div class="form-grid">' +
      '<div class="field"><label>적용 시작 거리 (km 이상)</label><input class="input num" type="number" min="0" id="dhKm" value="' + esc(s.downhill.minKm) + '"></div>' +
      '<div class="field"><label>할증 비율 (%)</label><input class="input num" type="number" min="0" step="0.1" id="dhPct" value="' + esc(s.downhill.percent) + '"><span class="hint">하차지가 상차지보다 남쪽일 때 타리프 × 비율</span></div>' +
      '</div></div>' +

      '<div class="group"><div class="group-head"><h3>밀크런 (유류비 · 통행료)</h3></div>' +
      '<p class="hint" style="margin:-6px 0 14px">톤수별 견적에는 들어가지 않고, 기준 톤수 하나로 경로별 유류비·통행료를 따로 계산합니다. 직원이 계산 화면에서 기준 톤수를 바꿀 수 있습니다.</p>' +
      '<div class="form-grid">' +
      '<div class="field"><label>기본 기준 톤수</label><select class="input" id="mrTon">' + s.tons.map(function (t) {
        return '<option' + (t.name === s.milkrun.baseTon ? ' selected' : '') + '>' + esc(t.name) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>편도 / 왕복</label><select class="input" id="mrTrip"><option value="0"' + (s.milkrun.roundTrip ? '' : ' selected') + '>편도 (×1)</option><option value="1"' + (s.milkrun.roundTrip ? ' selected' : '') + '>왕복 (×2)</option></select><span class="hint">유류비·통행료 모두에 적용</span></div>' +
      '<div class="field"><label>경유가 기본 방식</label><select class="input" id="fuelMode"><option value="manual"' + (s.fuel.mode === 'manual' ? ' selected' : '') + '>직접 입력값 사용</option><option value="auto"' + (s.fuel.mode === 'auto' ? ' selected' : '') + '>오피넷 자동 조회</option></select><span class="hint">자동 조회는 API 키 탭에서 오피넷 키가 필요해요</span></div>' +
      '<div class="field"><label>기본 경유가 (원/L)</label><input class="input num" type="number" min="0" id="fuelPrice" value="' + esc(s.fuel.manualPrice) + '"></div>' +
      '</div></div>' +

      '<div class="group"><div class="group-head"><h3>톤수별 연비 · 통행료 차종</h3></div>' +
      '<p class="hint" style="margin:-6px 0 12px">밀크런 기준 톤수로 쓰일 때 적용됩니다. 통행료는 이 차종으로 카카오에서 조회합니다.</p>' +
      '<div class="table-wrap"><table class="data"><thead><tr><th>톤수</th><th>통행료 차종</th><th>연비 (km/L)</th></tr></thead><tbody>' +
      s.tons.map(function (t, i) {
        return '<tr><td class="ton">' + esc(t.name) + '</td>' +
          '<td><select class="input input-sm" data-tc="' + i + '" style="width:110px;margin-left:auto">' + [1, 2, 3, 4, 5].map(function (k) {
            return '<option value="' + k + '"' + (Number(t.tollClass) === k ? ' selected' : '') + '>' + k + '종</option>';
          }).join('') + '</select></td>' +
          '<td><input class="input input-sm num" type="number" min="0" step="0.1" data-kpl="' + i + '" value="' + esc(t.kmPerL) + '" style="width:110px;margin-left:auto;text-align:right"></td></tr>';
      }).join('') + '</tbody></table></div></div>' +

      '<div class="group"><div class="group-head"><h3>거리 · 금액 처리</h3></div><div class="form-grid">' +
      '<div class="field"><label>조회 상세 보관 기간 (일)</label><input class="input num" type="number" min="7" max="3650" id="retDays" value="' + esc(s.snapshot.retentionDays) + '"><span class="hint">지나면 조회기록의 상세 내용만 삭제 (견적모음은 유지)</span></div>' +
      '<div class="field"><label>대량 계산 최대 건수</label><input class="input num" type="number" min="1" max="3000" id="maxRows" value="' + esc(s.batch.maxRows) + '"></div>' +
      '<div class="field"><label>타리프 최대 거리 (km)</label><input class="input num" type="number" min="1" id="maxKm" value="' + esc(s.maxKm) + '"><span class="hint">초과 시 "별도 문의"</span></div>' +
      '<div class="field"><label>거리 소수점 처리</label><select class="input" id="kmRound">' +
      [['ceil', '올림'], ['round', '반올림'], ['floor', '내림']].map(function (o) { return '<option value="' + o[0] + '"' + (s.kmRounding === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>합계 금액 단위</label><select class="input" id="prUnit">' +
      [1, 10, 100, 1000, 10000].map(function (u) { return '<option value="' + u + '"' + (Number(s.priceRounding.unit) === u ? ' selected' : '') + '>' + won(u) + '원</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>금액 처리</label><select class="input" id="prMode">' +
      [['round', '반올림'], ['ceil', '올림'], ['floor', '내림']].map(function (o) { return '<option value="' + o[0] + '"' + (s.priceRounding.mode === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
      '</div>' +
      '<div class="field"><label>회신 문구 하단 안내</label><input class="input" id="footer" value="' + esc(s.quoteFooter) + '"></div></div>' +

      saveBar(state.admin.settingsDirty) + '</div>';

    bindDirty(body, function (el) {
      var v = el.type === 'checkbox' ? el.checked : el.value;
      switch (el.id) {
        case 'dhOn': s.downhill.enabled = v; break;
        case 'dhKm': s.downhill.minKm = Number(v); break;
        case 'dhPct': s.downhill.percent = Number(v); break;
        case 'mrTon': s.milkrun.baseTon = v; break;
        case 'mrTrip': s.milkrun.roundTrip = v === '1'; break;
        case 'fuelMode': s.fuel.mode = v; break;
        case 'fuelPrice': s.fuel.manualPrice = Number(v); break;
        case 'retDays': s.snapshot.retentionDays = Math.min(3650, Math.max(7, Number(v) || 90)); break;
        case 'maxRows': s.batch.maxRows = Math.min(3000, Math.max(1, Number(v) || 1000)); break;
        case 'maxKm': s.maxKm = Number(v); break;
        case 'kmRound': s.kmRounding = v; break;
        case 'prUnit': s.priceRounding.unit = Number(v); break;
        case 'prMode': s.priceRounding.mode = v; break;
        case 'footer': s.quoteFooter = v; break;
      }
      if (el.dataset.tc) s.tons[el.dataset.tc].tollClass = Number(v);
      if (el.dataset.kpl) s.tons[el.dataset.kpl].kmPerL = Number(v);
    });
    $('#saveBtn').onclick = function () { saveSettings(this); };
  }

  function adminRegion() {
    var s = state.admin.settings;
    var body = $('#adminBody');
    body.innerHTML =
      '<div class="card">' +
      '<div class="eyebrow">Region · 지역 할증</div><h2>지역 할증 규칙</h2>' +
      '<p class="muted small" style="margin:6px 0 20px">상차지와 하차지를 각각 검사해서 <b>해당하는 할증을 모두 더합니다.</b> (예: 서울→강원 = 1만 + 2만)<br>' +
      '<b>시·도</b> 기준은 "서울", "강원"처럼 시·도 이름에서 찾고, <b>전체 주소</b> 기준은 "울릉군", "신안군 흑산면"처럼 주소 전체에서 찾습니다. 키워드는 쉼표(,)로 구분하세요.</p>' +
      '<div class="rule-head"><span>이름</span><span>금액 (원)</span><span>검사 대상</span><span>키워드</span><span></span></div>' +
      '<div id="rules">' + s.regionRules.map(ruleRow).join('') + '</div>' +
      '<button class="btn" id="addRule">+ 규칙 추가</button>' +
      saveBar(state.admin.settingsDirty) + '</div>';

    function ruleRow(rule, i) {
      return '<div class="rule" data-i="' + i + '">' +
        '<input class="input input-sm" data-f="name" value="' + esc(rule.name) + '" placeholder="이름" aria-label="이름">' +
        '<input class="input input-sm num" type="number" min="0" step="1000" data-f="amount" value="' + esc(rule.amount) + '" aria-label="금액">' +
        '<select class="input input-sm" data-f="target" aria-label="검사 대상"><option value="sido"' + (rule.target === 'sido' ? ' selected' : '') + '>시·도</option><option value="address"' + (rule.target === 'address' ? ' selected' : '') + '>전체 주소</option></select>' +
        '<input class="input input-sm kw" data-f="keywords" value="' + esc((rule.keywords || []).join(', ')) + '" placeholder="예) 울릉군, 신안군, 옹진군" aria-label="키워드">' +
        '<button class="btn btn-ghost btn-sm btn-danger" data-del="' + i + '" title="삭제" aria-label="삭제">✕</button></div>';
    }
    bindDirty(body, function (el) {
      var row = el.closest('.rule'); if (!row) return;
      var rule = s.regionRules[Number(row.dataset.i)];
      var f = el.dataset.f;
      if (f === 'amount') rule.amount = Number(el.value);
      else if (f === 'keywords') rule.keywords = el.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      else rule[f] = el.value;
    });
    $$('[data-del]', body).forEach(function (b) {
      b.onclick = function () {
        var rule = s.regionRules[Number(b.dataset.del)];
        if (!confirm('"' + rule.name + '" 규칙을 삭제할까요?')) return;
        s.regionRules.splice(Number(b.dataset.del), 1);
        state.admin.settingsDirty = true; adminRegion();
      };
    });
    $('#addRule').onclick = function () {
      s.regionRules.push({ name: '새 규칙', amount: 10000, target: 'address', keywords: [] });
      state.admin.settingsDirty = true; adminRegion();
    };
    $('#saveBtn').onclick = function () { saveSettings(this); };
  }

  var PAGE = 50;
  function adminTariff() {
    var a = state.admin, t = a.tariff, tons = t.tons;
    var pages = Math.ceil(t.rows.length / PAGE);
    if (a.page >= pages) a.page = 0;
    var from = a.page * PAGE;
    var body = $('#adminBody');
    var zeros = 0, firstZero = null;
    t.rows.forEach(function (r, i) { r.forEach(function (v, j) { if (!(Number(v) > 0)) { zeros++; if (!firstZero) firstZero = (i + 1) + 'km ' + tons[j]; } }); });
    var tw = a.tariffWarn || {};
    body.innerHTML =
      (zeros ? '<div class="notice err-notice">⚠ 단가가 <b>0원이거나 비어 있는 칸이 ' + won(zeros) + '개</b> 있어요 (처음: ' + esc(firstZero) + '). 이 칸은 0원으로 계산되니 채워 주세요.</div>' : '') +
      (tw.tonMismatch ? '<div class="notice err-notice">⚠ 타리프 시트의 톤수 이름(1행)이 기본 설정의 톤수와 달라요. 시트 1행을 고치거나 기본 설정을 맞춰 주세요.</div>' : '') +
      '<div class="card">' +
      '<div class="row-between" style="flex-wrap:wrap;margin-bottom:16px"><div><div class="eyebrow">Tariff · 타리프</div><h2>km × 톤수 단가표</h2>' +
      '<p class="muted small" style="margin:6px 0 0">1~' + t.rows.length + 'km · ' + tons.length + '개 톤수 · 칸을 눌러 바로 수정하거나 엑셀에서 통째로 붙여넣으세요. 서버 구글 시트의 타리프 탭을 직접 고쳐도 바로 반영돼요.</p></div>' +
      '<div class="actions"><button class="btn btn-sm" id="pasteBtn">엑셀 붙여넣기</button><button class="btn btn-sm" id="csvBtn">CSV 내려받기</button>' +
      (a.tariffDirty ? '<button class="btn btn-sm btn-danger" id="revertBtn">변경 취소</button>' : '') + '</div></div>' +
      '<div class="row-between" style="margin-bottom:10px;flex-wrap:wrap"><div class="pager">' +
      Array.apply(null, { length: pages }).map(function (_, p) {
        return '<button data-p="' + p + '" class="' + (p === a.page ? 'on' : '') + '">' + (p * PAGE + 1) + '–' + Math.min(t.rows.length, (p + 1) * PAGE) + '</button>';
      }).join('') + '</div>' +
      '<div style="display:flex;gap:6px;align-items:center"><input class="input input-sm num" id="jumpKm" type="number" min="1" max="' + t.rows.length + '" placeholder="km 찾기" style="width:110px"></div></div>' +
      '<div class="tariff-table"><table><thead><tr><th>km</th>' + tons.map(function (n) { return '<th>' + esc(n) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      t.rows.slice(from, from + PAGE).map(function (row, i) {
        var km = from + i + 1;
        return '<tr data-km="' + km + '"><td>' + km + '</td>' + row.map(function (v, j) {
          var changed = a.tariffOrig && a.tariffOrig.rows[km - 1] && a.tariffOrig.rows[km - 1][j] !== v;
          return '<td><input inputmode="numeric" data-r="' + (km - 1) + '" data-c="' + j + '" value="' + esc(won(v)) + '" class="' + (changed ? 'changed' : '') + '" aria-label="' + km + 'km ' + esc(tons[j]) + '"></td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>' +
      saveBar(a.tariffDirty, '타리프 저장') + '</div>';

    $$('.pager button', body).forEach(function (b) { b.onclick = function () { a.page = Number(b.dataset.p); adminTariff(); }; });
    $('#jumpKm').onkeydown = function (e) {
      if (e.key !== 'Enter') return;
      var km = Number(this.value);
      if (!(km >= 1 && km <= t.rows.length)) return;
      a.page = Math.floor((km - 1) / PAGE); adminTariff();
      var row = $('tr[data-km="' + km + '"]');
      if (row) { row.scrollIntoView({ block: 'center' }); var inp = $('input', row); if (inp) inp.focus(); }
    };
    $$('.tariff-table input', body).forEach(function (inp) {
      inp.onfocus = function () { this.value = String(t.rows[this.dataset.r][this.dataset.c]); this.select(); };
      inp.onblur = function () { this.value = won(t.rows[this.dataset.r][this.dataset.c]); };
      inp.oninput = function () {
        var v = Number(String(this.value).replace(/[^0-9.]/g, '')) || 0;
        t.rows[this.dataset.r][this.dataset.c] = v;
        var orig = a.tariffOrig.rows[this.dataset.r][this.dataset.c];
        this.classList.toggle('changed', orig !== v);
        if (!a.tariffDirty) { a.tariffDirty = true; $('.save-bar .small').innerHTML = '<span class="dirty-dot"></span>저장하지 않은 변경사항'; }
      };
      inp.onkeydown = function (e) {
        if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        var r = Number(this.dataset.r) + (e.key === 'ArrowUp' ? -1 : 1);
        var next = $('.tariff-table input[data-r="' + r + '"][data-c="' + this.dataset.c + '"]');
        if (next) next.focus();
      };
    });
    $('#csvBtn').onclick = function () {
      downloadCsv('JOIL_타리프_' + today() + '.csv', [['km'].concat(tons)].concat(t.rows.map(function (r, i) { return [i + 1].concat(r); })));
    };
    var rv = $('#revertBtn');
    if (rv) rv.onclick = function () {
      if (!confirm('저장하지 않은 타리프 변경을 모두 취소할까요?')) return;
      a.tariff = clone(a.tariffOrig); a.tariffDirty = false; adminTariff();
    };
    $('#pasteBtn').onclick = openTariffPaste;
    $('#saveBtn').onclick = function () {
      var btn = this;
      busy(btn, true, '저장 중…');
      api('admin.saveTariff', { tariff: t }).then(function () {
        a.tariffOrig = clone(t); a.tariffDirty = false;
        state.calc.result = null;
        toast('타리프를 저장했습니다.');
        adminTariff();
      }).catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
    };
  }

  function openTariffPaste() {
    var a = state.admin, t = a.tariff, n = t.tons.length;
    modal({
      wide: true, eyebrow: '타리프', title: '엑셀에서 붙여넣기',
      body:
        '<p class="muted small" style="margin:0 0 12px">엑셀에서 단가 영역을 복사(Ctrl+C)해서 아래에 붙여넣으세요.<br>' +
        '· 한 줄 = 1km, 칸 순서 = <b>' + t.tons.map(esc).join(' · ') + '</b><br>' +
        '· 맨 앞에 km 열이 있으면(' + (n + 1) + '칸) 그 km 줄에 넣고, 없으면(' + n + '칸) 아래 시작 km부터 차례로 넣습니다.<br>' +
        '· 제목 줄처럼 숫자가 아닌 줄은 건너뜁니다.</p>' +
        '<div class="field" style="max-width:200px"><label>시작 km</label><input class="input input-sm num" id="pasteStart" type="number" min="1" value="1"></div>' +
        '<textarea class="input" id="pasteArea" placeholder="여기에 붙여넣기"></textarea>' +
        '<p class="hint" id="pastePreview" style="margin:8px 0 0"></p>',
      foot: '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="pasteApply">적용</button>',
      onMount: function (m, close) {
        function parse() {
          var start = Math.max(1, Number($('#pasteStart', m).value) || 1);
          var out = [], skipped = 0, bad = 0;
          var seq = start;
          $('#pasteArea', m).value.split(/\r?\n/).forEach(function (line) {
            if (!line.trim()) return;
            var cells = line.indexOf('\t') !== -1 ? line.split('\t') : line.split(',');
            var nums = cells.map(function (c) { var s = String(c).replace(/[^0-9.\-]/g, ''); return s === '' ? NaN : Number(s); });
            if (nums.every(function (x) { return isNaN(x); })) { skipped++; return; }
            var km, vals;
            if (nums.length === n + 1) { km = nums[0]; vals = nums.slice(1); }
            else if (nums.length === n) { km = seq++; vals = nums; }
            else { bad++; return; }
            if (!(km >= 1 && km <= t.rows.length) || vals.some(function (x) { return isNaN(x) || x < 0; })) { bad++; return; }
            out.push({ km: km, vals: vals });
          });
          return { rows: out, skipped: skipped, bad: bad };
        }
        function preview() {
          var p = parse();
          $('#pastePreview', m).innerHTML = p.rows.length
            ? '<b>' + p.rows.length + '줄</b> 적용 예정 (' + p.rows[0].km + 'km ~ ' + p.rows[p.rows.length - 1].km + 'km)' + (p.skipped ? ' · 제목 줄 ' + p.skipped + '개 건너뜀' : '') + (p.bad ? ' · <span style="color:var(--red)">형식 오류 ' + p.bad + '줄 제외</span>' : '')
            : (p.bad ? '<span style="color:var(--red)">칸 수가 ' + n + '개 또는 ' + (n + 1) + '개인 줄이 없습니다.</span>' : '');
        }
        $('#pasteArea', m).oninput = preview;
        $('#pasteStart', m).oninput = preview;
        $('#pasteApply', m).onclick = function () {
          var p = parse();
          if (!p.rows.length) return toast('적용할 줄이 없습니다.', 'err');
          p.rows.forEach(function (r) { t.rows[r.km - 1] = r.vals; });
          a.tariffDirty = true;
          close(); adminTariff();
          toast(p.rows.length + '줄을 반영했습니다. "타리프 저장"을 눌러야 확정됩니다.');
        };
      }
    });
  }

  function refreshUsers() {
    return api('admin.listUsers').then(function (r) {
      state.admin.users = r.users;
      if (state.view === 'admin' && state.admin.tab === 'users') adminUsers();
    }).catch(function (err) { toast(err.message, 'err'); });
  }

  function adminUsers() {
    var a = state.admin;
    var body = $('#adminBody');
    body.innerHTML =
      '<div class="card" style="margin-bottom:16px"><div class="eyebrow">Accounts · 계정</div><h2 style="margin-bottom:16px">새 계정 발급</h2>' +
      '<form id="newUser" class="form-grid" style="align-items:end">' +
      '<div class="field"><label>아이디 (영문·숫자)</label><input class="input" id="nuId" required pattern="[A-Za-z0-9_.\\-]{3,30}"></div>' +
      '<div class="field"><label>이름</label><input class="input" id="nuName" required></div>' +
      '<div class="field"><label>메뉴 권한</label><div class="chips" id="nuPerms">' +
      '<button type="button" class="chip on" data-p="quote">견적</button><button type="button" class="chip" data-p="analysis">분석</button><button type="button" class="chip" data-p="search">배차검색</button><button type="button" class="chip" data-p="admin">관리자</button></div></div>' +
      '<div class="field"><button class="btn btn-primary" type="submit" style="width:100%;padding:12px">발급하기</button></div>' +
      '</form><p class="hint" style="margin:0">임시 비밀번호가 한 번만 표시됩니다. 직원은 첫 로그인 때 비밀번호를 바꿉니다.<br>' +
      '<b>견적</b> = 단건·대량 계산, 조회기록, 견적모음 · <b>분석</b> = 매출매입 분석 · <b>배차검색</b> = 지난 배차의 금액·차량 찾기 (금액 보임) · <b>관리자</b> = 모든 메뉴와 설정</p></div>' +
      '<div class="card" style="--i:1"><h3 style="margin-bottom:12px">계정 목록 <span class="muted small">' + a.users.length + '명</span></h3>' +
      '<div class="table-wrap"><table class="data"><thead><tr><th>아이디</th><th style="text-align:left">이름</th><th style="text-align:left">메뉴 권한</th><th style="text-align:left">상태</th><th>마지막 로그인</th><th></th></tr></thead><tbody>' +
      a.users.map(function (u, i) {
        var self = u.id === state.user.id;
        return '<tr style="--i:' + i + '"><td class="ton">' + esc(u.id) + '</td><td style="text-align:left">' + esc(u.name) + '</td>' +
          '<td style="text-align:left">' + (u.role === 'admin'
            ? '<span class="role-badge">ADMIN</span>' + (self ? '' : ' <button class="btn btn-ghost btn-sm" data-demote="' + esc(u.id) + '">관리자 해제</button>')
            : '<div class="chips perm-chips">' + [['quote', '견적'], ['analysis', '분석'], ['search', '배차검색']].map(function (p) {
              var on = (u.perms || []).indexOf(p[0]) !== -1;
              return '<button type="button" class="chip ' + (on ? 'on' : '') + '" data-uid="' + esc(u.id) + '" data-perm="' + p[0] + '">' + p[1] + '</button>';
            }).join('') + '<button type="button" class="chip ghost" data-promote="' + esc(u.id) + '">관리자로</button></div>') + '</td>' +
          '<td style="text-align:left"><span class="status-pill ' + (u.active ? 'ok' : 'no') + '">' + (u.active ? '사용' : '중지') + '</span>' + (u.mustChange ? ' <span class="badge off">비번 변경 대기</span>' : '') + '</td>' +
          '<td class="small muted">' + esc(u.lastLogin || '–') + '</td>' +
          '<td><div class="actions" style="justify-content:flex-end">' +
          '<button class="btn btn-sm" data-rename="' + esc(u.id) + '">이름 바꾸기</button>' +
          (self ? '<span class="small muted">본인</span>' :
            '<button class="btn btn-sm" data-reset="' + esc(u.id) + '">비번 초기화</button>' +
            '<button class="btn btn-sm ' + (u.active ? 'btn-danger' : '') + '" data-toggle="' + esc(u.id) + '" data-active="' + (u.active ? 1 : 0) + '">' + (u.active ? '사용 중지' : '다시 사용') + '</button>') +
          '</div></td></tr>';
      }).join('') + '</tbody></table></div></div>';

    function showTemp(title, id, pw) {
      modal({
        eyebrow: '임시 비밀번호', title: title,
        body: '<p class="muted small" style="margin:0 0 12px">아이디 <b>' + esc(id) + '</b> 의 임시 비밀번호입니다. <b>이 창을 닫으면 다시 볼 수 없어요.</b> 직원에게 직접 전달하세요.</p>' +
          '<div class="temp-pw">' + esc(pw) + '</div>',
        foot: '<button class="btn" id="copyPw">복사</button><button class="btn btn-primary" data-close>확인</button>',
        onMount: function (m) { $('#copyPw', m).onclick = function () { copyText('아이디: ' + id + '\n임시 비밀번호: ' + pw).then(function () { toast('복사했습니다.'); }); }; }
      });
    }
    $$('#nuPerms .chip').forEach(function (c) { c.onclick = function () { c.classList.toggle('on'); }; });
    $('#newUser').onsubmit = function (e) {
      e.preventDefault();
      var btn = e.target.querySelector('button[type=submit]');
      var id = $('#nuId').value.trim();
      var picked = $$('#nuPerms .chip.on').map(function (c) { return c.dataset.p; });
      if (!picked.length) return toast('메뉴 권한을 하나 이상 고르세요.', 'err');
      var role = picked.indexOf('admin') !== -1 ? 'admin' : 'user';
      busy(btn, true, '발급 중…');
      api('admin.createUser', { id: id, name: $('#nuName').value, role: role, perms: picked.filter(function (p) { return p !== 'admin'; }) }).then(function (r) {
        refreshUsers();
        showTemp('계정을 발급했습니다', id, r.tempPassword);
      }).catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
    };
    $$('[data-reset]', body).forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.reset;
        if (!confirm(id + ' 계정의 비밀번호를 초기화할까요?')) return;
        busy(b, true, '…');
        api('admin.resetPassword', { id: id }).then(function (r) {
          refreshUsers(); showTemp('비밀번호를 초기화했습니다', id, r.tempPassword);
        }).catch(function (err) { busy(b, false); toast(err.message, 'err'); });
      };
    });
    $$('[data-rename]', body).forEach(function (b) {
      b.onclick = function () {
        var u = a.users.filter(function (x) { return x.id === b.dataset.rename; })[0];
        var nm = prompt(u.id + ' 계정의 새 이름 (홈 화면에 "이름님, 안녕하세요"로 나와요)', u.name);
        if (nm == null) return; nm = nm.trim();
        if (!nm || nm === u.name) return;
        busy(b, true, '…');
        api('admin.updateUser', { id: u.id, patch: { name: nm } }).then(function () {
          toast('이름을 "' + nm + '"(으)로 바꿨어요. 그 사람이 다시 로그인하면 보여요.');
          if (u.id === state.user.id) { state.user.name = nm; }
          state.cal.data = null; refreshUsers();
        }).catch(function (err) { busy(b, false); toast(err.message, 'err'); });
      };
    });
    $$('[data-perm]', body).forEach(function (b) {
      b.onclick = function () {
        var u = a.users.filter(function (x) { return x.id === b.dataset.uid; })[0];
        var perms = (u.perms || []).slice(), i = perms.indexOf(b.dataset.perm);
        if (i === -1) perms.push(b.dataset.perm); else perms.splice(i, 1);
        b.disabled = true;
        api('admin.updateUser', { id: u.id, patch: { perms: perms } }).then(function () {
          u.perms = perms; toast(u.name + ' 권한을 바꿨습니다.'); adminUsers();
        }).catch(function (err) { b.disabled = false; toast(err.message, 'err'); });
      };
    });
    $$('[data-promote], [data-demote]', body).forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.promote || b.dataset.demote, up = !!b.dataset.promote;
        if (!confirm(up ? id + ' 계정을 관리자로 바꿀까요? 모든 메뉴와 설정에 접근할 수 있게 됩니다.' : id + ' 계정의 관리자 권한을 해제할까요? (견적 메뉴만 남습니다)')) return;
        busy(b, true, '…');
        api('admin.updateUser', { id: id, patch: up ? { role: 'admin' } : { role: 'user', perms: ['quote'] } }).then(function () {
          toast('권한을 바꿨습니다.'); refreshUsers();
        }).catch(function (err) { busy(b, false); toast(err.message, 'err'); });
      };
    });
    $$('[data-toggle]', body).forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.toggle, active = b.dataset.active === '1';
        if (active && !confirm(id + ' 계정을 사용 중지할까요? 즉시 로그아웃되고 계산할 수 없습니다.')) return;
        busy(b, true, '…');
        api('admin.updateUser', { id: id, patch: { active: !active } }).then(function () {
          toast(active ? '사용을 중지했습니다.' : '다시 사용하도록 했습니다.');
          refreshUsers();
        }).catch(function (err) { busy(b, false); toast(err.message, 'err'); });
      };
    });
  }

  function adminKeys() {
    var k = state.admin.keys || {};
    $('#adminBody').innerHTML =
      '<div class="card"><div class="eyebrow">Keys · API 키</div><h2>외부 서비스 연결</h2>' +
      '<p class="muted small" style="margin:6px 0 22px">키는 서버(Apps Script)에만 저장되고 <b>화면에는 다시 표시되지 않습니다.</b> 바꿀 때만 새로 입력하세요.</p>' +
      '<div class="group"><div class="group-head"><h3>카카오 REST API 키</h3><span class="status-pill ' + (k.kakao ? 'ok' : 'no') + '">' + (k.kakao ? '설정됨' : '미설정') + '</span></div>' +
      '<div class="field"><input class="input" id="kakaoKey" type="password" autocomplete="off" placeholder="' + (k.kakao ? '변경할 때만 입력' : 'REST API 키 붙여넣기') + '">' +
      '<span class="hint">주소 검색(로컬)과 길찾기(카카오모빌리티)에 사용합니다.</span></div>' +
      '<button class="btn btn-sm" id="testKakao"' + (k.kakao ? '' : ' disabled') + '>연결 테스트</button></div>' +
      '<div class="group"><div class="group-head"><h3>오피넷 API 키 (선택)</h3><span class="status-pill ' + (k.opinet ? 'ok' : 'no') + '">' + (k.opinet ? '설정됨' : '미설정') + '</span></div>' +
      '<div class="field"><input class="input" id="opinetKey" type="password" autocomplete="off" placeholder="' + (k.opinet ? '변경할 때만 입력' : '오피넷 무료 API 키') + '">' +
      '<span class="hint">경유가 자동 조회용입니다. 기본 설정 → 유류비에서 "오피넷 자동 조회"를 켜야 사용됩니다.</span></div></div>' +
      '<div class="group"><div class="group-head"><h3>주소 · 경로 저장소 (캐시)</h3><span class="small muted" id="cacheInfo">확인 중…</span></div>' +
      '<p class="hint" style="margin:-6px 0 12px">한 번 조회한 주소와 경로를 서버 시트에 저장해 두고 다시 씁니다. 도로·통행료가 바뀌었다고 생각되면 비우세요. (다음 조회 때 카카오에서 새로 받아옵니다)</p>' +
      '<button class="btn btn-sm btn-danger" id="clearCache">캐시 비우기</button></div>' +
      '<div class="save-bar"><span class="small muted" style="margin-right:auto">입력한 키만 저장됩니다</span><button class="btn btn-accent" id="saveBtn">키 저장</button></div></div>';
    $('#saveBtn').onclick = function () {
      var kakao = $('#kakaoKey').value.trim(), opinet = $('#opinetKey').value.trim();
      if (!kakao && !opinet) return toast('저장할 키를 입력하세요.', 'err');
      var btn = this; busy(btn, true, '저장 중…');
      api('admin.saveKeys', { kakao: kakao, opinet: opinet }).then(function (r) {
        state.admin.keys = r.keys; toast('키를 저장했습니다.'); adminKeys();
      }).catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
    };
    function showCache(c) { var el = $('#cacheInfo'); if (el) el.textContent = '주소 ' + won(c.addresses) + '개 · 경로 ' + won(c.routes) + '개 저장됨'; }
    if (state.admin.cache) showCache(state.admin.cache);
    $('#clearCache').onclick = function () {
      if (!confirm('저장된 주소·경로를 모두 지울까요? 다음 조회부터 카카오 호출이 다시 늘어납니다.')) return;
      var btn = this; busy(btn, true, '비우는 중…');
      api('admin.clearCache').then(function (r) { state.admin.cache = r.cache; showCache(r.cache); toast('캐시를 비웠습니다.'); })
        .catch(function (err) { toast(err.message, 'err'); }).then(function () { busy(btn, false); });
    };
    $('#testKakao').onclick = function () {
      var btn = this; busy(btn, true, '확인 중…');
      api('admin.testKakao').then(function (r) { toast(r.message); }).catch(function (err) { toast(err.message, 'err'); }).then(function () { busy(btn, false); });
    };
  }

  /* ───────── 주소 자동완성 (B2) ───────── */
  /* 지금까지 조회한 주소 + 분석 데이터의 발지·착지 이름을 입력칸 추천 목록으로 */

  function ensureAddrList() {
    var dl = document.getElementById('addrList');
    if (!dl) { dl = document.createElement('datalist'); dl.id = 'addrList'; document.body.appendChild(dl); }
    if (state.addr || state.addrLoading || !can('quote')) return;
    state.addrLoading = true;
    api('addr.list').then(function (r) {
      state.addr = r.list || [];
      fillAddrList();
    }).catch(function () { state.addr = []; }).then(function () { state.addrLoading = false; });
  }
  function fillAddrList() {
    var dl = document.getElementById('addrList'); if (!dl) return;
    var seen = {}, opts = [];
    (state.addr || []).forEach(function (x) { if (!seen[x[0]]) { seen[x[0]] = true; opts.push([x[0], x[1] && x[1] !== x[0] ? x[1] : '']); } });
    if (state.an && state.an.rows) {
      var names = {};
      state.an.rows.forEach(function (r) { names[r[C.from]] = 1; names[r[C.to]] = 1; });
      Object.keys(names).forEach(function (n) { if (n && n.length > 1 && !seen[n]) { seen[n] = true; opts.push([n, '실적 지명']); } });
    }
    dl.innerHTML = opts.slice(0, 5000).map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[1] ? ' label="' + esc(o[1]) + '"' : '') + '>'; }).join('');
  }
  function addrRemember(list) {
    if (!state.addr) return;
    var have = {}; state.addr.forEach(function (x) { have[x[0]] = true; });
    list.forEach(function (x) { if (x && x[0] && !have[x[0]]) { have[x[0]] = true; state.addr.unshift(x); } });
    fillAddrList();
  }

  /* ───────── 회사 정보 (견적서 공급자) ───────── */

  var BIZ_LIST = ['조일물류', '명일로지스', '조일로지스'];
  var COMPANY_FIELDS = [
    ['name', '상호', '예) 주식회사 조일물류'], ['ceo', '대표자', ''], ['bizNo', '사업자등록번호', '000-00-00000'],
    ['addr', '주소', ''], ['tel', '전화', ''], ['fax', '팩스', ''], ['email', '이메일', ''], ['manager', '견적 담당', '예) 일반팀 홍길동 대리 010-0000-0000'],
    ['bank', '입금 계좌', '예) 기업은행 000-000000-00-000 (주)조일물류']
  ];

  function loadCompanies(force) {
    if (state.companies && !force) return Promise.resolve(state.companies);
    return api('companies').then(function (r) { state.companies = r.companies || {}; return state.companies; });
  }

  /** 직인 이미지: 흰 배경을 투명하게 하고 작게 줄여서 PNG data-URL로 (시트 칸 1개에 들어가도록) */
  function stampFromFile(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var sizes = [220, 180, 150, 120, 96];
        for (var i = 0; i < sizes.length; i++) {
          var k = Math.min(1, sizes[i] / Math.max(img.width, img.height));
          var cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
          var g = cv.getContext('2d'); g.drawImage(img, 0, 0, cv.width, cv.height);
          var px = g.getImageData(0, 0, cv.width, cv.height), d = px.data;
          for (var p = 0; p < d.length; p += 4) { if (d[p] > 225 && d[p + 1] > 225 && d[p + 2] > 225) d[p + 3] = 0; }
          g.putImageData(px, 0, 0);
          var out = cv.toDataURL('image/png');
          if (out.length < 44000) return resolve(out);
        }
        reject(new Error('이미지가 너무 복잡해요. 직인만 잘라낸 작은 이미지로 올려 주세요.'));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('이미지를 읽을 수 없습니다.')); };
      img.src = url;
    });
  }

  function adminCompany() {
    var body = $('#adminBody');
    if (!state.admin.companies) {
      adminLoading('회사 정보 불러오는 중…');
      loadCompanies(true).then(function (c) { state.admin.companies = clone(c); if (state.admin.tab === 'company') adminCompany(); })
        .catch(function (err) { body.innerHTML = '<div class="card"><p style="margin:0">' + esc(err.message) + '</p></div>'; });
      return;
    }
    var cs = state.admin.companies;
    body.innerHTML =
      '<div class="card"><div class="eyebrow">Company · 회사 정보</div><h2>견적서 공급자 정보</h2>' +
      '<p class="muted small" style="margin:6px 0 18px">견적서를 만들 때 고른 사업자의 정보와 직인이 들어갑니다. 직인은 흰 배경을 자동으로 투명하게 바꿔요.</p>' +
      BIZ_LIST.map(function (biz) {
        var c = cs[biz] || {};
        return '<div class="group co-group" data-biz="' + esc(biz) + '"><div class="group-head"><h3>' + esc(biz) + '</h3>' +
          '<span class="status-pill ' + (c.name ? 'ok' : 'no') + '">' + (c.name ? '입력됨' : '미입력') + '</span></div>' +
          '<div class="co-grid"><div class="co-fields">' + COMPANY_FIELDS.map(function (f) {
            return '<div class="field' + (f[0] === 'addr' || f[0] === 'bank' || f[0] === 'manager' ? ' wide' : '') + '"><label>' + f[1] + '</label><input class="input input-sm" data-k="' + f[0] + '" value="' + esc(c[f[0]] || '') + '" placeholder="' + esc(f[2]) + '" maxlength="200"></div>';
          }).join('') + '</div>' +
          '<div class="co-stamp"><div class="stamp-box">' + (c.stamp ? '<img src="' + esc(c.stamp) + '" alt="직인">' : '<span class="muted small">직인 없음</span>') + '</div>' +
          '<label class="btn btn-sm">직인 이미지<input type="file" accept="image/png,image/jpeg,image/webp" data-stamp hidden></label>' +
          (c.stamp ? '<button class="btn btn-sm btn-ghost" data-unstamp>지우기</button>' : '') + '</div></div></div>';
      }).join('') +
      saveBar(state.admin.companyDirty, '회사 정보 저장') + '</div>';
    $$('.co-group', body).forEach(function (g) {
      var biz = g.dataset.biz, c = cs[biz] || (cs[biz] = {});
      $$('input[data-k]', g).forEach(function (inp) { inp.oninput = function () { c[inp.dataset.k] = inp.value; markDirty(); }; });
      $('[data-stamp]', g).onchange = function () {
        var file = this.files[0]; if (!file) return;
        stampFromFile(file).then(function (u) { c.stamp = u; markDirty(); adminCompany(); }).catch(function (err) { toast(err.message, 'err'); });
      };
      var un = $('[data-unstamp]', g); if (un) un.onclick = function () { c.stamp = ''; markDirty(); adminCompany(); };
    });
    function markDirty() { if (!state.admin.companyDirty) { state.admin.companyDirty = true; var s = $('.save-bar .small', body); if (s) s.innerHTML = '<span class="dirty-dot"></span>저장하지 않은 변경사항'; } }
    $('#saveBtn').onclick = function () {
      var btn = this; busy(btn, true, '저장 중…');
      api('admin.saveCompanies', { companies: cs }).then(function (r) {
        state.companies = r.companies; state.admin.companies = clone(r.companies); state.admin.companyDirty = false;
        toast('회사 정보를 저장했습니다.'); adminCompany();
      }).catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
    };
  }

  /* ───────── 서식 있는 엑셀 (ExcelJS) ─────────
   * 결과 엑셀(내부 검산용): 톤수 칸에 수식 = 기본타리프 + 기본타리프×하행 + 지역할증 → 반올림
   * 견적서 엑셀(고객용): 미리보기와 같은 양식 + 직인, 금액은 숫자만
   */
  var excelJsLoading = null;
  function loadExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (excelJsLoading) return excelJsLoading;
    excelJsLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
      s.onload = function () { resolve(window.ExcelJS); };
      s.onerror = function () { excelJsLoading = null; reject(new Error('엑셀 기능을 불러오지 못했습니다. 인터넷 연결을 확인하세요.')); };
      document.head.appendChild(s);
    });
    return excelJsLoading;
  }
  function saveWorkbook(wb, filename) {
    // 엑셀 기본 한글 글꼴로 통일
    wb.eachSheet(function (sh) { sh.eachRow(function (row) { row.eachCell(function (c) { c.font = Object.assign({ name: '맑은 고딕', size: 10 }, c.font || {}); }); }); });
    return wb.xlsx.writeBuffer().then(function (buf) {
      saveBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
    });
  }
  var XL = {
    ink: 'FF1E1C19', panel: 'FFF4EEE3', line: 'FFC9BDA8', muted: 'FF7A7265', red: 'FFB4371F', mr: 'FFE6F3F5', note: 'FFFFF6D6',
    thin: function (c) { var s = { style: 'thin', color: { argb: c || XL.line } }; return { top: s, left: s, bottom: s, right: s }; },
    fill: function (c) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: c } }; },
    col: function (n) { var s = ''; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  };
  function xlRoundFormula(expr) {
    var pr = (state.pub && state.pub.priceRounding) || { unit: 1000, mode: 'round' };
    var u = Number(pr.unit) || 1, fn = pr.mode === 'ceil' ? 'ROUNDUP' : pr.mode === 'floor' ? 'ROUNDDOWN' : 'ROUND';
    return u === 1 ? fn + '(' + expr + ',0)' : fn + '((' + expr + ')/' + u + ',0)*' + u;
  }

  /**
   * 결과 엑셀 (단건·대량 공용, 내부 검산용)
   * items: [{ no, origin, dest, status, result, error }], opts: { tons, title, fileName, meta, roundTrip, when, who }
   */
  function exportResultsXlsx(btn, items, opts) {
    busy(btn, true, '만드는 중…');
    return loadExcelJS().then(function (EJ) {
      var tons = opts.tons, meta = opts.meta || {}, adj = opts.adj || newAdj();
      var wb = new EJ.Workbook();
      var HEAD = 4, TS = '기본타리프', SS = '특수운임';
      // 이번 결과에 쓰인 특수운임 (행마다 다를 수 있어 합쳐서 열로)
      var sps = [], spById = {};
      items.forEach(function (x) { ((x.result && x.result.specials) || []).forEach(function (sp) { if (!spById[sp.id]) { spById[sp.id] = sp; sps.push(sp); } }); });
      var withMr = prefs().mr;
      var first = 5, rowAdjCol = first + tons.length, C_REGION = rowAdjCol + 1, C_DOWN = rowAdjCol + 2, C_SP = rowAdjCol + 3, C_MR = C_SP + sps.length;
      var lastCol = C_MR + (withMr ? 3 : 0); // 오류 열
      var fixed = ['No', '상차지', '하차지', '거리(km)', '요금기준(km)'];
      var tail = ['행 조정', '지역할증', '하행'].concat(sps.map(function (sp) { return sp.name + (sp.mode === 'percent' ? ' (%)' : '') + (sp.cust ? ' · ' + sp.cust : ''); }))
        .concat(withMr ? ['밀크런 유류비', '통행료', '유류비+통행료'] : []).concat(['오류']);
      var ws = wb.addWorksheet('견적', { views: [{ state: 'frozen', xSplit: 3, ySplit: HEAD }], pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
      var wt = wb.addWorksheet(TS, { views: [{ state: 'frozen', xSplit: 3, ySplit: HEAD }], pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
      ws.columns = [6, 34, 34, 9, 10].concat(tons.map(function () { return 12; })).concat([11, 11, 8]).concat(sps.map(function () { return 10; })).concat(withMr ? [12, 11, 13] : []).concat([36]).map(function (w) { return { width: w }; });
      wt.columns = [6, 34, 34, 10].concat(tons.map(function () { return 12; })).map(function (w) { return { width: w }; });
      ws.mergeCells(1, 1, 1, lastCol + 1);
      ws.getCell(1, 1).value = opts.title || '운임 견적 (내부 검산용)';
      ws.getCell(1, 1).font = { size: 15, bold: true };
      ws.mergeCells(2, 1, 2, lastCol + 1);
      var pr = (state.pub && state.pub.priceRounding) || { unit: 1000, mode: 'round' };
      ws.getCell(2, 1).value = '톤수 칸 = 기본타리프(' + TS + ' 시트) + 기본타리프 × 하행 + 지역할증' + (sps.length ? ' + 특수운임(1=적용, ' + SS + ' 시트)' : '') + ' → ' + won(pr.unit) + '원 단위 ' + (pr.mode === 'ceil' ? '올림' : pr.mode === 'floor' ? '내림' : '반올림') +
        ' + 행 조정 + 열 조정(3행) · 칸을 고치면 합계가 다시 계산됩니다 · 노란 칸은 직접 입력한 금액 · ' + (opts.when || today()) + ' ' + (opts.who || state.user.name);
      ws.getCell(2, 1).font = { size: 9.5, color: { argb: XL.muted } };
      wt.getCell(1, 1).value = '기본 타리프 (할증 전 단가 · 견적 시트의 수식이 이 값을 씁니다)';
      wt.getCell(1, 1).font = { size: 13, bold: true };
      var head = fixed.concat(tons).concat(tail);
      var lbl = ws.getCell(3, first); lbl.value = '열 조정 →'; lbl.alignment = { horizontal: 'right' }; lbl.font = { bold: true, color: { argb: XL.muted } };
      tons.forEach(function (t, i) { var c = ws.getCell(3, first + i + 1); c.value = adj.cols[t] || 0; c.numFmt = '#,##0;-#,##0;"–"'; c.fill = XL.fill(XL.note); c.border = XL.thin(); c.alignment = { horizontal: 'right' }; });
      head.forEach(function (h, i) {
        var c = ws.getCell(HEAD, i + 1);
        c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = XL.fill(i >= C_MR && i < lastCol ? 'FF2A7D8B' : i >= C_REGION && i < C_MR ? 'FF8A5A12' : XL.ink);
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = XL.thin();
      });
      ws.getRow(HEAD).height = 30;
      ['No', '상차지', '하차지', '요금기준(km)'].concat(tons).forEach(function (h, i) {
        var c = wt.getCell(HEAD, i + 1); c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = XL.fill(XL.ink); c.alignment = { horizontal: 'center' }; c.border = XL.thin();
      });
      // 특수운임 시트: 항목 × 톤수 (금액 또는 %)
      if (sps.length) {
        var wsp = wb.addWorksheet(SS);
        wsp.columns = [18, 10].concat(tons.map(function () { return 11; })).map(function (w) { return { width: w }; });
        wsp.getCell(1, 1).value = '특수 추가운임 (견적 당시 적용 값 · 금액은 원, %는 기본타리프 대비)'; wsp.getCell(1, 1).font = { size: 13, bold: true };
        ['항목', '방식'].concat(tons).forEach(function (h, i) { var c = wsp.getCell(HEAD, i + 1); c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = XL.fill(XL.ink); c.alignment = { horizontal: 'center' }; c.border = XL.thin(); });
        sps.forEach(function (sp, k) {
          var R = HEAD + 1 + k;
          wsp.getCell(R, 1).value = sp.name + (sp.cust ? ' (' + sp.cust + ')' : ''); wsp.getCell(R, 2).value = sp.mode === 'percent' ? '%' : '금액';
          tons.forEach(function (t, i) { var c = wsp.getCell(R, 3 + i); c.value = Number((sp.values || {})[t]) || 0; c.numFmt = sp.mode === 'percent' ? '0.##"%"' : '#,##0'; c.border = XL.thin(); });
        });
      }
      items.slice().sort(function (x, y) { return x.no - y.no; }).forEach(function (row, idx) {
        var R = HEAD + 1 + idx;
        var put = function (sheet, col, v, fmt) { var c = sheet.getCell(R, col + 1); c.value = v; if (fmt) c.numFmt = fmt; c.border = XL.thin(); return c; };
        put(ws, 0, row.no); put(wt, 0, row.no);
        if (row.status !== 'ok' || !row.result) {
          put(ws, 1, row.origin); put(ws, 2, row.dest);
          for (var q = 3; q < lastCol; q++) put(ws, q, '');
          var e = put(ws, lastCol, row.error || '실패'); e.font = { color: { argb: XL.red } };
          put(wt, 1, row.origin); put(wt, 2, row.dest);
          return;
        }
        var r = row.result, m = r.milkrun, byTon = {}, mine = {};
        r.rows.forEach(function (x) { byTon[x.ton] = x; });
        (r.specials || []).forEach(function (sp) { mine[sp.id] = true; });
        put(ws, 1, r.origin.address); put(ws, 2, r.dest.address);
        put(ws, 3, r.distanceKm, '#,##0.0'); put(ws, 4, r.km, '#,##0');
        put(ws, C_REGION, r.regionTotal, '#,##0');
        put(ws, C_DOWN, r.downhillApplied ? r.downhillPercent / 100 : 0, '0%');
        sps.forEach(function (sp, k) { var c = put(ws, C_SP + k, mine[sp.id] ? 1 : 0, '0'); c.alignment = { horizontal: 'center' }; c.fill = XL.fill('FFFBEFD9'); });
        if (withMr) [m.fuel, m.toll, m.total].forEach(function (v, i) { var c = put(ws, C_MR + i, v, '#,##0'); c.fill = XL.fill(XL.mr); });
        put(wt, 1, r.origin.address); put(wt, 2, r.dest.address); put(wt, 3, r.km, '#,##0');
        tons.forEach(function (t, i) {
          var x = byTon[t], col = first + i;
          if (r.overMax || !x || x.tariff == null) {
            put(ws, col, '별도 문의').font = { color: { argb: XL.muted } };
            put(wt, 4 + i, '');
            return;
          }
          put(wt, 4 + i, x.tariff, '#,##0');
          var T = "'" + TS + "'!" + XL.col(4 + i) + R, H = '$' + XL.col(C_DOWN) + R, G = '$' + XL.col(C_REGION) + R;
          var spx = sps.map(function (sp, k) {
            var V = "'" + SS + "'!$" + XL.col(2 + i) + '$' + (HEAD + 1 + k), F = '$' + XL.col(C_SP + k) + R;
            return '+' + F + '*' + (sp.mode === 'percent' ? 'ROUND(' + T + '*' + V + '/100,0)' : V);
          }).join('');
          var k = row.no + '|' + t;
          if (adj.cells.hasOwnProperty(k)) {
            var fc = put(ws, col, adj.cells[k], '#,##0');
            fc.font = { bold: true }; fc.fill = XL.fill('FFFFE08A'); fc.note = '직접 입력한 금액 (계산값 ' + won(adjCalc(adj, row.no, t, x.total)) + ')';
            return;
          }
          var c = put(ws, col, { formula: xlRoundFormula(T + '+ROUND(' + T + '*' + H + ',0)+' + G + spx) + '+$' + XL.col(rowAdjCol) + R + '+' + XL.col(col) + '$3', result: adjPrice(adj, row.no, t, x.total) }, '#,##0');
          c.font = { bold: true };
        });
        var ra = put(ws, rowAdjCol, adj.rows[row.no] || 0, '#,##0;-#,##0;"–"'); ra.fill = XL.fill(XL.note);
        put(ws, lastCol, '');
      });
      var cs = wb.addWorksheet('조건');
      cs.columns = [{ width: 18 }, { width: 70 }];
      var ok = items.filter(function (x) { return x.status === 'ok'; }).length;
      [['조회 일시', opts.when || new Date().toLocaleString('ko-KR')], ['조회자', opts.who || (state.user.name + ' (' + state.user.id + ')')], ['전체 건수', items.length], ['성공', ok], ['실패', items.length - ok],
        ['밀크런 기준 톤수', meta.baseTon || ''], ['편도/왕복', opts.roundTrip ? '왕복' : '편도'], ['경유가(원/L)', meta.diesel ? meta.diesel.price : ''], ['경유가 출처', meta.diesel ? meta.diesel.source || '' : ''],
        ['특수 추가운임', sps.length ? sps.map(function (sp) { return sp.name + (sp.cust ? '(' + sp.cust + ' 기준)' : ''); }).join(', ') : '없음'],
        ['계산식', '톤수별 합계 = 기본타리프 + 기본타리프 × 하행% + 지역할증 + 특수운임 (금액 단위 ' + won(pr.unit) + '원) + 행·열 조정'], ['참고', '유류비·통행료는 밀크런 기준 톤수로 따로 계산하며 톤수별 합계에는 들어가지 않습니다.']
      ].forEach(function (r, i) { cs.getCell(i + 1, 1).value = r[0]; cs.getCell(i + 1, 1).font = { bold: true }; cs.getCell(i + 1, 2).value = r[1]; });
      return saveWorkbook(wb, opts.fileName);
    }).catch(function (err) { toast(err.message, 'err'); }).then(function () { busy(btn, false); });
  }

  /** 견적서 엑셀 (고객용 양식, 금액은 숫자) */
  function quoteDocXlsx(btn, d) {
    busy(btn, true, '만드는 중…');
    return loadExcelJS().then(function (EJ) {
      var wb = new EJ.Workbook();
      var nT = d.tons.length + (d.milkrun ? 1 : 0);
      var N = Math.max(4 + nT, 7); // 전체 열 수
      var ws = wb.addWorksheet('견적서', { pageSetup: { paperSize: 9, orientation: N > 9 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }, horizontalCentered: true }, views: [{ showGridLines: false }] });
      var widths = [6, 30, 30, 10];
      for (var i = 4; i < N; i++) widths.push(N <= 8 ? 17 : 13);
      ws.columns = widths.map(function (w) { return { width: w }; });
      var border = XL.thin(), bold = { bold: true };
      // 맨 위 띠 + 제목
      for (var cc = 1; cc <= N; cc++) ws.getCell(1, cc).fill = XL.fill(['FFE0472E', 'FFF07A22', 'FFF4BE2E', 'FF4FA864', 'FF2A9DB0'][Math.floor((cc - 1) / N * 5)]);
      ws.getRow(1).height = 6;
      ws.mergeCells(2, 1, 2, N);
      var t = ws.getCell(2, 1); t.value = '견   적   서'; t.font = { size: 26, bold: true }; t.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(2).height = 52;
      // 왼쪽: 견적 정보 (A~C)
      var left = [['견적번호', d.no], ['견적일', d.date], ['유효기간', d.valid]];
      left.forEach(function (kv, i) {
        var r = 4 + i;
        ws.getCell(r, 1).value = kv[0]; ws.getCell(r, 1).font = { color: { argb: XL.muted }, size: 10 };
        ws.mergeCells(r, 2, r, 3); ws.getCell(r, 2).value = kv[1] || ''; ws.getCell(r, 2).font = bold;
      });
      ws.mergeCells(7, 1, 7, 3);
      var rc = ws.getCell(7, 1);
      rc.value = { richText: [{ text: (d.to || '') + '  ', font: { size: 16, bold: true } }, { text: '귀하', font: { size: 11, bold: true } }] };
      rc.border = { bottom: { style: 'medium', color: { argb: XL.ink } } };
      ws.getRow(7).height = 28;
      if (d.ref) { ws.getCell(8, 1).value = '참조'; ws.getCell(8, 1).font = { color: { argb: XL.muted }, size: 10 }; ws.mergeCells(8, 2, 8, 3); ws.getCell(8, 2).value = d.ref; ws.getCell(8, 2).font = bold; }
      ws.mergeCells(9, 1, 9, 3); ws.getCell(9, 1).value = '아래와 같이 견적합니다.';
      // 오른쪽: 공급자 (D~끝)
      var sup = d.supplier, S0 = 4;
      ws.mergeCells(S0, 4, S0 + sup.length - 1, 4);
      var sv = ws.getCell(S0, 4); sv.value = '공\n급\n자'; sv.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; sv.font = bold; sv.fill = XL.fill(XL.panel); sv.border = border;
      sup.forEach(function (kv, i) {
        var r = S0 + i;
        var l = ws.getCell(r, 5); l.value = kv[0]; l.font = bold; l.fill = XL.fill(XL.panel); l.border = border; l.alignment = { vertical: 'middle' };
        ws.mergeCells(r, 6, r, N);
        var v = ws.getCell(r, 6); v.value = kv[1] + (kv[0] === '대표자' ? '   (인)' : ''); v.border = border; v.alignment = { vertical: 'middle', shrinkToFit: true };
        for (var c2 = 7; c2 <= N; c2++) ws.getCell(r, c2).border = border;
        ws.getRow(r).height = 20;
      });
      if (d.stamp) {
        var img = wb.addImage({ base64: d.stamp, extension: /image\/jpeg/.test(d.stamp) ? 'jpeg' : 'png' });
        // "(인)" 글자 위에 오도록: 대표자 이름 길이만큼 오른쪽으로
        var colPx = ws.getColumn(6).width * 7 + 5, ceo = (sup.filter(function (x) { return x[0] === '대표자'; })[0] || ['', ''])[1];
        var off = Math.max(0, Math.min(colPx * 2, String(ceo).length * 13 + 28 - 31));
        ws.addImage(img, { tl: { col: 5 + off / colPx, row: S0 - 0.25 }, ext: { width: 62, height: 62 }, editAs: 'oneCell' });
      }
      // 견적 금액 상자
      var B = S0 + sup.length + 1;
      ws.mergeCells(B, 1, B, N);
      var bx = ws.getCell(B, 1);
      bx.value = { richText: [{ text: '견적 금액    ', font: { bold: true, size: 11 } }, { text: d.sumText, font: { bold: true, size: 14 } }].concat(d.vat ? [{ text: '      (부가세 별도)', font: { size: 10, color: { argb: XL.muted } } }] : []) };
      bx.border = { top: { style: 'medium' }, left: { style: 'medium' }, bottom: { style: 'medium' }, right: { style: 'medium' } };
      bx.alignment = { vertical: 'middle', indent: 1 };
      ws.getRow(B).height = 34;
      // 금액 표
      var H = B + 2;
      var head = ['No', '상차지', '하차지', '거리'].concat(d.tons).concat(d.milkrun ? [d.mrLabel] : []);
      for (var hc = 1; hc <= N; hc++) {
        var h = ws.getCell(H, hc); h.value = head[hc - 1] || ''; h.font = { bold: true, color: { argb: 'FF5A5246' } }; h.fill = XL.fill(XL.panel);
        h.border = { top: { style: 'thin', color: { argb: XL.ink } }, bottom: { style: 'thin', color: { argb: XL.ink } } }; h.alignment = { horizontal: hc <= 3 ? 'left' : 'right', vertical: 'middle', wrapText: true };
      }
      ws.getRow(H).height = 22;
      d.rows.forEach(function (row, i) {
        var r = H + 1 + i;
        var vals = [i + 1, row.from, row.to, row.km + 'km'].concat(row.prices).concat(d.milkrun ? [row.mr] : []);
        for (var c3 = 1; c3 <= N; c3++) {
          var c = ws.getCell(r, c3), v = vals[c3 - 1];
          c.value = v == null ? (c3 <= vals.length ? '별도 문의' : '') : v;
          if (typeof v === 'number' && c3 > 4) c.numFmt = '#,##0';
          c.alignment = { horizontal: c3 <= 3 ? 'left' : 'right', vertical: 'middle', shrinkToFit: c3 === 2 || c3 === 3 };
          c.border = { bottom: { style: 'hair', color: { argb: XL.line } } };
        }
      });
      var r0 = H + 1 + d.rows.length + 1;
      if (d.notes.length) {
        ws.getCell(r0, 1).value = '비고'; ws.getCell(r0, 1).font = bold;
        d.notes.forEach(function (n, i) { ws.mergeCells(r0 + 1 + i, 1, r0 + 1 + i, N); ws.getCell(r0 + 1 + i, 1).value = '· ' + n; ws.getCell(r0 + 1 + i, 1).font = { size: 10 }; });
        r0 += d.notes.length + 2;
      }
      if (d.bank) { ws.mergeCells(r0, 1, r0, N); ws.getCell(r0, 1).value = { richText: [{ text: '입금 계좌  ', font: bold }, { text: d.bank }] }; r0 += 2; }
      ws.mergeCells(r0, 1, r0, N);
      var f = ws.getCell(r0, 1); f.value = d.footer; f.alignment = { horizontal: 'center' }; f.font = { size: 10 };
      f.border = { top: { style: 'medium', color: { argb: XL.ink } } };
      ws.pageSetup.printArea = 'A1:' + XL.col(N - 1) + r0;
      return saveWorkbook(wb, d.fileName);
    }).catch(function (err) { toast(err.message, 'err'); }).then(function () { busy(btn, false); });
  }

  /* ───────── 견적서 (B3) ───────── */
  /*
   * src: { type: '단건'|'대량', items: [{ origin, dest, result }], tons, meta: { baseTon, roundTrip, diesel } }
   * 설정 창 → 미리보기(인쇄/PDF) · 엑셀
   */
  function openQuoteDoc(src) {
    var pref = local('get', 'joil-qdoc') || {};
    var ok = src.items.filter(function (x) { return x.result; });
    if (!ok.length) return toast('견적서에 넣을 성공한 결과가 없습니다.', 'err');
    var allTons = state.pub.tons;
    var defTons = (src.tons || allTons).filter(function (t) { return allTons.indexOf(t) !== -1; });
    if (src.type === '대량' && defTons.length > 4) defTons = defTons.slice(0, 4);
    var o = {
      biz: BIZ_LIST.indexOf(pref.biz) !== -1 ? pref.biz : BIZ_LIST[0], to: src.client || '', ref: '', date: today(),
      valid: pref.valid || '견적일로부터 30일', tons: defTons, milkrun: !!pref.milkrun && prefs().mr, vat: pref.vat !== false,
      note: pref.note != null ? pref.note : (state.pub.quoteFooter || '')
    };
    modal({
      eyebrow: '견적서', title: '견적서 만들기 · ' + (src.type === '대량' ? won(ok.length) + '개 경로' : '1개 경로'),
      body:
        '<div class="field"><label>공급자 (보내는 사업자)</label><div class="segmented" id="qdBiz">' + BIZ_LIST.map(function (b) { return '<button type="button" data-v="' + b + '" class="' + (o.biz === b ? 'on' : '') + '">' + b + '</button>'; }).join('') + '</div></div>' +
        '<div class="qd-two"><div class="field"><label>받는 곳 (거래처)</label><input class="input" id="qdTo" value="' + esc(o.to) + '" placeholder="예) (주)○○○ 물류팀"></div>' +
        '<div class="field"><label>참조 (담당자)</label><input class="input" id="qdRef" placeholder="예) 김○○ 과장님"></div></div>' +
        '<div class="qd-two"><div class="field"><label>견적일</label><input class="input" id="qdDate" type="date" value="' + esc(o.date) + '"></div>' +
        '<div class="field"><label>유효기간</label><input class="input" id="qdValid" value="' + esc(o.valid) + '"></div></div>' +
        '<div class="field"><label>넣을 톤수 ' + (src.type === '대량' ? '<span class="muted">(가로 폭 때문에 최대 6개)</span>' : '') + '</label><div class="chips" id="qdTons">' + allTons.map(function (t) {
          return '<button type="button" class="chip' + (o.tons.indexOf(t) !== -1 ? ' on' : '') + '" data-t="' + esc(t) + '">' + esc(t) + '</button>';
        }).join('') + '</div></div>' +
        '<div class="field' + (prefs().mr ? '' : ' hidden') + '"><label class="toggle"><input type="checkbox" id="qdMr"' + (o.milkrun ? ' checked' : '') + '><span class="track"></span>밀크런 유류비 + 통행료 함께 표시 (' + esc(src.meta.baseTon || '') + ' 기준)</label></div>' +
        '<div class="field"><label class="toggle"><input type="checkbox" id="qdVat"' + (o.vat ? ' checked' : '') + '><span class="track"></span>"부가세 별도" 표시</label></div>' +
        '<div class="field"><label>비고</label><textarea class="input memo" id="qdNote" maxlength="1000">' + esc(o.note) + '</textarea></div>',
      foot: '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="qdGo">미리보기</button>',
      onMount: function (m, close) {
        $$('#qdTons .chip', m).forEach(function (ch) { ch.onclick = function () { ch.classList.toggle('on'); }; });
        $$('#qdBiz button', m).forEach(function (b) { b.onclick = function () { $$('#qdBiz button', m).forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
        $('#qdGo', m).onclick = function () {
          o.biz = $('#qdBiz button.on', m).dataset.v; o.to = $('#qdTo', m).value.trim(); o.ref = $('#qdRef', m).value.trim();
          o.date = $('#qdDate', m).value || today(); o.valid = $('#qdValid', m).value.trim(); o.note = $('#qdNote', m).value;
          o.milkrun = $('#qdMr', m).checked; o.vat = $('#qdVat', m).checked;
          o.tons = $$('#qdTons .chip.on', m).map(function (x) { return x.dataset.t; });
          if (!o.tons.length && !o.milkrun) return toast('톤수를 하나 이상 고르세요.', 'err');
          if (src.type === '대량' && o.tons.length > 6) return toast('대량 견적서는 톤수를 6개까지 넣을 수 있어요.', 'err');
          local('set', 'joil-qdoc', { biz: o.biz, valid: o.valid, milkrun: o.milkrun, vat: o.vat, note: o.note });
          var btn = this; busy(btn, true, '준비 중…');
          loadCompanies().catch(function () { return {}; }).then(function (cs) { close(); showQuoteDoc(src, o, (cs || {})[o.biz] || {}); });
        };
      }
    });
  }

  function showQuoteDoc(src, o, co) {
    var ok = src.items.filter(function (x) { return x.result; });
    var no = 'Q' + o.date.replace(/-/g, '') + '-' + ('0' + new Date().getHours()).slice(-2) + ('0' + new Date().getMinutes()).slice(-2);
    var coName = co.name || o.biz;
    var priceOf = function (it, t) {
      var r = it.result;
      if (r.overMax) return null;
      var x = r.rows.filter(function (y) { return y.ton === t; })[0];
      return x && x.total != null ? adjPrice(src.adj, it.no || 1, t, x.total) : null;
    };
    var cell = function (v) { return v == null ? '<td class="num muted">별도 문의</td>' : '<td class="num">' + won(v) + '</td>'; };
    var bodyHtml;
    var mrLabel = '유류비+통행료 (' + (src.meta.baseTon || '') + (src.meta.roundTrip ? ' 왕복' : ' 편도') + ')';
    if (src.type === '단건') {
      var r = ok[0].result;
      bodyHtml = '<table class="data rpt qd-table"><thead><tr><th class="left">구간</th><th>운행거리</th>' + o.tons.map(function (t) { return '<th>' + esc(t) + '</th>'; }).join('') + (o.milkrun ? '<th>' + esc(mrLabel) + '</th>' : '') + '</tr></thead><tbody>' +
        '<tr><td class="left"><span class="pin from"></span>' + esc(r.origin.address) + '<br><span class="pin to"></span>' + esc(r.dest.address) + '</td><td class="num">약 ' + r.distanceKm + 'km</td>' +
        o.tons.map(function (t) { return cell(priceOf(ok[0], t)); }).join('') + (o.milkrun ? cell(r.milkrun.total) : '') + '</tr></tbody></table>';
    } else {
      bodyHtml = '<table class="data rpt qd-table"><thead><tr><th>No</th><th class="left">상차지</th><th class="left">하차지</th><th>거리</th>' + o.tons.map(function (t) { return '<th>' + esc(t) + '</th>'; }).join('') + (o.milkrun ? '<th>' + esc(mrLabel) + '</th>' : '') + '</tr></thead><tbody>' +
        ok.map(function (x, i) {
          var rr = x.result;
          return '<tr><td class="num muted">' + (i + 1) + '</td><td class="left">' + esc(rr.origin.address) + '</td><td class="left">' + esc(rr.dest.address) + '</td><td class="num">' + rr.distanceKm + 'km</td>' +
            o.tons.map(function (t) { return cell(priceOf(x, t)); }).join('') + (o.milkrun ? cell(rr.milkrun.total) : '') + '</tr>';
        }).join('') + '</tbody></table>';
    }
    var noteLines = [];
    if (o.vat && !/부가세/.test(o.note || '')) noteLines.push('위 금액은 부가세 별도입니다.');
    if (o.milkrun) noteLines.push('유류비는 경유 ' + won(src.meta.diesel ? src.meta.diesel.price : '') + '원/L 기준이며 유가 변동에 따라 달라질 수 있습니다.');
    String(o.note || '').split('\n').forEach(function (l) { if (l.trim()) noteLines.push(l.trim()); });
    var supplier = [['상호', coName], ['대표자', co.ceo], ['사업자번호', co.bizNo], ['주소', co.addr], ['전화', [co.tel, co.fax ? '팩스 ' + co.fax : ''].filter(Boolean).join(' · ')], ['담당', [co.manager, co.email].filter(Boolean).join(' · ')]];
    var missing = !co.name;
    var html =
      '<div class="rpt-bar no-print"><span class="muted small">견적서 미리보기 · 인쇄 창에서 "PDF로 저장"을 고르면 PDF가 돼요</span><span class="spacer"></span>' +
      '<button class="btn btn-sm" id="qdX">엑셀</button><button class="btn btn-sm btn-primary" id="qdPrint">인쇄 / PDF 저장</button><button class="btn btn-sm" id="qdClose">닫기</button></div>' +
      (missing ? '<div class="qd-warn no-print">' + esc(o.biz) + ' 회사 정보가 비어 있어요. ' + (state.user.role === 'admin' ? '<b>관리자 → 회사 정보</b>에서 입력하면 상호·사업자번호·직인이 들어갑니다.' : '관리자에게 회사 정보 입력을 요청하세요.') + '</div>' : '') +
      '<div class="rpt-page qd-page">' +
      '<div class="stripe-bar qd-stripe"></div>' +
      '<h1 class="qd-title">견 적 서</h1>' +
      '<div class="qd-head"><div class="qd-to">' +
      '<div class="qd-kv"><span>견적번호</span><b>' + esc(no) + '</b></div>' +
      '<div class="qd-kv"><span>견적일</span><b>' + esc(o.date) + '</b></div>' +
      (o.valid ? '<div class="qd-kv"><span>유효기간</span><b>' + esc(o.valid) + '</b></div>' : '') +
      '<div class="qd-recv">' + (o.to ? esc(o.to) + ' <small>귀하</small>' : '<span class="muted">받는 곳 귀하</span>') + '</div>' +
      (o.ref ? '<div class="qd-kv"><span>참조</span><b>' + esc(o.ref) + '</b></div>' : '') +
      '<p class="qd-lead">아래와 같이 견적합니다.</p></div>' +
      '<table class="qd-sup"><tbody>' + supplier.map(function (s, i) {
        return '<tr>' + (i === 0 ? '<th rowspan="' + supplier.length + '" class="qd-vert">공<br>급<br>자</th>' : '') + '<th>' + s[0] + '</th><td>' + esc(s[1] || '') +
          (s[0] === '대표자' && co.stamp ? '<span class="qd-seal-wrap"><span class="qd-seal-txt">(인)</span><img class="qd-seal" src="' + esc(co.stamp) + '" alt=""></span>' : (s[0] === '대표자' ? ' <span class="muted">(인)</span>' : '')) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="qd-sum"><span>견적 금액</span><b>' + (src.type === '단건' && o.tons.length === 1 && priceOf(ok[0], o.tons[0]) != null ? '일금 ' + won(priceOf(ok[0], o.tons[0])) + '원정 (' + esc(o.tons[0]) + ')' : '아래 표 참조') + '</b>' + (o.vat ? '<small>부가세 별도</small>' : '') + '</div>' +
      bodyHtml +
      (noteLines.length ? '<div class="qd-note"><h3>비고</h3><ul>' + noteLines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></div>' : '') +
      (co.bank ? '<div class="qd-bank"><span>입금 계좌</span> ' + esc(co.bank) + '</div>' : '') +
      '<footer class="qd-foot"><b>' + esc(coName) + '</b>' + (co.addr ? ' · ' + esc(co.addr) : '') + (co.tel ? ' · ' + esc(co.tel) : '') + '</footer></div>';
    var wrap = document.createElement('div');
    wrap.id = 'report';
    wrap.innerHTML = html;
    document.body.appendChild(wrap);
    document.body.classList.add('report-open');
    window.scrollTo(0, 0);
    function close() { wrap.remove(); document.body.classList.remove('report-open'); }
    $('#qdClose').onclick = close;
    $('#qdPrint').onclick = function () { window.print(); };
    $('#qdX').onclick = function () {
      var one = src.type === '단건' && o.tons.length === 1 && priceOf(ok[0], o.tons[0]) != null;
      quoteDocXlsx(this, {
        no: no, date: o.date, valid: o.valid, to: o.to, ref: o.ref, vat: o.vat, tons: o.tons, milkrun: o.milkrun, mrLabel: mrLabel,
        supplier: supplier.map(function (x) { return [x[0], x[1] || '']; }), stamp: co.stamp || '', bank: co.bank || '', notes: noteLines,
        sumText: one ? '일금 ' + won(priceOf(ok[0], o.tons[0])) + '원정 (' + o.tons[0] + ')' : '아래 표 참조',
        footer: [coName, co.addr, co.tel].filter(Boolean).join(' · '),
        rows: ok.map(function (x) { var rr = x.result; return { from: rr.origin.address, to: rr.dest.address, km: rr.distanceKm, prices: o.tons.map(function (t) { return priceOf(x, t); }), mr: rr.milkrun.total }; }),
        fileName: '견적서_' + (o.to || coName).replace(/[\\/:*?"<>|]/g, '_') + '_' + o.date + '.xlsx'
      });
    };
  }

  /* ───────── 특수 추가운임 (관리자) ───────── */

  function specialsGrid(items, tons) {
    return [['항목', '방식(금액/%)'].concat(tons)].concat(items.map(function (sp) {
      return [sp.name, sp.mode === 'percent' ? '%' : '금액'].concat(tons.map(function (t) { var v = (sp.values || {})[t]; return v ? Number(v) : ''; }));
    }));
  }
  /** 엑셀 시트 → [{ name, mode, values }] (제목 줄에 "항목"이 있는 표) */
  function parseSpecialsGrid(grid, tons) {
    var hi = -1;
    for (var i = 0; i < Math.min(grid.length, 20); i++) if (grid[i].some(function (c) { return String(c).replace(/\s/g, '') === '항목'; })) { hi = i; break; }
    if (hi === -1) return null;
    var h = grid[hi].map(function (c) { return String(c).replace(/\s/g, ''); });
    var ci = h.indexOf('항목'), mi = h.findIndex(function (c) { return /^방식/.test(c); });
    var tcol = {};
    tons.forEach(function (t) { var k = h.findIndex(function (c) { return normTon(c) === t; }); if (k !== -1) tcol[t] = k; });
    return grid.slice(hi + 1).filter(function (r) { return String(r[ci] || '').trim(); }).map(function (r) {
      var values = {};
      tons.forEach(function (t) { if (tcol[t] == null) return; var v = anNum(r[tcol[t]]); if (v > 0) values[t] = v; });
      return { name: String(r[ci]).trim(), mode: /%|퍼센트|percent/i.test(String(mi !== -1 ? r[mi] : '')) ? 'percent' : 'amount', values: values };
    });
  }
  /** "5T", "5", "5톤 윙" → 설정의 "5톤" */
  function normTon(v) {
    var tons = state.pub.tons, s = String(v == null ? '' : v).trim();
    if (tons.indexOf(s) !== -1) return s;
    var m = s.replace(/,/g, '').match(/\d+(\.\d+)?/);
    if (!m) return null;
    var n = parseFloat(m[0]);
    return tons.filter(function (t) { return parseFloat(t) === n; })[0] || null;
  }

  function adminSpecials() {
    var a = state.admin, st = a.settings, tons = st.tons.map(function (t) { return t.name; });
    st.specials = st.specials || [];
    var body = $('#adminBody');
    body.innerHTML = '<div class="card"><div class="row-between" style="flex-wrap:wrap;gap:10px;margin-bottom:12px"><div><div class="eyebrow">Special · 특수 추가운임</div><h2>회사 기준 특수운임</h2>' +
      '<p class="muted small" style="margin:6px 0 0">계산할 때 고르면 톤수별로 더해져요. <b>금액</b>은 원, <b>%</b>는 기본 타리프 대비입니다. 금액을 하나도 넣지 않은 항목은 계산 화면에 나오지 않아요. 업체마다 다른 값은 <b>업체 단가 → 특수운임 설정</b>에서 정해요.</p></div>' +
      '<div class="actions"><button class="btn btn-sm" id="spTpl">엑셀 양식 내려받기</button><label class="btn btn-sm" for="spFile">엑셀 올리기</label><input type="file" id="spFile" accept=".xlsx,.xls,.csv" hidden></div></div>' +
      '<div class="table-wrap"><table class="data sp-table"><thead><tr><th class="left">항목</th><th>방식</th>' + tons.map(function (t) { return '<th>' + esc(t) + '</th>'; }).join('') + '<th></th></tr></thead><tbody>' +
      st.specials.map(function (sp, i) {
        return '<tr data-i="' + i + '"><td><input class="input input-sm" data-f="name" value="' + esc(sp.name) + '" maxlength="30"></td>' +
          '<td><select class="input input-sm" data-f="mode"><option value="amount"' + (sp.mode !== 'percent' ? ' selected' : '') + '>금액</option><option value="percent"' + (sp.mode === 'percent' ? ' selected' : '') + '>%</option></select></td>' +
          tons.map(function (t) { var v = (sp.values || {})[t]; return '<td><input class="input input-sm num sp-v" data-t="' + esc(t) + '" value="' + (v ? (sp.mode === 'percent' ? v : won(v)) : '') + '" placeholder="–" inputmode="decimal"></td>'; }).join('') +
          '<td><button class="btn btn-sm btn-ghost" data-del>삭제</button></td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<button class="btn btn-sm" id="spAdd" style="margin-top:10px">＋ 항목 추가</button>' +
      saveBar(a.settingsDirty, '특수운임 저장') + '</div>';
    var mark = function () { a.settingsDirty = true; var d = $('.save-bar .small'); if (d) d.innerHTML = '<span class="dirty-dot"></span>저장하지 않은 변경사항'; };
    $$('.sp-table tbody tr', body).forEach(function (tr) {
      var sp = st.specials[Number(tr.dataset.i)];
      $('[data-f="name"]', tr).oninput = function () { sp.name = this.value; mark(); };
      $('[data-f="mode"]', tr).onchange = function () { sp.mode = this.value; mark(); };
      $$('.sp-v', tr).forEach(function (inp) {
        inp.onchange = function () { var v = anNum(inp.value); sp.values = sp.values || {}; if (v > 0) sp.values[inp.dataset.t] = v; else delete sp.values[inp.dataset.t]; inp.value = v > 0 ? (sp.mode === 'percent' ? v : won(v)) : ''; mark(); };
      });
      $('[data-del]', tr).onclick = function () { if (!confirm('"' + sp.name + '" 항목을 지울까요? (저장해야 반영돼요)')) return; st.specials.splice(Number(tr.dataset.i), 1); mark(); adminSpecials(); };
    });
    $('#spAdd').onclick = function () { st.specials.push({ id: 'sp' + Date.now().toString(36), name: '새 항목', mode: 'amount', values: {} }); mark(); adminSpecials(); };
    $('#saveBtn').onclick = function () { saveSettings(this); };
    $('#spTpl').onclick = function () {
      var btn = this; busy(btn, true, '…');
      downloadXlsx('JOIL_특수운임_' + today() + '.xlsx', [{ name: '특수운임', rows: specialsGrid(st.specials, tons), widths: [16, 12].concat(tons.map(function () { return 10; })) },
        { name: '안내', rows: [['특수 추가운임 양식'], ['방식: 금액(원) 또는 % (기본 타리프 대비)'], ['빈칸은 0원(해당 없음)으로 처리됩니다.'], ['항목 이름이 같으면 그 항목을 고치고, 새 이름은 새 항목으로 추가돼요.']], widths: [70] }])
        .catch(function (err) { toast(err.message, 'err'); }).then(function () { busy(btn, false); });
    };
    $('#spFile').onchange = function () {
      var file = this.files[0]; this.value = ''; if (!file) return;
      Promise.all([loadXlsx(), file.arrayBuffer()]).then(function (res) {
        var X = res[0], wb = X.read(new Uint8Array(res[1]), { type: 'array' });
        var name = wb.SheetNames.filter(function (n) { return /특수/.test(n); })[0] || wb.SheetNames[0];
        var list = parseSpecialsGrid(X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' }), tons);
        if (!list || !list.length) throw new Error('"항목" 제목 줄이 있는 표를 찾지 못했어요. 양식을 내려받아 써 주세요.');
        list.forEach(function (n) {
          var ex = st.specials.filter(function (sp) { return sp.name === n.name; })[0];
          if (ex) { ex.mode = n.mode; ex.values = n.values; } else st.specials.push({ id: 'sp' + Date.now().toString(36) + st.specials.length, name: n.name, mode: n.mode, values: n.values });
        });
        mark(); adminSpecials(); toast(list.length + '개 항목을 읽었어요. 확인 후 저장을 누르세요.');
      }).catch(function (err) { toast(err.message, 'err'); });
    };
  }

  /* ───────── 업체별 단가표 ───────── */

  function ratesTemplate(btn, cust) {
    var tons = state.pub.tons, items = (state.pub.specials || []).map(function (sp) { return { name: sp.name, mode: sp.mode, values: {} }; });
    busy(btn, true, '…');
    downloadXlsx('JOIL_업체단가_양식' + (cust ? '_' + cust : '') + '.xlsx', [
      { name: '단가표', widths: [36, 36, 9, 12, 13, 24], rows: [['상차지', '하차지', '톤수', '단가', '적용 시작일', '비고'],
        ['경기 평택시 포승읍 평택항로 100', '부산 강서구 녹산산단321로 10', '5톤', 500000, '2026-01-01', '← 예시 줄 (지우고 쓰세요)'],
        ['경기 평택시 포승읍 평택항로 100', '대구 달서구 성서공단로 1', '11톤', 700000, '', '']] },
      { name: '특수운임', widths: [16, 12].concat(tons.map(function () { return 10; })), rows: specialsGrid(items, tons) },
      { name: '안내', widths: [90], rows: [['업체 단가표 올리기 양식'], [''], ['[단가표] 한 줄에 하나: 상차지 · 하차지 · 톤수 · 단가 (적용 시작일, 비고는 선택)'],
        ['톤수는 ' + tons.join(', ') + ' 중 하나로 써 주세요. (5T, 5 처럼 써도 알아봐요)'], ['단가는 숫자만 (원). 적용 시작일은 2026-01-01 형식.'], [''],
        ['[특수운임] 이 업체만 회사 기준과 다른 특수운임이 있을 때만 채우세요. 빈 항목은 회사 기준을 씁니다.'], ['방식: 금액(원) 또는 % (기본 타리프 대비)']] }
    ]).catch(function (err) { toast(err.message, 'err'); }).then(function () { busy(btn, false); });
  }

  /** 단가표 엑셀 읽기 → { rows, bad, specials } */
  function parseRatesFile(file) {
    return Promise.all([loadXlsx(), file.arrayBuffer()]).then(function (res) {
      var X = res[0], wb = X.read(new Uint8Array(res[1]), { type: 'array', cellDates: true });
      var sheet = wb.SheetNames.filter(function (n) { return /단가/.test(n); })[0] || wb.SheetNames[0];
      var grid = X.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: true, defval: '' });
      var hi = -1, col = {};
      for (var i = 0; i < Math.min(grid.length, 30) && hi === -1; i++) {
        var h = grid[i].map(function (c) { return String(c).replace(/\s/g, ''); });
        var f = h.findIndex(function (c) { return /^(상차지|출발지|발지)/.test(c); }), t = h.findIndex(function (c) { return /^(하차지|도착지|착지)/.test(c); });
        if (f !== -1 && t !== -1) {
          hi = i; col = { from: f, to: t, ton: h.findIndex(function (c) { return /톤|차종|차량/.test(c); }), price: h.findIndex(function (c) { return /단가|운임|금액/.test(c); }),
            since: h.findIndex(function (c) { return /시작|적용일|일자/.test(c); }), memo: h.findIndex(function (c) { return /비고|메모/.test(c); }) };
        }
      }
      if (hi === -1) throw new Error('"상차지 · 하차지" 제목 줄을 찾지 못했어요. 양식을 내려받아 써 주세요.');
      if (col.ton === -1 || col.price === -1) throw new Error('"톤수", "단가" 열을 찾지 못했어요.');
      var rows = [], bad = [];
      grid.slice(hi + 1).forEach(function (r, k) {
        var from = String(r[col.from] || '').trim(), to = String(r[col.to] || '').trim();
        if (!from && !to) return;
        if (/예시/.test(String(col.memo !== -1 ? r[col.memo] : ''))) return;
        var ton = normTon(r[col.ton]), price = anNum(r[col.price]), since = col.since !== -1 ? anDate(r[col.since], X) || '' : '';
        var line = hi + k + 2;
        if (!from || !to) bad.push(line + '행: 상차지·하차지 빈칸');
        else if (!ton) bad.push(line + '행: 톤수 "' + r[col.ton] + '"를 알 수 없음');
        else if (!(price > 0)) bad.push(line + '행: 단가 확인');
        else rows.push([from, to, ton, Math.round(price), since, col.memo !== -1 ? String(r[col.memo] || '') : '']);
      });
      var specials = null, spName = wb.SheetNames.filter(function (n) { return /특수/.test(n); })[0];
      if (spName) {
        var list = parseSpecialsGrid(X.utils.sheet_to_json(wb.Sheets[spName], { header: 1, raw: true, defval: '' }), state.pub.tons) || [];
        list = list.filter(function (x) { return Object.keys(x.values).length; });
        if (list.length) {
          specials = {};
          list.forEach(function (x) { var sp = (state.pub.specials || []).filter(function (s) { return s.name === x.name; })[0]; if (sp) specials[sp.id] = { mode: x.mode, values: x.values }; else bad.push('특수운임 "' + x.name + '"은 회사 항목에 없어 건너뜀'); });
        }
      }
      return { rows: rows, bad: bad, specials: specials };
    });
  }

  function renderRates() {
    var rs = state.rates;
    $('#main').innerHTML = '<div class="rates-grid"><div class="card rates-side"><div class="eyebrow">Rates · 업체 단가</div><h2>업체별 단가표</h2>' +
      '<div class="actions" style="margin:12px 0"><button class="btn btn-sm btn-primary" id="rtUp">＋ 단가표 올리기</button><button class="btn btn-sm" id="rtTpl">양식 내려받기</button></div>' +
      '<input class="input input-sm" id="rtQ" placeholder="업체 찾기" value="' + esc(rs.custQ || '') + '"><div id="rtList" style="margin-top:10px"><p class="muted"><span class="spinner dark"></span></p></div></div>' +
      '<div id="rtBody"></div></div>';
    $('#rtUp').onclick = function () { openRatesUpload(rs.sel || ''); };
    $('#rtTpl').onclick = function () { ratesTemplate(this, ''); };
    $('#rtQ').oninput = function () { rs.custQ = this.value.trim(); drawRateList(); };
    if (rs.custs) { drawRateList(); drawRateBody(); return; }
    api('rates.list').then(function (r) { rs.custs = r.custs; state.rateCusts = r.custs; if (!rs.sel && r.custs.length) rs.sel = r.custs[0].cust; if (state.view === 'rates') { drawRateList(); drawRateBody(); } })
      .catch(function (err) { $('#rtList').innerHTML = '<p class="err-text">' + esc(err.message) + '</p>'; });
  }

  function drawRateList() {
    var rs = state.rates, el = $('#rtList'); if (!el || !rs.custs) return;
    var list = rs.custs.filter(function (x) { return !rs.custQ || x.cust.indexOf(rs.custQ) !== -1; });
    el.innerHTML = list.length ? '<ul class="rt-list">' + list.map(function (x) {
      return '<li><button class="' + (rs.sel === x.cust ? 'on' : '') + '" data-c="' + esc(x.cust) + '"><b>' + esc(x.cust) + '</b><span class="small muted">' + won(x.count) + '구간' + (x.hasSpecial ? ' · 특수운임 별도' : '') + '</span></button></li>';
    }).join('') + '</ul>' : '<p class="muted small">' + (rs.custs.length ? '찾는 업체가 없어요.' : '아직 올린 단가표가 없어요. 양식을 내려받아 채운 뒤 올려 주세요.') + '</p>';
    $$('[data-c]', el).forEach(function (b) { b.onclick = function () { rs.sel = b.dataset.c; rs.data = null; rs.cmp = null; rs.q = ''; rs.ton = ''; drawRateList(); drawRateBody(); }; });
  }

  function drawRateBody() {
    syncRoute();
    var rs = state.rates, box = $('#rtBody'); if (!box) return;
    if (!rs.sel) { box.innerHTML = '<div class="card empty"><div><div class="big-stripes"></div><h3>업체를 고르거나 단가표를 올려 주세요</h3><p class="muted" style="margin:0">올린 단가는 우리 타리프와 비교하거나, 그 구간 그대로 새 견적을 낼 수 있어요.</p></div></div>'; return; }
    if (!rs.data || rs.data.cust !== rs.sel) {
      box.innerHTML = '<div class="card muted"><span class="spinner dark"></span> 불러오는 중…</div>';
      var want = rs.sel;
      api('rates.get', { cust: want }).then(function (r) { if (rs.sel !== want) return; rs.data = r; drawRateBody(); }).catch(function (err) { box.innerHTML = '<div class="card"><p class="err-text" style="margin:0">' + esc(err.message) + '</p></div>'; });
      return;
    }
    var d = rs.data, cmp = rs.cmp, q = rs.q || '';
    var tonsUsed = state.pub.tons.filter(function (t) { return d.rows.some(function (r) { return r[2] === t; }); });
    var list = d.rows.map(function (r, i) { return { i: i, r: r }; }).filter(function (x) { return (!rs.ton || x.r[2] === rs.ton) && (!q || (x.r[0] + ' ' + x.r[1] + ' ' + x.r[5]).indexOf(q) !== -1); });
    var info = (rs.custs || []).filter(function (x) { return x.cust === d.cust; })[0] || {};
    var sum = '';
    if (cmp && cmp.done) {
      var diffs = d.rows.map(function (r, i) { var ours = cmp.ours[i]; return ours ? (r[3] - ours) / ours * 100 : null; }).filter(function (v) { return v != null; });
      var avg = diffs.length ? diffs.reduce(function (s, v) { return s + v; }, 0) / diffs.length : null;
      var below = diffs.filter(function (v) { return v < 0; }).length;
      sum = '<div class="kpis mini rt-kpis">' +
        '<div class="kpi"><div class="k">비교한 구간</div><div class="v num">' + won(diffs.length) + '</div><div class="s">' + (cmp.failed ? '계산 실패 ' + cmp.failed + '구간' : '전부 계산됨') + '</div></div>' +
        '<div class="kpi"><div class="k">평균 차이 (계약 − 우리 타리프)</div><div class="v num' + (avg < 0 ? ' neg' : '') + '">' + (avg == null ? '–' : (avg > 0 ? '+' : '') + avg.toFixed(1) + '%') + '</div><div class="s">+면 계약 단가가 더 높음</div></div>' +
        '<div class="kpi"><div class="k">계약 단가가 더 낮은 구간</div><div class="v num' + (below ? ' neg' : '') + '">' + won(below) + '</div><div class="s">단가 인상 검토 대상</div></div></div>';
    }
    box.innerHTML = '<div class="card"><div class="row-between" style="flex-wrap:wrap;gap:10px"><div><div class="eyebrow">Rate card · 단가표</div><h2>' + esc(d.cust) + '</h2>' +
      '<p class="muted small" style="margin:4px 0 0">' + won(d.rows.length) + '구간' + (info.updated ? ' · 마지막 올림 ' + esc(info.updated) + ' ' + esc(String(info.by || '').replace(/ \(.*\)$/, '')) : '') + (Object.keys(d.specials || {}).length ? ' · 특수운임 ' + Object.keys(d.specials).length + '개 업체 기준' : '') + '</p></div>' +
      '<div class="actions"><button class="btn btn-sm btn-primary" id="rtCmp"' + (cmp && !cmp.done ? ' disabled' : '') + '>' + (cmp && !cmp.done ? '<span class="spinner"></span>비교 중 ' + cmp.n + '/' + cmp.total : '우리 타리프로 비교') + '</button>' +
      '<button class="btn btn-sm" id="rtNew">이 구간으로 새 견적</button><button class="btn btn-sm" id="rtSp">특수운임 설정</button><button class="btn btn-sm" id="rtRe">다시 올리기</button>' +
      '<button class="btn btn-sm" id="rtX">엑셀</button>' + (state.user.role === 'admin' ? '<button class="btn btn-sm btn-ghost" id="rtDel">업체 삭제</button>' : '') + '</div></div>' + sum +
      '<div class="toolbar" style="margin-top:12px"><input class="input input-sm" id="rtSearch" placeholder="상차지·하차지 검색" value="' + esc(q) + '" style="max-width:260px">' +
      '<div class="segmented" id="rtTon"><button type="button" data-t="" class="' + (!rs.ton ? 'on' : '') + '">전체</button>' + tonsUsed.map(function (t) { return '<button type="button" data-t="' + esc(t) + '" class="' + (rs.ton === t ? 'on' : '') + '">' + esc(t) + '</button>'; }).join('') + '</div></div>' +
      '<div class="table-wrap"><table class="data rt-table"><thead><tr><th class="left">상차지</th><th class="left">하차지</th><th>톤수</th><th>계약 단가</th>' + (cmp ? '<th>우리 타리프</th><th>차이</th><th>차이율</th>' : '') + '<th class="left">적용일</th><th class="left">비고</th></tr></thead><tbody>' +
      list.slice(0, rs.limit || 300).map(function (x) {
        var r = x.r, ours = cmp && cmp.ours[x.i], err = cmp && cmp.errs[x.i];
        var df = ours != null ? r[3] - ours : null;
        return '<tr><td class="left wrap">' + esc(r[0]) + '</td><td class="left wrap">' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td><td class="num strong">' + won(r[3]) + '</td>' +
          (cmp ? (ours != null ? '<td class="num">' + won(ours) + '</td><td class="num ' + (df < 0 ? 'neg' : '') + '">' + (df > 0 ? '+' : '') + won(df) + '</td><td class="num ' + (df < 0 ? 'neg' : '') + '">' + (df > 0 ? '+' : '') + (df / ours * 100).toFixed(1) + '%</td>'
            : '<td colspan="3" class="muted small">' + (err ? esc(err) : cmp.done ? '–' : '…') + '</td>') : '') +
          '<td class="left small">' + esc(r[4] || '') + '</td><td class="left small muted">' + esc(r[5] || '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (list.length > (rs.limit || 300) ? '<button class="btn btn-sm" id="rtMore" style="margin-top:10px">더 보기 (' + won(list.length - (rs.limit || 300)) + '구간)</button>' : '') +
      (cmp ? '<p class="hint" style="margin:10px 0 0">우리 타리프 = 지금 단가 기준 톤수별 금액 (지역·하행 할증 포함' + (Object.keys(d.specials || {}).length ? ', 특수운임 제외' : '') + '). 차이 = 계약 단가 − 우리 타리프.</p>' : '') + '</div>';
    var st;
    $('#rtSearch').oninput = function () { var v = this.value; clearTimeout(st); st = setTimeout(function () { rs.q = v.trim(); drawRateBody(); var el = $('#rtSearch'); el.focus(); el.setSelectionRange(v.length, v.length); }, 250); };
    $$('#rtTon button').forEach(function (b) { b.onclick = function () { rs.ton = b.dataset.t; drawRateBody(); }; });
    var more = $('#rtMore'); if (more) more.onclick = function () { rs.limit = (rs.limit || 300) + 300; drawRateBody(); };
    $('#rtCmp').onclick = function () { compareRates(); };
    $('#rtNew').onclick = function () { ratesToQuote(d); };
    $('#rtSp').onclick = function () { openCustSpecials(d); };
    $('#rtRe').onclick = function () { openRatesUpload(d.cust); };
    $('#rtX').onclick = function () {
      var btn = this; busy(btn, true, '…');
      downloadXlsx('JOIL_업체단가_' + d.cust + '_' + today() + '.xlsx', [{ name: '단가표', widths: [36, 36, 8, 12].concat(cmp ? [12, 12, 9] : []).concat([12, 24]),
        rows: [['상차지', '하차지', '톤수', '계약 단가'].concat(cmp ? ['우리 타리프', '차이', '차이율(%)'] : []).concat(['적용 시작일', '비고'])].concat(d.rows.map(function (r, i) {
          var ours = cmp && cmp.ours[i];
          return [r[0], r[1], r[2], r[3]].concat(cmp ? [ours == null ? '' : ours, ours == null ? '' : r[3] - ours, ours == null ? '' : +((r[3] - ours) / ours * 100).toFixed(1)] : []).concat([r[4], r[5]]);
        })) }]).catch(function (err) { toast(err.message, 'err'); }).then(function () { busy(btn, false); });
    };
    var del = $('#rtDel'); if (del) del.onclick = function () {
      if (!confirm('"' + d.cust + '" 업체의 단가표와 특수운임 설정을 모두 지울까요? 되돌릴 수 없습니다.')) return;
      var btn = this; busy(btn, true, '삭제 중…');
      api('rates.delete', { cust: d.cust }).then(function () { rs.custs = null; rs.sel = ''; rs.data = null; rs.cmp = null; state.rateCusts = null; toast('삭제했습니다.'); renderRates(); })
        .catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
    };
  }

  /** 단가표 구간을 지금 타리프로 계산해서 비교 (조회기록에는 남기지 않음) */
  function compareRates() {
    var rs = state.rates, d = rs.data;
    var uniq = {}, pairs = [];
    d.rows.forEach(function (r) { var k = r[0] + '\u0001' + r[1]; if (!uniq[k]) { uniq[k] = pairs.length + 1; pairs.push({ no: pairs.length + 1, origin: r[0], dest: r[1] }); } });
    var cmp = rs.cmp = { ours: {}, errs: {}, n: 0, total: pairs.length, done: false, failed: 0 };
    var results = {};
    var chunks = [];
    for (var i = 0; i < pairs.length; i += BULK_CHUNK) chunks.push(pairs.slice(i, i + BULK_CHUNK));
    var next = 0, cust = d.cust;
    drawRateBody();
    var opts = { dieselMode: state.calc.dieselMode, dieselPrice: Number(state.calc.dieselPrice), baseTon: state.calc.baseTon };
    var worker = function () {
      if (next >= chunks.length || rs.cmp !== cmp) return Promise.resolve();
      var ch = chunks[next++];
      return api('quoteBatch', Object.assign({ pairs: ch, batch: { count: pairs.length } }, opts)).then(function (res) {
        res.items.forEach(function (it, j) { results[ch[j].no] = it; });
      }).catch(function (err) { ch.forEach(function (p) { results[p.no] = { error: err.message }; }); }).then(function () {
        cmp.n += ch.length;
        if (state.view === 'rates' && rs.data && rs.data.cust === cust) { var b = $('#rtCmp'); if (b) b.innerHTML = '<span class="spinner"></span>비교 중 ' + cmp.n + '/' + cmp.total; }
        return worker();
      });
    };
    Promise.all([worker(), worker(), worker()]).then(function () {
      if (rs.cmp !== cmp) return;
      d.rows.forEach(function (r, i) {
        var it = results[uniq[r[0] + '\u0001' + r[1]]];
        if (!it || it.error) { cmp.errs[i] = (it && it.error) || '계산 실패'; cmp.failed++; return; }
        if (it.result.overMax) { cmp.errs[i] = '타리프 범위 초과 (별도 문의)'; return; }
        var x = it.result.rows.filter(function (y) { return y.ton === r[2]; })[0];
        if (x && x.total != null) cmp.ours[i] = x.total; else cmp.errs[i] = '해당 톤수 단가 없음';
      });
      cmp.done = true;
      if (state.view === 'rates' && rs.data && rs.data.cust === cust) drawRateBody();
    });
  }

  /** 단가표 구간 → 대량 계산 화면으로 옮겨서 바로 계산 (업체 특수운임 기준 선택) */
  function ratesToQuote(d) {
    var b = state.bulk;
    if (b.running) return toast('대량 계산이 진행 중입니다. 끝난 뒤 다시 시도하세요.', 'err');
    var seen = {}, lines = [];
    d.rows.forEach(function (r) { var k = r[0] + '\t' + r[1]; if (!seen[k]) { seen[k] = true; lines.push(k); } });
    if (lines.length > (Number(state.pub.maxRows) || 1000)) return toast('구간이 너무 많아요. 최대 ' + won(state.pub.maxRows) + '건까지 계산할 수 있어요.', 'err');
    var tons = state.pub.tons.filter(function (t) { return d.rows.some(function (r) { return r[2] === t; }); });
    if (tons.length) { state.calc.tons = tons; local('set', 'joil-tons', tons); }
    if (Object.keys(d.specials || {}).length) state.calc.cust = d.cust;
    b.mode = 'pairs'; b.pairsText = lines.join('\n'); b.results = []; b.client = d.cust;
    state.view = 'bulk'; render();
    toast(d.cust + ' 단가표의 ' + lines.length + '개 구간을 계산해요. 결과에서 금액 조정·견적 저장을 할 수 있어요.');
    startBulk();
  }

  function openRatesUpload(cust) {
    var parsed = null, file = null;
    modal({
      eyebrow: '업체 단가', title: '단가표 올리기',
      body: '<div class="field"><label>업체 <span style="color:var(--red)">*</span></label><input class="input" id="ruC" list="ruCs" value="' + esc(cust || '') + '" placeholder="예) 쿠팡"><datalist id="ruCs">' + (state.rates.custs || []).map(function (x) { return '<option value="' + esc(x.cust) + '">'; }).join('') + '</datalist></div>' +
        '<label class="drop" id="ruDrop"><input type="file" id="ruF" accept=".xlsx,.xls,.csv" hidden><span id="ruTxt"><b>엑셀 파일 고르기</b> 또는 끌어다 놓기<br><span class="small muted">양식의 "단가표" 시트 (특수운임 시트는 선택)</span></span></label>' +
        '<div class="field"><label>올리는 방식</label><div class="segmented" id="ruM"><button type="button" data-m="replace" class="on">바꾸기 (이 업체 단가 전체 교체)</button><button type="button" data-m="append">뒤에 추가</button></div></div>' +
        '<div id="ruInfo"></div>',
      foot: '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="ruGo" disabled>올리기</button>',
      onMount: function (m, close) {
        $$('#ruM button', m).forEach(function (b) { b.onclick = function () { $$('#ruM button', m).forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
        var pick = function (f) {
          if (!f) return; file = f;
          $('#ruTxt', m).innerHTML = '<b>' + esc(f.name) + '</b><br><span class="small muted">읽는 중…</span>';
          parseRatesFile(f).then(function (p) {
            parsed = p;
            $('#ruTxt', m).innerHTML = '<b>' + esc(f.name) + '</b><br><span class="small muted">다른 파일을 고르려면 다시 누르세요</span>';
            $('#ruInfo', m).innerHTML = '<p style="margin:0"><b>' + won(p.rows.length) + '구간</b> 읽음' + (p.specials ? ' · 업체 특수운임 ' + Object.keys(p.specials).length + '개' : '') + '</p>' +
              (p.bad.length ? '<div class="notice err-notice" style="margin-top:8px">건너뛴 줄 ' + p.bad.length + '개<br>' + p.bad.slice(0, 8).map(esc).join('<br>') + (p.bad.length > 8 ? '<br>…' : '') + '</div>' : '');
            $('#ruGo', m).disabled = !p.rows.length;
          }).catch(function (err) { parsed = null; $('#ruGo', m).disabled = true; $('#ruInfo', m).innerHTML = '<p class="err-text" style="margin:0">' + esc(err.message) + '</p>'; });
        };
        $('#ruF', m).onchange = function () { pick(this.files[0]); this.value = ''; };
        var dz = $('#ruDrop', m);
        dz.ondragover = function (e) { e.preventDefault(); dz.classList.add('over'); };
        dz.ondragleave = function () { dz.classList.remove('over'); };
        dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove('over'); pick(e.dataTransfer.files[0]); };
        $('#ruGo', m).onclick = function () {
          var c = $('#ruC', m).value.trim(), mode = $('#ruM button.on', m).dataset.m;
          if (!c) return toast('업체 이름을 입력하세요.', 'err');
          if (!parsed) return;
          if (mode === 'replace' && (state.rates.custs || []).some(function (x) { return x.cust === c && x.count; }) && !confirm('"' + c + '"의 기존 단가를 모두 이 파일로 바꿀까요?')) return;
          var btn = this; busy(btn, true, '올리는 중…');
          api('rates.upload', { cust: c, rows: parsed.rows, mode: mode, specials: parsed.specials || undefined }).then(function (r) {
            close(); toast(c + ' 단가 ' + won(r.count) + '구간을 올렸어요.');
            var rs = state.rates; rs.custs = null; rs.sel = c; rs.data = null; rs.cmp = null; state.rateCusts = null;
            if (state.view === 'rates') renderRates();
          }).catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
        };
      }
    });
  }

  /** 업체 특수운임: 회사 기준과 다른 항목만 */
  function openCustSpecials(d) {
    var tons = state.pub.tons, items = state.pub.specials || [], cur = JSON.parse(JSON.stringify(d.specials || {}));
    modal({
      wide: true, eyebrow: '업체 단가 · ' + d.cust, title: '업체 특수운임',
      body: '<p class="muted small" style="margin:0 0 12px">이 업체만 회사 기준과 다르게 받는 항목만 채우세요. <b>빈 항목은 회사 기준</b>을 씁니다. 계산 화면에서 "' + esc(d.cust) + ' 기준"을 고르면 적용돼요.</p>' +
        '<div class="table-wrap"><table class="data sp-table"><thead><tr><th class="left">항목</th><th>업체 기준</th><th>방식</th>' + tons.map(function (t) { return '<th>' + esc(t) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        items.map(function (sp) {
          var o = cur[sp.id];
          return '<tr data-id="' + esc(sp.id) + '"><td class="left"><b>' + esc(sp.name) + '</b></td><td><input type="checkbox" data-on' + (o ? ' checked' : '') + '></td>' +
            '<td><select class="input input-sm" data-mode><option value="amount"' + (!o || o.mode !== 'percent' ? ' selected' : '') + '>금액</option><option value="percent"' + (o && o.mode === 'percent' ? ' selected' : '') + '>%</option></select></td>' +
            tons.map(function (t) { var v = o && o.values[t]; return '<td><input class="input input-sm num" data-t="' + esc(t) + '" value="' + (v ? v : '') + '" placeholder="–" inputmode="decimal"></td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>',
      foot: '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="csSave">저장</button>',
      onMount: function (m, close) {
        $$('tbody tr', m).forEach(function (tr) { $$('input[data-t]', tr).forEach(function (inp) { inp.oninput = function () { $('[data-on]', tr).checked = true; }; }); });
        $('#csSave', m).onclick = function () {
          var out = {};
          $$('tbody tr', m).forEach(function (tr) {
            if (!$('[data-on]', tr).checked) return;
            var vals = {};
            $$('input[data-t]', tr).forEach(function (inp) { var v = anNum(inp.value); if (v > 0) vals[inp.dataset.t] = v; });
            out[tr.dataset.id] = { mode: $('[data-mode]', tr).value, values: vals };
          });
          var btn = this; busy(btn, true, '저장 중…');
          api('rates.saveSpecials', { cust: d.cust, specials: out }).then(function (r) {
            d.specials = r.specials; close(); toast('업체 특수운임을 저장했어요.');
            state.rates.custs = null; state.rateCusts = null; if (state.view === 'rates') renderRates();
          }).catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
        };
      }
    });
  }

  /* ───────── 견적 접수함 ───────── */

  var REQ_STATUS = ['접수', '검토중', '제출', '수주', '미수주'];
  function reqPill(st) { return '<span class="rstatus r-' + Math.max(0, REQ_STATUS.indexOf(st)) + '">' + esc(st || '접수') + '</span>'; }
  function dueInfo(r) {
    if (!r.due || ['제출', '수주', '미수주'].indexOf(r.status) !== -1) return null;
    var n = docDays({ expires: r.due });
    return n;
  }
  function dueBadge(r) {
    var n = dueInfo(r);
    if (n == null) return r.due ? '<span class="small muted">' + esc(r.due) + '</span>' : '<span class="muted">–</span>';
    if (n < 0) return '<span class="badge exp-x">' + (-n) + '일 지남</span> <span class="small muted">' + esc(r.due.slice(5)) + '</span>';
    if (n <= 2) return '<span class="badge exp-soon">' + (n ? 'D-' + n : '오늘') + '</span> <span class="small muted">' + esc(r.due.slice(5)) + '</span>';
    return '<span class="small">' + esc(r.due) + '</span>';
  }

  function renderReqs() {
    syncRoute();
    var rs = state.reqs;
    if (rs.detail) return renderReqDetail();
    $('#main').innerHTML =
      '<div class="card"><div class="row-between" style="flex-wrap:wrap;margin-bottom:14px"><div><div class="eyebrow">Requests · 견적 접수함</div><h2>견적 접수함</h2>' +
      '<p class="muted small" style="margin:6px 0 0">받은 견적 요청(메일 제목·본문·원본 첨부)과 우리가 제출한 견적을 한 건으로 남겨요. 언제 무엇을 받아 어떤 단가로 냈는지 바로 찾을 수 있어요.</p></div>' +
      '<div class="actions"><button class="btn btn-sm" id="rqReload">새로고침</button><button class="btn btn-sm btn-primary" id="rqNew">＋ 견적 요청 등록</button></div></div>' +
      '<div id="rqAlert"></div>' +
      '<div class="toolbar"><div class="segmented" id="rqSt">' + [''].concat(REQ_STATUS).map(function (s) { return '<button type="button" data-s="' + s + '" class="' + (rs.status === s ? 'on' : '') + '">' + (s || '전체') + '</button>'; }).join('') + '</div>' +
      '<select class="input input-sm" id="rqBiz" style="width:auto"><option value="">모든 사업자</option>' + BIZ_LIST.map(function (b) { return '<option' + (rs.biz === b ? ' selected' : '') + '>' + b + '</option>'; }).join('') + '</select>' +
      '<input class="input input-sm" id="rqQ" placeholder="거래처·제목·본문 검색" value="' + esc(rs.q) + '" style="max-width:240px"></div><div id="rqList"></div></div>';
    $$('#rqSt button').forEach(function (b) { b.onclick = function () { rs.status = b.dataset.s; $$('#rqSt button').forEach(function (x) { x.classList.toggle('on', x === b); }); drawReqs(); }; });
    $('#rqBiz').onchange = function () { rs.biz = this.value; drawReqs(); };
    var st; $('#rqQ').oninput = function () { var v = this.value; clearTimeout(st); st = setTimeout(function () { rs.q = v.trim(); drawReqs(); }, 200); };
    $('#rqReload').onclick = function () { rs.list = null; loadReqs(); };
    $('#rqNew').onclick = openNewReq;
    if (rs.list) drawReqs(); else loadReqs();
  }
  function loadReqs() {
    var l = $('#rqList'); if (l) l.innerHTML = '<p class="muted"><span class="spinner dark"></span> 불러오는 중…</p>';
    return api('reqs.list').then(function (r) { state.reqs.list = r.reqs; if (state.view === 'reqs' && !state.reqs.detail) drawReqs(); })
      .catch(function (err) { var x = $('#rqList'); if (x) x.innerHTML = '<p class="err-text">' + esc(err.message) + '</p>'; });
  }
  function drawReqs() {
    syncRoute();
    var rs = state.reqs, el = $('#rqList'); if (!el || !rs.list) return;
    var counts = {}; rs.list.forEach(function (r) { counts[r.status] = (counts[r.status] || 0) + 1; });
    $$('#rqSt button').forEach(function (b) { var n = b.dataset.s ? counts[b.dataset.s] || 0 : rs.list.length; b.innerHTML = (b.dataset.s || '전체') + ' <span class="cnt">' + n + '</span>'; });
    var soon = rs.list.filter(function (r) { var n = dueInfo(r); return n != null && n <= 2; });
    $('#rqAlert').innerHTML = soon.length ? '<div class="doc-alert"><b>회신 기한</b> ' + soon.map(function (r) { return esc(r.cust + ' · ' + r.title.slice(0, 24)) + ' ' + dueBadge(r).replace(/<span class="small muted">.*<\/span>/, ''); }).join(' · ') + '</div>' : '';
    var q = rs.q;
    var list = rs.list.filter(function (r) {
      if (rs.status && r.status !== rs.status) return false;
      if (rs.biz && r.biz !== rs.biz) return false;
      return !q || (r.cust + ' ' + r.title + ' ' + r.snippet + ' ' + r.summary + ' ' + r.owner).indexOf(q) !== -1;
    });
    if (!list.length) { el.innerHTML = '<p class="muted" style="margin:18px 0 4px">' + (rs.list.length ? '조건에 맞는 접수 건이 없어요.' : '아직 등록한 견적 요청이 없어요. <b>＋ 견적 요청 등록</b>으로 메일 내용을 붙여넣어 보세요.') + '</p>'; return; }
    el.innerHTML = '<div class="table-wrap"><table class="data reqs"><thead><tr><th class="left">받은 날</th><th class="left">거래처</th><th class="left">제목</th><th class="left">상태</th><th class="left">회신 기한</th><th class="left">파일</th><th class="left">제출</th><th class="left">담당</th></tr></thead><tbody>' +
      list.map(function (r) {
        return '<tr data-id="' + esc(r.id) + '"><td class="left small">' + esc(r.received || String(r.at).slice(0, 10)) + '</td>' +
          '<td class="left"><b>' + esc(r.cust) + '</b>' + (r.biz ? '<br><span class="small muted">' + esc(r.biz) + '</span>' : '') + '</td>' +
          '<td class="left req-title"><button class="doc-name" data-open><span><b>' + esc(r.title) + '</b><small>' + esc(r.snippet) + '</small></span></button></td>' +
          '<td class="left">' + reqPill(r.status) + '</td><td class="left">' + dueBadge(r) + '</td>' +
          '<td class="left small"><span title="받은 파일">📥 ' + r.files.in + '</span> <span title="제출 파일">📤 ' + r.files.out + '</span></td>' +
          '<td class="left small">' + (r.submitted ? esc(r.submitted) + (r.summary ? '<br><span class="muted">' + esc(r.summary.split('\n')[0].slice(0, 30)) + '</span>' : '') : '<span class="muted">–</span>') + '</td>' +
          '<td class="left small">' + esc(r.owner || String(r.by).replace(/ \(.*\)$/, '')) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    $$('tr[data-id]', el).forEach(function (tr) { tr.onclick = function () { rs.detail = tr.dataset.id; rs.data = null; renderReqs(); window.scrollTo(0, 0); }; });
  }

  function reqFieldsHtml(r, compact) {
    return '<div class="qd-two"><div class="field"><label>거래처 <span style="color:var(--red)">*</span></label><input class="input" data-r="cust" value="' + esc(r.cust || '') + '" maxlength="100" placeholder="예) 삼다수"></div>' +
      '<div class="field"><label>사업자</label><select class="input" data-r="biz"><option value="">선택 안 함</option>' + BIZ_LIST.map(function (b) { return '<option' + (r.biz === b ? ' selected' : '') + '>' + b + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="field"><label>메일 제목 <span style="color:var(--red)">*</span></label><input class="input" data-r="title" value="' + esc(r.title || '') + '" maxlength="200" placeholder="받은 메일 제목을 붙여넣으세요"></div>' +
      '<div class="qd-three"><div class="field"><label>받은 날</label><input class="input" type="date" data-r="received" value="' + esc(r.received || today()) + '"></div>' +
      '<div class="field"><label>회신 기한</label><input class="input" type="date" data-r="due" value="' + esc(r.due || '') + '"></div>' +
      '<div class="field"><label>담당</label><input class="input" data-r="owner" value="' + esc(r.owner || state.user.name) + '" maxlength="50"></div></div>' +
      '<div class="field"><label>메일 본문</label><textarea class="input req-body" data-r="body" placeholder="받은 메일 본문을 그대로 붙여넣으세요" rows="' + (compact ? 8 : 12) + '">' + esc(r.body || '') + '</textarea></div>';
  }
  function readReqFields(root) {
    var o = {}; $$('[data-r]', root).forEach(function (el) { o[el.dataset.r] = el.value; }); return o;
  }
  function uploadReqFiles(id, kind, files, onEach) {
    var list = Array.prototype.slice.call(files || []), i = 0, last = null;
    var big = list.filter(function (f) { return f.size > DOC_MAX; });
    if (big.length) toast(big.map(function (f) { return f.name; }).join(', ') + ': 20MB를 넘어 건너뜀', 'err');
    list = list.filter(function (f) { return f.size <= DOC_MAX; });
    var step = function () {
      if (i >= list.length) return Promise.resolve(last);
      var f = list[i++];
      if (onEach) onEach(i, list.length, f);
      return readFileB64(f).then(function (b64) { return api('reqs.upload', { id: id, kind: kind, fileName: f.name, mime: f.type || 'application/octet-stream', data: b64 }); })
        .then(function (r) { last = r; return step(); });
    };
    return step();
  }

  function openNewReq() {
    var files = [];
    modal({
      wide: true, eyebrow: '견적 접수함', title: '견적 요청 등록',
      body: reqFieldsHtml({}, true) +
        '<label class="drop" id="nrDrop"><input type="file" id="nrFile" multiple hidden><span id="nrTxt"><b>받은 첨부파일</b> 고르기 또는 끌어다 놓기 (여러 개 가능)<br><span class="small muted">원본 그대로 보관돼요 · 파일당 20MB까지</span></span></label>',
      foot: '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="nrSave">등록</button>',
      onMount: function (m, close) {
        var show = function () { $('#nrTxt', m).innerHTML = files.length ? '<b>' + files.length + '개 파일</b><br><span class="small muted">' + files.map(function (f) { return esc(f.name); }).join(', ') + '</span>' : '<b>받은 첨부파일</b> 고르기 또는 끌어다 놓기'; };
        $('#nrFile', m).onchange = function () { files = files.concat(Array.prototype.slice.call(this.files)); this.value = ''; show(); };
        var dz = $('#nrDrop', m);
        dz.ondragover = function (e) { e.preventDefault(); dz.classList.add('over'); };
        dz.ondragleave = function () { dz.classList.remove('over'); };
        dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove('over'); files = files.concat(Array.prototype.slice.call(e.dataTransfer.files)); show(); };
        $('#nrSave', m).onclick = function () {
          var f = readReqFields(m);
          if (!f.cust.trim()) return toast('거래처를 입력하세요.', 'err');
          if (!f.title.trim()) return toast('메일 제목을 입력하세요.', 'err');
          var btn = this; busy(btn, true, '등록 중…');
          api('reqs.save', { req: f }).then(function (r) {
            return uploadReqFiles(r.req.id, '받은', files, function (i, n) { btn.innerHTML = '<span class="spinner"></span>파일 올리는 중 ' + i + '/' + n; }).then(function () { return r.req.id; });
          }).then(function (id) {
            close(); toast('견적 요청을 등록했어요.');
            state.reqs.list = null; state.reqs.detail = id; state.reqs.data = null; state.view = 'reqs'; render(); window.scrollTo(0, 0);
          }).catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
        };
      }
    });
  }

  function reqFileBlob(f) {
    var cache = state.reqs.blobs;
    if (cache[f.id]) return Promise.resolve(cache[f.id]);
    return api('reqs.file', { fileId: f.id }).then(function (r) { var bl = new Blob([bytesFromB64(r.data)], { type: f.mime || 'application/octet-stream' }); if (f.size < 8 * 1024 * 1024) cache[f.id] = bl; return bl; });
  }
  function previewReqFile(f) {
    var k = docKind(f), url = null;
    modal({
      wide: true, eyebrow: f.kind === '제출' ? '제출 파일' : '받은 파일', title: f.fileName,
      body: '<div class="doc-meta small muted">' + fileSize(f.size) + ' · ' + esc(f.by) + ' ' + esc(f.at) + '</div><div class="doc-view" id="rfView"><p class="muted"><span class="spinner dark"></span> 불러오는 중…</p></div>',
      foot: '<button class="btn" data-close>닫기</button><button class="btn btn-primary" id="rfDl">다운로드</button>',
      onMount: function (m) {
        var obs = new MutationObserver(function () { if (!document.body.contains(m)) { if (url) URL.revokeObjectURL(url); obs.disconnect(); } });
        obs.observe(document.body, { childList: true });
        reqFileBlob(f).then(function (bl) {
          var v = $('#rfView', m); if (!v) return;
          url = URL.createObjectURL(bl);
          if (k === 'img') v.innerHTML = '<img src="' + url + '" alt="">';
          else if (k === 'pdf') v.innerHTML = '<iframe src="' + url + '" title="' + esc(f.fileName) + '"></iframe>';
          else if (k === 'xls') xlsPreview(v, bl);
          else v.innerHTML = '<div class="empty" style="min-height:160px"><div><div class="ficon big f-' + k + '">' + DOC_ICON[k] + '</div><p class="muted">이 형식은 미리보기를 지원하지 않아요. 다운로드해서 여세요.</p></div></div>';
        }).catch(function (err) { var v = $('#rfView', m); if (v) v.innerHTML = '<p class="err-text">' + esc(err.message) + '</p>'; });
        $('#rfDl', m).onclick = function () { var b = this; busy(b, true, '…'); reqFileBlob(f).then(function (bl) { saveBlob(bl, f.fileName); }).catch(function (err) { toast(err.message, 'err'); }).then(function () { busy(b, false); }); };
      }
    });
  }

  function renderReqDetail() {
    var rs = state.reqs, id = rs.detail;
    $('#main').innerHTML = '<div class="row-between" style="margin-bottom:14px;flex-wrap:wrap"><button class="btn btn-sm" id="rdBack">← 견적 접수함</button><div class="actions" id="rdActs"></div></div><div id="rdBody"><div class="card muted"><span class="spinner dark"></span> 불러오는 중…</div></div>';
    $('#rdBack').onclick = function () { rs.detail = null; rs.data = null; renderReqs(); };
    var show = function (r) {
      if (state.view !== 'reqs' || rs.detail !== id) return;
      var isAdmin = state.user.role === 'admin', mine = String(r.by).indexOf('(' + state.user.id + ')') !== -1;
      var fileList = function (kind) {
        var fs = r.files.filter(function (f) { return f.kind === kind; });
        return (fs.length ? '<ul class="rf-list">' + fs.map(function (f) {
          var k = docKind(f);
          return '<li><button class="doc-name" data-pv="' + esc(f.id) + '"><span class="ficon f-' + k + '">' + DOC_ICON[k] + '</span><span><b>' + esc(f.fileName) + '</b><small>' + fileSize(f.size) + ' · ' + esc(f.by) + ' ' + esc(String(f.at).slice(0, 16)) + '</small></span></button>' +
            '<span class="actions"><button class="btn btn-sm" data-dl="' + esc(f.id) + '">다운로드</button><button class="btn btn-sm btn-ghost" data-rm="' + esc(f.id) + '">삭제</button></span></li>';
        }).join('') + '</ul>' : '<p class="muted small" style="margin:4px 0 10px">아직 없어요.</p>') +
          '<label class="drop small-drop" data-drop="' + kind + '"><input type="file" multiple hidden><span>' + (kind === '받은' ? '거래처가 보낸 원본 파일' : '우리가 보낸 견적서·엑셀') + ' 추가 (끌어다 놓기 가능)</span></label>';
      };
      $('#rdActs').innerHTML = (r.files.length ? '<button class="btn btn-sm" id="rdZip">파일 전체 ZIP</button>' : '') + (isAdmin || mine ? '<button class="btn btn-sm btn-danger" id="rdDel">삭제</button>' : '');
      $('#rdBody').innerHTML = '<div class="req-grid"><div>' +
        '<div class="card"><div class="row-between" style="flex-wrap:wrap;gap:8px;margin-bottom:12px"><div><div class="eyebrow">Request · ' + esc(r.biz || '견적 요청') + '</div><h2>' + esc(r.title) + '</h2><p class="muted small" style="margin:4px 0 0">' + esc(r.cust) + ' · 받은 날 ' + esc(r.received || '–') + ' · 등록 ' + esc(String(r.by).replace(/ \(.*\)$/, '')) + '</p></div>' + reqPill(r.status) + '</div>' +
        '<div class="field"><label>진행 상태</label><div class="segmented" id="rdSt">' + REQ_STATUS.map(function (s) { return '<button type="button" data-v="' + s + '" class="' + (r.status === s ? 'on' : '') + '">' + s + '</button>'; }).join('') + '</div></div>' +
        reqFieldsHtml(r, false) + '</div>' +
        '<div class="card" style="margin-top:16px"><div class="eyebrow">Submit · 제출</div><h3 style="margin-bottom:10px">제출한 견적</h3>' +
        '<div class="qd-two"><div class="field"><label>제출일</label><input class="input" type="date" data-r="submitted" value="' + esc(r.submitted || '') + '"></div>' +
        '<div class="field"><label>견적모음 연결 <span class="muted">(사이트에서 계산해 저장한 견적)</span></label><select class="input" data-r="quoteId"><option value="">연결 안 함</option>' + (r.quote ? '<option value="' + esc(r.quote.id) + '" selected>' + esc(r.quote.name) + '</option>' : (r.quoteId ? '<option value="' + esc(r.quoteId) + '" selected>(연결된 견적)</option>' : '')) + '</select></div></div>' +
        '<div class="field"><label>제출 단가 요약</label><textarea class="input memo" data-r="summary" placeholder="예) 5톤 평택→제주 650,000 / 11톤 900,000 · 유효기간 30일">' + esc(r.summary || '') + '</textarea></div>' +
        (r.quote ? '<p class="small" style="margin:0 0 10px">연결된 견적: <a href="#" id="rdGoQuote"><b>' + esc(r.quote.name) + '</b></a> ' + statusPill(r.quote.status) + ' <span class="muted">상태는 접수함과 자동으로 맞춰져요</span></p>' : '') +
        '<div class="actions" style="justify-content:flex-end"><button class="btn btn-primary" id="rdSave">저장</button></div></div>' +
        '</div><div>' +
        '<div class="card"><div class="eyebrow">Received · 받은 파일 (원본)</div>' + fileList('받은') + '</div>' +
        '<div class="card" style="margin-top:16px"><div class="eyebrow">Submitted · 제출 파일</div>' + fileList('제출') + '</div>' +
        '<div class="card" style="margin-top:16px"><div class="eyebrow">History · 기록</div><ul class="note-tl req-tl">' + (r.log || []).slice().reverse().map(function (l) {
          return '<li><span class="small muted">' + esc(String(l.at).slice(0, 16)) + ' · ' + esc(l.by) + '</span><br>' + esc(l.text) + '</li>';
        }).join('') + '</ul></div></div></div>';
      var body = $('#rdBody');
      $$('#rdSt button', body).forEach(function (b) { b.onclick = function () { $$('#rdSt button', body).forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
      // 견적모음 목록 (연결용)
      var qsel = $('[data-r="quoteId"]', body);
      (state.quotes.list ? Promise.resolve({ quotes: state.quotes.list }) : api('quotes.list')).then(function (x) {
        state.quotes.list = x.quotes;
        var cur = qsel.value;
        qsel.innerHTML = '<option value="">연결 안 함</option>' + x.quotes.map(function (q) { return '<option value="' + esc(q.id) + '"' + (q.id === cur ? ' selected' : '') + '>' + esc(q.name + (q.client ? ' · ' + q.client : '') + ' (' + String(q.savedAt).slice(0, 10) + ')') + '</option>'; }).join('');
        if (cur && !x.quotes.some(function (q) { return q.id === cur; })) qsel.insertAdjacentHTML('beforeend', '<option value="' + esc(cur) + '" selected>' + esc(r.quote ? r.quote.name : '(다른 사람 견적)') + '</option>');
      }).catch(function () { });
      $('#rdSave').onclick = function () {
        var f = readReqFields(body); f.status = $('#rdSt button.on', body).dataset.v;
        if (!f.cust.trim() || !f.title.trim()) return toast('거래처와 제목을 입력하세요.', 'err');
        if (f.status === '제출' && !f.submitted) f.submitted = today();
        var btn = this; busy(btn, true, '저장 중…');
        api('reqs.save', { id: id, req: f }).then(function (x) { rs.data = x.req; rs.list = null; state.quotes.list = null; toast('저장했어요.'); show(x.req); })
          .catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
      };
      var gq = $('#rdGoQuote'); if (gq) gq.onclick = function (e) { e.preventDefault(); state.quotes.detail = r.quote.id; state.quotes.detailData = null; state.view = 'quotes'; render(); window.scrollTo(0, 0); };
      $$('[data-drop]', body).forEach(function (dz) {
        var kind = dz.dataset.drop, inp = $('input', dz);
        var go = function (files) {
          if (!files.length) return;
          dz.classList.add('busy'); $('span', dz).innerHTML = '<span class="spinner dark"></span> 올리는 중…';
          uploadReqFiles(id, kind, files, function (i, n) { $('span', dz).innerHTML = '<span class="spinner dark"></span> 올리는 중 ' + i + '/' + n; })
            .then(function (x) { if (x) { rs.data = x.req; rs.list = null; toast('파일을 올렸어요.'); show(x.req); } })
            .catch(function (err) { toast(err.message, 'err'); show(r); });
        };
        inp.onchange = function () { go(Array.prototype.slice.call(this.files)); this.value = ''; };
        dz.ondragover = function (e) { e.preventDefault(); dz.classList.add('over'); };
        dz.ondragleave = function () { dz.classList.remove('over'); };
        dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove('over'); go(Array.prototype.slice.call(e.dataTransfer.files)); };
      });
      var byId = {}; r.files.forEach(function (f) { byId[f.id] = f; });
      $$('[data-pv]', body).forEach(function (b) { b.onclick = function () { previewReqFile(byId[b.dataset.pv]); }; });
      $$('[data-dl]', body).forEach(function (b) { b.onclick = function () { var f = byId[b.dataset.dl]; busy(b, true, '…'); reqFileBlob(f).then(function (bl) { saveBlob(bl, f.fileName); }).catch(function (err) { toast(err.message, 'err'); }).then(function () { busy(b, false); }); }; });
      $$('[data-rm]', body).forEach(function (b) {
        b.onclick = function () {
          var f = byId[b.dataset.rm]; if (!confirm('"' + f.fileName + '" 파일을 지울까요? 드라이브 휴지통으로 이동합니다.')) return;
          busy(b, true, '…');
          api('reqs.fileDelete', { fileId: f.id }).then(function (x) { rs.data = x.req; rs.list = null; show(x.req); }).catch(function (err) { busy(b, false); toast(err.message, 'err'); });
        };
      });
      var z = $('#rdZip'); if (z) z.onclick = function () {
        var b = this; busy(b, true, '묶는 중…');
        api('reqs.zip', { id: id }).then(function (x) { saveBlob(new Blob([bytesFromB64(x.data)], { type: 'application/zip' }), '견적접수_' + r.cust + '_' + (r.received || today()) + '.zip'); })
          .catch(function (err) { toast(err.message, 'err'); }).then(function () { busy(b, false); });
      };
      var del = $('#rdDel'); if (del) del.onclick = function () {
        if (!confirm('이 접수 건과 첨부파일을 모두 지울까요? 되돌릴 수 없습니다.')) return;
        busy(del, true, '삭제 중…');
        api('reqs.delete', { id: id }).then(function () { rs.detail = null; rs.data = null; rs.list = null; toast('삭제했어요.'); renderReqs(); }).catch(function (err) { busy(del, false); toast(err.message, 'err'); });
      };
    };
    if (rs.data && rs.data.id === id) return show(rs.data);
    api('reqs.get', { id: id }).then(function (x) { rs.data = x.req; show(x.req); }).catch(function (err) { if (rs.detail === id) $('#rdBody').innerHTML = '<div class="card"><p class="err-text" style="margin:0">' + esc(err.message) + '</p></div>'; });
  }

  /* 홈 카드: 회신 기한 다가오는 견적 요청 */
  function homeReqs(list) {
    var el = $('#hcReqs'); if (!el) return;
    var open = list.filter(function (r) { return ['접수', '검토중'].indexOf(r.status) !== -1; })
      .sort(function (a, b) { return (a.due || '9999') < (b.due || '9999') ? -1 : 1; });
    el.innerHTML = '<div class="row-between"><div class="eyebrow">Requests · 진행 중인 견적 요청</div><button class="btn btn-sm btn-ghost" data-go="reqs">접수함</button></div>' +
      (open.length ? '<ul class="home-list">' + open.slice(0, 6).map(function (r) {
        return '<li><button data-rq="' + esc(r.id) + '"><span><b>' + esc(r.cust) + '</b> <span class="small">' + esc(r.title) + '</span></span><span>' + (dueInfo(r) != null && dueInfo(r) <= 2 ? dueBadge(r).replace(/ <span class="small muted">.*<\/span>/, '') : reqPill(r.status)) + '</span></button></li>';
      }).join('') + '</ul>' : '<p class="muted small" style="margin:8px 0 0">진행 중인 견적 요청이 없어요.</p>');
    $$('[data-rq]', el).forEach(function (b) { b.onclick = function () { state.reqs.detail = b.dataset.rq; state.reqs.data = null; state.view = 'reqs'; render(); window.scrollTo(0, 0); }; });
    bindHomeGo(el);
  }

  /* ───────── 일정 (달력 · 할 일 · 휴가) ───────── */

  var LEAVE_KINDS = ['연차', '오전 반차', '오후 반차', '병가', '경조', '공가', '대체휴무', '기타', '야간근무', '휴일근무', '당직'];
  function isWork(k) { return /근무|당직/.test(k); }
  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  /* 날짜 문자열(YYYY-MM-DD) 계산 */
  function dU(s) { return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); }
  function dS(t) { return new Date(t).toISOString().slice(0, 10); }
  function dAdd(s, n) { return dS(dU(s) + n * 86400000); }
  function dDow(s) { return new Date(dU(s)).getUTCDay(); }
  function dim(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function ymAdd(ym, k) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + k; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + ('0' + (m + 1)).slice(-2); }
  function pad2(n) { return ('0' + n).slice(-2); }

  function calHoli() {
    var d = state.cal.data, map = {};
    (d.holidays || []).forEach(function (h) { (map[h.date] = map[h.date] || []).push({ name: h.name, off: h.off }); });
    (d.companyHolidays || []).forEach(function (h) { (map[h.date] = map[h.date] || []).push({ name: h.name, off: true, company: true }); });
    return map;
  }
  function isOff(s, holi) { var w = dDow(s); return w === 0 || w === 6 || (holi[s] || []).some(function (h) { return h.off; }); }
  function adjustDay(s, mode, holi) {
    if (mode === 'none') return s;
    var k = 0;
    while (isOff(s, holi) && k++ < 15) s = dAdd(s, mode === 'next' ? 1 : -1);
    return s;
  }
  function ruleText(t) {
    var r = t.rule || {}, adj = { prev: '쉬는 날이면 앞 영업일', next: '쉬는 날이면 다음 영업일', none: '' }[t.adjust] || '';
    if (r.type === 'daily') return r.workdays === false ? '매일' : '매일 (평일만)';
    var base = r.type === 'once' ? '일회 ' + r.date : r.type === 'monthEnd' ? '매월 말일' : r.type === 'monthDay' ? '매월 ' + r.day + '일' : r.type === 'weekly' ? '매주 ' + WD[r.dow] + '요일' : r.type === 'yearly' ? '매년 ' + r.month + '월 ' + r.day + '일' : '';
    return base + (adj && r.type !== 'weekly' ? ' · ' + adj : '');
  }
  /** 할 일 하나의 기한일 목록 (from~to) */
  function taskOccurrences(t, from, to, holi) {
    if (!t.active) return [];
    var r = t.rule || {}, bases = [], lo = dAdd(from, -10), hi = dAdd(to, 10);
    if (r.type === 'once') bases = [r.date];
    else if (r.type === 'weekly') { for (var s = lo; s <= hi; s = dAdd(s, 1)) if (dDow(s) === Number(r.dow)) bases.push(s); }
    else if (r.type === 'daily') { var td = state.cal.data.today; if (td >= from && td <= to && (r.workdays === false || !isOff(td, holi))) bases.push(td); } // 매일: 오늘 것만 (지난 날은 쌓지 않고, 달력도 오늘만)
    else {
      for (var ym = ymAdd(lo.slice(0, 7), 0); ym <= hi.slice(0, 7); ym = ymAdd(ym, 1)) {
        var y = +ym.slice(0, 4), m = +ym.slice(5, 7), n = dim(y, m);
        if (r.type === 'monthEnd') bases.push(ym + '-' + pad2(n));
        else if (r.type === 'monthDay') bases.push(ym + '-' + pad2(Math.min(r.day, n)));
        else if (r.type === 'yearly' && m === Number(r.month)) bases.push(ym + '-' + pad2(Math.min(r.day, n)));
      }
    }
    var doneMap = state.cal.doneMap;
    return bases.filter(function (b) { return !t.start || b >= t.start; }).map(function (b) {
      var date = r.type === 'weekly' || r.type === 'daily' ? b : adjustDay(b, t.adjust, holi);
      return { task: t, base: b, date: date, done: doneMap[t.id + '|' + b] || null };
    }).filter(function (o) { return o.date >= from && o.date <= to; });
  }
  function allOccurrences(from, to, mineOnly) {
    var c = state.cal, holi = calHoli(), out = [];
    c.data.tasks.forEach(function (t) {
      if (mineOnly && t.assigneeId && t.assigneeId !== state.user.id) return;
      out = out.concat(taskOccurrences(t, from, to, holi));
    });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }
  /** 휴가 일수: 연차는 쉬는 날 빼고, 반차 0.5 */
  function leaveDays(l, holi) {
    if (/반차/.test(l.kind)) return 0.5;
    var n = 0;
    for (var s = l.start; s <= l.end; s = dAdd(s, 1)) if (isWork(l.kind) || !isOff(s, holi)) n++;
    return n;
  }

  function loadCal(force) {
    var c = state.cal;
    if (c.data && !force) return Promise.resolve(c.data);
    var extra = [];
    if (can('quote')) {
      extra.push((state.reqs.list && !force ? Promise.resolve({ reqs: state.reqs.list }) : api('reqs.list')).then(function (r) { state.reqs.list = r.reqs; }).catch(function () { }));
      extra.push((state.docs.list && !force ? Promise.resolve({ docs: state.docs.list }) : api('docs.list')).then(function (r) { state.docs.list = r.docs; }).catch(function () { }));
      extra.push(loadCusts(force).catch(function () { }));
    }
    return Promise.all([api('cal.all')].concat(extra)).then(function (res) { setCalData(res[0]); return c.data; });
  }
  function setCalData(d) {
    var c = state.cal;
    c.data = d; c.doneMap = {};
    (d.done || []).forEach(function (x) { c.doneMap[x.taskId + '|' + x.date] = x; });
    if (!c.ym) c.ym = d.today.slice(0, 7);
    if (!c.year) c.year = d.today.slice(0, 4);
  }
  function calSave(action, payload, msg) {
    return api(action, payload).then(function (d) { setCalData(d); state.cal.weekly = {}; if (msg) toast(msg); if (state.view === 'cal') drawCal(); else if (state.view === 'home') { var h = $('#hcToday'); if (h) homeToday(); } return d; });
  }

  function renderCal() {
    var c = state.cal;
    $('#main').innerHTML = '<div class="card info-head"><div><div class="eyebrow">Schedule · 일정</div><h2>일정</h2></div>' +
      '<div class="segmented" id="calTabs">' + [['month', '📅 달력'], ['tasks', '✅ 할 일'], ['leave', '🌴 휴가·근무'], ['weekly', '📋 주간 요약']].map(function (t) { return '<button type="button" data-t="' + t[0] + '" class="' + (c.tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div></div>' +
      '<div id="calBody" style="margin-top:16px"><div class="card muted"><span class="spinner dark"></span> 불러오는 중…</div></div>';
    $$('#calTabs button').forEach(function (b) { b.onclick = function () { c.tab = b.dataset.t; $$('#calTabs button').forEach(function (x) { x.classList.toggle('on', x === b); }); drawCal(); }; });
    loadCal().then(function () { if (state.view === 'cal') drawCal(); }).catch(function (err) { $('#calBody').innerHTML = '<div class="card"><p class="err-text" style="margin:0">' + esc(err.message) + '</p></div>'; });
  }
  function drawCal() {
    syncRoute();
    var c = state.cal; if (!c.data || !$('#calBody')) return;
    if (c.tab === 'tasks') calTasks(); else if (c.tab === 'leave') calLeave(); else if (c.tab === 'weekly') calWeekly(); else calMonth();
  }

  /* ── 당직 순번 규칙 → 그 기간의 당직 (화면에서 계산) ── */
  function mondayOf(s) { return dAdd(s, -((dDow(s) + 6) % 7)); }
  function dutyEntries(from, to) {
    var d = state.cal.data, holi = calHoli(), out = [];
    var real = {}; d.leaves.forEach(function (l) { if (l.kind === '당직') real[l.name + '|' + l.start] = 1; });
    var ovr = {}; (d.dutyOverrides || []).forEach(function (o) { ovr[o.ruleId + '|' + o.week] = o; });
    (d.dutyRules || []).forEach(function (r) {
      if (!r.active || !r.members.length) return;
      var w = mondayOf(from) < r.start ? r.start : mondayOf(from);
      for (; w <= to; w = dAdd(w, 7)) {
        var n = Math.round((dU(w) - dU(r.start)) / 604800000), m = r.members[((n % r.members.length) + r.members.length) % r.members.length];
        var o = ovr[r.id + '|' + w]; if (o && o.cancel) continue;
        var who = o && o.name ? { id: o.userId, name: o.name } : m, h = o && o.hours != null ? o.hours : r.hours;
        var base = { kind: '당직', rule: r, week: w, ovr: o || null, name: who.name, userId: who.id, hours: h, memo: (o && o.memo) || '', label: r.name, virtual: true, by: '순번 규칙' };
        if (r.mode === 'week') {
          if (!real[who.name + '|' + w]) out.push(Object.assign({ id: 'R' + r.id + w, start: w, end: dAdd(w, 6) }, base));
        } else for (var k = 0; k < 7; k++) {
          var day = dAdd(w, k), hol = (holi[day] || []).some(function (x) { return x.off; });
          if ((r.days.indexOf(dDow(day)) !== -1 || (r.holidays && hol)) && !real[who.name + '|' + day]) out.push(Object.assign({ id: 'R' + r.id + day, start: day, end: day }, base));
        }
      }
    });
    return out.filter(function (l) { return l.end >= from && l.start <= to; });
  }
  /** 기간과 겹치는 휴가·근무 (+ 순번 당직) */
  function leavesIn(from, to) {
    return state.cal.data.leaves.filter(function (l) { return l.end >= from && l.start <= to; }).concat(dutyEntries(from, to));
  }
  function leaveKey(l) { return l.kind === '당직' ? 'duty' : isWork(l.kind) ? 'work' : 'leave'; }
  function leaveLabel(l) { return l.kind === '당직' ? (l.label || (l.memo && l.memo.length <= 10 ? l.memo : '당직')) + ' ' + l.name : l.name + ' ' + l.kind + (l.hours && isWork(l.kind) ? ' ' + l.hours + 'h' : ''); }
  function calShow(k) { var v = state.cal.show[k]; return v == null ? true : v; }

  /** 하루 목록 (날짜 팝업용) */
  function dayItems(s, holi, occ) {
    var d = state.cal.data, out = [];
    (holi[s] || []).forEach(function (h) { out.push({ k: h.off ? 'holi' : 'obs', t: h.name }); });
    leavesIn(s, s).forEach(function (l) { out.push({ k: leaveKey(l), t: leaveLabel(l) + (l.start !== l.end ? ' (' + l.start.slice(5).replace('-', '/') + '~' + l.end.slice(5).replace('-', '/') + ')' : ''), ref: l }); });
    (occ[s] || []).forEach(function (o) { out.push({ k: o.done ? 'task done' : 'task', t: (o.task.cust ? '[' + o.task.cust + '] ' : '') + o.task.title, ref: o }); });
    (state.reqs.list || []).forEach(function (r) { if (r.due === s && ['접수', '검토중'].indexOf(r.status) !== -1) out.push({ k: 'req', t: '회신 ' + r.cust, ref: r }); });
    (state.docs.list || []).forEach(function (x) { if (x.expires === s) out.push({ k: 'doc', t: '만료 ' + (x.biz ? x.biz + ' ' : '') + x.name, ref: x }); });
    (state.custs || []).forEach(function (x) { if (x.end === s) out.push({ k: 'doc', t: '계약 만료 ' + x.name, ref: x }); });
    d.events.forEach(function (e) { if (s >= e.start && s <= e.end) out.push({ k: 'event', t: e.title, ref: e }); });
    return out;
  }

  var CAL_LANES = 4;
  function calMonth() {
    syncRoute();
    var c = state.cal, d = c.data, ym = c.ym, holi = calHoli();
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7), first = ym + '-01', last = ym + '-' + pad2(dim(y, m));
    var col = function (x) { return (dDow(x) + 6) % 7; }; // 월요일 시작
    var gStart = dAdd(first, -col(first)), gEnd = dAdd(last, 6 - col(last));
    // 막대로 그릴 항목 (기간)
    var items = [], P = { duty: 0, leave: 1, work: 2, event: 3, task: 4, req: 5, doc: 6 };
    leavesIn(gStart, gEnd).forEach(function (l) { var k = leaveKey(l); if (calShow(k)) items.push({ k: k, t: leaveLabel(l), s: l.start, e: l.end }); });
    if (calShow('event')) d.events.forEach(function (e) { if (e.end >= gStart && e.start <= gEnd) items.push({ k: 'event', t: e.title, s: e.start, e: e.end }); });
    if (calShow('task')) allOccurrences(gStart, gEnd, c.mine).forEach(function (o) { items.push({ k: o.done ? 'task done' : 'task', t: (o.task.cust ? '[' + o.task.cust + '] ' : '') + o.task.title, s: o.date, e: o.date }); });
    if (calShow('req')) (state.reqs.list || []).forEach(function (r) { if (r.due && ['접수', '검토중'].indexOf(r.status) !== -1) items.push({ k: 'req', t: '회신 ' + r.cust, s: r.due, e: r.due }); });
    if (calShow('doc')) (state.docs.list || []).forEach(function (x) { if (x.expires) items.push({ k: 'doc', t: '만료 ' + (x.biz ? x.biz + ' ' : '') + x.name, s: x.expires, e: x.expires }); });
    if (calShow('doc')) (state.custs || []).forEach(function (x) { if (x.end) items.push({ k: 'doc', t: '계약 만료 ' + x.name, s: x.end, e: x.end }); });
    // 같은 사람·같은 종류가 이어진 날이면 막대 하나로 (예: 토·일 당직, 이어서 쓴 연차)
    items.sort(function (a, b) { return a.k + a.t < b.k + b.t ? -1 : a.k + a.t > b.k + b.t ? 1 : a.s < b.s ? -1 : 1; });
    items = items.reduce(function (out, it) {
      var p = out[out.length - 1];
      if (p && /^(duty|leave|work)$/.test(it.k) && p.k === it.k && p.t === it.t && it.s <= dAdd(p.e, 1)) { if (it.e > p.e) p.e = it.e; return out; }
      out.push(Object.assign({}, it)); return out;
    }, []);
    var weeks = '';
    for (var w = gStart; w <= gEnd; w = dAdd(w, 7)) {
      var we = dAdd(w, 6), segs = [];
      items.forEach(function (it) {
        if (it.e < w || it.s > we) return;
        var cs = it.s < w ? w : it.s, ce = it.e > we ? we : it.e;
        segs.push({ it: it, c: col(cs), n: Math.round((dU(ce) - dU(cs)) / 86400000) + 1, l: it.s < w, r: it.e > we });
      });
      segs.sort(function (a, b) { return (a.it.k === 'duty' ? 0 : 1) - (b.it.k === 'duty' ? 0 : 1) || b.n - a.n || (P[a.it.k.split(' ')[0]] - P[b.it.k.split(' ')[0]]) || a.c - b.c; });
      var lanes = [], more = [0, 0, 0, 0, 0, 0, 0], bars = '';
      segs.forEach(function (sg) {
        var L = 0;
        for (; L < CAL_LANES; L++) { var ok = true; for (var i = sg.c; i < sg.c + sg.n; i++) if (lanes[L] && lanes[L][i]) { ok = false; break; } if (ok) break; }
        if (L >= CAL_LANES) { for (var j = sg.c; j < sg.c + sg.n; j++) more[j]++; return; }
        lanes[L] = lanes[L] || []; for (var q = sg.c; q < sg.c + sg.n; q++) lanes[L][q] = 1;
        bars += '<div class="cal-bar k-' + sg.it.k.replace(' ', ' k-') + (sg.l ? ' cl' : '') + (sg.r ? ' cr' : '') + '" style="grid-column:' + (sg.c + 1) + ' / span ' + sg.n + ';grid-row:' + (L + 2) + '">' + esc(sg.it.t) + '</div>';
      });
      var cells = '';
      for (var k = 0; k < 7; k++) {
        var s = dAdd(w, k), hs = calShow('holi') ? (holi[s] || []) : [], offH = (holi[s] || []).some(function (h) { return h.off; });
        cells += '<div class="cal-cell' + (s.slice(0, 7) !== ym ? ' out' : '') + (s === d.today ? ' today' : '') + (k === 6 || offH ? ' sun' : k === 5 ? ' sat' : '') + '" style="grid-column:' + (k + 1) + '" data-d="' + s + '">' +
          '<div class="cal-head"><span class="cal-num">' + (+s.slice(8)) + '</span>' + (hs.length ? '<span class="cal-hname' + (hs.some(function (h) { return h.off; }) ? '' : ' obs') + '">' + esc(hs.map(function (h) { return h.name; }).join(' · ')) + '</span>' : '') + '</div></div>';
        if (more[k]) bars += '<div class="cal-more" style="grid-column:' + (k + 1) + ';grid-row:' + (CAL_LANES + 2) + '">+' + more[k] + '</div>';
      }
      weeks += '<div class="cal-week">' + cells + bars + '</div>';
    }
    var chip = function (k, label) { return '<button type="button" class="chip cal-f k-' + k + (calShow(k) ? ' on' : '') + '" data-f="' + k + '">' + label + '</button>'; };
    $('#calBody').innerHTML = '<div class="card"><div class="row-between" style="flex-wrap:wrap;gap:10px;margin-bottom:12px">' +
      '<div class="cal-nav"><button class="btn btn-sm" id="cmPrev">◀</button><h2>' + y + '년 ' + m + '월</h2><button class="btn btn-sm" id="cmNext">▶</button><button class="btn btn-sm btn-ghost" id="cmToday">오늘</button></div>' +
      '<div class="actions"><label class="toggle small"><input type="checkbox" id="cmMine"' + (c.mine ? ' checked' : '') + '><span class="track"></span>내 할 일만</label><button class="btn btn-sm btn-primary" id="cmAdd">＋ 일정</button></div></div>' +
      '<div class="chips cal-filters">' + chip('holi', '공휴일') + chip('duty', '당직') + chip('leave', '휴가') + chip('work', '추가근무') + chip('task', '할 일') + (can('quote') ? chip('req', '견적 회신') + chip('doc', '만료(서류·계약)') : '') + chip('event', '일정') + '</div>' +
      '<div class="cal-grid2"><div class="cal-wds">' + [1, 2, 3, 4, 5, 6, 0].map(function (i) { return '<div class="cal-wd' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '') + '">' + WD[i] + '</div>'; }).join('') + '</div>' + weeks + '</div>' +
      '<p class="hint" style="margin:10px 0 0">날짜를 누르면 그날 일정을 보고 추가할 수 있어요 · 공휴일은 구글 캘린더 "대한민국의 휴일" 기준 · 당직 순번은 휴가·근무 탭에서 정해요</p></div>';
    $('#cmPrev').onclick = function () { c.ym = ymAdd(c.ym, -1); calMonth(); };
    $('#cmNext').onclick = function () { c.ym = ymAdd(c.ym, 1); calMonth(); };
    $('#cmToday').onclick = function () { c.ym = d.today.slice(0, 7); calMonth(); };
    $('#cmMine').onchange = function () { c.mine = this.checked; calMonth(); };
    $('#cmAdd').onclick = function () { editEvent({ start: d.today }); };
    $$('.cal-f').forEach(function (b) { b.onclick = function () { c.show[b.dataset.f] = !calShow(b.dataset.f); local('set', 'joil-calshow', c.show); calMonth(); }; });
    $$('.cal-cell').forEach(function (cell) { cell.onclick = function () { openDay(cell.dataset.d); }; });
  }

  function openDay(s) {
    var holi = calHoli();
    var occ = {}; allOccurrences(s, s, false).forEach(function (o) { (occ[o.date] = occ[o.date] || []).push(o); });
    var items = dayItems(s, holi, occ);
    var canDuty = function (l) { return l.virtual && (state.user.role === 'admin' || l.rule.members.some(function (m) { return m.id === state.user.id || m.name === state.user.name; })); };
    var close = modal({
      eyebrow: s.slice(0, 4) + '년 ' + (+s.slice(5, 7)) + '월', title: (+s.slice(8)) + '일 (' + WD[dDow(s)] + ')',
      body: (items.length ? '<ul class="day-list">' + items.map(function (it, i) {
        var act = '';
        if (/^task/.test(it.k)) act = '<label class="chk"><input type="checkbox" data-task="' + i + '"' + (it.ref.done ? ' checked' : '') + '>' + (it.ref.done ? ' 완료 · ' + esc(it.ref.done.by) : ' 완료') + '</label>';
        if (it.k === 'event') act = '<button class="btn btn-sm btn-ghost" data-ev="' + i + '">수정</button>';
        if (it.k === 'duty' && canDuty(it.ref)) act = '<button class="btn btn-sm btn-ghost" data-duty="' + i + '">' + (it.ref.rule.mode === 'week' ? '이 주' : '이번 주말') + ' 바꾸기</button>';
        else if (/^(leave|work|duty)$/.test(it.k)) act = '<span class="small muted">' + esc((it.ref.hours && isWork(it.ref.kind) ? it.ref.hours + '시간 ' : '') + (it.ref.memo || '')) + '</span>';
        return '<li class="k-' + it.k.replace(' ', ' k-') + '"><span class="dot"></span><span class="txt">' + esc(it.t) + (it.ref && it.ref.task && it.ref.task.assignee ? ' <span class="small muted">· ' + esc(it.ref.task.assignee) + '</span>' : '') + (it.ref && it.ref.ovr ? ' <span class="small muted">· 바뀜</span>' : '') + (it.ref && it.ref.memo && it.k === 'event' ? '<br><span class="small muted">' + esc(it.ref.memo) + '</span>' : '') + '</span>' + act + '</li>';
      }).join('') + '</ul>' : '<p class="muted">일정이 없어요.</p>'),
      foot: '<button class="btn btn-sm" id="dyEv">＋ 일정</button><button class="btn btn-sm" id="dyTask">＋ 할 일</button><button class="btn btn-sm" id="dyLeave">＋ 휴가·근무</button><button class="btn" data-close>닫기</button>',
      onMount: function (m, closeFn) {
        $$('[data-task]', m).forEach(function (cb) { cb.onchange = function () { var o = items[+cb.dataset.task].ref; calSave('cal.taskDone', { id: o.task.id, date: o.base, undo: !cb.checked }, cb.checked ? '완료로 표시했어요.' : '완료를 취소했어요.').then(function () { closeFn(); openDay(s); }); }; });
        $$('[data-ev]', m).forEach(function (b) { b.onclick = function () { closeFn(); editEvent(items[+b.dataset.ev].ref); }; });
        $$('[data-duty]', m).forEach(function (b) { b.onclick = function () { closeFn(); editDutyWeek(items[+b.dataset.duty].ref); }; });
        $('#dyEv', m).onclick = function () { closeFn(); editEvent({ start: s }); };
        $('#dyTask', m).onclick = function () { closeFn(); editTask({ rule: { type: 'once', date: s } }); };
        $('#dyLeave', m).onclick = function () { closeFn(); editLeave({ start: s, end: s }); };
      }
    });
    return close;
  }

  /** 순번 당직 한 주만 바꾸기 */
  function editDutyWeek(l) {
    var r = l.rule, users = state.cal.data.users, cur = l.ovr;
    var names = r.members.map(function (x) { return x.name; }).concat(users.map(function (u) { return u.name; }).filter(function (n) { return !r.members.some(function (x) { return x.name === n; }); }));
    modal({
      eyebrow: r.name, title: l.week.slice(5).replace('-', '/') + ' ~ ' + dAdd(l.week, 6).slice(5).replace('-', '/') + ' 주 바꾸기',
      body: '<div class="field"><label>담당</label><select class="input" id="dwN">' + names.map(function (n) { return '<option' + (n === l.name ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label>시간 ' + (r.mode === 'week' ? '(그 주)' : '(하루당)') + '</label><input class="input num" id="dwH" inputmode="decimal" value="' + esc(l.hours) + '"></div>' +
        '<div class="field"><label>메모</label><input class="input" id="dwM" maxlength="200" value="' + esc(l.memo || '') + '" placeholder="예) 휴가로 교대"></div>' +
        (cur ? '<p class="hint" style="margin:0">이미 바꾼 주예요 · ' + esc(cur.by) + ' ' + esc(cur.at) + '</p>' : ''),
      foot: (cur ? '<button class="btn btn-sm btn-ghost" id="dwClr" style="margin-right:auto">원래 순번으로</button>' : '') + '<button class="btn btn-danger btn-sm" id="dwCancel">이 주 당직 없음</button><button class="btn" data-close>취소</button><button class="btn btn-primary" id="dwSave">저장</button>',
      onMount: function (m, close) {
        var send = function (p, msg) { calSave('cal.dutyOverride', Object.assign({ ruleId: r.id, week: l.week }, p), msg).then(close).catch(function (err) { toast(err.message, 'err'); }); };
        $('#dwSave', m).onclick = function () { send({ name: $('#dwN', m).value, hours: $('#dwH', m).value.trim() === '' ? '' : Number($('#dwH', m).value), memo: $('#dwM', m).value }, '이 주 당직을 바꿨어요.'); };
        $('#dwCancel', m).onclick = function () { if (confirm('이 주 ' + r.name + '을(를) 없는 것으로 할까요?')) send({ cancel: true, memo: $('#dwM', m).value }, '이 주는 당직 없음으로 했어요.'); };
        var clr = $('#dwClr', m); if (clr) clr.onclick = function () { send({ clear: true }, '원래 순번으로 되돌렸어요.'); };
      }
    });
  }

  /** 당직 순번 카드 (휴가·근무 탭) */
  function dutyCardHtml() {
    var d = state.cal.data, adm = state.user.role === 'admin', rules = d.dutyRules || [], today = d.today, w0 = mondayOf(today);
    var who = function (r, w) { if (w < r.start) return '시작 전'; var e = dutyEntries(w, dAdd(w, 6)).filter(function (x) { return x.rule.id === r.id; })[0]; return e ? e.name + (e.ovr ? '*' : '') : '없음'; };
    var ovrs = (d.dutyOverrides || []).filter(function (o) { return o.week >= dAdd(w0, -28); }).sort(function (a, b) { return a.week < b.week ? -1 : 1; });
    return '<div class="card" style="margin-top:16px"><div class="row-between"><div><div class="eyebrow">Duty · 당직 순번</div><h3 style="margin:0">당직 순번 규칙</h3></div>' + (adm ? '<button class="btn btn-sm" id="drAdd">＋ 규칙 추가</button>' : '') + '</div>' +
      (rules.length ? '<ul class="rule-list duty-rules" style="margin-top:10px">' + rules.map(function (r) {
        return '<li class="' + (r.active ? '' : 'off') + '"><span><b>' + esc(r.name) + '</b><small>' + r.members.map(function (x) { return esc(x.name); }).join(' → ') + ' · ' + (r.mode === 'week' ? '월~일 한 주, 주당 ' + r.hours + '시간' : [1, 2, 3, 4, 5, 6, 0].filter(function (k) { return r.days.indexOf(k) !== -1; }).map(function (k) { return WD[k]; }).join('·') + (r.holidays ? (r.days.length ? '·' : '') + '공휴일' : '') + ' 하루 ' + r.hours + '시간') + ' · ' + esc(r.start) + ' 주부터' + (r.active ? '' : ' · 꺼짐') + '</small>' +
          (r.active ? '<small>이번 주 <b>' + esc(who(r, w0)) + '</b> · 다음 주 ' + esc(who(r, dAdd(w0, 7))) + ' · 그다음 ' + esc(who(r, dAdd(w0, 14))) + '</small>' : '') + '</span>' +
          (adm ? '<button class="btn btn-sm btn-ghost" data-dr="' + esc(r.id) + '">수정</button>' : '') + '</li>';
      }).join('') + '</ul>' : '<p class="muted small" style="margin:8px 0 0">아직 규칙이 없어요.' + (adm ? ' "＋ 규칙 추가"로 당직 순번을 넣으면 달력과 추가근무 집계에 자동으로 들어가요.' : '') + '</p>') +
      (ovrs.length ? '<details style="margin-top:10px"><summary class="small">바꾼 주 ' + ovrs.length + '건</summary><ul class="rule-list" style="margin-top:6px">' + ovrs.map(function (o) {
        var r = rules.filter(function (x) { return x.id === o.ruleId; })[0];
        return '<li><span><b>' + esc((r ? r.name : '(지운 규칙)') + ' · ' + o.week.slice(5).replace('-', '/') + ' 주') + '</b><small>' + (o.cancel ? '당직 없음' : esc(o.name) + (o.hours != null ? ' · ' + o.hours + '시간' : '')) + (o.memo ? ' · ' + esc(o.memo) : '') + ' · ' + esc(o.by) + '</small></span>' +
          (r && (adm || r.members.some(function (m) { return m.id === state.user.id || m.name === state.user.name; })) ? '<button class="btn btn-sm btn-ghost" data-dclr="' + esc(o.ruleId + '|' + o.week) + '">되돌리기</button>' : '') + '</li>';
      }).join('') + '</ul></details>' : '') +
      '<p class="hint" style="margin:8px 0 0">순번 당직은 따로 등록하지 않아도 달력과 추가근무(당직)에 자동으로 들어가요 · 오늘까지 시작한 주만 집계 · 한 주만 바꾸려면 달력에서 그 날짜를 눌러 "바꾸기"</p></div>';
  }
  function bindDutyCard() {
    var d = state.cal.data;
    var add = $('#drAdd'); if (add) add.onclick = function () { editDutyRule({}); };
    $$('[data-dr]').forEach(function (b) { b.onclick = function () { editDutyRule(d.dutyRules.filter(function (r) { return r.id === b.dataset.dr; })[0]); }; });
    $$('[data-dclr]').forEach(function (b) { b.onclick = function () { var p = b.dataset.dclr.split('|'); calSave('cal.dutyOverride', { ruleId: p[0], week: p[1], clear: true }, '원래 순번으로 되돌렸어요.').catch(function (err) { toast(err.message, 'err'); }); }; });
  }
  function editDutyRule(r) {
    var isNew = !r.id, d = state.cal.data, mode = r.mode || 'week', days = r.days || [6, 0];
    modal({
      eyebrow: '당직 순번', title: isNew ? '당직 규칙 추가' : '당직 규칙 수정',
      body: '<div class="field"><label>이름</label><input class="input" id="drN" maxlength="30" value="' + esc(r.name || '') + '" placeholder="예) 주간 당직"></div>' +
        '<div class="field"><label>순번 (한 줄에 한 명, 위에서부터 차례로)</label><textarea class="input memo" id="drM" style="min-height:110px">' + esc((r.members || []).map(function (x) { return x.name; }).join('\n')) + '</textarea>' +
        '<span class="hint">넣을 수 있는 이름: ' + d.users.map(function (u) { return esc(u.name); }).join(', ') + ' · 첫 번째 사람이 시작 주 담당</span></div>' +
        '<div class="qd-two"><div class="field"><label>시작 주 <span class="muted">(그 주 월요일로 맞춰요)</span></label><input class="input" type="date" id="drS" value="' + esc(r.start || mondayOf(d.today)) + '"></div>' +
        '<div class="field"><label>사용</label><label class="toggle"><input type="checkbox" id="drOn"' + (r.active !== false ? ' checked' : '') + '><span class="track"></span>켜짐</label></div></div>' +
        '<div class="field"><label>방식</label><div class="segmented" id="drMode"><button type="button" data-v="week" class="' + (mode === 'week' ? 'on' : '') + '">월~일 한 주 통째로</button><button type="button" data-v="days" class="' + (mode === 'days' ? 'on' : '') + '">정한 요일마다 하루씩</button></div></div>' +
        '<div class="field dr-days"><label>요일</label><div class="chips" id="drD">' + [1, 2, 3, 4, 5, 6, 0].map(function (i) { return '<button type="button" class="chip' + (days.indexOf(i) !== -1 ? ' on' : '') + '" data-v="' + i + '">' + WD[i] + '</button>'; }).join('') + '<button type="button" class="chip' + (r.holidays ? ' on' : '') + '" data-v="h">공휴일</button></div></div>' +
        '<div class="field"><label id="drHl">시간</label><input class="input num" id="drH" inputmode="decimal" value="' + esc(r.hours != null ? r.hours : 2) + '"></div>',
      foot: (!isNew ? '<button class="btn btn-danger btn-sm" id="drDel" style="margin-right:auto">삭제</button>' : '') + '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="drSave">저장</button>',
      onMount: function (m, close) {
        var sync = function () { var md = $('#drMode button.on', m).dataset.v; $('.dr-days', m).classList.toggle('hidden', md !== 'days'); $('#drHl', m).textContent = md === 'days' ? '시간 (하루당)' : '시간 (주당)'; };
        $$('#drMode button', m).forEach(function (b) { b.onclick = function () { $$('#drMode button', m).forEach(function (x) { x.classList.toggle('on', x === b); }); sync(); }; });
        $$('#drD .chip', m).forEach(function (b) { b.onclick = function () { b.classList.toggle('on'); }; });
        sync();
        $('#drSave', m).onclick = function () {
          var sel = $$('#drD .chip.on', m).map(function (b) { return b.dataset.v; });
          var rule = { id: r.id || '', name: $('#drN', m).value.trim(), members: $('#drM', m).value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean),
            start: $('#drS', m).value, active: $('#drOn', m).checked, mode: $('#drMode button.on', m).dataset.v, hours: Number($('#drH', m).value),
            days: sel.filter(function (x) { return x !== 'h'; }).map(Number), holidays: sel.indexOf('h') !== -1 };
          var btn = this; busy(btn, true, '저장 중…');
          calSave('cal.dutyRuleSave', { rule: rule }, '저장했어요.').then(close).catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
        };
        var del = $('#drDel', m); if (del) del.onclick = function () { if (!confirm('이 규칙을 지울까요? (규칙으로 생긴 당직이 달력과 집계에서 빠져요)')) return; calSave('cal.dutyRuleDelete', { id: r.id }, '삭제했어요.').then(close).catch(function (err) { toast(err.message, 'err'); }); };
      }
    });
  }

  function editEvent(e) {
    var isNew = !e.id, mine = !e.ownerId || e.ownerId === state.user.id || state.user.role === 'admin';
    modal({
      eyebrow: '일정', title: isNew ? '일정 추가' : '일정 수정',
      body: '<div class="field"><label>제목 <span style="color:var(--red)">*</span></label><input class="input" id="evT" maxlength="100" value="' + esc(e.title || '') + '" placeholder="예) 삼다수 방문, 월간 회의"></div>' +
        '<div class="qd-two"><div class="field"><label>시작일</label><input class="input" type="date" id="evS" value="' + esc(e.start || '') + '"></div><div class="field"><label>종료일</label><input class="input" type="date" id="evE" value="' + esc(e.end || e.start || '') + '"></div></div>' +
        '<div class="field"><label>메모</label><textarea class="input memo" id="evM" maxlength="1000">' + esc(e.memo || '') + '</textarea></div>' +
        '<label class="toggle"><input type="checkbox" id="evP"' + (e.private ? ' checked' : '') + '><span class="track"></span>나만 보기</label>' +
        (e.owner ? '<p class="hint" style="margin:10px 0 0">작성 ' + esc(e.owner) + ' · ' + esc(e.at || '') + '</p>' : ''),
      foot: (!isNew && mine ? '<button class="btn btn-danger btn-sm" id="evDel" style="margin-right:auto">삭제</button>' : '') + '<button class="btn" data-close>취소</button>' + (mine ? '<button class="btn btn-primary" id="evSave">저장</button>' : ''),
      onMount: function (m, close) {
        var sv = $('#evSave', m); if (sv) sv.onclick = function () {
          var ev = { title: $('#evT', m).value.trim(), start: $('#evS', m).value, end: $('#evE', m).value || $('#evS', m).value, memo: $('#evM', m).value, private: $('#evP', m).checked };
          if (!ev.title) return toast('제목을 입력하세요.', 'err');
          busy(sv, true, '저장 중…');
          calSave('cal.eventSave', { id: e.id || '', event: ev }, '일정을 저장했어요.').then(close).catch(function (err) { busy(sv, false); toast(err.message, 'err'); });
        };
        var del = $('#evDel', m); if (del) del.onclick = function () { if (!confirm('이 일정을 지울까요?')) return; calSave('cal.eventDelete', { id: e.id }, '삭제했어요.').then(close).catch(function (err) { toast(err.message, 'err'); }); };
      }
    });
  }

  function editTask(t) {
    var isNew = !t.id, r = t.rule || { type: 'monthEnd' }, users = state.cal.data.users;
    modal({
      eyebrow: '할 일', title: isNew ? '할 일 추가' : '할 일 수정',
      body: '<div class="qd-two"><div class="field"><label>업체</label><input class="input" id="tkC" list="tkCs" maxlength="100" value="' + esc(t.cust || '') + '" placeholder="예) 삼다수 (없으면 비워 두기)"><datalist id="tkCs">' +
        Object.keys((state.cal.data.tasks || []).reduce(function (o, x) { if (x.cust) o[x.cust] = 1; return o; }, {})).concat((state.rateCusts || []).map(function (x) { return x.cust; })).map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist></div>' +
        '<div class="field"><label>담당</label><select class="input" id="tkA"><option value="">팀 전체</option>' + users.map(function (u) { return '<option value="' + esc(u.id) + '"' + ((t.assigneeId || (isNew ? state.user.id : '')) === u.id ? ' selected' : '') + '>' + esc(u.name) + '</option>'; }).join('') + '</select></div></div>' +
        '<div class="field"><label>할 일 <span style="color:var(--red)">*</span></label><input class="input" id="tkT" maxlength="200" value="' + esc(t.title || '') + '" placeholder="예) 월말 정산서 발송"></div>' +
        '<div class="field"><label>반복</label><div class="segmented" id="tkR">' + [['once', '일회'], ['daily', '매일'], ['monthEnd', '매월 말일'], ['monthDay', '매월 N일'], ['weekly', '매주'], ['yearly', '매년']].map(function (x) { return '<button type="button" data-v="' + x[0] + '" class="' + (r.type === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
        '<div class="rule-opts">' +
        '<div class="field ro ro-once"><label>날짜</label><input class="input" type="date" id="tkD" value="' + esc(r.date || state.cal.data.today) + '"></div>' +
        '<div class="field ro ro-daily"><label class="toggle"><input type="checkbox" id="tkWD"' + (r.type === 'daily' && r.workdays === false ? '' : ' checked') + '><span class="track"></span>평일만 (주말·공휴일 빼기)</label><span class="hint">오늘 할 일에만 나오고, 지난 날 안 한 것은 밀린 할 일로 쌓이지 않아요</span></div>' +
        '<div class="field ro ro-monthDay"><label>매월 며칠</label><input class="input" type="number" min="1" max="31" id="tkMD" value="' + esc(r.type === 'monthDay' ? r.day : 25) + '"><span class="hint">31처럼 없는 날이 있는 달은 그 달 마지막 날</span></div>' +
        '<div class="field ro ro-weekly"><label>요일</label><div class="segmented" id="tkW">' + WD.map(function (x, i) { return '<button type="button" data-v="' + i + '" class="' + ((r.type === 'weekly' ? Number(r.dow) : 1) === i ? 'on' : '') + '">' + x + '</button>'; }).join('') + '</div></div>' +
        '<div class="field ro ro-yearly"><label>매년</label><div class="qd-two"><input class="input" type="number" min="1" max="12" id="tkYM" value="' + esc(r.type === 'yearly' ? r.month : 1) + '" placeholder="월"><input class="input" type="number" min="1" max="31" id="tkYD" value="' + esc(r.type === 'yearly' ? r.day : 1) + '" placeholder="일"></div></div></div>' +
        '<div class="field ro-adj"><label>기한일이 주말·공휴일이면</label><div class="segmented" id="tkJ">' + [['prev', '앞 영업일로'], ['next', '다음 영업일로'], ['none', '그대로']].map(function (x) { return '<button type="button" data-v="' + x[0] + '" class="' + ((t.adjust || 'prev') === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
        '<div class="qd-two"><div class="field"><label>시작일 <span class="muted">(이날부터 생김)</span></label><input class="input" type="date" id="tkS" value="' + esc(t.start || state.cal.data.today) + '"></div>' +
        '<div class="field"><label>사용</label><label class="toggle"><input type="checkbox" id="tkOn"' + (t.active !== false ? ' checked' : '') + '><span class="track"></span>켜짐</label></div></div>' +
        '<div class="field"><label>메모</label><textarea class="input memo" id="tkM" maxlength="1000">' + esc(t.memo || '') + '</textarea></div>',
      foot: (!isNew ? '<button class="btn btn-danger btn-sm" id="tkDel" style="margin-right:auto">삭제</button>' : '') + '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="tkSave">저장</button>',
      onMount: function (m, close) {
        var seg = function (id) { $$(id + ' button', m).forEach(function (b) { b.onclick = function () { $$(id + ' button', m).forEach(function (x) { x.classList.toggle('on', x === b); }); sync(); }; }); };
        var sync = function () { var ty = $('#tkR button.on', m).dataset.v; $$('.ro', m).forEach(function (el) { el.classList.toggle('hidden', !el.classList.contains('ro-' + ty)); }); $('.ro-adj', m).classList.toggle('hidden', ty === 'weekly' || ty === 'daily'); };
        ['#tkR', '#tkW', '#tkJ'].forEach(seg); sync();
        $('#tkSave', m).onclick = function () {
          var ty = $('#tkR button.on', m).dataset.v, rule = { type: ty };
          if (ty === 'once') rule.date = $('#tkD', m).value;
          if (ty === 'monthDay') rule.day = Number($('#tkMD', m).value);
          if (ty === 'daily') rule.workdays = $('#tkWD', m).checked;
          if (ty === 'weekly') rule.dow = Number($('#tkW button.on', m).dataset.v);
          if (ty === 'yearly') { rule.month = Number($('#tkYM', m).value); rule.day = Number($('#tkYD', m).value); }
          var asel = $('#tkA', m);
          var task = { cust: $('#tkC', m).value.trim(), title: $('#tkT', m).value.trim(), rule: rule, adjust: $('#tkJ button.on', m).dataset.v, assigneeId: asel.value, assignee: asel.value ? asel.options[asel.selectedIndex].text : '',
            start: $('#tkS', m).value, active: $('#tkOn', m).checked, memo: $('#tkM', m).value };
          if (!task.title) return toast('할 일을 입력하세요.', 'err');
          var btn = this; busy(btn, true, '저장 중…');
          calSave('cal.taskSave', { id: t.id || '', task: task }, '할 일을 저장했어요.').then(close).catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
        };
        var del = $('#tkDel', m); if (del) del.onclick = function () { if (!confirm('이 할 일(반복 규칙 전체)을 지울까요? 완료 기록은 남아요.')) return; calSave('cal.taskDelete', { id: t.id }, '삭제했어요.').then(close).catch(function (err) { toast(err.message, 'err'); }); };
      }
    });
  }

  function taskRowHtml(o, today) {
    var t = o.task, late = o.date < today;
    return '<li class="task-row' + (late ? ' late' : '') + '"><label class="chk"><input type="checkbox" data-done="' + esc(t.id) + '|' + o.base + '"></label>' +
      '<span class="task-date">' + esc(o.date.slice(5).replace('-', '/')) + ' (' + WD[dDow(o.date)] + ')' + (late ? '<br><b>' + Math.round((dU(today) - dU(o.date)) / 86400000) + '일 지남</b>' : '') + '</span>' +
      '<span class="task-main"><b>' + (t.cust ? '[' + esc(t.cust) + '] ' : '') + esc(t.title) + '</b><small>' + esc(ruleText(t)) + (t.memo ? ' · ' + esc(t.memo) : '') + '</small></span>' +
      '<span class="task-who small">' + esc(t.assignee || '팀 전체') + '</span></li>';
  }
  function bindTaskChecks(root) {
    $$('[data-done]', root).forEach(function (cb) {
      cb.onchange = function () {
        var p = cb.dataset.done.split('|'); cb.disabled = true;
        cb.closest('li').classList.add('leaving');
        calSave('cal.taskDone', { id: p[0], date: p[1] }, '완료! 기록에 남겼어요.').catch(function (err) { cb.disabled = false; cb.checked = false; toast(err.message, 'err'); });
      };
    });
  }

  function calTasks() {
    syncRoute();
    var c = state.cal, d = c.data, today = d.today;
    var all = allOccurrences(dAdd(today, -90), dAdd(today, 31), c.mine).filter(function (o) { return !o.done; });
    var late = all.filter(function (o) { return o.date < today; }), now = all.filter(function (o) { return o.date === today; }),
      week = all.filter(function (o) { return o.date > today && o.date <= dAdd(today, 7); }), later = all.filter(function (o) { return o.date > dAdd(today, 7); });
    var sec = function (title, list, cls) { return list.length ? '<h3 class="task-h ' + (cls || '') + '">' + title + ' <span class="cnt">' + list.length + '</span></h3><ul class="task-list">' + list.map(function (o) { return taskRowHtml(o, today); }).join('') + '</ul>' : ''; };
    var doneList = (d.done || []).slice().sort(function (a, b) { return a.at < b.at ? 1 : -1; }).slice(0, 60);
    var byId = {}; d.tasks.forEach(function (t) { byId[t.id] = t; });
    $('#calBody').innerHTML = '<div class="task-grid"><div class="card"><div class="row-between" style="flex-wrap:wrap;gap:10px;margin-bottom:6px"><div><div class="eyebrow">To-do · 할 일</div><h2>해야 할 일</h2></div>' +
      '<div class="actions"><div class="segmented" id="tkMine"><button type="button" data-v="1" class="' + (c.mine ? 'on' : '') + '">내 할 일</button><button type="button" data-v="" class="' + (!c.mine ? 'on' : '') + '">팀 전체</button></div><button class="btn btn-sm btn-primary" id="tkAdd">＋ 할 일 추가</button></div></div>' +
      (all.length ? sec('⚠ 밀린 할 일', late, 'late') + sec('오늘', now, 'today') + sec('다음 7일', week) + sec('그 뒤 (한 달 안)', later)
        : '<p class="muted" style="margin:16px 0">' + (d.tasks.length ? '한 달 안에 남은 할 일이 없어요. 👍' : '아직 할 일이 없어요. "＋ 할 일 추가"로 업체별 반복 할 일을 넣어 보세요.') + '</p>') +
      '<p class="hint" style="margin:10px 0 0">체크하면 목록에서 사라지고 오른쪽 "완료 기록"에 남아요. 실수로 체크했으면 완료 기록에서 되돌릴 수 있어요.</p></div>' +
      '<div><div class="card"><div class="eyebrow">Rules · 반복 규칙</div><h3 style="margin-bottom:8px">등록된 할 일 ' + d.tasks.length + '개</h3>' +
      (d.tasks.length ? '<ul class="rule-list">' + d.tasks.slice().sort(function (a, b) { return (a.cust + a.title).localeCompare(b.cust + b.title); }).map(function (t) {
        return '<li class="' + (t.active ? '' : 'off') + '"><button data-edit="' + esc(t.id) + '"><b>' + (t.cust ? '[' + esc(t.cust) + '] ' : '') + esc(t.title) + '</b><small>' + esc(ruleText(t)) + ' · ' + esc(t.assignee || '팀 전체') + (t.active ? '' : ' · 꺼짐') + '</small></button></li>';
      }).join('') + '</ul>' : '<p class="muted small">없어요.</p>') + '</div>' +
      '<div class="card" style="margin-top:16px"><div class="eyebrow">Done · 완료 기록</div>' +
      (doneList.length ? '<ul class="rule-list done-list">' + doneList.map(function (x) {
        var t = byId[x.taskId];
        return '<li><span><b>' + esc(t ? (t.cust ? '[' + t.cust + '] ' : '') + t.title : '(지운 할 일)') + '</b><small>기한 ' + esc(x.date) + ' · ' + esc(x.by) + ' ' + esc(String(x.at).slice(5, 16)) + '</small></span>' + (t ? '<button class="btn btn-sm btn-ghost" data-undo="' + esc(x.taskId + '|' + x.date) + '">되돌리기</button>' : '') + '</li>';
      }).join('') + '</ul>' : '<p class="muted small">아직 없어요.</p>') + '</div></div></div>';
    $$('#tkMine button').forEach(function (b) { b.onclick = function () { c.mine = !!b.dataset.v; calTasks(); }; });
    $('#tkAdd').onclick = function () { editTask({}); };
    bindTaskChecks($('#calBody'));
    $$('[data-edit]').forEach(function (b) { b.onclick = function () { editTask(byId[b.dataset.edit]); }; });
    $$('[data-undo]').forEach(function (b) { b.onclick = function () { var p = b.dataset.undo.split('|'); calSave('cal.taskDone', { id: p[0], date: p[1], undo: true }, '완료를 취소했어요.'); }; });
  }

  function editLeave(l) {
    var isNew = !l.id, adm = state.user.role === 'admin', users = state.cal.data.users;
    var selId = (users.filter(function (u) { return u.id === l.userId; })[0] || users.filter(function (u) { return u.name === l.name; })[0] || { id: state.user.id }).id;
    modal({
      eyebrow: '휴가·근무', title: isNew ? '휴가·근무 등록' : '휴가·근무 수정',
      body: '<div class="field"><label>사람</label>' + (adm ? '<select class="input" id="lvU">' + users.map(function (u) { return '<option value="' + esc(u.id) + '"' + (selId === u.id ? ' selected' : '') + '>' + esc(u.name) + (u.nameOnly ? ' (계정 없음)' : '') + '</option>'; }).join('') + '</select>'
        : '<input class="input" value="' + esc(state.user.name) + '" disabled>') + '</div>' +
        '<div class="field"><label>종류</label><div class="segmented wrap-seg" id="lvK">' + LEAVE_KINDS.map(function (k) { return '<button type="button" data-v="' + k + '" class="' + ((l.kind || '연차') === k ? 'on' : '') + (isWork(k) ? ' work' : '') + '">' + k + '</button>'; }).join('') + '</div></div>' +
        '<div class="qd-two"><div class="field"><label>시작일</label><input class="input" type="date" id="lvS" value="' + esc(l.start || state.cal.data.today) + '"></div><div class="field" id="lvEf"><label>종료일</label><input class="input" type="date" id="lvE" value="' + esc(l.end || l.start || state.cal.data.today) + '"></div></div>' +
        '<div class="lv-time" id="lvTm"><div class="field"><label>시작 시각</label><input class="input" type="time" id="lvF" value="' + esc(l.from || '') + '"></div><div class="field"><label>종료 시각</label><input class="input" type="time" id="lvT" value="' + esc(l.to || '') + '"></div>' +
        '<div class="field"><label>추가근무 시간</label><input class="input num" id="lvH" inputmode="decimal" value="' + esc(l.hours || '') + '" placeholder="예) 2"><span class="hint">시각을 넣으면 자동 계산 (자정 넘으면 다음날)</span></div></div>' +
        '<div class="field"><label>메모</label><input class="input" id="lvM" maxlength="500" value="' + esc(l.memo || '') + '" placeholder="예) 한진 견적, 롯데 배차"></div><p class="hint" id="lvInfo" style="margin:0"></p>',
      foot: (!isNew ? '<button class="btn btn-danger btn-sm" id="lvDel" style="margin-right:auto">삭제</button>' : '') + '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="lvSave">저장</button>',
      onMount: function (m, close) {
        var holi = calHoli();
        var info = function () {
          var k = $('#lvK button.on', m).dataset.v, s = $('#lvS', m).value, e = /반차/.test(k) ? s : ($('#lvE', m).value || s);
          $('#lvEf', m).classList.toggle('hidden', /반차/.test(k));
          $('#lvTm', m).classList.toggle('hidden', !isWork(k));
          if (!s || e < s) { $('#lvInfo', m).textContent = ''; return; }
          var n = leaveDays({ kind: k, start: s, end: e }, holi);
          $('#lvInfo', m).textContent = isWork(k) ? '추가근무로 집계돼요 (연차에서 빠지지 않아요)' : k === '연차' || /반차/.test(k) ? '연차 ' + n + '일 사용 (주말·공휴일 제외)' : n + '일 (연차에서 빠지지 않아요)';
        };
        var autoH = function () {
          var f = $('#lvF', m).value, t = $('#lvT', m).value; if (!f || !t) return;
          var d = (+t.slice(0, 2) * 60 + +t.slice(3, 5)) - (+f.slice(0, 2) * 60 + +f.slice(3, 5)); if (d <= 0) d += 1440;
          $('#lvH', m).value = Math.round(d / 60 * 100) / 100;
        };
        $('#lvF', m).onchange = autoH; $('#lvT', m).onchange = autoH;
        $$('#lvK button', m).forEach(function (b) { b.onclick = function () { $$('#lvK button', m).forEach(function (x) { x.classList.toggle('on', x === b); }); info(); }; });
        $('#lvS', m).onchange = function () { if ($('#lvE', m).value < this.value) $('#lvE', m).value = this.value; info(); };
        $('#lvE', m).onchange = info; info();
        $('#lvSave', m).onclick = function () {
          var k = $('#lvK button.on', m).dataset.v;
          var lv = { userId: adm ? $('#lvU', m).value : state.user.id, kind: k, start: $('#lvS', m).value, end: $('#lvE', m).value, memo: $('#lvM', m).value,
            from: $('#lvF', m).value, to: $('#lvT', m).value, hours: Number(String($('#lvH', m).value).replace(/[^\d.]/g, '')) || 0 };
          if (isWork(k) && !lv.hours && !confirm('추가근무 시간이 비어 있어요. 0시간으로 저장할까요?')) return;
          var btn = this; busy(btn, true, '저장 중…');
          calSave('cal.leaveSave', { id: l.id || '', leave: lv }, '저장했어요.').then(close).catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
        };
        var del = $('#lvDel', m); if (del) del.onclick = function () { if (!confirm('이 기록을 지울까요?')) return; calSave('cal.leaveDelete', { id: l.id }, '삭제했어요.').then(close).catch(function (err) { toast(err.message, 'err'); }); };
      }
    });
  }

  var OT_KINDS = ['야간근무', '휴일근무', '당직'];
  /** 추가근무가 집계되는 날: 당직은 끝나는 날 (주가 다 끝난 달), 나머지는 그날 */
  function otD(l) { return l.kind === '당직' ? l.end : l.start; }
  function hrs(n) { return Math.round(n * 100) / 100; }
  /** 사람 목록 (이름 기준: 계정·계정 없는 직원·기록에만 있는 이름) */
  function calPeople() {
    var d = state.cal.data, out = [], seen = {};
    var add = function (name, id, nameOnly) { if (!name || seen[name]) return; seen[name] = 1; out.push({ name: name, id: id, nameOnly: nameOnly }); };
    d.users.forEach(function (u) { add(u.name, u.id, u.nameOnly); });
    d.leaves.forEach(function (l) { add(l.name, l.userId, true); });
    return out;
  }
  /** 월별 추가근무 (시작일이 속한 달 기준) */
  function otMonth(ym) {
    var by = {}, today = state.cal.data.today;
    leavesIn(dAdd(ym + '-01', -10), ym + '-31').forEach(function (l) {
      if (OT_KINDS.indexOf(l.kind) === -1 || otD(l).slice(0, 7) !== ym || (l.virtual && otD(l) > today)) return;
      var s = by[l.name] || (by[l.name] = { name: l.name, total: 0, list: [] });
      OT_KINDS.forEach(function (k) { s[k] = s[k] || { n: 0, h: 0 }; });
      s[l.kind].n++; s[l.kind].h += l.hours || 0; s.total += l.hours || 0; s.list.push(l);
    });
    return by;
  }
  function otXlsx(ym) {
    var by = otMonth(ym), names = Object.keys(by).sort();
    var sum = [['이름', '야간근무(건)', '야간근무(시간)', '휴일근무(건)', '휴일근무(시간)', '당직(건)', '당직(시간)', '합계(시간)']].concat(names.map(function (n) {
      var s = by[n]; return [n, s['야간근무'].n, hrs(s['야간근무'].h), s['휴일근무'].n, hrs(s['휴일근무'].h), s['당직'].n, hrs(s['당직'].h), hrs(s.total)];
    }));
    var det = [['날짜', '종료일', '이름', '종류', '시작 시각', '종료 시각', '시간', '메모']];
    names.forEach(function (n) { by[n].list.slice().sort(function (a, b) { return a.start < b.start ? -1 : 1; }).forEach(function (l) { det.push([l.start, l.end !== l.start ? l.end : '', l.name, l.kind, l.from || '', l.to || '', l.hours || 0, l.memo || '']); }); });
    return downloadXlsx('추가근무_' + ym + '.xlsx', [{ name: '요약', rows: sum, widths: [12, 12, 13, 12, 13, 10, 11, 11] }, { name: '상세', rows: det, widths: [12, 12, 10, 10, 9, 9, 7, 36] }]);
  }

  /* ── 시간외근무일지 (회사 양식 그대로) ── */
  function otFormRows(list) {
    var md = function (s) { return (+s.slice(5, 7)) + '/' + (+s.slice(8)); };
    var items = list.slice().sort(function (a, b) { return otD(a) < otD(b) ? -1 : otD(a) > otD(b) ? 1 : 0; });
    // 이어진 하루짜리 당직(토·일 등)은 한 줄로
    var merged = [];
    items.forEach(function (l) {
      var p = merged[merged.length - 1], lab = l.label || (l.memo && l.memo.length <= 10 ? l.memo : '');
      if (p && l.kind === '당직' && p.kind === '당직' && l.start === l.end && p.single && p.lab === lab && p.name === l.name && l.start === dAdd(p.end, 1)) { p.end = l.start; p.hours += l.hours || 0; return; }
      merged.push({ kind: l.kind, name: l.name, start: l.start, end: l.end, from: l.from, to: l.to, hours: l.hours || 0, memo: l.virtual ? '' : (l.memo || ''), lab: lab, single: l.kind === '당직' && l.start === l.end });
    });
    return merged.map(function (x) {
      var range = x.start !== x.end, date = x.kind === '당직' ? x.end : x.start;
      var t = function (v) { if (!v) return ''; var m = /^(\d\d):(\d\d)$/.exec(v); return m ? (+m[1] * 60 + +m[2]) / 1440 : ''; };
      var memo = x.kind === '당직' ? (range ? md(x.start) + '~' + md(x.end) + ' ' : '') + (x.lab || '당직') + (x.memo && x.memo !== x.lab ? ' ' + x.memo : '') : x.memo;
      return { date: date, label: (+date.slice(5, 7)) + '월' + (+date.slice(8)) + '일', dow: range ? WD[dDow(x.start)] + '~' + WD[dDow(x.end)] : WD[dDow(date)], kind: x.kind,
        from: range ? WD[dDow(x.start)] : t(x.from), to: range ? WD[dDow(x.end)] : t(x.to), hours: Math.round(x.hours * 100) / 100, memo: memo };
    });
  }
  function otFormSheet(wb, sheetName, name, ym, rows, info) {
    var ws = wb.addWorksheet(sheetName, { views: [{ showGridLines: false, zoomScale: 115 }],
      pageSetup: { paperSize: 9, orientation: 'portrait', horizontalCentered: true, fitToPage: true, fitToWidth: 1, fitToHeight: 1, printArea: 'A1:I29', margins: { left: 0.197, right: 0.197, top: 1.268, bottom: 0.551, header: 0, footer: 0 } } });
    [10.5, 7.6, 7.9, 6.4, 6.5, 5.9, 25.9, 9.5, 8.9].forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
    var F = function (o) { return Object.assign({ name: '나눔고딕', size: 9, color: { argb: 'FF000000' } }, o || {}); };
    var C = { horizontal: 'center', vertical: 'middle' }, thin = { style: 'thin' }, med = { style: 'medium' };
    var cell = function (a, v, o) { var c = ws.getCell(a); if (v !== undefined) c.value = v; o = o || {}; c.font = F(o.font); c.alignment = o.al || C; if (o.border) c.border = o.border; if (o.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fill } }; if (o.nf) c.numFmt = o.nf; return c; };
    var box = function (t, l, b, r) { return { top: t || thin, left: l || thin, bottom: b || thin, right: r || thin }; };
    ws.getRow(1).height = 60.75; [2, 3, 4].forEach(function (r) { ws.getRow(r).height = 28.5; }); ws.getRow(5).height = 14.25; ws.getRow(6).height = 15.75; ws.getRow(7).height = 15.75;
    for (var r = 8; r <= 28; r++) ws.getRow(r).height = 21; ws.getRow(29).height = 21.75;
    ws.mergeCells('A1:I1'); cell('A1', '시간외 근무일지', { font: { bold: true, size: 20 } });
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7), last = ym + '-' + pad2(dim(y, m));
    cell('A2', '부 서 명 :', { font: { bold: true, size: 10 }, al: { vertical: 'middle' } });
    cell('A3', '근 무 자 :', { font: { bold: true, size: 10 }, al: { vertical: 'middle' } });
    cell('A4', '작성일자 :', { font: { bold: true, size: 10 }, al: { vertical: 'middle' } });
    ws.mergeCells('B2:D2'); cell('B2', info.dept || '', { border: box(), font: { size: 10 } }); ['C2', 'D2'].forEach(function (a) { cell(a, undefined, { border: box() }); });
    ws.mergeCells('B3:C3'); cell('B3', name, { border: box(), font: { size: 10 }, al: { horizontal: 'left', vertical: 'middle', indent: 1 } }); cell('C3', undefined, { border: box() });
    cell('D3', '(인)', { border: box(), font: { size: 10 } });
    ws.mergeCells('B4:D4'); cell('B4', new Date(Date.UTC(y, m - 1, dim(y, m))), { border: box(), font: { size: 10 }, nf: 'yyyy-mm-dd', al: { horizontal: 'left', vertical: 'middle', indent: 1 } }); ['C4', 'D4'].forEach(function (a) { cell(a, undefined, { border: box() }); });
    ws.mergeCells('H2:I2'); cell('H2', '부서장', { border: box(), font: { size: 10 } }); cell('I2', undefined, { border: box() });
    ws.mergeCells('H3:I4'); cell('H3', '(인)', { border: box(), font: { size: 10 } }); ['I3', 'H4', 'I4'].forEach(function (a) { cell(a, undefined, { border: box() }); });
    var head = 'FFF2F2F2';
    [['A', '일자'], ['B', '요일'], ['C', '구분'], ['G', '업무내용'], ['H', '확인'], ['I', '비고']].forEach(function (h) { ws.mergeCells(h[0] + '6:' + h[0] + '7'); });
    ws.mergeCells('D6:F6');
    'ABCDEFGHI'.split('').forEach(function (col) {
      [6, 7].forEach(function (r) {
        var v = r === 6 ? { A: '일자', B: '요일', C: '구분', D: '업무시간', G: '업무내용', H: '확인', I: '비고' }[col] : { D: '시작', E: '종료', F: '시간' }[col];
        cell(col + r, v, { fill: head, border: box(r === 6 ? med : thin, col === 'A' ? med : thin, thin, col === 'I' ? med : thin) });
      });
    });
    for (var i = 0; i < 20; i++) {
      var rr = 8 + i, x = rows[i];
      'ABCDEFGHI'.split('').forEach(function (col) {
        var v = !x ? undefined : { A: x.label, B: x.dow, C: x.kind, D: x.from, E: x.to, F: x.hours, G: x.memo }[col];
        cell(col + rr, v === '' ? undefined : v, { border: box(thin, col === 'A' ? med : thin, thin, col === 'I' ? med : thin),
          al: col === 'G' ? { horizontal: 'left', vertical: 'middle', shrinkToFit: true } : C, nf: (col === 'D' || col === 'E') && typeof v === 'number' ? 'h:mm' : col === 'F' ? '0.##_);[Red](0.##)' : undefined });
      });
    }
    ws.mergeCells('A28:C28'); cell('A28', '합  계', { border: box(thin, med, med, thin) }); ['B28', 'C28'].forEach(function (a) { cell(a, undefined, { border: box(thin, thin, med, thin) }); });
    'DEFGHI'.split('').forEach(function (col) { cell(col + '28', col === 'F' ? { formula: 'SUM(F8:F27)', result: rows.slice(0, 20).reduce(function (a, x) { return a + (x.hours || 0); }, 0) } : undefined, { border: box(thin, thin, med, col === 'I' ? med : thin), nf: col === 'F' ? '0.##_);[Red](0.##)' : undefined }); });
    cell('A29', '***. 작업내용은 수기로 작성해 주시고, 부서장 사전승인 후, 작업진행해 주시길 바랍니다.', { al: { vertical: 'middle' } });
    cell('I29', info.biz ? '㈜' + info.biz : '', { font: { bold: true, color: { argb: 'FF17365D' } }, al: { horizontal: 'right', vertical: 'middle' } });
    return ws;
  }
  /** names: 일지를 만들 사람들 (그 달 추가근무가 있는 사람) */
  function otFormXlsx(ym, names) {
    var by = otMonth(ym), info = state.cal.data.staffInfo || {}, missing = [];
    return loadExcelJS().then(function (ExcelJS) {
      var wb = new ExcelJS.Workbook();
      names.forEach(function (n) {
        var rows = otFormRows(by[n] ? by[n].list : []), inf = info[n] || {};
        if (!inf.biz || !inf.dept) missing.push(n);
        for (var p = 0; p < Math.max(1, Math.ceil(rows.length / 20)); p++) otFormSheet(wb, (n + (p ? ' (' + (p + 1) + ')' : '')).slice(0, 31), n, ym, rows.slice(p * 20, p * 20 + 20), inf);
      });
      return saveWorkbook(wb, '시간외근무일지_' + ym + (names.length === 1 ? '_' + names[0] : '') + '.xlsx').then(function () { return missing; });
    });
  }

  function calLeave() {
    syncRoute();
    var c = state.cal, d = c.data, yr = c.year, holi = calHoli(), adm = state.user.role === 'admin';
    if (!c.otm || c.otm.slice(0, 4) !== yr) c.otm = yr === d.today.slice(0, 4) ? d.today.slice(0, 7) : yr + '-12';
    var people = calPeople();
    var inYear = d.leaves.filter(function (l) { return l.start.slice(0, 4) === yr || l.end.slice(0, 4) === yr; });
    var dutyYear = dutyEntries(dAdd(yr + '-01-01', -10), yr + '-12-31').filter(function (l) { return otD(l).slice(0, 4) === yr && otD(l) <= d.today; });
    var grant = {}; d.grants.forEach(function (g) { if (g.year === yr) grant[g.name] = g.days; });
    var stat = {}; people.forEach(function (p) { stat[p.name] = { p: p, used: 0, other: 0, ot: 0, otN: 0 }; });
    inYear.concat(dutyYear).forEach(function (l) {
      var s = stat[l.name]; if (!s) return;
      if (OT_KINDS.indexOf(l.kind) !== -1) { if (otD(l).slice(0, 4) === yr) { s.ot += l.hours || 0; s.otN++; } }
      else if (l.kind === '연차' || /반차/.test(l.kind)) s.used += leaveDays(l, holi); else s.other += leaveDays(l, holi);
    });
    var shown = people.filter(function (p) { var s = stat[p.name]; return !p.nameOnly || s.used || s.other || s.ot || s.otN || grant[p.name] != null || d.users.some(function (u) { return u.name === p.name; }); });
    var years = {}; years[d.today.slice(0, 4)] = 1; d.leaves.forEach(function (l) { years[l.start.slice(0, 4)] = 1; }); d.grants.forEach(function (g) { years[g.year] = 1; });
    var who = c.person || '';
    var list = inYear.filter(function (l) { return !who || l.name === who; }).sort(function (a, b) { return a.start < b.start ? 1 : -1; });
    // 월별 추가근무
    var om = otMonth(c.otm), omNames = Object.keys(om).sort(), mon = +c.otm.slice(5);
    var matrix = {}; d.leaves.concat(dutyYear).forEach(function (l) { if (OT_KINDS.indexOf(l.kind) === -1 || otD(l).slice(0, 4) !== yr) return; var r = matrix[l.name] || (matrix[l.name] = {}); var k = +otD(l).slice(5, 7); r[k] = (r[k] || 0) + (l.hours || 0); });
    var mNames = Object.keys(matrix).sort();
    var cell = function (s) { return s.n ? '<b>' + hrs(s.h) + '</b><small> h · ' + s.n + '건</small>' : '<span class="muted">–</span>'; };

    $('#calBody').innerHTML = '<div class="card"><div class="row-between" style="flex-wrap:wrap;gap:10px;margin-bottom:12px"><div><div class="eyebrow">Leave · 휴가·근무</div><h2>' + yr + '년 휴가·근무</h2></div>' +
      '<div class="actions"><select class="input input-sm" id="lvY" style="width:auto">' + Object.keys(years).sort().reverse().map(function (y) { return '<option' + (y === yr ? ' selected' : '') + '>' + y + '</option>'; }).join('') + '</select>' +
      (adm ? '<button class="btn btn-sm" id="lvStaff">직원 목록</button><button class="btn btn-sm" id="lvG">연차 부여 일수</button><button class="btn btn-sm" id="lvImp">엑셀 가져오기</button>' : '') + '<button class="btn btn-sm btn-primary" id="lvAdd">＋ 휴가·근무 등록</button></div></div>' +
      '<div class="table-wrap"><table class="data leave-table"><thead><tr><th class="left">이름</th><th>부여</th><th>사용</th><th>잔여</th><th>그 밖의 휴가</th><th>추가근무 (연간)</th></tr></thead><tbody>' +
      shown.map(function (p) {
        var s = stat[p.name], g = grant[p.name], rem = g != null ? g - s.used : null;
        return '<tr class="' + (who === p.name ? 'sel' : '') + '" data-p="' + esc(p.name) + '"><td class="left"><b>' + esc(p.name) + '</b>' + (p.nameOnly ? ' <span class="muted small">계정 없음</span>' : '') + '</td><td class="num">' + (g != null ? g : '<span class="muted">–</span>') + '</td><td class="num">' + s.used + '</td>' +
          '<td class="num' + (rem != null && rem < 0 ? ' neg' : '') + '">' + (rem != null ? '<b>' + rem + '</b>' : '<span class="muted">–</span>') + '</td><td class="num">' + (s.other || '–') + '</td><td class="num">' + (s.otN ? hrs(s.ot) + '시간 <span class="muted small">' + s.otN + '건</span>' : '–') + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="hint" style="margin:8px 0 0">사용 = 연차 + 반차(0.5) · 주말·공휴일 제외 · 추가근무 = 야간근무 + 휴일근무 + 당직(순번 규칙 포함, 오늘까지) · 이름을 누르면 그 사람 기록만 보여요</p></div>' +

      '<div class="card" style="margin-top:16px"><div class="row-between" style="flex-wrap:wrap;gap:10px;margin-bottom:10px"><div><div class="eyebrow">Overtime · 월별 추가근무</div>' +
      '<div class="cal-nav"><button class="btn btn-sm" id="otPrev"' + (mon <= 1 ? ' disabled' : '') + '>◀</button><h2>' + yr + '년 ' + mon + '월</h2><button class="btn btn-sm" id="otNext"' + (mon >= 12 ? ' disabled' : '') + '>▶</button></div></div>' +
      '<div class="actions"><button class="btn btn-sm" id="otX"' + (omNames.length ? '' : ' disabled') + '>엑셀 (요약·상세)</button><button class="btn btn-sm btn-primary" id="otF"' + (omNames.length ? '' : ' disabled') + '>시간외근무일지 (전체)</button></div></div>' +
      (omNames.length ? '<div class="table-wrap"><table class="data leave-table ot-table"><thead><tr><th class="left">이름</th><th>야간근무</th><th>휴일근무</th><th>당직</th><th>합계</th></tr></thead><tbody>' +
        omNames.map(function (n) { var s = om[n]; return '<tr data-otp="' + esc(n) + '"><td class="left"><b>' + esc(n) + '</b> <button class="btn btn-sm btn-ghost ot-one" data-otf="' + esc(n) + '" title="이 사람 시간외근무일지">일지</button></td><td class="num">' + cell(s['야간근무']) + '</td><td class="num">' + cell(s['휴일근무']) + '</td><td class="num">' + cell(s['당직']) + '</td><td class="num tot"><b>' + hrs(s.total) + '</b> 시간</td></tr>'; }).join('') +
        '</tbody></table></div>' : '<p class="muted small" style="margin:6px 0 10px">' + mon + '월에는 추가근무 기록이 없어요.</p>') +
      (mNames.length ? '<h3 style="margin:18px 0 6px;font-size:14px">' + yr + '년 월별 합계 <span class="muted small">(시간 · 누르면 그 달로)</span></h3><div class="table-wrap"><table class="data leave-table ot-year"><thead><tr><th class="left">이름</th>' +
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (k) { return '<th class="' + (k === mon ? 'on' : '') + '" data-m="' + k + '">' + k + '월</th>'; }).join('') + '<th>합계</th></tr></thead><tbody>' +
        mNames.map(function (n) { var r = matrix[n], t = 0; return '<tr><td class="left"><b>' + esc(n) + '</b></td>' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (k) { t += r[k] || 0; return '<td class="num' + (k === mon ? ' on' : '') + '" data-m="' + k + '">' + (r[k] ? hrs(r[k]) : '<span class="muted">·</span>') + '</td>'; }).join('') + '<td class="num"><b>' + hrs(t) + '</b></td></tr>'; }).join('') +
        '</tbody></table></div>' : '') +
      '<p class="hint" style="margin:8px 0 0">야간·휴일근무는 그날, 당직은 끝나는 날이 속한 달로 집계해요 (시간외근무일지와 같은 기준)</p></div>' +

      dutyCardHtml() +
      '<div class="card" style="margin-top:16px"><div class="row-between"><h3>' + (who ? esc(who) + ' 기록' : '전체 기록') + ' <span class="muted small">' + list.length + '건</span></h3>' + (who ? '<button class="btn btn-sm btn-ghost" id="lvAll">전체 보기</button>' : '') + '</div>' +
      (list.length ? '<div class="table-wrap"><table class="data leave-table"><thead><tr><th class="left">기간</th><th class="left">이름</th><th class="left">종류</th><th>일수 · 시간</th><th class="left">메모</th><th class="left">등록</th><th></th></tr></thead><tbody>' +
        list.slice(0, c.lvMore ? list.length : 40).map(function (l) {
          var canEdit = adm || l.userId === state.user.id, w = isWork(l.kind);
          return '<tr><td class="left">' + esc(l.start) + (l.end !== l.start ? ' ~ ' + esc(l.end.slice(5)) : '') + ' <span class="muted small">(' + WD[dDow(l.start)] + ')</span></td><td class="left">' + esc(l.name) + '</td>' +
            '<td class="left"><span class="lv-kind' + (w ? ' work' : '') + '">' + esc(l.kind) + '</span></td><td class="num">' + (w ? '<b>' + hrs(l.hours || 0) + '시간</b>' + (l.from ? ' <span class="muted small">' + esc(l.from) + '~' + esc(l.to) + '</span>' : '') : leaveDays(l, holi) + '일') + '</td><td class="left small">' + esc(l.memo) + '</td>' +
            '<td class="left small muted">' + esc(l.by) + '</td><td>' + (canEdit ? '<button class="btn btn-sm btn-ghost" data-lv="' + esc(l.id) + '">수정</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' + (list.length > 40 && !c.lvMore ? '<div style="text-align:center;margin-top:10px"><button class="btn btn-sm" id="lvMore">나머지 ' + (list.length - 40) + '건 더 보기</button></div>' : '') : '<p class="muted small">기록이 없어요.</p>') + '</div>' +
      (adm ? '<div class="card" style="margin-top:16px"><div class="row-between"><h3>회사 휴무일 <span class="muted small">공휴일 외에 회사가 쉬는 날 (창립기념일 등)</span></h3><span class="actions"><button class="btn btn-sm btn-ghost" id="hoRe">공휴일 다시 받기</button><button class="btn btn-sm" id="chAdd">＋ 추가</button></span></div>' +
        ((d.companyHolidays || []).length ? '<ul class="rule-list">' + d.companyHolidays.map(function (h, i) { return '<li><span><b>' + esc(h.date) + '</b> ' + esc(h.name) + '</span><button class="btn btn-sm btn-ghost" data-ch="' + i + '">삭제</button></li>'; }).join('') + '</ul>' : '<p class="muted small" style="margin:6px 0 0">없어요.</p>') + '</div>' : '');

    $('#lvY').onchange = function () { c.year = this.value; calLeave(); };
    $('#lvAdd').onclick = function () { var p = people.filter(function (x) { return x.name === who; })[0]; editLeave({ userId: p ? p.id : state.user.id, name: who }); };
    $$('tr[data-p]').forEach(function (tr) { tr.onclick = function () { c.person = c.person === tr.dataset.p ? '' : tr.dataset.p; calLeave(); }; });
    $$('tr[data-otp]').forEach(function (tr) { tr.onclick = function () { c.person = tr.dataset.otp; calLeave(); }; });
    var all = $('#lvAll'); if (all) all.onclick = function () { c.person = ''; calLeave(); };
    bindDutyCard();
    var more = $('#lvMore'); if (more) more.onclick = function () { c.lvMore = true; calLeave(); };
    $('#otPrev').onclick = function () { c.otm = ymAdd(c.otm, -1); calLeave(); };
    $('#otNext').onclick = function () { c.otm = ymAdd(c.otm, 1); calLeave(); };
    $$('.ot-year [data-m]').forEach(function (x) { x.onclick = function () { c.otm = yr + '-' + pad2(+x.dataset.m); calLeave(); }; });
    var formGo = function (btn, names) {
      busy(btn, true, '만드는 중…');
      otFormXlsx(c.otm, names).then(function (miss) { busy(btn, false); if (miss.length) toast('직원 목록에 사업자·부서가 없는 사람: ' + miss.join(', ') + ' (관리자 → 직원 목록)', 'err'); })
        .catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
    };
    $('#otF').onclick = function () { formGo(this, omNames); };
    $$('[data-otf]').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); formGo(b, [b.dataset.otf]); }; });
    $('#otX').onclick = function () { var b = this; busy(b, true, '만드는 중…'); otXlsx(c.otm).then(function () { busy(b, false); }).catch(function (err) { busy(b, false); toast(err.message, 'err'); }); };
    var byId = {}; d.leaves.forEach(function (l) { byId[l.id] = l; });
    $$('[data-lv]').forEach(function (b) { b.onclick = function () { editLeave(byId[b.dataset.lv]); }; });
    var g = $('#lvG'); if (g) g.onclick = function () {

      modal({
        eyebrow: '휴가·근무', title: yr + '년 연차 부여 일수',
        body: '<p class="muted small" style="margin:0 0 10px">사람마다 올해 쓸 수 있는 연차 일수를 넣으면 사용·잔여가 자동으로 계산돼요. 비워 두면 계산하지 않아요.</p>' +
          '<div class="grant-grid">' + d.users.map(function (u) { return '<label>' + esc(u.name) + '<input class="input input-sm num" data-g="' + esc(u.id) + '" value="' + (grant[u.name] != null ? grant[u.name] : '') + '" inputmode="decimal" placeholder="–"></label>'; }).join('') + '</div>',
        foot: '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="gSave">저장</button>',
        onMount: function (m, close) {
          $('#gSave', m).onclick = function () {
            var out = {}; $$('[data-g]', m).forEach(function (inp) { if (inp.value.trim() !== '') out[inp.dataset.g] = Number(inp.value); });
            var btn = this; busy(btn, true, '저장 중…');
            calSave('cal.grantsSave', { year: yr, grants: out }, '저장했어요.').then(close).catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
          };
        }
      });
    };
    var st = $('#lvStaff'); if (st) st.onclick = function () { state.admin.tab = 'staff'; state.view = 'admin'; render(); };
    var imp = $('#lvImp'); if (imp) imp.onclick = openCalImport;
    var re = $('#hoRe'); if (re) re.onclick = function () {
      busy(re, true, '받는 중…');
      api('cal.refreshHolidays').then(function (r) {
        setCalData(r.cal); drawCal();
        var x = r.result;
        if (x.ok) toast('공휴일 ' + x.count + '개를 받았어요. (' + x.source + ')');
        else modal({ eyebrow: '공휴일', title: '구글 캘린더에서 받지 못했어요', body: '<p style="margin:0 0 8px">지금은 <b>' + esc(x.source) + '</b>을(를) 쓰고 있어요.</p><p class="small muted" style="margin:0 0 8px">' + x.errors.map(esc).join('<br>') + '</p><p class="small" style="margin:0">서버 구글 시트 메뉴 <b>조일그룹 시스템 → 공휴일 받기 (캘린더 권한)</b>을 한 번 눌러 권한을 허용한 뒤, 새 버전으로 배포해 주세요.</p>', foot: '<button class="btn btn-primary" data-close>확인</button>' });
      }).catch(function (err) { busy(re, false); toast(err.message, 'err'); });
    };
    var ch = $('#chAdd'); if (ch) ch.onclick = function () {
      modal({
        eyebrow: '회사 휴무일', title: '휴무일 추가',
        body: '<div class="qd-two"><div class="field"><label>날짜</label><input class="input" type="date" id="chD" value="' + esc(d.today) + '"></div><div class="field"><label>이름</label><input class="input" id="chN" maxlength="40" placeholder="예) 창립기념일"></div></div>',
        foot: '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="chSave">추가</button>',
        onMount: function (m, close) {
          $('#chSave', m).onclick = function () {
            var list = (d.companyHolidays || []).concat([{ date: $('#chD', m).value, name: $('#chN', m).value.trim() || '회사 휴무' }]);
            calSave('cal.companyHolidays', { list: list }, '추가했어요.').then(close).catch(function (err) { toast(err.message, 'err'); });
          };
        }
      });
    };
    $$('[data-ch]').forEach(function (b) { b.onclick = function () { var list = d.companyHolidays.slice(); list.splice(+b.dataset.ch, 1); calSave('cal.companyHolidays', { list: list }, '삭제했어요.'); }; });
  }

  /* 엑셀 가져오기: 휴가근무 / 일정 / 연차부여 시트 */
  var CAL_IMPORT_HEAD = {
    '휴가근무': ['이름', '종류', '시작일', '종료일', '시작시각', '종료시각', '시간', '메모'],
    '일정': ['제목', '시작일', '종료일', '메모'],
    '연차부여': ['연도', '이름', '일수']
  };
  function xlDate(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number') return new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400000)).toISOString().slice(0, 10);
    var m = /(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(String(v));
    return m ? m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3]) : String(v).trim();
  }
  function xlTime(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number') { var mm = Math.round((v % 1) * 1440); return pad2(Math.floor(mm / 60) % 24) + ':' + pad2(mm % 60); }
    var m = /(\d{1,2}):(\d{2})/.exec(String(v)); return m ? pad2(m[1]) + ':' + m[2] : '';
  }
  function parseCalImport(buf) {
    return loadXlsx().then(function (X) {
      var wb = X.read(buf, { type: 'array' }), out = { leaves: [], events: [], grants: [] };
      var rowsOf = function (name) {
        var ws = wb.Sheets[name]; if (!ws) return [];
        var rows = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }), head = (rows[0] || []).map(function (h) { return String(h).replace(/\s/g, ''); });
        return rows.slice(1).filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); }).map(function (r) {
          var o = {}; CAL_IMPORT_HEAD[name].forEach(function (h) { var i = head.indexOf(h); o[h] = i === -1 ? '' : r[i]; }); return o;
        });
      };
      if (!wb.Sheets['휴가근무'] && !wb.Sheets['일정'] && !wb.Sheets['연차부여']) throw new Error('"휴가근무", "일정", "연차부여" 시트를 찾지 못했어요. 양식을 내려받아 확인하세요.');
      rowsOf('휴가근무').forEach(function (r) { out.leaves.push({ name: String(r['이름']).trim(), kind: String(r['종류']).trim(), start: xlDate(r['시작일']), end: xlDate(r['종료일']), from: xlTime(r['시작시각']), to: xlTime(r['종료시각']), hours: Number(r['시간']) || 0, memo: String(r['메모'] || '') }); });
      rowsOf('일정').forEach(function (r) { out.events.push({ title: String(r['제목']).trim(), start: xlDate(r['시작일']), end: xlDate(r['종료일']), memo: String(r['메모'] || '') }); });
      rowsOf('연차부여').forEach(function (r) { out.grants.push({ year: String(r['연도']).trim(), name: String(r['이름']).trim(), days: Number(r['일수']) }); });
      return out;
    });
  }
  function openCalImport() {
    var data = null;
    modal({
      eyebrow: '휴가·근무', title: '엑셀 가져오기', wide: true,
      body: '<p class="muted small" style="margin:0 0 10px">"휴가근무", "일정", "연차부여" 시트가 있는 엑셀을 올리세요. 이미 있는 기록(같은 사람·종류·시작일, 같은 제목·날짜)은 건너뛰어요. 계정에 없는 이름은 "계정 없는 직원"으로 추가돼요.</p>' +
        '<div class="actions" style="margin-bottom:12px"><button class="btn btn-sm" id="ciTpl">양식 내려받기</button><label class="btn btn-sm btn-primary">파일 고르기<input type="file" id="ciFile" accept=".xlsx,.xls" hidden></label></div><div id="ciPrev"></div>',
      foot: '<button class="btn" data-close>닫기</button><button class="btn btn-primary" id="ciGo" disabled>가져오기</button>',
      onMount: function (m, close) {
        $('#ciTpl', m).onclick = function () {
          downloadXlsx('일정_가져오기_양식.xlsx', [
            { name: '휴가근무', rows: [CAL_IMPORT_HEAD['휴가근무'], ['홍길동', '연차', '2026-10-15', '', '', '', '', ''], ['홍길동', '야간근무', '2026-10-16', '', '17:30', '19:30', 2, '견적'], ['홍길동', '당직', '2026-10-19', '2026-10-25', '', '', 2, '']], widths: [10, 10, 12, 12, 9, 9, 7, 30] },
            { name: '일정', rows: [CAL_IMPORT_HEAD['일정'], ['팀 회식', '2026-10-23', '', '장소 미정']], widths: [24, 12, 12, 30] },
            { name: '연차부여', rows: [CAL_IMPORT_HEAD['연차부여'], ['2026', '홍길동', 15]], widths: [8, 10, 8] },
            { name: '안내', rows: [['종류'], [LEAVE_KINDS.join(', ')], ['반차(오전)·반차(오후)도 됩니다. 날짜는 2026-10-15 형식, 시각은 17:30 형식.'], ['추가근무(야간근무·휴일근무·당직)는 "시간"에 시간 수를 넣으세요.']], widths: [80] }
          ]);
        };
        $('#ciFile', m).onchange = function () {
          var f = this.files[0]; if (!f) return;
          $('#ciPrev', m).innerHTML = '<p class="muted"><span class="spinner dark"></span> 읽는 중…</p>';
          f.arrayBuffer().then(parseCalImport).then(function (r) {
            data = r;
            var kinds = {}, names = {}; r.leaves.forEach(function (l) { kinds[l.kind] = (kinds[l.kind] || 0) + 1; names[l.name] = 1; });
            var known = {}; state.cal.data.users.forEach(function (u) { known[u.name] = 1; });
            var newNames = Object.keys(names).filter(function (n) { return !known[n]; });
            var ot = r.leaves.filter(function (l) { return OT_KINDS.indexOf(l.kind) !== -1; }).reduce(function (a, l) { return a + (l.hours || 0); }, 0);
            $('#ciPrev', m).innerHTML = '<div class="ci-sum"><div><b>' + r.leaves.length + '</b><small>휴가·근무</small></div><div><b>' + r.events.length + '</b><small>일정</small></div><div><b>' + r.grants.length + '</b><small>연차 부여</small></div><div><b>' + hrs(ot) + '</b><small>추가근무 시간</small></div></div>' +
              '<p class="small" style="margin:10px 0 4px">종류: ' + Object.keys(kinds).map(function (k) { return esc(k) + ' ' + kinds[k]; }).join(' · ') + '</p>' +
              '<p class="small" style="margin:0 0 4px">사람: ' + Object.keys(names).map(esc).join(', ') + '</p>' +
              (newNames.length ? '<p class="small" style="margin:0;color:var(--orange)">계정이 없어 "계정 없는 직원"으로 추가될 이름: ' + newNames.map(esc).join(', ') + '</p>' : '');
            $('#ciGo', m).disabled = !(r.leaves.length || r.events.length || r.grants.length);
          }).catch(function (err) { data = null; $('#ciPrev', m).innerHTML = '<p class="err-text">' + esc(err.message) + '</p>'; });
        };
        $('#ciGo', m).onclick = function () {
          if (!data) return;
          var btn = this; busy(btn, true, '가져오는 중…');
          api('cal.import', data).then(function (r) {
            setCalData(r.cal); close(); drawCal();
            var x = r.result;
            toast('가져왔어요: 휴가·근무 ' + x.leaves + ' · 일정 ' + x.events + ' · 연차 부여 ' + x.grants + (x.skipped ? ' · 건너뜀 ' + x.skipped : ''));
          }).catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
        };
      }
    });
  }

  /* 홈 카드: 오늘 할 일 · 오늘 휴가 */
  function homeToday() {
    var el = $('#hcToday'); if (!el || !state.cal.data) return;
    var d = state.cal.data, today = d.today, holi = calHoli();
    var list = allOccurrences(dAdd(today, -90), today, true).filter(function (o) { return !o.done; });
    var off = d.leaves.filter(function (l) { return today >= l.start && today <= l.end && !isWork(l.kind); });
    var wk = mondayOf(today), duty = {}; leavesIn(wk, dAdd(wk, 6)).forEach(function (l) { if (l.kind !== '당직') return; var k = l.label || '당직'; duty[k] = duty[k] || []; if (duty[k].indexOf(l.name) === -1) duty[k].push(l.name); });
    var hol = (holi[today] || []).filter(function (h) { return h.off; }), cover = can('quote') ? coverToday() : [];
    el.innerHTML = '<div class="row-between"><div class="eyebrow">Today · 오늘 할 일</div><button class="btn btn-sm btn-ghost" data-go="cal">일정</button></div>' +
      (hol.length ? '<p class="small" style="margin:6px 0 0">🔴 ' + esc(hol.map(function (h) { return h.name; }).join(', ')) + '</p>' : '') +
      (list.length ? '<ul class="task-list mini">' + list.slice(0, 6).map(function (o) { return taskRowHtml(o, today); }).join('') + '</ul>' + (list.length > 6 ? '<p class="hint" style="margin:4px 0 0">외 ' + (list.length - 6) + '개</p>' : '')
        : '<p class="muted small" style="margin:8px 0 0">오늘까지 할 일이 없어요. 👍</p>') +
      (Object.keys(duty).length ? '<p class="small" style="margin:10px 0 0">🛡 이번 주 ' + Object.keys(duty).map(function (k) { return esc(k) + ' <b>' + esc(duty[k].join(', ')) + '</b>'; }).join(' · ') + '</p>' : '') +
      (off.length ? '<p class="small" style="margin:10px 0 0">🌴 ' + off.map(function (l) { return esc(l.name + ' ' + l.kind); }).join(' · ') + '</p>' : '') +
      (cover.length ? '<p class="small" style="margin:6px 0 0">🔁 ' + cover.map(function (x) { return '[' + esc(x.o.task) + '] ' + esc(x.o.main) + ' ' + esc(x.l.kind) + ' → ' + (x.o.sub ? '부담당 <b>' + esc(x.o.sub) + '</b>' : '<b style="color:var(--red)">부담당 없음</b>'); }).join(' · ') + ' <button class="btn btn-sm btn-ghost" data-go="owners">담당표</button></p>' : '');
    bindTaskChecks(el); bindHomeGo(el);
  }

  function newCalState() {
    return { data: null, tab: 'month', ym: '', year: '', mine: false, person: '', doneMap: {}, show: local('get', 'joil-calshow') || {} };
  }

  /* ───────── 주간 업무 요약 (일정 탭) ───────── */
  function calWeekly() {
    syncRoute();
    var c = state.cal, d = c.data;
    c.wk = c.wk || mondayOf(d.today);
    c.weekly = c.weekly || {};
    var box = $('#calBody'), adm = state.user.role === 'admin';
    var show = function (x) {
      var md = function (s) { return (+s.slice(5, 7)) + '/' + (+s.slice(8)) + '(' + WD[dDow(s)] + ')'; };
      var tbl = function (head, rows) { return rows.length ? '<div class="table-wrap"><table class="data wk-table"><thead><tr>' + head.map(function (h) { return '<th class="left">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (v) { return '<td class="left">' + v + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted small" style="margin:4px 0 0">없어요.</p>'; };
      var card = function (t, inner, wide) { return '<div class="card wk-card' + (wide ? ' wide' : '') + '"><h3>' + t + '</h3>' + inner + '</div>'; };
      box.innerHTML = '<div class="card"><div class="row-between" style="flex-wrap:wrap;gap:10px"><div class="cal-nav"><button class="btn btn-sm" id="wkPrev">◀</button><h2>' + md(x.week) + ' ~ ' + md(x.weekEnd) + '</h2><button class="btn btn-sm" id="wkNext">▶</button><button class="btn btn-sm btn-ghost" id="wkNow">이번 주</button></div>' +
        (adm ? '<div class="actions"><button class="btn btn-sm" id="wkMe">나에게 메일로 보내기</button><button class="btn btn-sm btn-primary" id="wkAll">받기 체크한 직원에게 보내기</button></div>' : '') + '</div>' +
        (x.holidays.length ? '<p class="small" style="margin:8px 0 0;color:var(--red)">🔴 ' + x.holidays.map(function (h) { return esc(md(h.date) + ' ' + h.name); }).join(' · ') + '</p>' : '') +
        '<p class="hint" style="margin:6px 0 0">매주 월요일 오전 8시에 같은 내용이 메일로 가요 (관리자 → 직원 목록에서 "주간 요약 받기"를 체크한 직원) · 금액은 메일에 넣지 않아요</p></div>' +
        '<div class="wk-grid">' +
        (x.notices.length ? card('📢 공지', x.notices.map(function (n) { return '<div class="wk-notice"><b>' + (n.pinned ? '📌 ' : '') + esc(n.title) + '</b> <span class="muted small">' + esc(n.owner + ' · ' + n.at) + '</span>' + (n.body ? '<div class="small">' + esc(n.body) + '</div>' : '') + '</div>'; }).join(''), true) : '') +
        card('🛡 이번 주 당직', tbl(['구분', '담당', '기간'], x.duty.map(function (v) { return [esc(v.label), '<b>' + esc(v.name) + '</b>', v.from === v.to ? md(v.from) : md(v.from) + ' ~ ' + md(v.to)]; }))) +
        ((x.cover || []).length ? card('🔁 휴가로 대신 맡는 업무', tbl(['업무', '주담당', '대신 맡는 사람', '기간'], x.cover.map(function (v) { return [esc(v.task) + (v.cust ? ' <span class="muted small">' + esc(v.cust) + '</span>' : ''), esc(v.main) + ' <span class="muted small">' + esc(v.kind) + '</span>', v.sub ? '<b>' + esc(v.sub) + '</b>' : '<b style="color:var(--red)">없음</b>', v.start === v.end ? md(v.start) : md(v.start) + ' ~ ' + md(v.end)]; }))) : '') +
        card('🌴 휴가·근무', tbl(['이름', '종류', '날짜'], x.leaves.map(function (l) { return [esc(l.name), esc(l.kind) + (l.hours ? ' ' + l.hours + 'h' : ''), l.start === l.end ? md(l.start) : md(l.start) + ' ~ ' + md(l.end)]; }))) +
        card('✅ 이번 주 할 일' + (x.overdue ? ' <span class="small" style="color:var(--red)">밀린 할 일 ' + x.overdue + '건</span>' : ''), tbl(['기한', '할 일', '담당'], x.tasks.map(function (t) { return [md(t.date), (t.cust ? '[' + esc(t.cust) + '] ' : '') + esc(t.title), esc(t.who)]; })), true) +
        (x.reqs ? card('📨 견적', '<div class="wk-kpis">' + [['지난주 접수', x.reqs.received], ['제출', x.reqs.submitted], ['수주', x.reqs.won], ['미수주', x.reqs.lost], ['진행 중', x.reqs.open]].map(function (k) { return '<div><b>' + k[1] + '</b><small>' + k[0] + '</small></div>'; }).join('') + '</div>' +
          tbl(['회신 기한', '거래처', '제목'], x.reqs.due.map(function (r) { return [r.late ? '<b style="color:var(--red)">' + md(r.date) + ' 지남</b>' : md(r.date), esc(r.cust), esc(r.title)]; }))) : '') +
        (x.reqs ? card('⏰ 만료 임박 (30일)', tbl(['구분', '이름', '만료일'], x.contracts.map(function (v) { return ['계약', esc(v.name), md(v.end)]; }).concat(x.docs.map(function (v) { return ['서류', esc(v.name), md(v.end)]; })))) : '') +
        card('⏱ 지난주 추가근무', tbl(['이름', '야간', '휴일', '당직', '합계'], x.ot.map(function (o) { return [esc(o.name), o['야간근무'] || '–', o['휴일근무'] || '–', o['당직'] || '–', '<b>' + o.total + '시간</b>']; }))) +
        '</div>';
      $('#wkPrev').onclick = function () { c.wk = dAdd(c.wk, -7); calWeekly(); };
      $('#wkNext').onclick = function () { c.wk = dAdd(c.wk, 7); calWeekly(); };
      $('#wkNow').onclick = function () { c.wk = mondayOf(d.today); calWeekly(); };
      var send = function (btn, onlyMe) {
        if (!onlyMe && !confirm('주간 요약 메일을 "받기" 체크한 직원 모두에게 지금 보낼까요?')) return;
        busy(btn, true, '보내는 중…');
        api('weekly.send', { week: x.week, onlyMe: onlyMe }).then(function (r) { busy(btn, false); toast(r.sent + '명에게 보냈어요: ' + r.to.join(', ')); }).catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
      };
      var me = $('#wkMe'); if (me) me.onclick = function () { send(this, true); };
      var al = $('#wkAll'); if (al) al.onclick = function () { send(this, false); };
    };
    if (c.weekly[c.wk]) return show(c.weekly[c.wk]);
    box.innerHTML = '<div class="card muted"><span class="spinner dark"></span> 주간 요약 만드는 중…</div>';
    var wk = c.wk;
    api('weekly.get', { week: wk }).then(function (r) { c.weekly[wk] = r.weekly; if (state.view === 'cal' && c.tab === 'weekly' && c.wk === wk) show(r.weekly); })
      .catch(function (err) { box.innerHTML = '<div class="card"><p class="err-text" style="margin:0">' + esc(err.message) + '</p></div>'; });
  }

  /* ───────── 팀 공지 ───────── */
  function loadNotices(force) {
    if (state.notices && !force) return Promise.resolve(state.notices);
    return api('notice.list').then(function (r) { state.notices = r.notices; return r.notices; });
  }
  function homeNotice() {
    var el = $('#hcNotice'); if (!el) return;
    var list = state.notices || [], top = list.filter(function (n) { return n.pinned; }).concat(list.filter(function (n) { return !n.pinned; })).slice(0, 3);
    el.innerHTML = '<div class="row-between"><div class="eyebrow">Notice · 팀 공지</div><span class="actions"><button class="btn btn-sm btn-ghost" id="ntAll">전체 ' + list.length + '</button><button class="btn btn-sm" id="ntNew">＋ 공지</button></span></div>' +
      (top.length ? '<ul class="notice-list">' + top.map(function (n) { return '<li class="' + (n.pinned ? 'pin' : '') + '"><button data-nt="' + esc(n.id) + '"><b>' + (n.pinned ? '📌 ' : '') + esc(n.title) + '</b><span class="small muted">' + esc(n.owner) + ' · ' + esc(n.at.slice(5, 10).replace('-', '/')) + '</span>' + (n.body ? '<span class="nt-body">' + esc(n.body) + '</span>' : '') + '</button></li>'; }).join('') + '</ul>'
        : '<p class="muted small" style="margin:8px 0 0">공지가 없어요.</p>');
    $('#ntNew').onclick = function () { editNotice({}); };
    $('#ntAll').onclick = openNotices;
    $$('[data-nt]', el).forEach(function (b) { b.onclick = function () { viewNotice(list.filter(function (n) { return n.id === b.dataset.nt; })[0]); }; });
  }
  function noticeChanged(r) { state.notices = r.notices; homeNotice(); var m = $('#ntList'); if (m) drawNoticeList(m); }
  function canEditNotice(n) { return n.ownerId === state.user.id || state.user.role === 'admin'; }
  function viewNotice(n) {
    if (!n) return;
    modal({ eyebrow: '팀 공지' + (n.pinned ? ' · 📌 고정' : ''), title: n.title,
      body: '<p class="small muted" style="margin:0 0 10px">' + esc(n.owner) + ' · ' + esc(n.at) + (n.updated ? ' (수정 ' + esc(n.updated) + ')' : '') + '</p><div class="nt-full">' + esc(n.body || '') + '</div>',
      foot: (canEditNotice(n) ? '<button class="btn btn-danger btn-sm" id="nvDel" style="margin-right:auto">삭제</button><button class="btn" id="nvEdit">수정</button>' : '') + '<button class="btn btn-primary" data-close>닫기</button>',
      onMount: function (m, close) {
        var e = $('#nvEdit', m); if (e) e.onclick = function () { close(); editNotice(n); };
        var dl = $('#nvDel', m); if (dl) dl.onclick = function () { if (!confirm('이 공지를 지울까요?')) return; api('notice.delete', { id: n.id }).then(function (r) { close(); noticeChanged(r); toast('삭제했어요.'); }).catch(function (err) { toast(err.message, 'err'); }); };
      } });
  }
  function editNotice(n) {
    var adm = state.user.role === 'admin';
    modal({ eyebrow: '팀 공지', title: n.id ? '공지 수정' : '공지 쓰기',
      body: '<div class="field"><label>제목</label><input class="input" id="neT" maxlength="100" value="' + esc(n.title || '') + '" placeholder="예) 10월 마감 일정 안내"></div>' +
        '<div class="field"><label>내용</label><textarea class="input memo" id="neB" style="min-height:160px" maxlength="5000">' + esc(n.body || '') + '</textarea></div>' +
        (adm ? '<label class="toggle"><input type="checkbox" id="neP"' + (n.pinned ? ' checked' : '') + '><span class="track"></span>📌 맨 위에 고정</label>' : ''),
      foot: '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="neS">저장</button>',
      onMount: function (m, close) {
        $('#neS', m).onclick = function () {
          var btn = this, p = $('#neP', m); busy(btn, true, '저장 중…');
          api('notice.save', { id: n.id || '', notice: { title: $('#neT', m).value, body: $('#neB', m).value, pinned: p ? p.checked : false } })
            .then(function (r) { close(); noticeChanged(r); toast('공지를 올렸어요.'); }).catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
        };
      } });
  }
  function drawNoticeList(el) {
    var list = state.notices || [];
    el.innerHTML = list.length ? '<ul class="notice-list full">' + list.map(function (n) { return '<li class="' + (n.pinned ? 'pin' : '') + '"><button data-nt="' + esc(n.id) + '"><b>' + (n.pinned ? '📌 ' : '') + esc(n.title) + '</b><span class="small muted">' + esc(n.owner) + ' · ' + esc(n.at.slice(0, 10)) + '</span></button></li>'; }).join('') + '</ul>' : '<p class="muted">공지가 없어요.</p>';
    $$('[data-nt]', el).forEach(function (b) { b.onclick = function () { viewNotice(list.filter(function (n) { return n.id === b.dataset.nt; })[0]); }; });
  }
  function openNotices() {
    modal({ eyebrow: '팀 공지', title: '전체 공지', body: '<div id="ntList"></div>', foot: '<button class="btn" id="ntNew2">＋ 공지 쓰기</button><button class="btn btn-primary" data-close>닫기</button>',
      onMount: function (m, close) { drawNoticeList($('#ntList', m)); $('#ntNew2', m).onclick = function () { close(); editNotice({}); }; } });
  }

  /* ───────── 거래처 카드 ───────── */
  function custNorm(s) { return String(s || '').replace(/\(주\)|㈜|주식회사|\s/g, '').toLowerCase(); }
  function custNames(c) { return [c.name].concat(c.aliases || []).map(custNorm).filter(Boolean); }
  function custMatch(c, name) { var n = custNorm(name); return !!n && custNames(c).indexOf(n) !== -1; }
  function loadCusts(force) {
    if (state.custs && !force) return Promise.resolve(state.custs);
    return api('custs.list').then(function (r) { state.custs = r.custs; return r.custs; });
  }
  function custDays(c) { return c.end ? Math.round((dU(c.end) - dU(todayYmd())) / 86400000) : null; }
  function todayYmd() { var t = new Date(); return t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate()); }
  function custBadge(c) { var n = custDays(c); if (n == null) return ''; return n < 0 ? '<span class="badge exp-x">계약 만료</span>' : n <= 30 ? '<span class="badge exp-soon">만료 D-' + n + '</span>' : '<span class="badge off">~' + esc(c.end) + '</span>'; }
  function renderCusts() {
    syncRoute();
    var cs = state.custView = state.custView || { q: '', sel: '' };
    if (cs.sel) return renderCustDetail();
    $('#main').innerHTML = '<div class="card info-head"><div><div class="eyebrow">Customers · 거래처</div><h2>거래처</h2></div><div class="actions"><input class="input input-sm" id="ctQ" placeholder="이름·담당자 검색" value="' + esc(cs.q) + '" style="width:200px"><button class="btn btn-sm btn-primary" id="ctAdd">＋ 거래처 추가</button></div></div><div id="ctList" style="margin-top:16px"><div class="card muted"><span class="spinner dark"></span> 불러오는 중…</div></div>';
    var draw = function () {
      var q = custNorm(cs.q), list = (state.custs || []).filter(function (c) { return !q || custNorm(c.name + c.aliases.join('') + c.contact + c.owner).indexOf(q) !== -1; });
      $('#ctList').innerHTML = list.length ? '<div class="cust-grid">' + list.map(function (c) {
        return '<button class="card cust-card" data-c="' + esc(c.id) + '"><div class="row-between"><b>' + esc(c.name) + '</b>' + custBadge(c) + '</div>' +
          '<small>' + esc([c.biz, c.owner && '담당 ' + c.owner, c.contact].filter(Boolean).join(' · ') || '정보 없음') + '</small>' + (c.aliases.length ? '<small class="muted">= ' + esc(c.aliases.join(', ')) + '</small>' : '') + '</button>';
      }).join('') + '</div>' : '<div class="card empty"><div><h3>' + (state.custs && state.custs.length ? '검색 결과가 없어요' : '아직 거래처가 없어요') + '</h3><p class="muted" style="margin:0">"＋ 거래처 추가"로 담당자·계약 만료일을 넣으면 견적·접수·단가·할 일이 한 화면에 모여요.</p></div></div>';
      $$('[data-c]').forEach(function (b) { b.onclick = function () { cs.sel = b.dataset.c; renderCustDetail(); window.scrollTo(0, 0); }; });
    };
    var st; $('#ctQ').oninput = function () { var v = this.value; clearTimeout(st); st = setTimeout(function () { cs.q = v; draw(); }, 150); };
    $('#ctAdd').onclick = function () { editCust({}); };
    loadCusts().then(function () { if (state.view === 'custs' && !cs.sel) draw(); }).catch(function (err) { $('#ctList').innerHTML = '<div class="card"><p class="err-text" style="margin:0">' + esc(err.message) + '</p></div>'; });
  }
  function editCust(c) {
    var staffNames = state.cal.data ? state.cal.data.users.map(function (u) { return u.name; }) : [];
    var f = function (id, label, v, ph, type) { return '<div class="field"><label>' + label + '</label><input class="input" id="' + id + '"' + (type ? ' type="' + type + '"' : '') + ' value="' + esc(v || '') + '" placeholder="' + esc(ph || '') + '"></div>'; };
    modal({ eyebrow: '거래처', title: c.id ? c.name + ' 수정' : '거래처 추가', wide: true,
      body: '<div class="qd-two">' + f('cfN', '거래처 이름 *', c.name, '예) 제주삼다수') + f('cfA', '같은 업체로 볼 다른 이름 (쉼표로)', (c.aliases || []).join(', '), '예) 삼다수, 제주개발공사') + '</div>' +
        '<div class="qd-two"><div class="field"><label>우리 쪽 사업자</label><select class="input" id="cfB"><option value="">–</option>' + BIZ_NAMES.map(function (b) { return '<option' + (b === c.biz ? ' selected' : '') + '>' + b + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label>담당 직원</label><input class="input" id="cfO" list="cfOs" value="' + esc(c.owner || '') + '"><datalist id="cfOs">' + staffNames.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist></div></div>' +
        '<div class="qd-two">' + f('cfC', '거래처 담당자', c.contact, '예) 박과장') + f('cfP', '연락처', c.phone, '010-0000-0000') + '</div>' +
        '<div class="qd-two">' + f('cfE', '이메일', c.email, '') + f('cfPay', '결제 조건', c.payment, '예) 월말 마감 익월 말 현금') + '</div>' +
        '<div class="qd-two">' + f('cfS', '계약 시작일', c.start, '', 'date') + f('cfEnd', '계약 만료일 (30일 전부터 알림)', c.end, '', 'date') + '</div>' +
        '<div class="field"><label>메모</label><textarea class="input memo" id="cfM" maxlength="3000">' + esc(c.memo || '') + '</textarea></div>',
      foot: (c.id ? '<button class="btn btn-danger btn-sm" id="cfDel" style="margin-right:auto">삭제</button>' : '') + '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="cfSave">저장</button>',
      onMount: function (m, close) {
        $('#cfSave', m).onclick = function () {
          var btn = this; busy(btn, true, '저장 중…');
          var v = { name: $('#cfN', m).value, aliases: $('#cfA', m).value, biz: $('#cfB', m).value, owner: $('#cfO', m).value, contact: $('#cfC', m).value, phone: $('#cfP', m).value, email: $('#cfE', m).value, payment: $('#cfPay', m).value, start: $('#cfS', m).value, end: $('#cfEnd', m).value, memo: $('#cfM', m).value };
          api('custs.save', { id: c.id || '', cust: v }).then(function (r) { state.custs = r.custs; close(); toast('저장했어요.'); var cs = state.custView = state.custView || { q: '' }; cs.sel = r.id; if (state.view === 'custs') renderCustDetail(); else { state.view = 'custs'; render(); } })
            .catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
        };
        var dl = $('#cfDel', m); if (dl) dl.onclick = function () { if (!confirm('"' + c.name + '" 거래처 카드를 지울까요? (견적·접수 기록은 그대로 남아요)')) return; api('custs.delete', { id: c.id }).then(function (r) { state.custs = r.custs; close(); state.custView.sel = ''; renderCusts(); toast('삭제했어요.'); }).catch(function (err) { toast(err.message, 'err'); }); };
      } });
  }
  function renderCustDetail() {
    syncRoute();
    var cs = state.custView, c = (state.custs || []).filter(function (x) { return x.id === cs.sel; })[0];
    if (!c) { cs.sel = ''; return renderCusts(); }
    var row = function (k, v) { return v ? '<div><span class="muted small">' + k + '</span><b>' + v + '</b></div>' : ''; };
    $('#main').innerHTML = '<div class="row-between" style="margin-bottom:14px;flex-wrap:wrap;gap:8px"><button class="btn btn-sm" id="cdBack">← 거래처</button><div class="actions">' + (can('analysis') ? '<button class="btn btn-sm" id="cdAn">실적 상세</button>' : '') + '<button class="btn btn-sm" id="cdQuote">＋ 견적 요청 등록</button><button class="btn btn-sm btn-primary" id="cdEdit">수정</button></div></div>' +
      '<div class="card"><div class="row-between" style="flex-wrap:wrap;gap:10px"><div><div class="eyebrow">Customer · 거래처</div><h2>' + esc(c.name) + ' ' + custBadge(c) + '</h2>' + (c.aliases.length ? '<p class="muted small" style="margin:2px 0 0">같은 업체: ' + esc(c.aliases.join(', ')) + '</p>' : '') + '</div></div>' +
      '<div class="cust-info">' + row('우리 사업자', esc(c.biz)) + row('담당 직원', esc(c.owner)) + row('거래처 담당자', esc(c.contact)) + row('연락처', c.phone ? '<a href="tel:' + esc(c.phone.replace(/[^\d+]/g, '')) + '">' + esc(c.phone) + '</a>' : '') + row('이메일', c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '') +
      row('계약 기간', (c.start || c.end) ? esc((c.start || '?') + ' ~ ' + (c.end || '?')) : '') + row('결제 조건', esc(c.payment)) + '</div>' +
      (c.memo ? '<div class="cust-memo">' + esc(c.memo) + '</div>' : '') + '<p class="hint" style="margin:10px 0 0">수정 ' + esc(c.by) + ' · ' + esc(c.at) + '</p></div>' +
      '<div class="cust-sec" id="cdLinks"><div class="card muted"><span class="spinner dark"></span> 관련 기록 모으는 중…</div></div>';
    $('#cdBack').onclick = function () { cs.sel = ''; renderCusts(); };
    $('#cdEdit').onclick = function () { editCust(c); };
    $('#cdQuote').onclick = function () { state.view = 'reqs'; render(); setTimeout(function () { if (typeof openNewReq === 'function') { openNewReq(); var i = $('.modal [data-r=cust]'); if (i) i.value = c.name; } }, 50); };
    var an = $('#cdAn'); if (an) an.onclick = function () { var b = this; busy(b, true, '…'); loadAnalysis().then(function () { busy(b, false); openCustCard(c.name); }).catch(function (err) { busy(b, false); toast(err.message, 'err'); }); };
    var jobs = [
      state.quotes.list ? Promise.resolve() : api('quotes.list').then(function (r) { state.quotes.list = r.quotes; }),
      state.reqs.list ? Promise.resolve() : api('reqs.list').then(function (r) { state.reqs.list = r.reqs; }),
      state.rateCusts ? Promise.resolve() : api('rates.list').then(function (r) { state.rateCusts = r.custs; }),
      loadCal().catch(function () { }),
      loadManuals(true).catch(function () { }), loadOwners(true).catch(function () { }),
      can('analysis') ? loadAnalysis().catch(function () { }) : Promise.resolve()
    ];
    Promise.all(jobs).then(function () {
      if (state.view !== 'custs' || cs.sel !== c.id) return;
      var qs = (state.quotes.list || []).filter(function (q) { return custMatch(c, q.client); });
      var rq = (state.reqs.list || []).filter(function (r) { return custMatch(c, r.cust); });
      var rt = (state.rateCusts || []).filter(function (r) { return custMatch(c, r.cust); });
      var tk = state.cal.data ? state.cal.data.tasks.filter(function (t) { return custMatch(c, t.cust); }) : [];
      var ns = can('analysis') ? (state.an.notes || []).filter(function (n) { return custMatch(c, n.cust); }) : [];
      var sec = function (t, n, inner, go) { return '<div class="card"><div class="row-between"><h3>' + t + ' <span class="muted small">' + n + '</span></h3>' + (go ? '<button class="btn btn-sm btn-ghost" data-go="' + go + '">열기</button>' : '') + '</div>' + (n ? inner : '<p class="muted small" style="margin:6px 0 0">없어요.</p>') + '</div>'; };
      var mans = (state.manuals || []).filter(function (m) { return m.cust && custMatch(c, m.cust); }), ows = (state.owners || []).filter(function (o) { return o.cust && custMatch(c, o.cust); });
      $('#cdLinks').innerHTML =
        '<div class="card"><div class="row-between"><h3>📘 업무 매뉴얼 <span class="muted small">' + mans.length + '</span></h3><button class="btn btn-sm" id="cdMan">＋ 매뉴얼 쓰기</button></div>' +
          (mans.length ? '<ul class="home-list">' + mans.map(function (m) { return '<li><button data-man="' + esc(m.id) + '"><span>' + esc(m.title) + '</span><span class="small muted">' + esc((m.cat ? m.cat + ' · ' : '') + String(m.updAt).slice(0, 10)) + '</span></button></li>'; }).join('') + '</ul>' : '<p class="muted small" style="margin:6px 0 0">없어요. 처리 순서·연락처를 적어 두면 누가 맡아도 할 수 있어요.</p>') +
          (ows.length ? '<p class="small" style="margin:10px 0 0">👥 ' + ows.map(function (o) { return esc(o.task) + ' — 주 <b>' + esc(o.main || '없음') + '</b> · 부 ' + esc(o.sub || '없음'); }).join('<br>👥 ') + '</p>' : '') + '</div>' +
        sec('📨 견적 접수', rq.length, '<ul class="home-list">' + rq.slice(0, 8).map(function (r) { return '<li><button data-rq="' + esc(r.id) + '"><span>' + esc(r.title) + '</span><span>' + reqPill(r.status) + ' <span class="small muted">' + esc(r.received || '') + '</span></span></button></li>'; }).join('') + '</ul>', 'reqs') +
        sec('📁 견적모음', qs.length, '<ul class="home-list">' + qs.slice(0, 8).map(function (q) { return '<li><button data-q="' + esc(q.id) + '"><span>' + esc(q.name) + '</span><span>' + statusPill(q.status) + ' <span class="small muted">' + esc(String(q.savedAt).slice(0, 10)) + '</span></span></button></li>'; }).join('') + '</ul>', 'quotes') +
        sec('💲 업체 단가표', rt.length, '<ul class="home-list">' + rt.map(function (r) { return '<li><button data-rt="' + esc(r.cust) + '"><span>' + esc(r.cust) + '</span><span class="small muted">' + won(r.count) + '구간' + (r.hasSpecial ? ' · 특수운임' : '') + '</span></button></li>'; }).join('') + '</ul>', 'rates') +
        sec('✅ 할 일', tk.length, '<ul class="home-list">' + tk.map(function (t) { return '<li><span class="hl-row"><span>' + esc(t.title) + '</span><span class="small muted">' + esc(ruleText(t)) + ' · ' + esc(t.assignee || '팀 전체') + '</span></span></li>'; }).join('') + '</ul>') +
        (can('analysis') ? sec('📌 단가 변경 기록', ns.length, '<ul class="home-list">' + ns.slice(0, 10).map(function (n) { return '<li><span class="hl-row"><span>' + esc(n.month) + '</span><span class="small">' + esc(noteText(n)) + '</span></span></li>'; }).join('') + '</ul>') : '');
      $$('[data-rq]').forEach(function (b) { b.onclick = function () { state.reqs.detail = b.dataset.rq; state.reqs.data = null; state.view = 'reqs'; render(); }; });
      $$('[data-q]').forEach(function (b) { b.onclick = function () { state.quotes.detail = b.dataset.q; state.quotes.detailData = null; state.view = 'quotes'; render(); }; });
      $$('[data-rt]').forEach(function (b) { b.onclick = function () { state.rates.sel = b.dataset.rt; state.rates.data = null; state.view = 'rates'; render(); }; });
      $$('[data-man]').forEach(function (b) { b.onclick = function () { state.manView = state.manView || { q: '' }; state.manView.sel = b.dataset.man; state.manView.q = ''; state.view = 'manual'; render(); }; });
      $('#cdMan').onclick = function () { editManual({ cust: c.name }); };
      bindHomeGo($('#cdLinks'));
    }).catch(function (err) { $('#cdLinks').innerHTML = '<div class="card"><p class="err-text" style="margin:0">' + esc(err.message) + '</p></div>'; });
  }

  /* ───────── 배차검색 (지난 배차의 금액·차량 찾기) ───────── */
  var SR_FIELDS = [['cust', '업체', '예) GSGM'], ['from', '상차지', '예) 평택'], ['to', '하차지', '예) 창원'], ['weight', '중량', '예) 5 또는 2.5윙'], ['car', '차량번호', '예) 8508'], ['driver', '기사명', '예) 정현대'], ['phone', '전화번호', '예) 9904'], ['note', '비고', '예) 착불']];
  function srState() { return state.srch || (state.srch = { f: {}, period: 'all', biz: '', limit: 200 }); }
  function srNorm(s) { return String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase(); }
  function srRun() {
    var st = srState(), f = st.f, rows = state.an.rows || [], months = anMonths(), last = months[months.length - 1] || '';
    var from = st.period === 'all' || !last ? '' : ymAdd(last, -(+st.period - 1)) + '-01';
    var conds = SR_FIELDS.map(function (x) { return [x[0], String(f[x[0]] || '').trim()]; }).filter(function (x) { return x[1]; }).map(function (x) {
      var terms = x[1].split(/\s+/).map(x[0] === 'phone' ? function (t) { return t.replace(/\D/g, ''); } : srNorm).filter(Boolean);
      return { k: x[0], terms: terms };
    });
    var out = rows.filter(function (r) {
      if (r[C.hidden]) return false; // 매출처 설정에서 숨긴 업체는 검색에도 안 나옴
      if (from && String(r[C.date]) < from) return false;
      return conds.every(function (c) {
        if (c.k === 'weight' && st.exactW) return srNorm(r[C.weight]) === c.terms.join('');
        var v = c.k === 'cust' ? srNorm(r[C.cust]) + '|' + srNorm(r[C.disp]) : c.k === 'phone' ? String(r[C.phone] || '').replace(/\D/g, '') : srNorm(r[c.k === 'note' ? C.etc : C[c.k]]); // 비고 = 분석 자료의 "기타1"
        return c.terms.every(function (t) { return v.indexOf(t) !== -1; });
      });
    });
    out.sort(function (a, b) { return a[C.date] < b[C.date] ? 1 : a[C.date] > b[C.date] ? -1 : 0; });
    return { rows: out, active: conds.length > 0 };
  }
  function renderSearch() {
    var st = srState(), an = state.an;
    $('#main').innerHTML = '<div class="card info-head"><div><div class="eyebrow">Dispatch search · 배차검색</div><h2>배차검색</h2><p class="muted small" style="margin:4px 0 0">새 오더가 왔을 때 예전에 같은 구간을 얼마에, 어떤 차로 했는지 찾아봐요. 칸마다 일부만 넣어도 돼요.</p></div></div>' +
      '<form class="card sr-form" id="srForm" autocomplete="off"><div class="sr-grid">' + SR_FIELDS.map(function (x) {
        return '<label class="sr-f"><span>' + x[1] + (x[0] === 'weight' ? '<span class="sr-exact"><input type="checkbox" id="srExact"' + (st.exactW ? ' checked' : '') + '> 정확히</span>' : '') + '</span><input class="input" data-k="' + x[0] + '" value="' + esc(st.f[x[0]] || '') + '" placeholder="' + (x[0] === 'weight' && st.exactW ? '예) 1 → 1만 (11·1윙 제외)' : x[2]) + '"></label>';
      }).join('') + '</div><div class="sr-bar"><select class="input input-sm" id="srPeriod" style="width:auto">' + [['all', '전체 기간'], ['12', '최근 1년'], ['6', '최근 6개월'], ['3', '최근 3개월']].map(function (p) { return '<option value="' + p[0] + '"' + (st.period === p[0] ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('') + '</select>' +
      '<span class="hint" style="margin:0">띄어쓰기로 여러 단어를 넣으면 모두 들어간 것만 · 전화번호는 숫자만 맞춰요</span><span class="spacer"></span><button type="button" class="btn btn-sm btn-ghost" id="srReset">초기화</button><button class="btn btn-sm btn-primary" type="submit">검색</button></div></form>' +
      '<div id="srOut" style="margin-top:16px"></div>';
    var go = function () { st.limit = 200; drawSearch(); };
    var t;
    $$('#srForm [data-k]').forEach(function (inp) { inp.oninput = function () { st.f[inp.dataset.k] = inp.value; clearTimeout(t); t = setTimeout(go, 300); }; });
    $('#srForm').onsubmit = function (e) { e.preventDefault(); clearTimeout(t); go(); };
    $('#srPeriod').onchange = function () { st.period = this.value; go(); };
    $('#srExact').onchange = function () { st.exactW = this.checked; var w = $('#srForm [data-k=weight]'); w.placeholder = st.exactW ? '예) 1 → 1만 (11·1윙 제외)' : '예) 5 또는 2.5윙'; go(); };
    $('#srReset').onclick = function () { st.f = {}; st.period = 'all'; st.exactW = false; renderSearch(); };
    if (an.rows) return drawSearch();
    $('#srOut').innerHTML = '<div class="card muted"><span class="spinner dark"></span> 배차 데이터 불러오는 중… <span id="anProg"></span></div>';
    loadAnalysis().then(function () { if (state.view === 'search') renderSearch(); })
      .catch(function (err) { if (state.view === 'search') $('#srOut').innerHTML = '<div class="card"><p class="err-text" style="margin:0">' + esc(err.message) + '</p></div>'; });
  }
  function drawSearch() {
    syncRoute();
    var st = srState(), box = $('#srOut'); if (!box) return;
    if (!state.an.rows) return;
    var months = anMonths(), res = srRun(), rows = res.rows;
    if (!res.active) {
      box.innerHTML = '<div class="card empty"><div><h3>무엇을 찾을까요?</h3><p class="muted" style="margin:0">예) 상차지에 <b>평택</b>, 하차지에 <b>창원</b> → 평택에서 창원 간 배차만 나와요.<br>데이터: ' + won(state.an.rows.length) + '건 · ' + esc(months[0] || '') + ' ~ ' + esc(months[months.length - 1] || '') + ' (관리자 → 분석 데이터에 올린 월별 엑셀)</p></div></div>';
      return;
    }
    var cnt = rows.length, shown = rows.slice(0, st.limit);
    var money = function (v) { return v ? won(v) : '<span class="muted">–</span>'; };
    var hl = function (text, k) {
      var v = String(text == null ? '' : text), terms = String(st.f[k] || '').trim().split(/\s+/).filter(Boolean);
      if (!terms.length || k === 'phone') return esc(v);
      var out = esc(v); terms.forEach(function (tm) { var i = v.toLowerCase().indexOf(tm.toLowerCase()); if (i !== -1) out = esc(v.slice(0, i)) + '<mark>' + esc(v.slice(i, i + tm.length)) + '</mark>' + esc(v.slice(i + tm.length)); });
      return out;
    };
    box.innerHTML =
      '<div class="card"><div class="row-between" style="flex-wrap:wrap;gap:10px;margin-bottom:10px"><h3 style="margin:0">검색 결과 <span class="muted small">' + won(cnt) + '건 · 최신순</span></h3>' +
      '<button class="btn btn-sm" id="srX"' + (cnt ? '' : ' disabled') + '>엑셀 다운로드</button></div>' +
      (cnt ? '<div class="bulk-table" style="max-height:70vh"><table class="data bulk sr-tbl"><thead><tr><th class="left">날짜</th><th class="left">매출처</th><th class="left">상차지</th><th class="left">하차지</th><th class="left">중량</th><th>매입가</th><th>청구가</th><th>수익</th><th class="left">차량번호</th><th class="left">기사명</th><th class="left">전화</th><th class="left">비고</th></tr></thead><tbody>' +
        shown.map(function (r) {
          var p = (r[C.sales] || 0) - (r[C.buys] || 0), d = String(r[C.date]);
          return '<tr><td class="left nowrap">' + esc(d) + (/^\d{4}-\d\d-\d\d$/.test(d) ? '<small class="muted">(' + WD[dDow(d)] + ')</small>' : '') + '</td><td class="left">' + hl(r[C.disp] || r[C.cust], 'cust') + '</td>' +
            '<td class="left wrap">' + hl(r[C.from], 'from') + '</td><td class="left wrap">' + hl(r[C.to], 'to') + '</td><td class="left">' + hl(r[C.weight], 'weight') + '</td>' +
            '<td class="num">' + money(r[C.buys]) + '</td><td class="num">' + money(r[C.sales]) + '</td><td class="num' + (p < 0 ? ' neg' : '') + '">' + (r[C.sales] || r[C.buys] ? won(p) : '<span class="muted">–</span>') + '</td>' +
            '<td class="left"><button type="button" class="sr-pick" data-pk="car" data-v="' + esc(r[C.car]) + '">' + hl(r[C.car], 'car') + '</button></td><td class="left"><button type="button" class="sr-pick" data-pk="driver" data-v="' + esc(r[C.driver]) + '">' + hl(r[C.driver], 'driver') + '</button></td>' +
            '<td class="left small nowrap">' + esc(r[C.phone]) + '</td><td class="left small wrap">' + hl(r[C.etc], 'note') + '</td></tr>';
        }).join('') + '</tbody></table></div>' + (cnt > shown.length ? '<div style="text-align:center;margin-top:10px"><button class="btn btn-sm" id="srMore">더 보기 (' + won(cnt - shown.length) + '건 남음)</button></div>' : '') +
        '<p class="hint" style="margin:8px 0 0">차량번호·기사명을 누르면 그 차/기사로 다시 검색해요</p>'
        : '<p class="muted" style="margin:0">조건에 맞는 배차가 없어요. 단어를 줄이거나 기간을 "전체"로 바꿔 보세요.</p>') + '</div>';
    var more = $('#srMore'); if (more) more.onclick = function () { st.limit += 300; drawSearch(); };
    $$('.sr-pick', box).forEach(function (b) { b.onclick = function () { if (!b.dataset.v) return; st.f = {}; st.f[b.dataset.pk] = b.dataset.v; renderSearch(); }; });
    var x = $('#srX'); if (x) x.onclick = function () {
      var btn = this; busy(btn, true, '…');
      downloadXlsx('배차검색_' + todayYmd() + '.xlsx', [{ name: '검색결과', widths: [12, 22, 24, 24, 8, 11, 11, 11, 14, 10, 15, 30],
        rows: [['날짜', '매출처', '상차지', '하차지', '중량', '매입가', '청구가', '수익', '차량번호', '기사명', '전화', '비고']].concat(rows.map(function (r) { return [r[C.date], r[C.disp] || r[C.cust], r[C.from], r[C.to], r[C.weight], r[C.buys] || 0, r[C.sales] || 0, (r[C.sales] || 0) - (r[C.buys] || 0), r[C.car], r[C.driver], r[C.phone], r[C.etc]]; })) },
        { name: '조건', rows: [['항목', '값']].concat(SR_FIELDS.filter(function (f) { return st.f[f[0]]; }).map(function (f) { return [f[1], st.f[f[0]]]; })).concat([['중량', st.exactW ? '정확히 일치' : '포함'], ['기간', st.period === 'all' ? '전체' : '최근 ' + st.period + '개월']]) }])
        .catch(function (err) { toast(err.message, 'err'); }).then(function () { busy(btn, false); });
    };
  }

  /* ───────── 업무 매뉴얼 · 문의 기록 · 업무 담당표 ───────── */
  var MAN_SECS = [['steps', '처리 순서', '예) 1. 오전 9시 접수 확인\n2. 배차 시스템 입력\n3. 기사 배정'], ['contacts', '연락처', '예) 이천터미널 사무실 031-000-0000 (오전만)'], ['issues', '문제와 대처', '예) 미배송 → 터미널 확인 → 기사 연락 → 고객 안내'], ['cautions', '주의사항', '예) 금요일은 마감이 2시로 빠름'], ['memo', '기타 메모', '']];
  function loadManuals(force) { if (state.manuals && !force) return Promise.resolve(state.manuals); return api('manual.list').then(function (r) { state.manuals = r.manuals; return r.manuals; }); }
  function loadInqs(force) { if (state.inqs && !force) return Promise.resolve(state.inqs); return api('inq.list').then(function (r) { state.inqs = r.inqs; return r.inqs; }); }
  function loadOwners(force) { if (state.owners && !force) return Promise.resolve(state.owners); return api('owners.list').then(function (r) { state.owners = r.owners; state.ownerLog = r.log; return r.owners; }); }
  function custNameList() { var o = {}; (state.custs || []).forEach(function (c) { o[c.name] = 1; }); (state.manuals || []).forEach(function (m) { if (m.cust) o[m.cust] = 1; }); (state.owners || []).forEach(function (m) { if (m.cust) o[m.cust] = 1; }); return Object.keys(o).sort(); }
  function custDatalist(id) { return '<datalist id="' + id + '">' + custNameList().map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>'; }
  function sameCust(a, b) { if (!a || !b) return false; var c = (state.custs || []).filter(function (x) { return custMatch(x, a); })[0]; return c ? custMatch(c, b) : custNorm(a) === custNorm(b); }
  function multiline(t) { return esc(t || '').replace(/\n/g, '<br>'); }

  /* 업무 매뉴얼 */
  function renderManual() {
    var mv = state.manView = state.manView || { sel: '', q: '' };
    $('#main').innerHTML = '<div class="card info-head"><div><div class="eyebrow">Manual · 업무 매뉴얼</div><h2>업무 매뉴얼</h2><p class="muted small" style="margin:4px 0 0">업체별 처리 순서·연락처·문제와 대처를 모아 두는 곳이에요. 처음 맡는 사람도 이것만 보고 할 수 있게 적어 주세요.</p></div>' +
      '<div class="actions"><input class="input input-sm" id="mnQ" placeholder="제목·업체·내용 검색" value="' + esc(mv.q) + '" style="width:200px"><button class="btn btn-sm btn-primary" id="mnAdd">＋ 매뉴얼 쓰기</button></div></div>' +
      '<div class="man-grid" style="margin-top:16px"><div class="card man-list" id="mnList"><p class="muted"><span class="spinner dark"></span></p></div><div id="mnBody"></div></div>';
    $('#mnAdd').onclick = function () { editManual({}); };
    var t; $('#mnQ').oninput = function () { var v = this.value; clearTimeout(t); t = setTimeout(function () { mv.q = v; drawManualList(); }, 200); };
    Promise.all([loadManuals(), loadInqs().catch(function () { return []; }), loadCusts().catch(function () { return []; })]).then(function () { if (state.view === 'manual') { drawManualList(); drawManualBody(); } })
      .catch(function (err) { $('#mnList').innerHTML = '<p class="err-text">' + esc(err.message) + '</p>'; });
  }
  function drawManualList() {
    var mv = state.manView, q = custNorm(mv.q), el = $('#mnList'); if (!el) return;
    var list = (state.manuals || []).filter(function (m) { return !q || custNorm(m.title + m.cust + m.cat + m.steps + m.issues + m.cautions + m.contacts + m.memo).indexOf(q) !== -1; });
    var groups = {}; list.forEach(function (m) { (groups[m.cust || '공통'] = groups[m.cust || '공통'] || []).push(m); });
    el.innerHTML = list.length ? Object.keys(groups).sort(function (a, b) { return (a === '공통') - (b === '공통') || a.localeCompare(b); }).map(function (g) {
      return '<div class="man-g"><div class="man-gh">' + esc(g) + '</div>' + groups[g].map(function (m) { return '<button class="man-it' + (mv.sel === m.id ? ' on' : '') + '" data-m="' + esc(m.id) + '"><b>' + esc(m.title) + '</b><small>' + esc((m.cat ? m.cat + ' · ' : '') + m.updBy + ' ' + String(m.updAt).slice(0, 10)) + (m.files.length ? ' · 📎' + m.files.length : '') + '</small></button>'; }).join('') + '</div>';
    }).join('') : '<p class="muted small" style="margin:0">' + ((state.manuals || []).length ? '검색 결과가 없어요.' : '아직 매뉴얼이 없어요. "＋ 매뉴얼 쓰기"로 시작해 보세요. 예) 로젠 일일 업무, 네오4 문제 대응, 월말 마감 순서') + '</p>';
    $$('[data-m]', el).forEach(function (b) { b.onclick = function () { mv.sel = b.dataset.m; drawManualList(); drawManualBody(); syncRoute(); if (window.innerWidth < 900) $('#mnBody').scrollIntoView({ behavior: 'smooth' }); }; });
  }
  function drawManualBody() {
    var mv = state.manView, box = $('#mnBody'); if (!box) return;
    var m = (state.manuals || []).filter(function (x) { return x.id === mv.sel; })[0];
    if (!m) { box.innerHTML = '<div class="card empty"><div><h3>왼쪽에서 매뉴얼을 고르세요</h3><p class="muted" style="margin:0">거래처 카드에서도 그 업체 매뉴얼을 바로 볼 수 있어요.</p></div></div>'; return; }
    var faq = (state.inqs || []).filter(function (x) { return x.faq && m.cust && sameCust(x.cust, m.cust); });
    box.innerHTML = '<div class="card man-doc"><div class="row-between" style="flex-wrap:wrap;gap:8px"><div><div class="eyebrow">' + esc(m.cust || '공통') + (m.cat ? ' · ' + esc(m.cat) : '') + '</div><h2 style="margin:2px 0 0">' + esc(m.title) + '</h2>' +
      '<p class="hint" style="margin:4px 0 0">작성 ' + esc(m.by) + ' · 마지막 수정 ' + esc(m.updBy) + ' ' + esc(m.updAt) + '</p></div><div class="actions"><button class="btn btn-sm" id="mnPrint">인쇄</button><button class="btn btn-sm btn-primary" id="mnEdit">수정</button></div></div>' +
      MAN_SECS.filter(function (s) { return m[s[0]]; }).map(function (s) { return '<section class="man-sec"><h3>' + s[1] + '</h3><div class="man-txt">' + multiline(m[s[0]]) + '</div></section>'; }).join('') +
      (MAN_SECS.some(function (s) { return m[s[0]]; }) ? '' : '<p class="muted">아직 내용이 없어요. "수정"을 눌러 채워 주세요.</p>') +
      (faq.length ? '<section class="man-sec"><h3>자주 묻는 질문 <span class="muted small">문의 기록에서</span></h3>' + faq.map(function (x) { return '<div class="faq"><b>Q. ' + esc(x.body) + '</b><div>A. ' + multiline(x.answer || '(답변 없음)') + '</div><small class="muted">' + esc(x.by + ' · ' + x.at.slice(0, 10)) + '</small></div>'; }).join('') + '</section>' : '') +
      '<section class="man-sec no-print"><h3>첨부 <span class="muted small">' + m.files.length + '</span></h3><ul class="man-files">' + m.files.map(function (f) { return '<li><button data-f="' + esc(f.id) + '">' + DOC_ICON[docKind({ mime: f.mime, fileName: f.name })] + ' ' + esc(f.name) + ' <small class="muted">' + fileSize(f.size) + '</small></button><button class="btn btn-sm btn-ghost" data-fd="' + esc(f.id) + '">삭제</button></li>'; }).join('') + '</ul>' +
      '<label class="btn btn-sm">＋ 파일·사진 올리기<input type="file" id="mnFile" multiple hidden></label></section>' +
      (m.log.length ? '<details class="man-sec no-print"><summary class="small">수정 이력 ' + m.log.length + '</summary><ul class="man-log">' + m.log.slice().reverse().map(function (l) { return '<li><small>' + esc(l.at) + '</small> ' + esc(l.by) + ' · ' + esc(l.what) + '</li>'; }).join('') + '</ul></details>' : '') + '</div>';
    $('#mnEdit').onclick = function () { editManual(m); };
    $('#mnPrint').onclick = function () { document.body.classList.add('print-manual'); window.print(); setTimeout(function () { document.body.classList.remove('print-manual'); }, 500); };
    $('#mnFile').onchange = function () {
      var files = Array.prototype.slice.call(this.files || []).filter(function (f) { if (f.size > DOC_MAX) { toast(f.name + ': 20MB를 넘어 건너뜀', 'err'); return false; } return true; }), i = 0;
      var step = function () {
        if (i >= files.length) { toast('올렸어요.'); drawManualList(); drawManualBody(); return; }
        var f = files[i++]; toast(f.name + ' 올리는 중… (' + i + '/' + files.length + ')');
        readFileB64(f).then(function (b64) { return api('manual.upload', { id: m.id, fileName: f.name, mime: f.type || 'application/octet-stream', data: b64 }); }).then(function (r) { state.manuals = r.manuals; step(); }).catch(function (err) { toast(err.message, 'err'); });
      };
      step();
    };
    $$('[data-f]', box).forEach(function (b) { b.onclick = function () { var f = m.files.filter(function (x) { return x.id === b.dataset.f; })[0]; previewManualFile(f); }; });
    $$('[data-fd]', box).forEach(function (b) { b.onclick = function () { if (!confirm('이 파일을 지울까요?')) return; api('manual.fileDelete', { fileId: b.dataset.fd }).then(function (r) { state.manuals = r.manuals; drawManualBody(); }).catch(function (err) { toast(err.message, 'err'); }); }; });
  }
  function previewManualFile(f) {
    var k = docKind({ mime: f.mime, fileName: f.name }), url = null, blobP = null;
    var getBlob = function () { return blobP || (blobP = api('manual.file', { fileId: f.id }).then(function (r) { return new Blob([bytesFromB64(r.data)], { type: f.mime }); })); };
    modal({ wide: true, eyebrow: '매뉴얼 첨부', title: f.name, body: '<div class="doc-view" id="mfView"><p class="muted"><span class="spinner dark"></span> 불러오는 중…</p></div>',
      foot: '<button class="btn" data-close>닫기</button><button class="btn btn-primary" id="mfDl">다운로드</button>',
      onMount: function (m) {
        getBlob().then(function (bl) { var v = $('#mfView', m); if (!v) return; url = URL.createObjectURL(bl);
          if (k === 'img') v.innerHTML = '<img src="' + url + '" alt="">'; else if (k === 'pdf') v.innerHTML = '<iframe src="' + url + '"></iframe>'; else if (k === 'xls') xlsPreview(v, bl);
          else v.innerHTML = '<p class="muted">미리보기를 지원하지 않는 형식이에요. 다운로드해서 여세요.</p>'; }).catch(function (err) { var v = $('#mfView', m); if (v) v.innerHTML = '<p class="err-text">' + esc(err.message) + '</p>'; });
        $('#mfDl', m).onclick = function () { getBlob().then(function (bl) { saveBlob(bl, f.name); }); };
      } });
  }
  function editManual(m) {
    modal({ wide: true, eyebrow: '업무 매뉴얼', title: m.id ? '매뉴얼 수정' : '매뉴얼 쓰기',
      body: '<div class="qd-two"><div class="field"><label>제목 *</label><input class="input" id="meT" maxlength="100" value="' + esc(m.title || '') + '" placeholder="예) 로젠 일일 업무"></div>' +
        '<div class="field"><label>업체 <span class="muted">(비우면 공통)</span></label><input class="input" id="meC" list="meCs" value="' + esc(m.cust || '') + '" placeholder="예) 로젠택배">' + custDatalist('meCs') + '</div></div>' +
        '<div class="field"><label>분류 <span class="muted">(선택)</span></label><input class="input" id="meK" maxlength="30" value="' + esc(m.cat || '') + '" placeholder="예) 일일 업무, 문제 대응, 월말 마감"></div>' +
        MAN_SECS.map(function (s) { return '<div class="field"><label>' + s[1] + '</label><textarea class="input memo man-ta" data-s="' + s[0] + '" placeholder="' + esc(s[2]) + '">' + esc(m[s[0]] || '') + '</textarea></div>'; }).join('') +
        '<p class="hint" style="margin:0">사진·파일은 저장한 뒤 매뉴얼 화면 아래 "＋ 파일·사진 올리기"로 붙여요.</p>',
      foot: (m.id ? '<button class="btn btn-danger btn-sm" id="meDel" style="margin-right:auto">삭제</button>' : '') + '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="meSave">저장</button>',
      onMount: function (mo, close) {
        $('#meSave', mo).onclick = function () {
          var v = { title: $('#meT', mo).value, cust: $('#meC', mo).value, cat: $('#meK', mo).value }; $$('[data-s]', mo).forEach(function (t) { v[t.dataset.s] = t.value; });
          var btn = this; busy(btn, true, '저장 중…');
          api('manual.save', { id: m.id || '', manual: v }).then(function (r) { state.manuals = r.manuals; close(); toast('저장했어요.'); state.manView = state.manView || { q: '' }; state.manView.sel = r.id; if (state.view !== 'manual') { state.view = 'manual'; render(); } else { drawManualList(); drawManualBody(); syncRoute(); } })
            .catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
        };
        var d = $('#meDel', mo); if (d) d.onclick = function () { if (!confirm('"' + m.title + '" 매뉴얼을 지울까요? 첨부 파일도 같이 지워져요.')) return; api('manual.delete', { id: m.id }).then(function (r) { state.manuals = r.manuals; state.manView.sel = ''; close(); drawManualList(); drawManualBody(); }).catch(function (err) { toast(err.message, 'err'); }); };
      } });
  }

  /* 문의 기록 */
  function renderInq() {
    var iv = state.inqView = state.inqView || { st: '', q: '', mine: false, limit: 100 };
    $('#main').innerHTML = '<div class="card info-head"><div><div class="eyebrow">Inquiries · 문의 기록</div><h2>문의 기록</h2><p class="muted small" style="margin:4px 0 0">업체 문의를 10초 안에 남겨요. 좋은 답변은 ⭐ 자주 묻는 질문으로 표시하면 그 업체 매뉴얼에 모여요.</p></div></div>' +
      '<form class="card inq-quick" id="iqForm" autocomplete="off"><div class="inq-row"><input class="input" id="iqC" list="iqCs" placeholder="업체" style="max-width:180px">' + custDatalist('iqCs') + '<input class="input" id="iqW" placeholder="문의자 (선택)" style="max-width:150px">' +
      '<input class="input grow" id="iqB" placeholder="문의 내용 *"></div><div class="inq-row"><input class="input grow" id="iqA" placeholder="처리 / 답변 (선택)">' +
      '<label class="toggle small"><input type="checkbox" id="iqDone"><span class="track"></span>완료</label><label class="toggle small"><input type="checkbox" id="iqF"><span class="track"></span>⭐ 자주 묻는</label><button class="btn btn-primary" type="submit">남기기</button></div></form>' +
      '<div class="card" style="margin-top:16px"><div class="row-between" style="flex-wrap:wrap;gap:8px;margin-bottom:10px"><div class="segmented" id="iqSt">' + [['', '전체'], ['처리 중', '처리 중'], ['완료', '완료'], ['faq', '⭐ 자주 묻는']].map(function (x) { return '<button type="button" data-v="' + x[0] + '" class="' + (iv.st === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<div class="actions"><label class="toggle small"><input type="checkbox" id="iqMine"' + (iv.mine ? ' checked' : '') + '><span class="track"></span>내가 응대한 것</label><input class="input input-sm" id="iqQ" placeholder="업체·내용 검색" value="' + esc(iv.q) + '" style="width:180px"></div></div><div id="iqList"><p class="muted"><span class="spinner dark"></span></p></div></div>';
    $('#iqForm').onsubmit = function (e) {
      e.preventDefault(); var btn = $('#iqForm button[type=submit]');
      var v = { cust: $('#iqC').value, who: $('#iqW').value, body: $('#iqB').value, answer: $('#iqA').value, status: $('#iqDone').checked ? '완료' : '처리 중', faq: $('#iqF').checked };
      if (!v.body.trim()) return toast('문의 내용을 넣으세요.', 'err');
      busy(btn, true, '…');
      api('inq.save', { inq: v }).then(function (r) { state.inqs = r.inqs; busy(btn, false); ['#iqW', '#iqB', '#iqA'].forEach(function (s) { $(s).value = ''; }); $('#iqDone').checked = false; $('#iqF').checked = false; $('#iqB').focus(); drawInqs(); toast('남겼어요.'); })
        .catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
    };
    $$('#iqSt button').forEach(function (b) { b.onclick = function () { iv.st = b.dataset.v; $$('#iqSt button').forEach(function (x) { x.classList.toggle('on', x === b); }); drawInqs(); }; });
    $('#iqMine').onchange = function () { iv.mine = this.checked; drawInqs(); };
    var t; $('#iqQ').oninput = function () { var v = this.value; clearTimeout(t); t = setTimeout(function () { iv.q = v; drawInqs(); }, 200); };
    Promise.all([loadInqs(true), loadCusts().catch(function () { })]).then(function () { if (state.view === 'inq') drawInqs(); }).catch(function (err) { $('#iqList').innerHTML = '<p class="err-text">' + esc(err.message) + '</p>'; });
  }
  function drawInqs() {
    syncRoute();
    var iv = state.inqView, el = $('#iqList'); if (!el) return;
    var q = custNorm(iv.q), ym = todayYmd().slice(0, 7);
    var all = state.inqs || [], list = all.filter(function (x) {
      if (iv.st === 'faq' ? !x.faq : iv.st && x.status !== iv.st) return false;
      if (iv.mine && x.byId !== state.user.id) return false;
      return !q || custNorm(x.cust + x.who + x.body + x.answer).indexOf(q) !== -1;
    });
    var open = all.filter(function (x) { return x.status !== '완료'; }).length, month = all.filter(function (x) { return x.at.slice(0, 7) === ym; }).length;
    el.innerHTML = '<p class="small muted" style="margin:0 0 8px">이번 달 ' + month + '건 · 처리 중 ' + open + '건 · 보이는 것 ' + list.length + '건</p>' +
      (list.length ? '<ul class="inq-list">' + list.slice(0, iv.limit).map(function (x) {
        return '<li class="' + (x.status === '완료' ? 'done' : 'open') + '"><button data-i="' + esc(x.id) + '"><span class="inq-meta"><span class="inq-st">' + esc(x.status) + '</span>' + (x.faq ? '⭐ ' : '') + '<b>' + esc(x.cust || '(업체 없음)') + '</b>' + (x.who ? ' · ' + esc(x.who) : '') + '<small>' + esc(x.at.slice(5, 16).replace('-', '/')) + ' · ' + esc(x.by) + '</small></span>' +
          '<span class="inq-q">' + esc(x.body) + '</span>' + (x.answer ? '<span class="inq-a">↳ ' + esc(x.answer) + '</span>' : '') + '</button></li>';
      }).join('') + '</ul>' + (list.length > iv.limit ? '<div style="text-align:center;margin-top:10px"><button class="btn btn-sm" id="iqMore">더 보기</button></div>' : '') : '<p class="muted small">없어요.</p>');
    var mr = $('#iqMore'); if (mr) mr.onclick = function () { iv.limit += 200; drawInqs(); };
    $$('[data-i]', el).forEach(function (b) { b.onclick = function () { editInq(all.filter(function (x) { return x.id === b.dataset.i; })[0]); }; });
  }
  function editInq(x) {
    var mine = x.byId === state.user.id || state.user.role === 'admin';
    modal({ eyebrow: '문의 기록', title: (x.cust || '문의') + ' · ' + x.at.slice(0, 16),
      body: '<div class="qd-two"><div class="field"><label>업체</label><input class="input" id="ieC" list="ieCs" value="' + esc(x.cust) + '">' + custDatalist('ieCs') + '</div><div class="field"><label>문의자</label><input class="input" id="ieW" value="' + esc(x.who) + '"></div></div>' +
        '<div class="field"><label>문의 내용</label><textarea class="input memo" id="ieB">' + esc(x.body) + '</textarea></div><div class="field"><label>처리 / 답변</label><textarea class="input memo" id="ieA">' + esc(x.answer) + '</textarea></div>' +
        '<div class="actions"><label class="toggle"><input type="checkbox" id="ieD"' + (x.status === '완료' ? ' checked' : '') + '><span class="track"></span>완료</label><label class="toggle"><input type="checkbox" id="ieF"' + (x.faq ? ' checked' : '') + '><span class="track"></span>⭐ 자주 묻는 질문 (업체 매뉴얼에 모임)</label></div><p class="hint" style="margin:10px 0 0">응대 ' + esc(x.by) + '</p>',
      foot: (mine ? '<button class="btn btn-danger btn-sm" id="ieDel" style="margin-right:auto">삭제</button>' : '') + '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="ieSave">저장</button>',
      onMount: function (m, close) {
        $('#ieSave', m).onclick = function () { var btn = this; busy(btn, true, '…'); api('inq.save', { id: x.id, inq: { cust: $('#ieC', m).value, who: $('#ieW', m).value, body: $('#ieB', m).value, answer: $('#ieA', m).value, status: $('#ieD', m).checked ? '완료' : '처리 중', faq: $('#ieF', m).checked } }).then(function (r) { state.inqs = r.inqs; close(); drawInqs(); }).catch(function (err) { busy(btn, false); toast(err.message, 'err'); }); };
        var d = $('#ieDel', m); if (d) d.onclick = function () { if (!confirm('이 문의 기록을 지울까요?')) return; api('inq.delete', { id: x.id }).then(function (r) { state.inqs = r.inqs; close(); drawInqs(); }).catch(function (err) { toast(err.message, 'err'); }); };
      } });
  }

  /* 업무 담당표 */
  function offToday(name, from, to) { var d = state.cal.data; if (!d || !name) return null; return d.leaves.filter(function (l) { return l.name === name && !isWork(l.kind) && l.start <= to && l.end >= from; })[0] || null; }
  function renderOwners() {
    $('#main').innerHTML = '<div class="card info-head"><div><div class="eyebrow">Owners · 업무 담당표</div><h2>업무 담당표</h2><p class="muted small" style="margin:4px 0 0">업무마다 주담당과 부담당(대신 맡을 사람)을 정해요. 주담당이 휴가면 홈·주간 요약에 "부담당 OO"로 알려줘요.</p></div>' +
      '<div class="actions"><button class="btn btn-sm btn-primary" id="owAdd">＋ 업무 추가</button></div></div><div id="owBody" style="margin-top:16px"><div class="card muted"><span class="spinner dark"></span></div></div>';
    $('#owAdd').onclick = function () { editOwner({}); };
    Promise.all([loadOwners(true), loadCal().catch(function () { }), loadCusts().catch(function () { })]).then(function () { if (state.view === 'owners') drawOwners(); }).catch(function (err) { $('#owBody').innerHTML = '<div class="card"><p class="err-text">' + esc(err.message) + '</p></div>'; });
  }
  function drawOwners() {
    var list = state.owners || [], box = $('#owBody'); if (!box) return;
    var today = todayYmd(), we = dAdd(mondayOf(today), 6), cnt = {};
    list.forEach(function (o) { if (o.main) (cnt[o.main] = cnt[o.main] || { m: 0, s: 0 }).m++; if (o.sub) (cnt[o.sub] = cnt[o.sub] || { m: 0, s: 0 }).s++; });
    var ppl = Object.keys(cnt).sort(function (a, b) { return cnt[b].m - cnt[a].m || cnt[b].s - cnt[a].s; }), mx = Math.max.apply(null, ppl.map(function (p) { return cnt[p].m + cnt[p].s; }).concat([1]));
    var nobody = list.filter(function (o) { return !o.sub; }).length;
    var who = function (n, isMain) { if (!n) return '<span class="muted">' + (isMain ? '없음' : '⚠ 없음') + '</span>'; var l = offToday(n, today, we); return '<b>' + esc(n) + '</b>' + (l ? ' <span class="badge exp-soon" title="' + esc(l.start + '~' + l.end) + '">' + esc(l.kind) + (l.start <= today && l.end >= today ? ' 오늘' : ' 이번 주') + '</span>' : ''); };
    box.innerHTML = '<div class="ow-grid"><div class="card"><div class="table-wrap"><table class="data ow-table"><thead><tr><th class="left">업무</th><th class="left">업체</th><th class="left">주담당</th><th class="left">부담당</th><th class="left">메모</th><th></th></tr></thead><tbody>' +
      (list.length ? list.slice().sort(function (a, b) { return (a.cust + a.task).localeCompare(b.cust + b.task); }).map(function (o) {
        return '<tr><td class="left"><b>' + esc(o.task) + '</b></td><td class="left">' + esc(o.cust || '–') + '</td><td class="left">' + who(o.main, true) + '</td><td class="left">' + who(o.sub) + '</td><td class="left small">' + esc(o.memo) + '</td><td><button class="btn btn-sm btn-ghost" data-o="' + esc(o.id) + '">수정</button></td></tr>';
      }).join('') : '<tr><td colspan="6" class="left muted" style="padding:16px">아직 없어요. 예) 로젠 일일 배차 · 로젠택배 · 주담당 김기중 · 부담당 이인성</td></tr>') + '</tbody></table></div>' +
      (nobody ? '<p class="small" style="margin:8px 0 0;color:var(--orange)">⚠ 부담당이 없는 업무 ' + nobody + '개 — 담당자가 쉬면 아무도 못 해요</p>' : '') + '</div>' +
      '<div><div class="card"><h3 style="margin:0 0 8px">사람별 업무 수</h3>' + (ppl.length ? ppl.map(function (p) { var c = cnt[p]; return '<div class="ow-bar"><span>' + esc(p) + '</span><div><i class="m" style="width:' + (c.m / mx * 100) + '%"></i><i class="s" style="width:' + (c.s / mx * 100) + '%"></i></div><small>주 ' + c.m + ' · 부 ' + c.s + '</small></div>'; }).join('') : '<p class="muted small">없어요.</p>') +
      '<p class="hint" style="margin:8px 0 0"><i class="ow-key m"></i>주담당 <i class="ow-key s"></i>부담당 — 한 사람에게 몰린 게 보이면 나눠 주세요</p></div>' +
      '<div class="card" style="margin-top:16px"><h3 style="margin:0 0 8px">바뀐 기록</h3>' + ((state.ownerLog || []).length ? '<ul class="man-log">' + state.ownerLog.slice(0, 20).map(function (l) { return '<li><small>' + esc(l.at.slice(0, 16)) + '</small> <b>' + esc(l.task) + '</b> ' + esc(l.text) + ' · ' + esc(l.by) + '</li>'; }).join('') + '</ul>' : '<p class="muted small">없어요.</p>') + '</div></div></div>';
    $$('[data-o]', box).forEach(function (b) { b.onclick = function () { editOwner(list.filter(function (o) { return o.id === b.dataset.o; })[0]); }; });
  }
  function editOwner(o) {
    var names = state.cal.data ? state.cal.data.users.map(function (u) { return u.name; }) : [];
    var dl = '<datalist id="owNs">' + names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>';
    modal({ eyebrow: '업무 담당표', title: o.id ? '업무 수정' : '업무 추가',
      body: '<div class="qd-two"><div class="field"><label>업무 *</label><input class="input" id="oeT" maxlength="100" value="' + esc(o.task || '') + '" placeholder="예) 로젠 일일 배차"></div><div class="field"><label>업체</label><input class="input" id="oeC" list="oeCs" value="' + esc(o.cust || '') + '">' + custDatalist('oeCs') + '</div></div>' +
        '<div class="qd-two"><div class="field"><label>주담당</label><input class="input" id="oeM" list="owNs" value="' + esc(o.main || '') + '"></div><div class="field"><label>부담당 (대신 맡을 사람)</label><input class="input" id="oeS" list="owNs" value="' + esc(o.sub || '') + '"></div></div>' + dl +
        '<div class="field"><label>메모</label><input class="input" id="oeN" maxlength="500" value="' + esc(o.memo || '') + '" placeholder="예) 인수인계 중 (11월까지)"></div>',
      foot: (o.id ? '<button class="btn btn-danger btn-sm" id="oeDel" style="margin-right:auto">삭제</button>' : '') + '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="oeSave">저장</button>',
      onMount: function (m, close) {
        $('#oeSave', m).onclick = function () { var btn = this; busy(btn, true, '…'); api('owners.save', { id: o.id || '', owner: { task: $('#oeT', m).value, cust: $('#oeC', m).value, main: $('#oeM', m).value, sub: $('#oeS', m).value, memo: $('#oeN', m).value } }).then(function (r) { state.owners = r.owners; state.ownerLog = r.log; close(); if (state.view === 'owners') drawOwners(); else render(); toast('저장했어요.'); }).catch(function (err) { busy(btn, false); toast(err.message, 'err'); }); };
        var d = $('#oeDel', m); if (d) d.onclick = function () { if (!confirm('이 업무를 담당표에서 뺄까요?')) return; api('owners.delete', { id: o.id }).then(function (r) { state.owners = r.owners; state.ownerLog = r.log; close(); drawOwners(); }).catch(function (err) { toast(err.message, 'err'); }); };
      } });
  }
  /** 홈 '오늘 할 일' 카드에: 오늘 휴가인 주담당 → 부담당 */
  function coverToday() {
    var today = todayYmd();
    return (state.owners || []).map(function (o) { var l = offToday(o.main, today, today); return l ? { o: o, l: l } : null; }).filter(Boolean);
  }

  /* 팀 월간 보고서 (분석 권한) */
  function renderReport() {
    var rv = state.rptView = state.rptView || { team: '', ym: ymAdd(todayYmd().slice(0, 7), -1) };
    $('#main').innerHTML = '<div class="card info-head"><div><div class="eyebrow">Team report · 팀 월간 보고서</div><h2>팀 월간 보고서</h2><p class="muted small" style="margin:4px 0 0">팀이 한 달 동안 맡은 업체 실적·견적·문의·추가근무·업무 담당을 한 장으로 정리해요. 팀은 관리자 → 직원 목록의 "팀" 칸 기준이에요.</p></div></div>' +
      '<div class="card" style="margin-top:16px" id="rpBox"><p class="muted"><span class="spinner dark"></span> 자료 모으는 중… <span id="anProg"></span></p></div>';
    var soft = function (p) { return p.catch(function () { return null; }); };
    Promise.all([loadCal(), loadAnalysis(), soft(loadOwners(true)), soft(loadInqs(true)), soft(api('reqs.list').then(function (r) { state.reqs.list = r.reqs; })), soft(loadCusts())]).then(function () {
      if (state.view !== 'report') return;
      var info = state.cal.data.staffInfo || {}, teams = {}; Object.keys(info).forEach(function (n) { if (info[n].team) teams[info[n].team] = 1; });
      var tl = Object.keys(teams).sort(); if (!rv.team || !teams[rv.team]) rv.team = tl[0] || '';
      var months = anMonths(), ms = {}; months.forEach(function (m) { ms[m] = 1; }); ms[todayYmd().slice(0, 7)] = 1; ms[rv.ym] = 1;
      $('#rpBox').innerHTML = tl.length ? '<div class="actions" style="flex-wrap:wrap"><span class="small muted">팀</span><select class="input input-sm" id="rpT" style="width:auto">' + tl.map(function (t) { return '<option' + (t === rv.team ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>' +
        '<span class="small muted">월</span><select class="input input-sm" id="rpM" style="width:auto">' + Object.keys(ms).sort().reverse().map(function (m) { return '<option' + (m === rv.ym ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select>' +
        '<span class="field" style="flex:1;min-width:220px;margin:0"><input class="input input-sm" id="rpNote" placeholder="이번 달 주요 이슈·건의 (보고서에 들어가요)" value="' + esc(local('get', 'joil-rptnote-' + rv.team + rv.ym) || '') + '"></span><button class="btn btn-sm btn-primary" id="rpGo">보고서 만들기</button></div>'
        : '<p style="margin:0">아직 팀이 정해진 직원이 없어요. <b>관리자 → 직원 목록</b>에서 "팀" 칸을 채워 주세요 (예: 일반팀).</p>';
      if (!tl.length) return;
      $('#rpT').onchange = function () { rv.team = this.value; $('#rpNote').value = local('get', 'joil-rptnote-' + rv.team + rv.ym) || ''; };
      $('#rpM').onchange = function () { rv.ym = this.value; $('#rpNote').value = local('get', 'joil-rptnote-' + rv.team + rv.ym) || ''; };
      $('#rpNote').onchange = function () { local('set', 'joil-rptnote-' + rv.team + rv.ym, this.value); };
      $('#rpGo').onclick = function () { local('set', 'joil-rptnote-' + rv.team + rv.ym, $('#rpNote').value); openTeamReport(rv.team, rv.ym, $('#rpNote').value); };
    }).catch(function (err) { var b = $('#rpBox'); if (b) b.innerHTML = '<p class="err-text">' + esc(err.message) + '</p>'; });
  }
  function teamReportData(team, ym) {
    var d = state.cal.data, info = d.staffInfo || {}, members = Object.keys(info).filter(function (n) { return info[n].team === team; }).sort();
    var isM = function (n) { return members.indexOf(n) !== -1; }, inM = function (s) { return String(s || '').slice(0, 7) === ym; }, prev = ymAdd(ym, -1);
    var reqs = (state.reqs.list || []).filter(function (r) { return isM(r.owner); });
    var rq = { received: reqs.filter(function (r) { return inM(r.received); }).length, submitted: reqs.filter(function (r) { return inM(r.submitted); }).length, open: reqs.filter(function (r) { return r.status === '접수' || r.status === '검토중'; }).length,
      won: reqs.filter(function (r) { return r.status === '수주' && inM(r.updated || r.submitted || r.received); }).length };
    var inqs = (state.inqs || []).filter(function (x) { return isM(x.by) && inM(x.at); });
    var inqCust = {}; inqs.forEach(function (x) { var k = x.cust || '(업체 없음)'; inqCust[k] = (inqCust[k] || 0) + 1; });
    var ot = otMonth(ym), holi = calHoli();
    var per = members.map(function (n) {
      var o = ot[n] || {}, lv = d.leaves.filter(function (l) { return l.name === n && !isWork(l.kind) && l.start.slice(0, 7) <= ym && l.end.slice(0, 7) >= ym; }).reduce(function (a, l) { return a + leaveDays(l, holi); }, 0);
      var ow = (state.owners || []), mainN = ow.filter(function (x) { return x.main === n; }).length, subN = ow.filter(function (x) { return x.sub === n; }).length;
      return { name: n, main: mainN, sub: subN, req: reqs.filter(function (r) { return r.owner === n && inM(r.received); }).length, inq: inqs.filter(function (x) { return x.by === n; }).length,
        ot: o.total || 0, duty: o['당직'] ? o['당직'].h : 0, leave: lv, done: (d.done || []).filter(function (x) { return x.by === n && inM(x.at); }).length };
    });
    var owned = (state.owners || []).filter(function (o) { return isM(o.main); });
    var custs = {}; owned.forEach(function (o) { if (o.cust) custs[o.cust] = 1; });
    var sales = Object.keys(custs).map(function (c) {
      var cc = (state.custs || []).filter(function (x) { return custMatch(x, c); })[0], match = function (r) { var nm = r[C.disp] || r[C.cust]; return cc ? custMatch(cc, nm) || custMatch(cc, r[C.cust]) : custNorm(nm) === custNorm(c); };
      var agg = function (m) { var t = { n: 0, s: 0, b: 0 }; (state.an.rows || []).forEach(function (r) { if (r[C.hidden] || String(r[C.date]).slice(0, 7) !== m || !match(r)) return; t.n++; t.s += r[C.sales] || 0; t.b += r[C.buys] || 0; }); t.p = t.s - t.b; return t; };
      return { cust: c, cur: agg(ym), prev: agg(prev) };
    });
    return { team: team, ym: ym, members: members, rq: rq, inqN: inqs.length, inqOpen: inqs.filter(function (x) { return x.status !== '완료'; }).length, inqTop: Object.keys(inqCust).map(function (k) { return [k, inqCust[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5),
      per: per, owned: owned, sales: sales, otSum: per.reduce(function (a, p) { return a + p.ot; }, 0) };
  }
  function openTeamReport(team, ym, note) {
    var x = teamReportData(team, ym), y = +ym.slice(0, 4), m = +ym.slice(5);
    var tot = x.sales.reduce(function (a, s) { a.s += s.cur.s; a.b += s.cur.b; a.n += s.cur.n; a.ps += s.prev.s; a.pp += s.prev.p; return a; }, { s: 0, b: 0, n: 0, ps: 0, pp: 0 }); tot.p = tot.s - tot.b;
    var dlt = function (c, p) { if (!p) return '<span class="muted">–</span>'; var v = (c - p) / Math.abs(p) * 100; return '<span class="' + (v >= 0 ? 'up' : 'down') + '">' + (v >= 0 ? '▲' : '▼') + ' ' + Math.abs(v).toFixed(1) + '%</span>'; };
    var hrs2 = function (v) { return v ? (Math.round(v * 10) / 10) + 'h' : '–'; };
    var html = '<div class="rpt-bar no-print"><span class="muted small">보고서 미리보기 · 인쇄 창에서 "PDF로 저장"을 고르면 PDF가 돼요</span><span class="spacer"></span><button class="btn btn-sm" id="trX">엑셀</button><button class="btn btn-sm btn-primary" id="trPrint">인쇄 / PDF 저장</button><button class="btn btn-sm" id="trClose">닫기</button></div>' +
      '<div class="rpt-page"><header class="rpt-head"><div class="stripe-bar"></div><div class="rpt-title"><div><div class="eyebrow">Team Monthly Report · 팀 월간 업무 보고</div><h1>' + y + '년 ' + m + '월 ' + esc(team) + ' 업무 보고</h1>' +
      '<p class="muted small">팀원 ' + x.members.map(esc).join(', ') + ' · 작성 ' + esc(today()) + ' · ' + esc(state.user.name) + '</p></div><span class="logo"></span></div></header>' +
      '<section><h2>1. 한눈에 보기</h2><div class="tr-kpis">' + [['담당 업체 매출', won(tot.s) + '원', dlt(tot.s, tot.ps) + ' 전월 대비'], ['담당 업체 이익', won(tot.p) + '원', dlt(tot.p, tot.pp) + ' 전월 대비'], ['견적 접수 · 제출', x.rq.received + ' · ' + x.rq.submitted + '건', '진행 중 ' + x.rq.open + '건'],
        ['문의 응대', x.inqN + '건', '처리 중 ' + x.inqOpen + '건'], ['추가근무 합계', hrs2(x.otSum), '야간·휴일·당직'], ['맡은 업무', x.owned.length + '개', '업무 담당표 주담당 기준']].map(function (k) { return '<div><small>' + k[0] + '</small><b>' + k[1] + '</b><span class="small muted">' + k[2] + '</span></div>'; }).join('') + '</div></section>' +
      '<section><h2>2. 팀원별 업무</h2><table class="data rpt"><thead><tr><th class="left">이름</th><th>맡은 업무 (주·부)</th><th>견적 접수</th><th>문의 응대</th><th>할 일 완료</th><th>추가근무</th><th>당직</th><th>휴가</th></tr></thead><tbody>' +
        x.per.map(function (p) { return '<tr><td class="left strong">' + esc(p.name) + '</td><td class="num">' + p.main + ' · ' + p.sub + '</td><td class="num">' + p.req + '</td><td class="num">' + p.inq + '</td><td class="num">' + p.done + '</td><td class="num">' + hrs2(p.ot) + '</td><td class="num">' + hrs2(p.duty) + '</td><td class="num">' + (p.leave ? p.leave + '일' : '–') + '</td></tr>'; }).join('') + '</tbody></table></section>' +
      '<section><h2>3. 담당 업체 실적</h2>' + (x.sales.length ? '<table class="data rpt"><thead><tr><th class="left">업체</th><th>건수</th><th>매출</th><th>매입</th><th>이익</th><th>이익률</th><th>매출 전월 대비</th></tr></thead><tbody>' +
        x.sales.sort(function (a, b) { return b.cur.s - a.cur.s; }).map(function (s) { var c = s.cur; return '<tr><td class="left">' + esc(s.cust) + '</td><td class="num">' + won(c.n) + '</td><td class="num">' + won(c.s) + '</td><td class="num">' + won(c.b) + '</td><td class="num' + (c.p < 0 ? ' neg' : '') + '">' + won(c.p) + '</td><td class="num">' + (c.s ? (c.p / c.s * 100).toFixed(1) + '%' : '–') + '</td><td class="num">' + dlt(c.s, s.prev.s) + '</td></tr>'; }).join('') +
        '<tr class="tot"><td class="left strong">합계</td><td class="num">' + won(tot.n) + '</td><td class="num">' + won(tot.s) + '</td><td class="num">' + won(tot.b) + '</td><td class="num strong">' + won(tot.p) + '</td><td class="num">' + (tot.s ? (tot.p / tot.s * 100).toFixed(1) + '%' : '–') + '</td><td class="num">' + dlt(tot.s, tot.ps) + '</td></tr></tbody></table>'
        : '<p class="muted small">업무 담당표에 이 팀이 주담당인 업체가 없어요.</p>') + '</section>' +
      '<section class="rpt-two"><div><h2>4. 맡은 업무</h2>' + (x.owned.length ? '<table class="data rpt"><thead><tr><th class="left">업무</th><th class="left">주담당</th><th class="left">부담당</th></tr></thead><tbody>' + x.owned.map(function (o) { return '<tr><td class="left">' + esc(o.task) + (o.cust ? ' <span class="muted small">' + esc(o.cust) + '</span>' : '') + '</td><td class="left">' + esc(o.main) + '</td><td class="left">' + (o.sub ? esc(o.sub) : '<b class="neg">없음</b>') + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="muted small">없어요.</p>') + '</div>' +
      '<div><h2>5. 문의 많은 업체</h2>' + (x.inqTop.length ? '<table class="data rpt"><tbody>' + x.inqTop.map(function (t) { return '<tr><td class="left">' + esc(t[0]) + '</td><td class="num">' + t[1] + '건</td></tr>'; }).join('') + '</tbody></table>' : '<p class="muted small">없어요.</p>') + '</div></section>' +
      (note ? '<section><h2>6. 주요 이슈 · 건의</h2><p style="white-space:pre-wrap;margin:0">' + esc(note) + '</p></section>' : '') +
      '<footer class="rpt-foot muted small">조일그룹 견적·실적 시스템 · 매출·매입은 분석 데이터(월별 엑셀), 견적은 견적 접수함, 문의는 문의 기록, 근무는 일정 기준</footer></div>';
    var wrap = document.createElement('div'); wrap.id = 'report'; wrap.innerHTML = html; document.body.appendChild(wrap); document.body.classList.add('report-open'); window.scrollTo(0, 0);
    var close = function () { wrap.remove(); document.body.classList.remove('report-open'); };
    $('#trClose').onclick = close; $('#trPrint').onclick = function () { window.print(); };
    $('#trX').onclick = function () {
      var btn = this; busy(btn, true, '…');
      downloadXlsx(team + '_' + ym + '_월간보고.xlsx', [
        { name: '팀원별', rows: [['이름', '주담당', '부담당', '견적 접수', '문의 응대', '할 일 완료', '추가근무(h)', '당직(h)', '휴가(일)']].concat(x.per.map(function (p) { return [p.name, p.main, p.sub, p.req, p.inq, p.done, p.ot, p.duty, p.leave]; })), widths: [10, 8, 8, 9, 9, 9, 11, 9, 9] },
        { name: '담당업체', rows: [['업체', '건수', '매출', '매입', '이익', '전월 매출']].concat(x.sales.map(function (s) { return [s.cust, s.cur.n, s.cur.s, s.cur.b, s.cur.p, s.prev.s]; })), widths: [22, 8, 14, 14, 14, 14] },
        { name: '맡은업무', rows: [['업무', '업체', '주담당', '부담당', '메모']].concat(x.owned.map(function (o) { return [o.task, o.cust, o.main, o.sub, o.memo]; })), widths: [24, 18, 10, 10, 30] }
      ]).catch(function (err) { toast(err.message, 'err'); }).then(function () { busy(btn, false); });
    };
  }

  /* ───────── 서류함 ───────── */

  var DOC_CATS = ['사업자등록증', '통장사본', '법인등기부등본', '인감증명서', '운송사업 허가증', '보험증권', '계약서', '견적서 양식', '기타'];
  var DOC_MAX = 20 * 1024 * 1024;

  function docDays(d) {
    if (!d.expires) return null;
    var t = new Date(today() + 'T00:00:00'), e = new Date(d.expires + 'T00:00:00');
    return Math.round((e - t) / 86400000);
  }
  function docBadge(d) {
    var n = docDays(d);
    if (n == null) return '<span class="muted small">–</span>';
    if (n < 0) return '<span class="badge exp-x">만료됨</span> <span class="small muted">' + esc(d.expires) + '</span>';
    if (n <= 30) return '<span class="badge exp-soon">D-' + n + '</span> <span class="small muted">' + esc(d.expires) + '</span>';
    return '<span class="small">' + esc(d.expires) + '</span>';
  }
  function fileSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB'; }
  function docKind(d) {
    var m = d.mime || '', ext = (d.fileName.match(/\.([^.]+)$/) || ['', ''])[1].toLowerCase();
    if (/^image\//.test(m)) return 'img';
    if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
    if (/sheet|excel/.test(m) || /^xlsx?$|^csv$/.test(ext)) return 'xls';
    if (/word|hwp/.test(m) || /^docx?$|^hwpx?$/.test(ext)) return 'doc';
    return 'etc';
  }
  var DOC_ICON = { img: '🖼', pdf: 'PDF', xls: 'XLS', doc: 'DOC', etc: 'FILE' };
  /** 엑셀 미리보기: 시트 탭 + 표 (시트당 최대 500줄 · 40열) */
  function xlsPreview(v, blob) {
    v.innerHTML = '<p class="muted"><span class="spinner dark"></span> 엑셀 읽는 중…</p>';
    Promise.all([loadXlsx(), blob.arrayBuffer()]).then(function (r) {
      var X = r[0], wb = X.read(r[1], { type: 'array', cellDates: true }), names = wb.SheetNames, cur = 0;
      var draw = function () {
        var ws = wb.Sheets[names[cur]], rows = X.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: false });
        var nc = Math.min(40, rows.reduce(function (a, x) { return Math.max(a, x.length); }, 0)), more = rows.length > 500;
        var colName = function (i) { var t = ''; i++; while (i) { var mm = (i - 1) % 26; t = String.fromCharCode(65 + mm) + t; i = Math.floor((i - 1) / 26); } return t; };
        v.innerHTML = (names.length > 1 ? '<div class="xls-tabs">' + names.map(function (n, i) { return '<button type="button" class="' + (i === cur ? 'on' : '') + '" data-i="' + i + '">' + esc(n) + '</button>'; }).join('') + '</div>' : '') +
          '<div class="xls-wrap"><table class="xls-tbl"><thead><tr><th></th>' + Array.apply(null, Array(nc)).map(function (_, i) { return '<th>' + colName(i) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          (rows.length ? rows.slice(0, 500).map(function (row, ri) { return '<tr><th>' + (ri + 1) + '</th>' + Array.apply(null, Array(nc)).map(function (_, i) { return '<td>' + esc(row[i] == null ? '' : row[i]) + '</td>'; }).join('') + '</tr>'; }).join('') : '<tr><td class="muted" style="padding:16px">빈 시트예요.</td></tr>') +
          '</tbody></table></div>' + (more ? '<p class="hint" style="margin:6px 0 0">처음 500줄만 보여요. 전체는 다운로드해서 여세요.</p>' : '');
        $$('.xls-tabs button', v).forEach(function (b) { b.onclick = function () { cur = +b.dataset.i; draw(); }; });
      };
      v.classList.add('xls-mode'); draw();
    }).catch(function (err) { v.innerHTML = '<p class="err-text">엑셀을 읽지 못했어요: ' + esc(err.message) + '</p>'; });
  }

  function renderDocs() {
    var ds = state.docs;
    $('#main').innerHTML =
      '<div class="card">' +
      '<div class="row-between" style="flex-wrap:wrap;margin-bottom:14px"><div><div class="eyebrow">Documents · 서류함</div><h2>회사 서류함</h2>' +
      '<p class="muted small" style="margin:6px 0 0">사업자등록증·통장사본·허가증·견적서 양식 등을 보관하고 바로 미리보기·다운로드합니다. 파일은 회사 구글 드라이브 비공개 폴더에 저장돼요.</p></div>' +
      '<div class="actions"><button class="btn btn-sm" id="dReload">새로고침</button><button class="btn btn-sm btn-primary" id="dUp">＋ 서류 올리기</button></div></div>' +
      '<div id="dAlert"></div>' +
      '<div class="toolbar">' +
      '<div class="segmented" id="dBiz">' + [''].concat(BIZ_LIST).concat(['공통']).map(function (b) { return '<button type="button" data-b="' + b + '" class="' + (ds.biz === b ? 'on' : '') + '">' + (b || '전체') + '</button>'; }).join('') + '</div>' +
      '<select class="input input-sm" id="dCat" style="width:auto"><option value="">모든 분류</option></select>' +
      '<input class="input input-sm" id="dQ" placeholder="서류명·파일명·메모 검색" value="' + esc(ds.q) + '" style="max-width:240px">' +
      '<button class="btn btn-sm" id="dZip" style="margin-left:auto" disabled>선택 ZIP 다운로드</button>' +
      '</div><div id="dList"></div></div>';
    $$('#dBiz button').forEach(function (b) { b.onclick = function () { ds.biz = b.dataset.b; $$('#dBiz button').forEach(function (x) { x.classList.toggle('on', x === b); }); drawDocs(); }; });
    $('#dCat').onchange = function () { ds.cat = this.value; drawDocs(); };
    var st; $('#dQ').oninput = function () { var v = this.value; clearTimeout(st); st = setTimeout(function () { ds.q = v.trim(); drawDocs(); }, 200); };
    $('#dReload').onclick = function () { ds.list = null; loadDocs(); };
    $('#dUp').onclick = function () { openDocEdit(null); };
    $('#dZip').onclick = function () { zipDocs(this); };
    if (ds.list) drawDocs(); else loadDocs();
  }

  function loadDocs() {
    var l = $('#dList'); if (l) l.innerHTML = '<p class="muted"><span class="spinner dark"></span> 불러오는 중…</p>';
    return api('docs.list').then(function (r) {
      state.docs.list = r.docs;
      if (state.view === 'docs') drawDocs();
    }).catch(function (err) { var x = $('#dList'); if (x) x.innerHTML = '<p style="color:var(--red)">' + esc(err.message) + '</p>' + (/드라이브|Drive|권한|permission/i.test(err.message) ? '<p class="hint">서버 구글 시트 메뉴 <b>조일그룹 시스템 → 서류함 준비 (드라이브 권한)</b>을 한 번 실행해야 합니다.</p>' : ''); });
  }

  function drawDocs() {
    syncRoute();
    var ds = state.docs, list = $('#dList'); if (!list || !ds.list) return;
    var cats = {}; ds.list.forEach(function (d) { cats[d.cat] = (cats[d.cat] || 0) + 1; });
    var catSel = $('#dCat');
    catSel.innerHTML = '<option value="">모든 분류</option>' + Object.keys(cats).sort().map(function (c) { return '<option value="' + esc(c) + '"' + (ds.cat === c ? ' selected' : '') + '>' + esc(c) + ' (' + cats[c] + ')</option>'; }).join('');
    var q = ds.q;
    var items = ds.list.filter(function (d) {
      if (ds.biz === '공통' ? d.biz : (ds.biz && d.biz !== ds.biz)) return false;
      if (ds.cat && d.cat !== ds.cat) return false;
      return !q || (d.name + ' ' + d.fileName + ' ' + d.memo + ' ' + d.cat + ' ' + d.biz).indexOf(q) !== -1;
    }).sort(function (a, b) { return (a.biz || '~').localeCompare(b.biz || '~') || a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name); });
    var soon = ds.list.filter(function (d) { var n = docDays(d); return n != null && n <= 30; });
    $('#dAlert').innerHTML = soon.length ? '<div class="doc-alert"><b>만료 확인</b> ' + soon.map(function (d) { var n = docDays(d); return esc((d.biz ? d.biz + ' ' : '') + d.name) + ' <span class="badge ' + (n < 0 ? 'exp-x">만료됨' : 'exp-soon">D-' + n) + '</span>'; }).join(' · ') + '</div>' : '';
    Object.keys(ds.sel).forEach(function (id) { if (!ds.list.some(function (d) { return d.id === id; })) delete ds.sel[id]; });
    if (!items.length) {
      list.innerHTML = '<p class="muted" style="margin:18px 0 4px">' + (ds.list.length ? '조건에 맞는 서류가 없습니다.' : '아직 올린 서류가 없어요. <b>＋ 서류 올리기</b>로 사업자등록증부터 넣어 보세요.') + '</p>';
    } else {
      list.innerHTML = '<div class="table-wrap"><table class="data docs"><thead><tr><th class="chk"><input type="checkbox" id="dAll" aria-label="모두 선택"></th><th class="left">서류</th><th class="left">사업자</th><th class="left">분류</th><th class="left">발급일</th><th class="left">만료일</th><th>크기</th><th class="left">올린 사람</th><th></th></tr></thead><tbody>' +
        items.map(function (d) {
          var k = docKind(d);
          return '<tr data-id="' + esc(d.id) + '"><td class="chk"><input type="checkbox" data-sel' + (ds.sel[d.id] ? ' checked' : '') + '></td>' +
            '<td class="left"><button class="doc-name" data-act="view"><span class="ficon f-' + k + '">' + DOC_ICON[k] + '</span><span><b>' + esc(d.name) + '</b><small>' + esc(d.fileName) + (d.memo ? ' · ' + esc(d.memo) : '') + '</small></span></button></td>' +
            '<td class="left">' + (d.biz ? esc(d.biz) : '<span class="muted">공통</span>') + '</td><td class="left">' + esc(d.cat) + '</td>' +
            '<td class="left small">' + esc(d.issued || '–') + '</td><td class="left">' + docBadge(d) + '</td>' +
            '<td class="num small">' + fileSize(d.size) + '</td><td class="left small muted">' + esc(String(d.by).replace(/ \(.*\)$/, '')) + '<br>' + esc(String(d.at).slice(0, 10)) + '</td>' +
            '<td class="doc-acts"><button class="btn btn-sm" data-act="dl">다운로드</button><button class="btn btn-sm btn-ghost" data-act="edit">수정</button></td></tr>';
        }).join('') + '</tbody></table></div>';
      var all = $('#dAll');
      all.checked = items.every(function (d) { return ds.sel[d.id]; });
      all.onchange = function () { var on = this.checked; items.forEach(function (d) { if (on) ds.sel[d.id] = true; else delete ds.sel[d.id]; }); drawDocs(); };
      $$('tr[data-id]', list).forEach(function (tr) {
        var d = ds.list.filter(function (x) { return x.id === tr.dataset.id; })[0];
        $('[data-sel]', tr).onchange = function () { if (this.checked) ds.sel[d.id] = true; else delete ds.sel[d.id]; updZip(); };
        $('[data-act="view"]', tr).onclick = function () { previewDoc(d); };
        $('[data-act="dl"]', tr).onclick = function () { var b = this; busy(b, true, '…'); docBlob(d).then(function (bl) { saveBlob(bl, d.fileName); }).catch(function (err) { toast(err.message, 'err'); }).then(function () { busy(b, false); }); };
        $('[data-act="edit"]', tr).onclick = function () { openDocEdit(d); };
      });
    }
    updZip();
    function updZip() { var n = Object.keys(ds.sel).length, z = $('#dZip'); if (z) { z.disabled = !n; z.textContent = n ? '선택 ' + n + '개 ZIP 다운로드' : '선택 ZIP 다운로드'; } }
  }

  /** 파일 내용 받기 (한 번 받은 건 이 화면에서 다시 안 받음) */
  function docBlob(d) {
    var cache = state.docs.blobs;
    if (cache[d.id]) return Promise.resolve(cache[d.id]);
    return api('docs.get', { id: d.id }).then(function (r) {
      var bl = new Blob([bytesFromB64(r.data)], { type: d.mime || 'application/octet-stream' });
      if (d.size < 8 * 1024 * 1024) cache[d.id] = bl;
      return bl;
    });
  }

  function previewDoc(d) {
    var k = docKind(d), url = null;
    var close = modal({
      wide: true, eyebrow: (d.biz || '공통') + ' · ' + d.cat, title: d.name,
      body: '<div class="doc-meta small muted">' + esc(d.fileName) + ' · ' + fileSize(d.size) + (d.issued ? ' · 발급 ' + esc(d.issued) : '') + (d.expires ? ' · 만료 ' + esc(d.expires) : '') + ' · ' + esc(d.by) + ' ' + esc(d.at) + (d.memo ? '<br>' + esc(d.memo) : '') + '</div>' +
        '<div class="doc-view" id="dView"><p class="muted"><span class="spinner dark"></span> 불러오는 중…</p></div>',
      foot: '<button class="btn btn-danger btn-sm" id="dDel" style="margin-right:auto">삭제</button><button class="btn" data-close>닫기</button><button class="btn btn-primary" id="dDl">다운로드</button>',
      onMount: function (m, closeFn) {
        var obs = new MutationObserver(function () { if (!document.body.contains(m)) { if (url) URL.revokeObjectURL(url); obs.disconnect(); } });
        obs.observe(document.body, { childList: true });
        docBlob(d).then(function (bl) {
          var v = $('#dView', m); if (!v) return;
          url = URL.createObjectURL(bl);
          if (k === 'img') v.innerHTML = '<img src="' + url + '" alt="' + esc(d.name) + '">';
          else if (k === 'pdf') v.innerHTML = '<iframe src="' + url + '" title="' + esc(d.name) + '"></iframe>';
          else if (k === 'xls') xlsPreview(v, bl);
          else v.innerHTML = '<div class="empty" style="min-height:160px"><div><div class="ficon big f-' + k + '">' + DOC_ICON[k] + '</div><p class="muted">이 형식은 미리보기를 지원하지 않아요. 다운로드해서 여세요.</p></div></div>';
        }).catch(function (err) { var v = $('#dView', m); if (v) v.innerHTML = '<p style="color:var(--red)">' + esc(err.message) + '</p>'; });
        $('#dDl', m).onclick = function () { var b = this; busy(b, true, '…'); docBlob(d).then(function (bl) { saveBlob(bl, d.fileName); }).catch(function (err) { toast(err.message, 'err'); }).then(function () { busy(b, false); }); };
        $('#dDel', m).onclick = function () {
          if (!confirm('"' + d.name + '" 서류를 삭제할까요? 드라이브 휴지통으로 이동합니다.')) return;
          var b = this; busy(b, true, '삭제 중…');
          api('docs.delete', { id: d.id }).then(function () {
            closeFn(); state.docs.list = state.docs.list.filter(function (x) { return x.id !== d.id; }); delete state.docs.sel[d.id];
            toast('삭제했습니다.'); if (state.view === 'docs') drawDocs();
          }).catch(function (err) { busy(b, false); toast(err.message, 'err'); });
        };
      }
    });
    return close;
  }

  function readFileB64(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(',')[1] || ''); };
      fr.onerror = function () { reject(new Error('파일을 읽을 수 없습니다.')); };
      fr.readAsDataURL(file);
    });
  }

  /** 서류 올리기(d 없음) · 정보 수정(d 있음) */
  function openDocEdit(d) {
    var isNew = !d, v = d || { biz: state.docs.biz && state.docs.biz !== '공통' ? state.docs.biz : '', cat: state.docs.cat || '', name: '', issued: '', expires: '', memo: '' };
    var file = null;
    modal({
      eyebrow: '서류함', title: isNew ? '서류 올리기' : '서류 정보 수정',
      body:
        (isNew ? '<label class="drop" id="dDrop"><input type="file" id="dFile" hidden><span id="dFileTxt"><b>파일 고르기</b> 또는 여기로 끌어다 놓기<br><span class="small muted">PDF · 이미지 · 엑셀 · 한글 등 20MB까지</span></span></label>' : '') +
        '<div class="field"><label>서류명 <span style="color:var(--red)">*</span></label><input class="input" id="dName" maxlength="100" value="' + esc(v.name) + '" placeholder="예) 사업자등록증"></div>' +
        '<div class="field"><label>사업자</label><div class="segmented" id="dBizSel">' + [''].concat(BIZ_LIST).map(function (b) { return '<button type="button" data-v="' + b + '" class="' + (v.biz === b ? 'on' : '') + '">' + (b || '공통') + '</button>'; }).join('') + '</div></div>' +
        '<div class="field"><label>분류</label><input class="input" id="dCatIn" list="docCats" maxlength="30" value="' + esc(v.cat) + '" placeholder="골라도 되고 직접 써도 돼요"><datalist id="docCats">' + DOC_CATS.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist></div>' +
        '<div class="qd-two"><div class="field"><label>발급일</label><input class="input" id="dIss" type="date" value="' + esc(v.issued) + '"></div>' +
        '<div class="field"><label>만료일 <span class="muted">(있으면)</span></label><input class="input" id="dExp" type="date" value="' + esc(v.expires) + '"></div></div>' +
        '<div class="field"><label>메모</label><input class="input" id="dMemo" maxlength="500" value="' + esc(v.memo) + '" placeholder="예) 2026년 갱신본, 원본 스캔"></div>' +
        (isNew ? '' : '<p class="hint" style="margin:0">파일을 바꾸려면 이 서류를 지우고 새로 올리세요.</p>'),
      foot: '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="dSave">' + (isNew ? '올리기' : '저장') + '</button>',
      onMount: function (m, close) {
        $$('#dBizSel button', m).forEach(function (b) { b.onclick = function () { $$('#dBizSel button', m).forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
        if (!$('#dBizSel button.on', m)) $('#dBizSel button', m).classList.add('on');
        if (isNew) {
          var pick = function (f) {
            if (!f) return;
            if (f.size > DOC_MAX) { toast('파일은 20MB까지 올릴 수 있습니다.', 'err'); return; }
            file = f;
            $('#dFileTxt', m).innerHTML = '<b>' + esc(f.name) + '</b><br><span class="small muted">' + fileSize(f.size) + ' · 다른 파일을 고르려면 다시 누르세요</span>';
            var nm = $('#dName', m); if (!nm.value.trim()) nm.value = f.name.replace(/\.[^.]+$/, '');
            var ci = $('#dCatIn', m); if (!ci.value) { var g = DOC_CATS.filter(function (c) { return c !== '기타' && f.name.indexOf(c.replace(/ /g, '')) !== -1; })[0]; if (g) ci.value = g; }
          };
          $('#dFile', m).onchange = function () { pick(this.files[0]); };
          var dz = $('#dDrop', m);
          dz.ondragover = function (e) { e.preventDefault(); dz.classList.add('over'); };
          dz.ondragleave = function () { dz.classList.remove('over'); };
          dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove('over'); pick(e.dataTransfer.files[0]); };
        }
        $('#dSave', m).onclick = function () {
          var meta = { name: $('#dName', m).value.trim(), biz: $('#dBizSel button.on', m).dataset.v, cat: $('#dCatIn', m).value.trim() || '기타', issued: $('#dIss', m).value, expires: $('#dExp', m).value, memo: $('#dMemo', m).value.trim() };
          if (isNew && !file) return toast('올릴 파일을 고르세요.', 'err');
          if (!meta.name) return toast('서류명을 입력하세요.', 'err');
          var btn = this; busy(btn, true, isNew ? '올리는 중…' : '저장 중…');
          var p = isNew
            ? readFileB64(file).then(function (b64) { return api('docs.upload', Object.assign({ fileName: file.name, mime: file.type || 'application/octet-stream', data: b64 }, meta)); })
            : api('docs.update', { id: d.id, patch: meta });
          p.then(function (r) {
            close();
            var ds = state.docs;
            if (ds.list) { ds.list = ds.list.filter(function (x) { return x.id !== r.doc.id; }); ds.list.push(r.doc); }
            toast(isNew ? '서류를 올렸습니다.' : '저장했습니다.');
            if (state.view === 'docs') { if (ds.list) drawDocs(); else loadDocs(); }
          }).catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
        };
      }
    });
  }

  function zipDocs(btn) {
    var ids = Object.keys(state.docs.sel);
    if (!ids.length) return;
    if (ids.length > 50) return toast('한 번에 50개까지 묶을 수 있어요.', 'err');
    busy(btn, true, '묶는 중…');
    api('docs.zip', { ids: ids }).then(function (r) {
      saveBlob(new Blob([bytesFromB64(r.data)], { type: 'application/zip' }), '서류_' + today() + '.zip');
    }).catch(function (err) { toast(err.message, 'err'); }).then(function () { busy(btn, false); var z = $('#dZip'); if (z) z.textContent = '선택 ' + ids.length + '개 ZIP 다운로드'; });
  }

  /* ───────── 견적 ↔ 실적 연결 (B1) ───────── */

  function linkRows(link) {
    var out = [];
    state.an.rows.forEach(function (r) {
      if (r[C.hidden] || r[C.cat]) return;
      if (r[C.disp] !== link.cust) return;
      if (link.from && r[C.from] !== link.from) return;
      if (link.to && r[C.to] !== link.to) return;
      if (link.weight && r[C.weight] !== link.weight) return;
      if (link.since && r[C.date].slice(0, 7) < link.since) return;
      out.push(r);
    });
    return out;
  }

  function drawQuoteLink(d, box) {
    if (!box || !can('analysis')) return;
    var q = d.quote, an = state.an, id = q.id;
    if (!an.rows) {
      box.innerHTML = '<div class="card muted"><span class="spinner dark"></span> 실적 비교용 분석 데이터를 불러오는 중…</div>';
      loadAnalysis().then(function () { if (state.quotes.detail === id) drawQuoteLink(d, $('#qLink')); })
        .catch(function (err) { box.innerHTML = '<div class="card"><p style="margin:0">' + esc(err.message) + '</p></div>'; });
      return;
    }
    var l = q.link;
    if (!l) {
      box.innerHTML = '<div class="card qlink"><div class="row-between" style="flex-wrap:wrap;gap:10px"><div><div class="eyebrow">Actual · 실적 연결</div><h3>수주 후 실제 운송 실적과 비교</h3>' +
        '<p class="muted small" style="margin:4px 0 0">매출처·경로를 연결하면 이 견적 단가와 실제 매출·매입·이익을 월별로 나란히 봅니다.</p></div>' +
        '<button class="btn btn-sm btn-primary" id="qlSet">실적 연결하기</button></div></div>';
      $('#qlSet').onclick = function () { openLinkPicker(d); };
      return;
    }
    var rows = linkRows(l), byM = {};
    rows.forEach(function (r) { var m = r[C.date].slice(0, 7), x = byM[m] || (byM[m] = { n: 0, s: 0, b: 0 }); x.n++; x.s += r[C.sales]; x.b += r[C.buys]; });
    var months = Object.keys(byM).sort();
    var t = agg(rows), avgS = t.n ? t.s / t.n : 0, avgB = t.n ? t.b / t.n : 0;
    var gap = l.price && t.n ? (avgS - l.price) / l.price * 100 : null;
    var desc = [l.from, l.to].filter(Boolean).join(' → ') + (l.weight ? ' · ' + l.weight : '');
    box.innerHTML = '<div class="card qlink"><div class="row-between" style="flex-wrap:wrap;gap:10px;margin-bottom:12px"><div><div class="eyebrow">Actual · 실적 연결</div>' +
      '<h3>' + esc(l.cust) + (desc ? ' <span class="muted small">' + esc(desc) + '</span>' : '') + '</h3>' +
      '<p class="muted small" style="margin:4px 0 0">' + (l.since ? esc(l.since) + '부터' : '전체 기간') + ' · 운송 오더 기준</p></div>' +
      '<div class="actions"><button class="btn btn-sm" id="qlGo">분석에서 보기</button><button class="btn btn-sm" id="qlEdit">연결 바꾸기</button><button class="btn btn-sm btn-ghost" id="qlOff">연결 해제</button></div></div>' +
      (t.n ? '<div class="kpis mini">' +
        '<div class="kpi"><div class="k">실적 건수</div><div class="v num">' + won(t.n) + '건</div><div class="s">' + months.length + '개월</div></div>' +
        '<div class="kpi"><div class="k">건당 평균 매출</div><div class="v num">' + won(Math.round(avgS)) + '원</div><div class="s">' + (l.price ? '견적 ' + won(l.price) + '원 ' + deltaHtml(gap, '%', true) + (l.ton ? ' <span class="muted">(' + esc(l.ton) + ')</span>' : '') : '견적 단가 미입력') + '</div></div>' +
        '<div class="kpi"><div class="k">건당 평균 매입</div><div class="v num">' + won(Math.round(avgB)) + '원</div><div class="s">' + (l.price ? '견적 대비 매입 ' + pctText(avgB / l.price * 100) : '') + '</div></div>' +
        '<div class="kpi"><div class="k">이익 · 이익률</div><div class="v num' + (t.p < 0 ? ' neg' : '') + '">' + won(t.p) + '원</div><div class="s">' + pctText(t.r) + '</div></div></div>' +
        '<div class="table-wrap" style="margin-top:12px"><table class="data grp mini"><thead><tr><th class="left">월</th><th>건수</th><th>매출</th><th>매입</th><th>이익</th><th>이익률</th><th>건당 매출</th>' + (l.price ? '<th>견적 대비</th>' : '') + '</tr></thead><tbody>' +
        months.slice().reverse().map(function (m) {
          var x = byM[m], p = x.s - x.b, a = x.s / x.n;
          return '<tr><td class="left">' + m + '</td><td class="num">' + won(x.n) + '</td><td class="num">' + won(x.s) + '</td><td class="num">' + won(x.b) + '</td><td class="num' + (p < 0 ? ' neg' : '') + '">' + won(p) + '</td><td class="num">' + pctText(pct(p, x.s)) + '</td><td class="num">' + won(Math.round(a)) + '</td>' +
            (l.price ? '<td class="num">' + deltaHtml((a - l.price) / l.price * 100, '%', true) + '</td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>'
        : '<p class="muted" style="margin:0">조건에 맞는 실적이 아직 없어요. 다음 달 데이터를 올리면 자동으로 나타납니다.</p>') + '</div>';
    $('#qlEdit').onclick = function () { openLinkPicker(d); };
    $('#qlOff').onclick = function () {
      if (!confirm('실적 연결을 해제할까요?')) return;
      var b = this; busy(b, true, '…');
      api('quotes.update', { id: q.id, patch: { link: null } }).then(function (r) { d.quote = r.quote; state.quotes.list = null; drawQuoteLink(d, $('#qLink')); })
        .catch(function (err) { busy(b, false); toast(err.message, 'err'); });
    };
    $('#qlGo').onclick = function () {
      var f = an.f, ms = anMonths();
      f.sel = { cust: [l.cust] };
      if (l.from) f.sel.from = [l.from];
      if (l.to) f.sel.to = [l.to];
      if (l.weight) f.sel.weight = [l.weight];
      f.to = ms[ms.length - 1] || f.to; f.from = l.since && ms.indexOf(l.since) !== -1 ? l.since : (ms.filter(function (m) { return m >= (l.since || ''); })[0] || f.to);
      an.dim = 'month';
      state.view = 'analysis'; render();
    };
  }

  function openLinkPicker(d) {
    var q = d.quote, an = state.an, l = q.link || {};
    var custs = {};
    an.rows.forEach(function (r) { if (!r[C.hidden] && !r[C.cat]) custs[r[C.disp]] = (custs[r[C.disp]] || 0) + r[C.sales]; });
    var custList = Object.keys(custs).sort(function (a, b) { return custs[b] - custs[a]; });
    var it = d.items && d.items[0] && d.items[0].result;
    var tons = (d.meta.tons || state.pub.tons);
    var priceFor = function (t) { if (!it || d.meta.type !== '단건') return ''; var x = it.rows.filter(function (y) { return y.ton === t; })[0]; return x ? x.total : ''; };
    var guess = l.cust || (custList.filter(function (c) { return q.client && (c.indexOf(q.client) !== -1 || q.client.indexOf(c) !== -1); })[0] || '');
    modal({
      eyebrow: '실적 연결', title: q.name,
      body:
        '<div class="field"><label>매출처 <span style="color:var(--red)">*</span> <span class="muted">(분석의 표시 이름)</span></label><input class="input" id="lkCust" list="lkCusts" value="' + esc(guess) + '" placeholder="이름 일부를 입력하면 골라져요"><datalist id="lkCusts">' + custList.slice(0, 3000).map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist></div>' +
        '<div class="qd-two"><div class="field"><label>발지</label><select class="input" id="lkFrom"></select></div><div class="field"><label>착지</label><select class="input" id="lkTo"></select></div></div>' +
        '<div class="qd-two"><div class="field"><label>중량</label><select class="input" id="lkW"></select></div><div class="field"><label>언제부터 (수주 시작 월)</label><select class="input" id="lkSince"><option value="">전체 기간</option>' + anMonths().slice().reverse().map(function (m) { return '<option' + (l.since === m ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select></div></div>' +
        '<div class="qd-two"><div class="field"><label>비교할 톤수</label><select class="input" id="lkTon"><option value="">직접 입력</option>' + tons.map(function (t) { return '<option' + (l.ton === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label>견적 단가 (건당, 원)</label><input class="input" id="lkPrice" inputmode="numeric" value="' + esc(l.price ? won(l.price) : '') + '" placeholder="예) 450,000"></div></div>' +
        '<p class="hint" id="lkCount" style="margin:0"></p>',
      foot: '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="lkSave">연결</button>',
      onMount: function (m, close) {
        var cur = { from: l.from || '', to: l.to || '', weight: l.weight || '' };
        function opts(sel, key, list) {
          var el = $(sel, m), counts = {};
          list.forEach(function (r) { counts[r[key]] = (counts[r[key]] || 0) + 1; });
          var names = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
          el.innerHTML = '<option value="">전체</option>' + names.map(function (n) { return '<option value="' + esc(n) + '">' + esc(n || '(빈칸)') + ' · ' + counts[n] + '건</option>'; }).join('');
          return el;
        }
        function refresh() {
          var c = $('#lkCust', m).value.trim();
          var base = custs[c] ? an.rows.filter(function (r) { return !r[C.hidden] && !r[C.cat] && r[C.disp] === c; }) : [];
          var f1 = opts('#lkFrom', C.from, base); if (!base.some(function (r) { return r[C.from] === cur.from; })) cur.from = ''; f1.value = cur.from;
          var b2 = base.filter(function (r) { return !cur.from || r[C.from] === cur.from; });
          var f2 = opts('#lkTo', C.to, b2); if (!b2.some(function (r) { return r[C.to] === cur.to; })) cur.to = ''; f2.value = cur.to;
          var b3 = b2.filter(function (r) { return !cur.to || r[C.to] === cur.to; });
          var f3 = opts('#lkW', C.weight, b3); if (!b3.some(function (r) { return r[C.weight] === cur.weight; })) cur.weight = ''; f3.value = cur.weight;
          var n = linkRows({ cust: c, from: cur.from, to: cur.to, weight: cur.weight, since: $('#lkSince', m).value }).length;
          $('#lkCount', m).innerHTML = !c ? '매출처를 고르세요.' : !custs[c] ? '<span style="color:var(--red)">분석 데이터에 없는 매출처입니다.</span>' : '조건에 맞는 실적 <b>' + won(n) + '건</b>';
        }
        $('#lkCust', m).oninput = refresh;
        $('#lkFrom', m).onchange = function () { cur.from = this.value; refresh(); };
        $('#lkTo', m).onchange = function () { cur.to = this.value; refresh(); };
        $('#lkW', m).onchange = function () { cur.weight = this.value; refresh(); };
        $('#lkSince', m).onchange = refresh;
        $('#lkTon', m).onchange = function () { var p = priceFor(this.value); if (p) $('#lkPrice', m).value = won(p); };
        $('#lkPrice', m).oninput = function () { var n = this.value.replace(/[^\d]/g, ''); this.value = n ? won(Number(n)) : ''; };
        refresh();
        $('#lkSave', m).onclick = function () {
          var c = $('#lkCust', m).value.trim();
          if (!custs[c]) return toast('분석 데이터에 있는 매출처를 고르세요.', 'err');
          var link = { cust: c, from: cur.from, to: cur.to, weight: cur.weight, since: $('#lkSince', m).value, ton: $('#lkTon', m).value, price: Number($('#lkPrice', m).value.replace(/[^\d]/g, '')) || 0 };
          var btn = this; busy(btn, true, '저장 중…');
          api('quotes.update', { id: q.id, patch: { link: link } }).then(function (r) {
            close(); d.quote = r.quote; state.quotes.list = null; toast('실적을 연결했습니다.'); drawQuoteLink(d, $('#qLink'));
          }).catch(function (err) { busy(btn, false); toast(err.message, 'err'); });
        };
      }
    });
  }

  /* ───────── 홈 (C4) ───────── */
  /* 권한에 맞는 카드만: 오늘 경유가 · 이번 달 실적과 확인해 볼 곳 · 만료 임박 서류 · 최근 내 견적·조회 */

  /* ───────── 관심 종목 (홈 카드 · 네이버 금융 시세) ───────── */
  var stockTimer = null;
  function myStocks() { var v = local('get', 'joil-stocks'); return Array.isArray(v) ? v.slice(0, 5) : []; }
  function tzNow(tz) { try { var p = new Date().toLocaleString('en-US', { timeZone: tz, hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit' }).split(/[\s,:]+/); return { d: p[0], m: (+p[1] % 24) * 60 + +p[2] }; } catch (e) { return null; } }
  /** 국내: 한국 시간 평일 09:00~15:40 · 미국(.O .N .K .A): 뉴욕 시간 평일 09:30~16:10 (서머타임 자동) · 그 밖의 해외는 늘 갱신 */
  function marketOpen(code) {
    var us = /\.(O|N|K|A)$/i.test(code || ''), kr = /^\d{6}$/.test(code || '');
    if (!kr && !us && code) return true;
    var t = tzNow(us ? 'America/New_York' : 'Asia/Seoul'); if (!t) return true;
    return t.d !== 'Sat' && t.d !== 'Sun' && (us ? t.m >= 570 && t.m <= 970 : t.m >= 540 && t.m <= 940);
  }
  function stkCls(v) { return v > 0 ? 'up' : v < 0 ? 'down' : ''; }
  function stkSign(v) { return v > 0 ? '▲' : v < 0 ? '▼' : ''; }
  function stkNum(v, dec) { return v == null ? '–' : Number(v).toLocaleString('ko-KR', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }); }
  function stkMoney(x, v) { return (x.foreign ? (x.sym || '$') : '') + stkNum(v, x.foreign ? 2 : 0); }
  function homeStocks() {
    var el = $('#hcStock'); if (!el) return;
    clearTimeout(stockTimer);
    var list = myStocks();
    var head = function (extra) { return '<div class="row-between"><div class="eyebrow">Stocks · 관심 종목</div><span class="actions">' + (extra || '') + '<button class="btn btn-sm btn-ghost" id="stkEdit">종목 설정</button></span></div>'; };
    if (!list.length) {
      el.innerHTML = head() + '<p class="muted small" style="margin:10px 0 0">"종목 설정"에서 보고 싶은 국내·해외 종목을 5개까지 넣어 보세요.<br>예) 삼성전자, CJ대한통운, 애플, 테슬라</p>';
      $('#stkEdit').onclick = openStockEdit; return;
    }
    api('stock.quotes', { codes: list.map(function (x) { return x.code; }) }).then(function (r) {
      if (!$('#hcStock') || state.view !== 'home') return;
      var q = r.quotes, open = list.some(function (x) { return marketOpen(x.code); });
      var row = function (x) {
        var mine = list.filter(function (y) { return y.code === x.code; })[0] || {}, nm = x.error ? (mine.name || x.code) : x.name, tk = mine.ticker || x.code;
        if (x.error) return '<li class="stk-row"><span class="stk-n">' + esc(nm) + '</span><span class="small muted" title="' + esc(x.error) + '">시세를 못 받았어요</span></li>';
        return '<li class="stk-row"><button data-stk="' + esc(x.code) + '" data-nm="' + esc(nm) + '"><span class="stk-n">' + esc(nm) + ' <small class="muted">' + esc(tk) + (x.foreign ? ' · 해외' : '') + '</small></span>' +
          '<span class="stk-p ' + stkCls(x.diff) + '"><b>' + stkMoney(x, x.price) + '</b><small>' + stkSign(x.diff) + ' ' + stkMoney(x, Math.abs(x.diff || 0)) + ' (' + (x.rate > 0 ? '+' : '') + (x.rate == null ? '–' : x.rate.toFixed(2)) + '%)</small></span></button></li>';
      };
      el.innerHTML = head('<span class="small muted">' + (open ? '<span class="stk-live"></span>장중 · 1분마다' : '장 마감 · 종가') + '</span>') +
        '<ul class="stk-list">' + q.map(row).join('') + '</ul>' +
        '<p class="hint" style="margin:6px 0 0">네이버 금융 기준 · ' + esc(String(r.at).slice(11, 16)) + ' 받음 · 누르면 3개월 그래프</p>';
      $('#stkEdit').onclick = openStockEdit;
      $$('[data-stk]', el).forEach(function (b) { b.onclick = function () { openStockChart(b.dataset.stk, b.dataset.nm, q.filter(function (x) { return x.code === b.dataset.stk; })[0]); }; });
      if (open) stockTimer = setTimeout(function tick() { if (state.view !== 'home' || !$('#hcStock')) return; if (document.hidden) stockTimer = setTimeout(tick, 60000); else homeStocks(); }, 60000);
    }).catch(function (err) {
      if (!$('#hcStock')) return;
      el.innerHTML = head() + '<p class="small" style="color:var(--red);margin:8px 0 0">' + esc(err.message) + '</p>';
      $('#stkEdit').onclick = openStockEdit;
    });
  }
  function openStockEdit() {
    var list = myStocks();
    modal({ eyebrow: '관심 종목', title: '종목 설정 (최대 5개)',
      body: '<div class="field"><label>종목 찾기</label><input class="input" id="skQ" placeholder="종목 이름·티커·6자리 코드 (예: 삼성전자, 애플, TSLA, 005930)" autocomplete="off"></div><ul class="stk-found" id="skFound"></ul>' +
        '<h4 style="margin:12px 0 6px">내 종목 <span class="muted small" id="skN"></span></h4><ul class="stk-mine" id="skMine"></ul><p class="hint" style="margin:8px 0 0">국내·해외 섞어서 고를 수 있어요. 내 브라우저에만 저장돼요 (사람마다 따로).</p>',
      foot: '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="skSave">저장</button>',
      onMount: function (m, close) {
        var drawMine = function () {
          $('#skN', m).textContent = list.length + ' / 5';
          $('#skMine', m).innerHTML = list.length ? list.map(function (x, i) { return '<li><span><b>' + esc(x.name) + '</b> <small class="muted">' + esc(x.ticker || x.code) + (x.foreign ? ' · 해외' : '') + '</small></span><span class="actions"><button class="btn btn-sm btn-ghost" data-up="' + i + '"' + (i ? '' : ' disabled') + '>▲</button><button class="btn btn-sm btn-ghost" data-rm="' + i + '">빼기</button></span></li>'; }).join('') : '<li class="muted small">아직 없어요.</li>';
          $$('[data-rm]', m).forEach(function (b) { b.onclick = function () { list.splice(+b.dataset.rm, 1); drawMine(); }; });
          $$('[data-up]', m).forEach(function (b) { b.onclick = function () { var i = +b.dataset.up; var t = list[i - 1]; list[i - 1] = list[i]; list[i] = t; drawMine(); }; });
        };
        drawMine();
        var t, seq = 0;
        $('#skQ', m).oninput = function () {
          var v = this.value.trim(), my = ++seq; clearTimeout(t);
          if (!v) { $('#skFound', m).innerHTML = ''; return; }
          t = setTimeout(function () {
            $('#skFound', m).innerHTML = '<li class="muted small"><span class="spinner dark"></span> 찾는 중…</li>';
            api('stock.search', { q: v }).then(function (r) {
              if (my !== seq) return;
              $('#skFound', m).innerHTML = r.items.length ? r.items.map(function (x, i) { var have = list.some(function (y) { return y.code === x.code; }); return '<li><button data-add="' + i + '"' + (have ? ' disabled' : '') + '><b>' + esc(x.name) + '</b> <small class="muted">' + esc(x.ticker || x.code) + (x.market ? ' · ' + esc(x.market) : '') + '</small><span>' + (have ? '추가됨' : '＋ 추가') + '</span></button></li>'; }).join('') : '<li class="muted small">찾는 종목이 없어요.</li>';
              $$('[data-add]', m).forEach(function (b) { b.onclick = function () { if (list.length >= 5) return toast('5개까지 넣을 수 있어요.', 'err'); var x = r.items[+b.dataset.add]; list.push({ code: x.code, name: x.name, ticker: x.ticker || x.code, foreign: !!x.foreign }); b.disabled = true; b.lastChild.textContent = '추가됨'; drawMine(); }; });
            }).catch(function (err) { if (my === seq) $('#skFound', m).innerHTML = '<li class="small" style="color:var(--red)">' + esc(err.message) + '</li>'; });
          }, 300);
        };
        $('#skSave', m).onclick = function () { local('set', 'joil-stocks', list); close(); homeStocks(); };
        setTimeout(function () { var q = $('#skQ', m); if (q) q.focus(); }, 50);
      } });
  }
  function openStockChart(code, name, q) {
    var fx = q && q.foreign, mine = myStocks().filter(function (y) { return y.code === code; })[0] || {};
    modal({ wide: true, eyebrow: '관심 종목' + (fx ? ' · 해외' : ''), title: name + ' (' + (mine.ticker || code) + ')',
      body: (q && !q.error ? '<div class="stk-head"><b class="' + stkCls(q.diff) + '">' + stkMoney(q, q.price) + '</b><span class="' + stkCls(q.diff) + '">' + stkSign(q.diff) + ' ' + stkMoney(q, Math.abs(q.diff || 0)) + ' (' + (q.rate > 0 ? '+' : '') + (q.rate == null ? '–' : q.rate.toFixed(2)) + '%)</span>' +
        '<span class="small muted">시가 ' + stkMoney(q, q.open) + ' · 고가 ' + stkMoney(q, q.high) + ' · 저가 ' + stkMoney(q, q.low) + (q.volume != null ? ' · 거래량 ' + stkNum(q.volume) : '') + '</span></div>' : '') +
        '<div id="skChart" class="stk-chart"><p class="muted"><span class="spinner dark"></span> 그래프 불러오는 중…</p></div>' +
        '<p class="hint" style="margin:6px 0 0">최근 3개월 일별 종가 · 네이버 금융 · <a href="https://m.stock.naver.com/' + (fx ? 'worldstock/stock/' : 'domestic/stock/') + esc(code) + '/total" target="_blank" rel="noopener">네이버 증권에서 보기 ↗</a></p>',
      onMount: function (m) {
        api('stock.chart', { code: code }).then(function (r) {
          var box = $('#skChart', m); if (!box) return;
          var pts = r.points; if (pts.length < 2) { box.innerHTML = '<p class="muted">그래프 자료가 없어요.</p>'; return; }
          var W = 760, H = 240, P = 36, vals = pts.map(function (p) { return p.c; }), lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), sp = hi - lo || 1;
          var x = function (i) { return P + i / (pts.length - 1) * (W - P - 8); }, y = function (v) { return 10 + (hi - v) / sp * (H - 40); };
          var up = vals[vals.length - 1] >= vals[0], col = up ? 'var(--red)' : '#2E6FD0';
          var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p.c).toFixed(1); }).join('');
          var ticks = [0, Math.floor(pts.length / 2), pts.length - 1];
          box.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="stk-svg">' +
            [hi, (hi + lo) / 2, lo].map(function (v) { return '<line x1="' + P + '" x2="' + (W - 8) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--line)" stroke-dasharray="3 3"/><text x="' + (P - 4) + '" y="' + (y(v) + 4) + '" text-anchor="end" font-size="11" fill="var(--muted)">' + stkNum(v, fx ? 2 : 0) + '</text>'; }).join('') +
            '<path d="' + line + 'L' + x(pts.length - 1) + ',' + (H - 30) + 'L' + P + ',' + (H - 30) + 'Z" fill="' + col + '" opacity=".08"/><path d="' + line + '" fill="none" stroke="' + col + '" stroke-width="2"/>' +
            ticks.map(function (i) { return '<text x="' + x(i) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="11" fill="var(--muted)">' + pts[i].d.slice(5).replace('-', '/') + '</text>'; }).join('') + '</svg>';
        }).catch(function (err) { var box = $('#skChart', m); if (box) box.innerHTML = '<p class="small" style="color:var(--red)">' + esc(err.message) + '</p>'; });
      } });
  }

  function renderHome() {
    var hq = can('quote'), ha = can('analysis');
    var d = new Date(), wd = '일월화수목금토'.charAt(d.getDay());
    $('#main').innerHTML =
      '<div class="home-hero card"><div><div class="eyebrow">' + esc(today()) + ' (' + wd + ')</div><h2>' + esc(state.user.name) + '님, 안녕하세요</h2></div>' +
      (hq ? '<form class="home-quick" id="homeQuick" autocomplete="off"><input class="input" id="hqFrom" list="addrList" placeholder="상차지"><span class="hq-arrow">→</span><input class="input" id="hqTo" list="addrList" placeholder="하차지"><button class="btn btn-accent" type="submit">바로 계산</button></form>' : '') +
      '</div>' +
      '<div class="home-grid">' +
      '<div class="card home-card full" id="hcNotice"><div class="eyebrow">Notice · 팀 공지</div><p class="muted"><span class="spinner dark"></span></p></div>' +
      (hq ? '<div class="card home-card" id="hcDiesel"><div class="eyebrow">Diesel · 오늘 경유가</div><p class="muted"><span class="spinner dark"></span></p></div>' : '') +
      (ha ? '<div class="card home-card wide2" id="hcAn"><div class="eyebrow">This month · 이번 달 실적</div><p class="muted"><span class="spinner dark"></span> 분석 데이터 불러오는 중…</p></div>' : '') +
      '<div class="card home-card" id="hcToday"><div class="eyebrow">Today · 오늘 할 일</div><p class="muted"><span class="spinner dark"></span></p></div>' +
      '<div class="card home-card" id="hcStock"><div class="eyebrow">Stocks · 관심 종목</div><p class="muted"><span class="spinner dark"></span></p></div>' +
      '<div class="card home-card" id="hcWx"><div class="eyebrow">Weather · 오늘 날씨</div><p class="muted"><span class="spinner dark"></span></p></div>' +
      '<div class="card home-card wide2" id="hcNews"><div class="eyebrow">News · 물류 뉴스</div><p class="muted"><span class="spinner dark"></span></p></div>' +
      (hq ? '<div class="card home-card" id="hcReqs"><div class="eyebrow">Requests · 진행 중인 견적 요청</div><p class="muted"><span class="spinner dark"></span></p></div>' : '') +
      (hq ? '<div class="card home-card" id="hcDocs"><div class="eyebrow">Expiring · 만료 임박</div><p class="muted"><span class="spinner dark"></span></p></div>' : '') +
      (hq ? '<div class="card home-card" id="hcQuotes"><div class="eyebrow">Quotes · 최근 내 견적</div><p class="muted"><span class="spinner dark"></span></p></div>' : '') +
      (hq ? '<div class="card home-card" id="hcHist"><div class="eyebrow">History · 최근 조회 (7일)</div><p class="muted"><span class="spinner dark"></span></p></div>' : '') +
      '</div>';
    var alive = function () { return state.view === 'home'; };
    var fail = function (sel) {
      return function (err) {
        var el = $(sel); if (!el || !alive()) return;
        $$('.spinner', el).forEach(function (s) { s.parentNode.remove(); });
        el.insertAdjacentHTML('beforeend', '<p class="small" style="color:var(--red);margin:0">' + esc(err.message) + '</p>');
      };
    };
    if (hq) {
      ensureAddrList();
      $('#homeQuick').onsubmit = function (e) {
        e.preventDefault();
        var o = $('#hqFrom').value.trim(), t = $('#hqTo').value.trim();
        if (!o || !t) return toast('상차지와 하차지를 모두 입력하세요.', 'err');
        state.calc.origin = o; state.calc.dest = t; state.calc.result = null;
        state.view = 'calc'; render();
        $('#calcForm').requestSubmit ? $('#calcForm').requestSubmit() : $('#calcBtn').click();
      };
      api('diesel.recent').then(function (r) { if (alive()) homeDiesel(r); }).catch(fail('#hcDiesel'));
      Promise.all([(state.docs.list ? Promise.resolve({ docs: state.docs.list }) : api('docs.list')), loadCusts().catch(function () { return []; })]).then(function (r) { state.docs.list = r[0].docs; if (alive()) homeDocs(r[0].docs); }).catch(fail('#hcDocs'));
      api('quotes.list').then(function (r) { state.quotes.list = r.quotes; if (alive()) homeQuotes(r.quotes); }).catch(fail('#hcQuotes'));
      api('reqs.list').then(function (r) { state.reqs.list = r.reqs; if (alive()) homeReqs(r.reqs); }).catch(fail('#hcReqs'));
      api('history.list', { days: 7, type: '', userId: state.user.id, q: '' }).then(function (r) { if (alive()) homeHist(r.logs); }).catch(fail('#hcHist'));
    }
    if (ha) loadAnalysis().then(function () { if (alive()) homeAn(); }).catch(fail('#hcAn'));
    Promise.all([loadCal(), can('quote') ? loadOwners(true).catch(function () { }) : null]).then(function () { if (alive()) homeToday(); }).catch(fail('#hcToday'));
    loadNotices(true).then(function () { if (alive()) homeNotice(); }).catch(fail('#hcNotice'));
    homeStocks();
    infoLoad('weather').then(function (r) { if (alive()) homeWeather(r); }).catch(fail('#hcWx'));
    infoLoad('news').then(function (r) { if (alive()) homeNews(r); }).catch(fail('#hcNews'));
  }

  function sparkline(vals, w, h) {
    if (vals.length < 2) return '';
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), span = hi - lo || 1;
    var pts = vals.map(function (v, i) { return (i / (vals.length - 1) * w).toFixed(1) + ',' + (h - 3 - (v - lo) / span * (h - 6)).toFixed(1); });
    var last = pts[pts.length - 1].split(',');
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="M' + pts.join('L') + 'L' + w + ',' + h + 'L0,' + h + 'Z" fill="' + AN_SALES_COLOR + '" opacity=".1"/>' +
      '<path d="M' + pts.join('L') + '" fill="none" stroke="' + AN_SALES_COLOR + '" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="3" fill="' + AN_SALES_COLOR + '"/></svg>';
  }

  function homeDiesel(r) {
    var el = $('#hcDiesel'), rows = r.rows || [];
    var lastP = rows.length ? rows[rows.length - 1][1] : null;
    var ago = rows.filter(function (x) { return x[0] <= addDays(rows.length ? rows[rows.length - 1][0] : today(), -30); });
    var base = ago.length ? ago[ago.length - 1][1] : (rows[0] && rows[0][1]);
    var diff = lastP != null && base ? lastP - base : null;
    el.innerHTML = '<div class="row-between"><div class="eyebrow">Diesel · 오늘 경유가</div><button class="btn btn-sm btn-ghost" data-info="diesel">유가 자세히</button></div>' +
      '<div class="home-big num">' + won(r.now.price) + '<span class="small"> 원/L</span></div>' +
      '<div class="small muted">' + esc(r.now.source) + ' · 견적 밀크런 기준</div>' +
      (rows.length > 1 ? sparkline(rows.map(function (x) { return x[1]; }), 300, 64) +
        '<div class="row-between small"><span class="muted">최근 ' + rows.length + '일 전국 평균</span>' + (diff != null ? '<span>30일 전보다 ' + deltaHtml(diff / base * 100, '%', false) + '</span>' : '') + '</div>'
        : '<p class="small muted" style="margin:10px 0 0">유가 기록이 쌓이면 추이가 보여요.</p>');
    bindInfoGo(el);
  }
  function addDays(d, k) { var t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10); }

  function homeAn() {
    var el = $('#hcAn'), an = state.an, ms = anMonths();
    if (!ms.length) { el.innerHTML = '<div class="eyebrow">This month · 이번 달 실적</div><p class="muted" style="margin:0">아직 올라온 분석 데이터가 없어요.</p>'; return; }
    var m = ms[ms.length - 1], pm = addMonths(m, -1), ly = addMonths(m, -12);
    var by = function (month) {
      var t = { n: 0, s: 0, b: 0 }, cust = {};
      an.rows.forEach(function (r) {
        if (r[C.hidden] || r[C.cat] || r[C.date].slice(0, 7) !== month) return;
        t.n++; t.s += r[C.sales]; t.b += r[C.buys];
        var x = cust[r[C.disp]] || (cust[r[C.disp]] = { k: r[C.disp], n: 0, s: 0, b: 0 }); x.n++; x.s += r[C.sales]; x.b += r[C.buys];
      });
      t.p = t.s - t.b; t.r = pct(t.p, t.s); t.cust = cust;
      return t;
    };
    var c = by(m), p = ms.indexOf(pm) !== -1 ? by(pm) : null, y = ms.indexOf(ly) !== -1 ? by(ly) : null;
    var watch = [];
    if (p) {
      watch = Object.keys(c.cust).map(function (k) {
        var a = c.cust[k], b = p.cust[k]; if (!b) return null;
        a.p = a.s - a.b; a.r = pct(a.p, a.s); b.p = b.s - b.b; b.r = pct(b.p, b.s);
        a.dr = a.r != null && b.r != null ? a.r - b.r : null; a.turned = b.p > 0 && a.p < 0;
        return a;
      }).filter(function (x) { return x && x.s >= an.alert.minSales && (x.turned || (x.dr != null && x.dr <= -an.alert.drop)); })
        .sort(function (a, b) { return (a.turned === b.turned ? 0 : a.turned ? -1 : 1) || a.dr - b.dr; });
    }
    var kpi = function (label, v, neg, d1, d2) {
      return '<div class="kpi"><div class="k">' + label + '</div><div class="v num' + (neg ? ' neg' : '') + '">' + v + '</div><div class="s">' +
        (d1 != null ? d1 + ' <span class="muted">전월</span>' : '') + (d2 != null ? ' · ' + d2 + ' <span class="muted">전년</span>' : '') + '</div></div>';
    };
    el.innerHTML = '<div class="row-between" style="flex-wrap:wrap;gap:8px"><div><div class="eyebrow">This month · 최근 실적</div><h3>' + esc(m) + ' 전체 사업자</h3></div><button class="btn btn-sm" id="hcAnGo">분석 열기</button></div>' +
      '<div class="kpis mini" style="margin-top:12px">' +
      kpi('이익', won(c.p) + '원', c.p < 0, p ? deltaHtml(deltaPct(c.p, p.p), '%', true) : null, y ? deltaHtml(deltaPct(c.p, y.p), '%', true) : null) +
      kpi('이익률', pctText(c.r), c.r < 0, p && c.r != null && p.r != null ? deltaHtml(c.r - p.r, '%p', true) : null, y && c.r != null && y.r != null ? deltaHtml(c.r - y.r, '%p', true) : null) +
      kpi('매출', won(c.s) + '원', false, p ? deltaHtml(deltaPct(c.s, p.s), '%', true) : null, null) +
      kpi('건수', won(c.n) + '건', false, p ? deltaHtml(deltaPct(c.n, p.n), '%', true) : null, null) + '</div>' +
      (p ? '<h4 class="home-sub">확인해 볼 곳 <span class="' + (watch.length ? 'neg' : 'muted') + '">' + watch.length + '곳</span> <span class="small muted">전월보다 이익률 ' + an.alert.drop + '%p 이상 하락 또는 적자 전환</span></h4>' +
        (watch.length ? '<ul class="home-list">' + watch.slice(0, 5).map(function (x) {
          var nb = notesBetween(pm, m, x.k)[0];
          return '<li><button data-cust="' + esc(x.k) + '"><span>' + (x.turned ? '<span class="badge down">적자 전환</span> ' : '') + esc(x.k) + (nb ? ' ' + noteBadge(nb) : '') + '</span><span class="num">' + pctText(x.r) + ' ' + deltaHtml(x.dr, '%p', true) + '</span></button></li>';
        }).join('') + '</ul>' + (watch.length > 5 ? '<p class="hint" style="margin:6px 0 0">외 ' + (watch.length - 5) + '곳은 분석 화면에서 볼 수 있어요.</p>' : '') : '<p class="muted small" style="margin:0">해당하는 매출처가 없어요. 👍</p>')
        : '<p class="muted small" style="margin:12px 0 0">전월 데이터가 올라오면 비교가 나와요.</p>');
    var goAn = function (cust) {
      var f = an.f; f.from = m; f.to = m; f.biz = []; f.q = ''; f.sel = cust ? { cust: [cust] } : {}; an.cmp = 'prev';
      if (cust) { an.dim = 'route'; an.sort = { key: 'profit', dir: 1 }; }
      state.view = 'analysis'; render();
    };
    $('#hcAnGo').onclick = function () { goAn(null); };
    $$('#hcAn [data-cust]').forEach(function (b) { b.onclick = function () { goAn(b.dataset.cust); }; });
  }

  function homeDocs(docs) {
    var el = $('#hcDocs');
    var list = docs.map(function (d) { return { d: d, n: docDays(d) }; }).filter(function (x) { return x.n != null && x.n <= 60; }).sort(function (a, b) { return a.n - b.n; });
    var cl = (state.custs || []).map(function (c) { return { c: c, n: custDays(c) }; }).filter(function (x) { return x.n != null && x.n <= 60 && x.n >= -30; }).sort(function (a, b) { return a.n - b.n; });
    var dbadge = function (n) { return n < 0 ? '<span class="badge exp-x">만료됨</span>' : '<span class="badge ' + (n <= 30 ? 'exp-soon' : 'off') + '">D-' + n + '</span>'; };
    el.innerHTML = '<div class="row-between"><div class="eyebrow">Expiring · 만료 임박 (서류·계약)</div><span class="actions"><button class="btn btn-sm btn-ghost" data-go="custs">거래처</button><button class="btn btn-sm btn-ghost" data-go="docs">서류함</button></span></div>' +
      (cl.length ? '<ul class="home-list">' + cl.slice(0, 4).map(function (x) { return '<li><button data-ct="' + esc(x.c.id) + '"><span>계약 · ' + esc(x.c.name) + '</span><span>' + dbadge(x.n) + '</span></button></li>'; }).join('') + '</ul>' : '') +
      (list.length ? '<ul class="home-list">' + list.slice(0, 6).map(function (x) {
        return '<li><button data-doc="' + esc(x.d.id) + '"><span>' + esc((x.d.biz ? x.d.biz + ' · ' : '') + x.d.name) + '</span><span>' +
          (x.n < 0 ? '<span class="badge exp-x">만료됨</span>' : '<span class="badge ' + (x.n <= 30 ? 'exp-soon' : 'off') + '">D-' + x.n + '</span>') + '</span></button></li>';
      }).join('') + '</ul>' : '<p class="muted small" style="margin:8px 0 0">60일 안에 만료되는 서류가 없어요. (' + won(docs.length) + '개 보관 중)</p>');
    $$('[data-doc]', el).forEach(function (b) { b.onclick = function () { var d = docs.filter(function (x) { return x.id === b.dataset.doc; })[0]; if (d) previewDoc(d); }; });
    $$('[data-ct]', el).forEach(function (b) { b.onclick = function () { state.custView = { q: '', sel: b.dataset.ct }; state.view = 'custs'; render(); }; });
    bindHomeGo(el);
  }

  function homeQuotes(list) {
    var el = $('#hcQuotes');
    var mine = list.filter(function (q) { return q.userId === state.user.id; }).sort(function (a, b) { return String(b.updatedAt || b.savedAt).localeCompare(String(a.updatedAt || a.savedAt)); });
    el.innerHTML = '<div class="row-between"><div class="eyebrow">Quotes · 최근 내 견적</div><button class="btn btn-sm btn-ghost" data-go="quotes">견적모음</button></div>' +
      (mine.length ? '<ul class="home-list">' + mine.slice(0, 5).map(function (q) {
        return '<li><button data-q="' + esc(q.id) + '"><span><b>' + esc(q.name) + '</b>' + (q.client ? ' <span class="muted small">' + esc(q.client) + '</span>' : '') + '</span>' + statusPill(q.status) + '</button></li>';
      }).join('') + '</ul>' : '<p class="muted small" style="margin:8px 0 0">아직 저장한 견적이 없어요.</p>');
    $$('[data-q]', el).forEach(function (b) { b.onclick = function () { state.quotes.detail = b.dataset.q; state.quotes.detailData = null; state.view = 'quotes'; render(); window.scrollTo(0, 0); }; });
    bindHomeGo(el);
  }

  function homeHist(logs) {
    var el = $('#hcHist');
    el.innerHTML = '<div class="row-between"><div class="eyebrow">History · 최근 조회 (7일)</div><button class="btn btn-sm btn-ghost" data-go="history">조회기록</button></div>' +
      (logs.length ? '<ul class="home-list">' + logs.slice(0, 6).map(function (l) {
        return '<li><button data-h="' + esc(l.hasSnapshot ? l.recordId : '') + '"><span class="ellip">' + esc(l.from) + ' → ' + esc(l.to) + '</span><span class="small muted">' + esc(String(l.at).slice(5, 16)) + '</span></button></li>';
      }).join('') + '</ul>' : '<p class="muted small" style="margin:8px 0 0">최근 7일 동안 조회한 기록이 없어요.</p>');
    $$('[data-h]', el).forEach(function (b) { b.onclick = function () { var h = state.hist; h.logs = null; h.detail = b.dataset.h || null; h.detailData = null; state.view = 'history'; render(); window.scrollTo(0, 0); }; });
    bindHomeGo(el);
  }

  function bindHomeGo(el) { $$('[data-go]', el).forEach(function (b) { b.onclick = function () { state.view = b.dataset.go; render(); }; }); }

  /* ───────── 물류 정보 (유가 상세 · 뉴스 · 날씨) ───────── */

  var WX = {
    0: ['맑음', '☀️'], 1: ['대체로 맑음', '🌤️'], 2: ['구름 조금', '⛅'], 3: ['흐림', '☁️'], 45: ['안개', '🌫️'], 48: ['짙은 안개', '🌫️'],
    51: ['이슬비', '🌦️'], 53: ['이슬비', '🌦️'], 55: ['이슬비', '🌦️'], 56: ['어는 비', '🌧️'], 57: ['어는 비', '🌧️'],
    61: ['비', '🌧️'], 63: ['비', '🌧️'], 65: ['강한 비', '🌧️'], 66: ['어는 비', '🌧️'], 67: ['어는 비', '🌧️'],
    71: ['눈', '🌨️'], 73: ['눈', '🌨️'], 75: ['많은 눈', '❄️'], 77: ['싸락눈', '🌨️'], 80: ['소나기', '🌦️'], 81: ['소나기', '🌧️'], 82: ['강한 소나기', '⛈️'],
    85: ['눈 소나기', '🌨️'], 86: ['강한 눈', '❄️'], 95: ['뇌우', '⛈️'], 96: ['뇌우·우박', '⛈️'], 99: ['뇌우·우박', '⛈️']
  };
  function wx(code) { return WX[code] || ['–', '·']; }
  /** 운행에 영향 줄 만한 날씨만 짧게 */
  function wxAlerts(d) {
    var a = [];
    if (d.snow > 0) a.push(['snow', '눈 ' + (Math.round(d.snow * 10) / 10) + 'cm']);
    if (d.rain >= 20) a.push(['rain', '비 ' + Math.round(d.rain) + 'mm']);
    else if (d.rain >= 10 && !d.snow) a.push(['rain', '비 ' + Math.round(d.rain) + 'mm']);
    if (d.wind >= 50) a.push(['wind', '강풍 ' + Math.round(d.wind) + 'km/h']);
    if (d.code === 56 || d.code === 57 || d.code === 66 || d.code === 67) a.push(['snow', '도로 결빙 주의']);
    if (d.min != null && d.min <= -5 && !a.length) a.push(['cold', '한파 ' + Math.round(d.min) + '°']);
    return a;
  }
  function dayName(date, k) { return k === 0 ? '오늘' : k === 1 ? '내일' : k === 2 ? '모레' : String(date).slice(5).replace('-', '/'); }
  function timeAgo(t) {
    if (!t) return '';
    var m = Math.round((Date.now() - t) / 60000);
    if (m < 60) return Math.max(1, m) + '분 전';
    if (m < 1440) return Math.round(m / 60) + '시간 전';
    return Math.round(m / 1440) + '일 전';
  }

  function infoLoad(kind, force) {
    var inf = state.info;
    if (inf[kind] && !force) return Promise.resolve(inf[kind]);
    return api('info.' + kind, force ? { force: true } : {}).then(function (r) { inf[kind] = r; return r; });
  }

  function renderInfo() {
    var inf = state.info;
    $('#main').innerHTML =
      '<div class="card info-head"><div><div class="eyebrow">Logistics · 물류 정보</div><h2>오늘의 물류 정보</h2></div>' +
      '<div class="segmented" id="infoTabs">' + [['diesel', '⛽ 유가'], ['news', '📰 뉴스'], ['weather', '🌤️ 날씨']].map(function (t) {
        return '<button type="button" data-t="' + t[0] + '" class="' + (inf.tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>';
      }).join('') + '</div></div><div id="infoBody" style="margin-top:16px"></div>';
    $$('#infoTabs button').forEach(function (b) { b.onclick = function () { inf.tab = b.dataset.t; $$('#infoTabs button').forEach(function (x) { x.classList.toggle('on', x === b); }); drawInfo(); }; });
    drawInfo();
  }

  function drawInfo() {
    syncRoute();
    var inf = state.info, box = $('#infoBody'), tab = inf.tab;
    if (!inf[tab]) {
      box.innerHTML = '<div class="card muted"><span class="spinner dark"></span> 불러오는 중…</div>';
      infoLoad(tab).then(function () { if (state.view === 'info' && inf.tab === tab) drawInfo(); })
        .catch(function (err) { if (state.view === 'info' && inf.tab === tab) box.innerHTML = '<div class="card"><p class="err-text" style="margin:0">' + esc(err.message) + '</p></div>'; });
      return;
    }
    if (tab === 'diesel') infoDiesel(box);
    else if (tab === 'news') infoNews(box);
    else infoWeather(box);
  }

  function infoDiesel(box) {
    var inf = state.info, r = inf.diesel, rows = r.rows || [];
    if (!rows.length) {
      box.innerHTML = '<div class="card"><p class="muted" style="margin:0">아직 쌓인 유가 기록이 없어요. 관리자가 유가 자동 기록을 켜면 매일 쌓입니다.</p></div>';
      return;
    }
    var shown = inf.range ? rows.filter(function (x) { return x[0] > addDays(rows[rows.length - 1][0], -inf.range); }) : rows;
    if (shown.length < 2) shown = rows.slice(-2);
    var data = shown.map(function (x) { return { d: x[0], p: Number(x[1]) }; });
    var last = rows[rows.length - 1], prev = rows.length > 1 ? rows[rows.length - 2] : null;
    var dd = prev ? last[1] - prev[1] : null;
    var first = data[0], end = data[data.length - 1];
    var hi = data.reduce(function (a, b) { return b.p > a.p ? b : a; }), lo = data.reduce(function (a, b) { return b.p < a.p ? b : a; });
    var avg = data.reduce(function (s, x) { return s + x.p; }, 0) / data.length;
    var chg = end.p - first.p, chgP = first.p ? chg / first.p * 100 : 0;
    var sign = function (v, dig) { return (v > 0 ? '▲ ' : v < 0 ? '▼ ' : '') + Math.abs(v).toFixed(dig); };
    box.innerHTML =
      '<div class="card"><div class="stock-head"><div><div class="muted small">전국 평균 경유 · ' + esc(last[0]) + '</div>' +
      '<div class="stock-price num">' + Number(last[1]).toFixed(2) + '<span class="small"> 원/L</span></div>' +
      (dd != null ? '<div class="stock-chg ' + (dd > 0 ? 'up' : dd < 0 ? 'down' : '') + '">' + sign(dd, 2) + '원 (' + sign(dd / prev[1] * 100, 2) + '%) <span class="muted small">전일 대비</span></div>' : '') + '</div>' +
      '<div class="stock-side"><div><span class="muted small">견적 밀크런에 쓰는 값</span><b class="num">' + won(r.now.price) + '원/L</b><span class="muted small">' + esc(r.now.source) + '</span></div></div></div>' +
      '<div class="row-between" style="flex-wrap:wrap;gap:10px;margin:18px 0 6px"><div class="segmented" id="dzR">' +
      [[7, '1주'], [30, '1개월'], [90, '3개월'], [365, '1년'], [1095, '3년'], [0, '전체']].map(function (x) { return '<button type="button" data-r="' + x[0] + '" class="' + (inf.range === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<span class="small muted">' + esc(first.d) + ' ~ ' + esc(end.d) + '</span></div>' +
      '<div id="dzChart">' + priceChart(data) + '</div>' +
      '<div class="stock-stats">' +
      '<div><span>기간 등락</span><b class="num ' + (chg > 0 ? 'up' : chg < 0 ? 'down' : '') + '">' + sign(chg, 2) + '원</b><small>' + sign(chgP, 2) + '%</small></div>' +
      '<div><span>최고</span><b class="num">' + hi.p.toFixed(2) + '</b><small>' + esc(hi.d) + '</small></div>' +
      '<div><span>최저</span><b class="num">' + lo.p.toFixed(2) + '</b><small>' + esc(lo.d) + '</small></div>' +
      '<div><span>평균</span><b class="num">' + avg.toFixed(2) + '</b><small>' + data.length + '일</small></div></div></div>' +
      '<div class="card" style="margin-top:16px"><h3 style="margin-bottom:10px">일별 시세</h3><div class="table-wrap"><table class="data"><thead><tr><th class="left">날짜</th><th>경유 (원/L)</th><th>전일 대비</th><th>등락률</th></tr></thead><tbody>' +
      rows.slice(-20).reverse().map(function (x, i, arr) {
        var pv = arr[i + 1] ? arr[i + 1][1] : null, df = pv != null ? x[1] - pv : null;
        return '<tr><td class="left">' + esc(x[0]) + '</td><td class="num">' + Number(x[1]).toFixed(2) + '</td><td class="num ' + (df > 0 ? 'up' : df < 0 ? 'down' : '') + '">' + (df == null ? '–' : sign(df, 2)) + '</td><td class="num ' + (df > 0 ? 'up' : df < 0 ? 'down' : '') + '">' + (df == null ? '–' : sign(df / pv * 100, 2) + '%') + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="hint" style="margin:10px 0 0">오피넷 전국 평균 경유가 (매일 아침 기록)</p></div>';
    $$('#dzR button').forEach(function (b) { b.onclick = function () { inf.range = Number(b.dataset.r); infoDiesel(box); }; });
    bindChartHover($('#dzChart'), data, function (d) {
      var i = data.indexOf(d), p = i > 0 ? data[i - 1].p : null;
      return '<b>' + d.d + '</b><br>' + d.p.toFixed(2) + '원/L' + (p != null ? '<br>' + sign(d.p - p, 2) : '');
    });
  }

  function infoNews(box) {
    var inf = state.info, r = inf.news, items = r.items || [], k = r.keywords || {};
    var counts = {};
    items.forEach(function (n) { n.kws.forEach(function (w) { counts[w] = (counts[w] || 0) + 1; }); });
    var tags = (k.include || []).concat(k.watch || []).filter(function (w) { return counts[w]; });
    var f = inf.newsKw, q = inf.newsQ || '';
    var list = items.filter(function (n) {
      if (f === '__watch' && !n.watch) return false;
      if (f && f !== '__watch' && n.kws.indexOf(f) === -1) return false;
      return !q || (n.title + ' ' + n.source).indexOf(q) !== -1;
    });
    var isAdmin = state.user.role === 'admin';
    box.innerHTML = '<div class="card"><div class="row-between" style="flex-wrap:wrap;gap:10px;margin-bottom:12px"><div><h3>물류 뉴스 <span class="muted small">최근 7일 · ' + items.length + '건</span></h3>' +
      '<p class="muted small" style="margin:4px 0 0">구글 뉴스에서 국내 언론사 기사만 모았어요 · 30분마다 새로 모음 · ' + esc(r.at || '') + (r.foreign ? ' · 해외 기사 ' + r.foreign + '건 제외' : '') + (r.failed ? ' · 일부 키워드 실패 ' + r.failed : '') + '</p></div>' +
      '<div class="actions">' + (isAdmin ? '<button class="btn btn-sm" id="nwSet">키워드 설정</button><button class="btn btn-sm" id="nwRe">지금 새로 모으기</button>' : '') + '</div></div>' +
      '<div class="toolbar"><div class="chips nw-chips">' +
      '<button type="button" class="chip' + (!f ? ' on' : '') + '" data-k="">전체 ' + items.length + '</button>' +
      ((k.watch || []).length ? '<button type="button" class="chip' + (f === '__watch' ? ' on' : '') + '" data-k="__watch">⭐ 관심 업체 ' + items.filter(function (n) { return n.watch; }).length + '</button>' : '') +
      tags.map(function (w) { return '<button type="button" class="chip' + (f === w ? ' on' : '') + '" data-k="' + esc(w) + '">' + esc(w) + ' ' + counts[w] + '</button>'; }).join('') +
      '</div><input class="input input-sm" id="nwQ" placeholder="제목·언론사 검색" value="' + esc(q) + '" style="max-width:220px;margin-left:auto"></div>' +
      (list.length ? '<ul class="news-list">' + list.slice(0, inf.newsLimit || 60).map(function (n) {
        return '<li><a href="' + esc(n.link) + '" target="_blank" rel="noopener noreferrer">' + (n.watch ? '<span class="badge region">⭐</span> ' : '') + esc(n.title) + '</a>' +
          '<div class="news-meta"><span>' + esc(n.source || '') + '</span><span>' + timeAgo(n.at) + '</span>' + n.kws.map(function (w) { return '<span class="kw">' + esc(w) + '</span>'; }).join('') + '</div></li>';
      }).join('') + '</ul>' + (list.length > (inf.newsLimit || 60) ? '<button class="btn btn-sm" id="nwMore" style="margin-top:10px">더 보기</button>' : '')
        : '<p class="muted">' + (items.length ? '조건에 맞는 기사가 없어요.' : '최근 7일 동안 모인 기사가 없어요.') + '</p>') +
      '<p class="hint" style="margin:12px 0 0">제목을 누르면 원문 기사가 새 창으로 열려요. 키워드로 모으는 방식이라 관계없는 기사가 섞일 수 있어요.' + (isAdmin ? ' 키워드 설정에서 제외 단어를 추가해 걸러 주세요.' : '') + '</p></div>';
    $$('.nw-chips .chip', box).forEach(function (c) { c.onclick = function () { inf.newsKw = c.dataset.k; inf.newsLimit = 60; syncRoute(); infoNews(box); }; });
    var st; $('#nwQ', box).oninput = function () { var v = this.value; clearTimeout(st); st = setTimeout(function () { inf.newsQ = v.trim(); infoNews(box); var el = $('#nwQ'); el.focus(); el.setSelectionRange(v.length, v.length); }, 250); };
    var more = $('#nwMore', box); if (more) more.onclick = function () { inf.newsLimit = (inf.newsLimit || 60) + 60; infoNews(box); };
    if (isAdmin) {
      $('#nwRe', box).onclick = function () { var b = this; busy(b, true, '모으는 중…'); infoLoad('news', true).then(function () { toast('뉴스를 새로 모았어요.'); infoNews(box); }).catch(function (err) { busy(b, false); toast(err.message, 'err'); }); };
      $('#nwSet', box).onclick = function () { openNewsRules(k, function () { infoLoad('news', true).then(function () { if (state.view === 'info') infoNews(box); }); }); };
    }
  }

  function openNewsRules(k, done) {
    var ta = function (id, list, ph) { return '<textarea class="input memo" id="' + id + '" placeholder="' + ph + '">' + esc((list || []).join('\n')) + '</textarea>'; };
    modal({
      eyebrow: '물류 정보', title: '뉴스 키워드 설정',
      body: '<p class="muted small" style="margin:0 0 12px">한 줄에 하나씩 넣으세요. 띄어쓰기까지 정확히 같은 말이 들어간 기사를 모아요.</p>' +
        '<div class="field"><label>모을 키워드 <span class="muted">(물류 업계 이슈)</span></label>' + ta('nkInc', k.include, '화물연대&#10;안전운임') + '</div>' +
        '<div class="field"><label>관심 업체 <span class="muted">(⭐ 표시 · 거래처·경쟁사)</span></label>' + ta('nkWatch', k.watch, '쿠팡&#10;CJ대한통운') + '</div>' +
        '<div class="field"><label>제외 단어 <span class="muted">(제목에 있으면 빼기 · 자잘한 사고 등)</span></label>' + ta('nkEx', k.exclude, '교통사고&#10;추돌') + '</div>' +
        '<div class="field"><label>제외 언론사 <span class="muted">(언론사 이름 · 국내 언론사만 모으지만 더 빼고 싶을 때)</span></label>' + ta('nkSrc', k.blockSources, '블로그 이름&#10;언론사 이름') + '</div>' +
        '<p class="hint" style="margin:0">해외 언론사 기사와 제목에 한글이 없는 기사는 자동으로 빠져요.</p>',
      foot: '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="nkSave">저장</button>',
      onMount: function (m, close) {
        var lines = function (id) { return $(id, m).value.split(/\n|,/).map(function (x) { return x.trim(); }).filter(Boolean); };
        $('#nkSave', m).onclick = function () {
          var b = this; busy(b, true, '저장 중…');
          api('admin.saveNews', { rules: { include: lines('#nkInc'), watch: lines('#nkWatch'), exclude: lines('#nkEx'), blockSources: lines('#nkSrc') } }).then(function () {
            close(); toast('키워드를 저장했어요. 뉴스를 새로 모아요.'); done();
          }).catch(function (err) { busy(b, false); toast(err.message, 'err'); });
        };
      }
    });
  }

  function infoWeather(box) {
    var r = state.info.weather, regs = r.regions || [];
    var warn = [];
    regs.forEach(function (g) { (g.days || []).slice(0, 2).forEach(function (d, k) { wxAlerts(d).forEach(function (a) { warn.push(g.name + ' ' + dayName(d.date, k) + ' ' + a[1]); }); }); });
    box.innerHTML = (warn.length ? '<div class="wx-warn">⚠️ <b>운행 주의</b> ' + warn.map(esc).join(' · ') + '</div>' : '<div class="wx-ok">오늘·내일 운행에 큰 영향을 줄 날씨는 없어요.</div>') +
      '<div class="wx-grid">' + regs.map(function (g) {
        var n = g.now || {};
        return '<div class="card wx-card"><div class="row-between"><div><h3>' + esc(g.name) + '</h3><span class="muted small">' + esc(g.city) + ' 기준</span></div>' +
          '<div class="wx-now"><span class="wx-ico">' + wx(n.code)[1] + '</span><b class="num">' + (n.temp != null ? Math.round(n.temp) + '°' : '–') + '</b></div></div>' +
          '<table class="wx-days"><tbody>' + (g.days || []).map(function (d, k) {
            var al = wxAlerts(d);
            return '<tr><th>' + dayName(d.date, k) + '</th><td class="wx-ico">' + wx(d.code)[1] + '</td><td>' + wx(d.code)[0] + '</td>' +
              '<td class="num"><span class="hi">' + Math.round(d.max) + '°</span> / <span class="lo">' + Math.round(d.min) + '°</span></td><td class="num muted">☔ ' + (d.pop == null ? '–' : d.pop + '%') + '</td></tr>' +
              (al.length ? '<tr class="wx-al"><td colspan="5">' + al.map(function (a) { return '<span class="wx-tag ' + a[0] + '">' + esc(a[1]) + '</span>'; }).join('') + '</td></tr>' : '');
          }).join('') + '</tbody></table></div>';
      }).join('') + '</div>' +
      '<p class="hint" style="margin:12px 0 0">Open-Meteo 예보 · 도별 대표 도시 기준 · 1시간마다 갱신 · ' + esc(r.at || '') + '</p>';
  }

  /* 홈 카드: 날씨 · 뉴스 */
  function homeWeather(r) {
    var el = $('#hcWx'); if (!el) return;
    el.innerHTML = '<div class="row-between"><div class="eyebrow">Weather · 오늘 날씨</div><button class="btn btn-sm btn-ghost" data-info="weather">날씨 자세히</button></div>' +
      '<ul class="home-list">' + (r.regions || []).map(function (g) {
        var d = (g.days || [])[0] || {}, al = wxAlerts(d).concat(wxAlerts((g.days || [])[1] || {}).map(function (a) { return [a[0], '내일 ' + a[1]]; }));
        return '<li><button data-info="weather"><span><b>' + esc(g.name) + '</b> ' + wx(d.code)[1] + ' <span class="small">' + wx(d.code)[0] + '</span>' + (al.length ? ' <span class="wx-tag ' + al[0][0] + '">' + esc(al[0][1]) + '</span>' : '') + '</span>' +
          '<span class="num small"><span class="hi">' + Math.round(d.max) + '°</span>/<span class="lo">' + Math.round(d.min) + '°</span> ☔' + (d.pop == null ? '–' : d.pop + '%') + '</span></button></li>';
      }).join('') + '</ul>';
    bindInfoGo(el);
  }
  function homeNews(r) {
    var el = $('#hcNews'); if (!el) return;
    var items = (r.items || []).slice(0, 6);
    el.innerHTML = '<div class="row-between"><div class="eyebrow">News · 물류 뉴스</div><button class="btn btn-sm btn-ghost" data-info="news">뉴스 더 보기</button></div>' +
      (items.length ? '<ul class="home-list news-mini">' + items.map(function (n) {
        return '<li><a href="' + esc(n.link) + '" target="_blank" rel="noopener noreferrer"><span>' + (n.watch ? '⭐ ' : '') + esc(n.title) + '</span><span class="small muted">' + esc(n.source || '') + ' · ' + timeAgo(n.at) + '</span></a></li>';
      }).join('') + '</ul>' : '<p class="muted small" style="margin:8px 0 0">최근 모인 기사가 없어요.</p>');
    bindInfoGo(el);
  }
  function bindInfoGo(el) { $$('[data-info]', el).forEach(function (b) { b.onclick = function () { state.info.tab = b.dataset.info; state.view = 'info'; render(); window.scrollTo(0, 0); }; }); }

  /* ───────── 도움말 (C2) ───────── */

  function renderHelp() {
    var hq = can('quote'), ha = can('analysis'), adm = state.user.role === 'admin';
    var sec = [];
    if (hq) sec.push(
      ['calc', '단건 계산', [
        '상차지와 하차지를 넣고 <b>견적 계산하기</b>를 누르면 거리와 톤수별 운임이 나옵니다. 주소는 도로명·지번·회사 이름 모두 됩니다.',
        '<b>합계 = 타리프 + 지역 할증 + 하행 할증</b>입니다. 유류비·통행료는 합계에 들어가지 않고, 아래 <b>밀크런</b> 칸에 따로 나옵니다.',
        '지역 할증은 상차지·하차지 양쪽에 걸리면 둘 다 더합니다. 하행 할증은 하차지가 더 남쪽이고 일정 거리 이상일 때 붙습니다.',
        '오른쪽 <b>표시할 톤수</b>에서 필요한 톤수만 고를 수 있고, 고른 톤수는 다음에도 기억합니다.',
        '입력칸을 누르면 예전에 조회한 주소가 추천으로 뜹니다.'
      ]],
      ['bulk', '대량 계산', [
        '최대 1,000건까지 한 번에 계산합니다. <b>상차지 1곳 → 여러 하차지</b> 또는 엑셀에서 <b>상차지·하차지 두 열</b>을 복사해 붙여넣으세요.',
        '실패한 줄은 빨간색으로 표시되고, <b>실패 n건 다시 계산</b>으로 그 줄만 다시 돌릴 수 있습니다. 주소를 고친 뒤 다시 하면 됩니다.',
        '한 번 조회한 주소와 경로는 저장돼서 다음부터 훨씬 빨라집니다.'
      ]],
      ['qdoc', '견적서 만들기', [
        '계산 결과, 조회기록 상세, 견적모음 상세에서 <b>견적서</b> 버튼을 누르세요.',
        '보내는 사업자(조일물류·명일로지스·조일로지스)를 고르면 그 회사의 상호·사업자번호·주소·직인이 들어갑니다.',
        '미리보기에서 <b>인쇄 / PDF 저장</b>을 누르고 인쇄 창의 대상을 <b>PDF로 저장</b>으로 바꾸면 PDF 파일이 됩니다. <b>엑셀</b>로도 받을 수 있어요.',
        '대량 결과로 만들면 경로별 표가 들어갑니다. 가로 폭 때문에 톤수는 6개까지 넣을 수 있어요.'
      ]],
      ['history', '조회기록 · 견적모음', [
        '모든 조회는 그때 금액 그대로 자동 보관됩니다(기본 90일). <b>상세보기</b>로 그때 결과를 다시 볼 수 있어요.',
        '오래 둘 결과는 <b>견적으로 저장</b>하세요. 견적모음은 기간 제한 없이 남고, 거래처·메모·진행 상태(작성/제출/수주/미수주)를 적어 둘 수 있습니다.',
        '<b>현재 단가로 다시 계산</b>을 누르면 같은 경로를 지금 단가로 다시 계산합니다.',
        '<b>금액 조정</b>: 결과 표의 "금액 조정"을 누르면 열(톤수 전체), 행(그 경로 전체), 칸 하나를 직접 고칠 수 있어요. 빼려면 -5000처럼 입력합니다. 조정한 칸은 노란색, 직접 입력한 칸은 주황 테두리로 표시돼요.',
        '조정은 <b>견적으로 저장</b>할 때 같이 저장되고, 견적모음 상세에서 계속 고친 뒤 <b>조정 저장</b>을 누르면 돼요. 누가 언제 무엇을 바꿨는지는 "변경 기록"에 남아요.',
        '<b>구간 추가</b>: 견적모음 상세에서 새 구간을 넣으면 <b>그 견적을 낼 때의 타리프·할증 기준</b>으로 계산해 마지막 행에 붙여요. 열 조정도 자동으로 적용됩니다.',
        '<b>특수 추가운임</b>: 계산 화면에서 냉동·리프트 같은 항목을 고르면 톤수별로 더해져요. 관리자가 금액을 넣은 항목만 보여요.',
        '결과 엑셀에는 계산식이 들어가요. 지역할증·하행·행 조정·열 조정(3행) 칸을 바꾸면 합계가 다시 계산됩니다.'
      ].concat(ha ? ['견적모음 상세의 <b>실적 연결</b>에서 매출처·경로를 이어 두면, 수주 후 실제 월별 매출·매입·이익을 견적 단가와 비교해서 보여 줍니다.'] : [])],
      ['reqs', '견적 접수함', [
        '견적 요청 메일이 오면 <b>＋ 견적 요청 등록</b>에서 거래처·메일 제목·본문을 붙여넣고, 받은 첨부파일을 끌어다 놓으세요. 원본 그대로 보관돼요.',
        '견적을 보내면 상세 화면에서 <b>제출 파일</b>(우리 견적서·엑셀)을 올리고, 제출일·제출 단가 요약을 적고 상태를 <b>제출</b>로 바꿔요.',
        '사이트에서 계산해 저장한 견적은 <b>견적모음 연결</b>로 이어 두면 상태(제출·수주·미수주)가 자동으로 맞춰져요.',
        '회신 기한이 2일 안으로 다가오면 접수함과 홈 화면에 표시돼요. 상태 변경·파일 추가는 모두 "기록"에 남아요.'
      ]],
      ['rates', '업체 단가', [
        '<b>양식 내려받기</b>로 받은 엑셀에 상차지 · 하차지 · 톤수 · 단가를 채워 <b>단가표 올리기</b>로 올려요. 업체마다 달랐던 양식을 이 하나로 통일합니다.',
        '<b>우리 타리프로 비교</b>: 올린 구간을 지금 단가로 계산해서 계약 단가와의 차이(원, %)를 보여 줘요. 계약 단가가 더 낮은 구간은 빨간색이에요.',
        '<b>이 구간으로 새 견적</b>: 단가표의 구간 그대로 대량 계산을 돌려요. 결과에서 금액 조정 후 견적으로 저장하면 거래처가 미리 채워져 있어요.',
        '<b>특수운임 설정</b>: 이 업체만 회사 기준과 다른 특수운임(냉동·리프트 등)을 정해요. 계산 화면의 특수운임에서 "업체 기준"을 고르면 적용돼요.'
      ]],
      ['docs', '서류함', [
        '사업자등록증, 통장사본, 허가증, 보험증권, 견적서 양식 같은 회사 서류를 올려 두고 필요할 때 바로 미리보기·다운로드합니다.',
        '만료일을 넣어 두면 30일 전부터 서류함과 홈 화면에 표시됩니다.',
        '여러 개를 체크한 뒤 <b>선택 ZIP 다운로드</b>를 누르면 한 파일로 묶어 받을 수 있어요. (입찰 서류 제출 등)',
        '파일은 회사 구글 드라이브의 비공개 폴더에 저장되고, 견적 메뉴 권한이 있는 사람만 볼 수 있습니다.'
      ]]
    );
    if (ha) sec.push(
      ['analysis', '매출매입 분석', [
        '위쪽에서 <b>기간</b>과 <b>사업자</b>를 고르고, 아래 순위표에서 매출처·발지·착지·기사·차량·중량·경로 조합별로 나눠 볼 수 있습니다.',
        '순위표의 줄을 누르면 그 조건으로 걸러지고, 위쪽 칩의 ✕를 누르면 풀립니다. <b>초기화</b>로 한 번에 풀 수도 있어요.',
        '<b>이익 = 매출 − 매입</b>, <b>이익률 = 이익 ÷ 매출</b>입니다. 비교 기준은 직전 같은 기간 또는 전년 같은 기간 중에서 고릅니다.',
        '<b>확인해 볼 곳</b>은 비교 기간보다 이익률이 떨어졌거나 적자로 바뀐 매출처입니다. 매출처 이름 옆 <b>상세</b>를 누르면 월별 추이와 주력·손실 경로가 나옵니다.',
        '<b>단가 이상치</b>는 같은 발지·착지·중량의 보통 단가(중앙값)보다 매입이 비싸거나 매출이 싼 오더입니다.',
        '<b>보고서</b> 버튼으로 지금 조건의 월간 보고서를 인쇄/PDF·엑셀로 만들 수 있습니다.',
        '<b>📌 단가 변경 기록</b>: 재계약·유가연동·구두 합의처럼 엑셀에 없는 단가 변경을 적어 두면, 그래프에 📌로 표시되고 확인해 볼 곳·매출처 상세·월간 보고서에도 같이 나와요. 지난 기록은 엑셀 양식으로 한꺼번에 올릴 수 있어요.'
      ]]
    );
    if (adm) sec.push(
      ['admin', '관리자', [
        '<b>타리프 단가</b>는 엑셀에서 1~600km × 9톤수 표를 복사해 붙여넣고 저장합니다. 실제 단가는 이 화면에서만 넣으세요.',
        '<b>계정 관리</b>에서 직원 계정을 만들고 메뉴 권한(견적·분석)을 정합니다. 퇴사자는 바로 <b>사용 중지</b>하세요.',
        '<b>분석 데이터</b>에 매월 사업자별 엑셀을 올립니다. 같은 달을 다시 올리면 덮어씁니다.',
        '<b>회사 정보</b>에 사업자 3곳의 정보와 직인을 넣으면 견적서에 들어갑니다.',
        '<b>직원 목록</b>에 직원마다 사업자·부서·팀·메일을 넣으세요. 시간외근무일지, 주간 요약 메일, 팀 월간 보고서에 쓰여요. 퇴사자는 지우지 말고 "재직"을 끄세요.',
        '서버 코드가 바뀌는 업데이트가 있으면 SETUP.md의 "업데이트가 나왔을 때" 순서대로 Apps Script에 붙여넣고 새 버전으로 배포하세요.'
      ]]
    );
    if (can('search')) sec.push(['search', '배차검색', [
      '새 오더가 오면 <b>업체·자료 → 배차검색</b>에서 업체·상차지·하차지·중량·차량번호·기사명·전화번호·비고를 칸마다 넣어 찾아요. 일부만 넣어도 되고, 여러 칸을 넣으면 모두 맞는 것만 나와요. 중량 옆 <b>정확히</b>를 켜면 1을 넣었을 때 11·1윙 없이 "1"만 나와요.',
      '예) 상차지 <b>평택</b> + 하차지 <b>창원</b> → 평택에서 창원 간 배차만. 매출처 설정에서 숨긴 업체는 나오지 않아요. 뒤로가기를 누르면 바로 전 검색 조건으로 돌아가요.',
      '차량번호·기사명을 누르면 그 차/기사로 다시 찾아요. 결과는 엑셀로 받을 수 있어요.',
      '데이터는 관리자가 분석 데이터에 올린 월별 엑셀이에요. 금액이 보이니 권한은 관리자가 계정마다 따로 줘요.'
    ]]);
    if (hq) sec.push(['custs', '거래처', [
      '<b>업체·자료 → 거래처</b>에서 업체별 담당자·연락처·계약 기간·결제 조건을 적어 두면, 그 업체의 견적 접수·견적모음·업체 단가표·할 일' + (ha ? '·단가 변경 기록' : '') + '이 한 화면에 모여요.',
      '이름이 조금씩 다르게 적힌 업체는 "같은 업체로 볼 다른 이름"에 쉼표로 넣으세요 (예: 삼다수, 제주개발공사).',
      '계약 만료일을 넣으면 30일 전부터 홈 "만료 임박"과 달력, 주간 요약에 나와요.'
    ]]);
    if (hq) sec.push(['work', '업무 매뉴얼 · 담당표 · 문의 기록', [
      '<b>업무 매뉴얼</b>: 업체별(또는 공통) 처리 순서·연락처·문제와 대처·주의사항을 적어 두는 곳이에요. 사진·파일도 붙이고, 누가 언제 무엇을 고쳤는지 "수정 이력"에 남아요. <b>인쇄</b>로 한 장씩 뽑을 수 있어요.',
      '<b>업무 담당표</b>: 업무마다 주담당·부담당을 정해요. 주담당이 휴가로 등록돼 있으면 홈 "오늘 할 일"과 주간 요약에 "부담당 OO"가 대신 맡는다고 나와요. 담당이 바뀐 기록도 남아요.',
      '<b>문의 기록</b>: 업체 전화·메일 문의를 한 줄로 남겨요. 좋은 답변은 <b>⭐ 자주 묻는</b>을 켜면 그 업체 매뉴얼의 "자주 묻는 질문"에 자동으로 모여요.',
      '거래처 카드에서도 그 업체 매뉴얼과 담당자를 바로 볼 수 있어요.'
    ].concat(ha ? ['<b>팀 월간 보고서</b>(분석 메뉴): 관리자 → 직원 목록의 "팀" 칸 기준으로 팀원별 업무·견적·문의·추가근무와 주담당 업체의 매출·이익을 한 장으로 만들어요. 인쇄/PDF·엑셀 가능.'] : [])]);
    sec.unshift(['notice', '팀 공지', ['홈 화면 맨 위 <b>팀 공지</b>에서 누구나 공지를 쓸 수 있어요. 본인 글과 관리자만 고치거나 지울 수 있고, 📌 고정은 관리자만 해요. 최근 공지는 주간 요약 메일에도 들어가요.']]);
    sec.unshift(['info', '물류 정보', [
      '<b>유가</b>: 오피넷 전국 평균 경유가를 주식 화면처럼 기간별(1주~전체) 그래프로 봅니다. 그래프에 마우스를 올리면 그날 가격과 전일 대비가 나와요.',
      '<b>뉴스</b>: 화물연대·안전운임·유가 같은 물류 업계 이슈를 구글 뉴스에서 30분마다 모아요. 키워드별로 걸러 보고, 제목을 누르면 원문이 열립니다. ⭐는 관심 업체 기사예요.',
      '<b>관심 종목</b>: 홈 화면 카드의 <b>종목 설정</b>에서 국내·해외 종목을 5개까지 골라요 (사람마다 따로 저장). 장중(미국 종목은 한국 시간 밤)에는 1분마다 새로 받고, 누르면 3개월 그래프가 나와요. 네이버 금융 시세라 가끔 안 나올 수 있어요.',
      '<b>날씨</b>: 경기·충청·전라·강원·경상 도별 오늘·내일·모레 날씨. 눈·많은 비·강풍처럼 운행에 영향을 줄 날씨는 맨 위 "운행 주의"에 모아 보여요.'
    ].concat(adm ? ['뉴스 키워드(모을 키워드·관심 업체·제외 단어)는 뉴스 탭의 <b>키워드 설정</b>에서 바꿉니다.'] : [])]);
    sec.unshift(['cal', '일정 · 할 일 · 휴가', [
      '<b>달력</b>: 월요일부터 시작해요. 공휴일(구글 캘린더 "대한민국의 휴일"), 당직, 휴가, 추가근무, 할 일' + (hq ? ', 견적 회신 기한, 서류 만료일' : '') + ', 일정을 한 달 단위로 봐요. 위쪽 칩으로 보일 것만 고를 수 있어요.',
      '날짜를 누르면 그날 항목을 보고 바로 <b>일정 · 할 일 · 휴가·근무</b>를 추가할 수 있어요. 일정은 팀 전체가 보고, "나만 보기"를 켜면 나만 봐요.',
      '<b>할 일</b>: 업체별로 일회·매일·매월 말일·매월 N일·매주·매년 반복을 정해요. 기한이 주말·공휴일이면 앞 영업일(또는 다음 영업일)로 당겨져요.',
      '체크하면 목록에서 사라지고 <b>완료 기록</b>에 누가 언제 했는지 남아요. 잘못 체크했으면 완료 기록에서 되돌리기.',
      '<b>휴가·근무</b>: 연차·반차·병가·경조·공가·대체휴무와 야간근무·휴일근무를 등록해요. 반차는 0.5일, 연차는 주말·공휴일을 빼고 셉니다.' + (adm ? ' 관리자는 사람별 <b>연차 부여 일수</b>와 <b>회사 휴무일</b>을 정할 수 있어요.' : ''),
      '<b>당직 순번</b>: 휴가·근무 탭의 "당직 순번 규칙"에 순서·시작 주·시간을 정해 두면 앞으로의 당직이 달력에 자동으로 나오고 추가근무(당직)에도 들어가요. 한 주만 바꾸려면 달력에서 그 날짜를 눌러 "바꾸기".',
      '<b>시간외근무일지</b>: 휴가·근무 탭의 월별 추가근무에서 이름 옆 <b>일지</b> 또는 <b>시간외근무일지 (전체)</b>를 누르면 회사 양식 엑셀이 나와요. 부서·사업자는 관리자 → 직원 목록에서 가져와요. 당직은 끝나는 날이 속한 달로 들어가요.',
      '<b>주간 요약</b>: 일정의 📋 주간 요약 탭에서 이번 주 당직·휴가·할 일·견적 회신·만료 임박과 지난주 추가근무를 한눈에 봐요. 같은 내용이 매주 월요일 오전 8시 메일로 가요.',
      '<b>추가근무</b>: 야간근무·휴일근무·당직에 시작·종료 시각과 시간을 넣으면 <b>월별 추가근무</b> 표에 사람별 시간 합계가 나와요. 월말에 그 달을 골라 <b>엑셀</b>로 받으면 요약·상세가 들어 있어요.'
    ].concat(adm ? ['관리자: <b>관리자 → 직원 목록</b>에서 계정 없는 직원도 추가하고, <b>엑셀 가져오기</b>로 예전 기록(휴가근무·일정·연차부여 시트)을 한 번에 넣을 수 있어요. 같은 기록은 건너뛰어요.'] : [])]);
    sec.push(['account', '계정 · 보안', [
      '오른쪽 위 <b>비밀번호</b>에서 언제든 바꿀 수 있습니다. 로그인은 브라우저 창을 닫으면 풀립니다.',
      '비밀번호를 5번 틀리면 10분 동안 잠깁니다. 잊어버렸다면 관리자에게 초기화를 요청하세요.',
      '브라우저 <b>뒤로·앞으로</b> 버튼(마우스 측면 버튼)으로 이전 화면에 돌아갈 수 있어요. 새로고침해도 보던 화면이 그대로 나와요.',
      '화면이 이상하면 <b>Ctrl + F5</b>로 새로고침해 보세요.'
    ]]);
    $('#main').innerHTML =
      '<div class="help-grid"><nav class="card rail help-rail">' + sec.map(function (s) { return '<button data-sec="' + s[0] + '">' + s[1] + '</button>'; }).join('') + '</nav>' +
      '<div><div class="card help-head"><div class="eyebrow">Guide · 사용 안내</div><h2>JOIL 사용법</h2><p class="muted small" style="margin:6px 0 0">' + esc(state.user.name) + '님이 쓸 수 있는 메뉴만 안내합니다.</p></div>' +
      sec.map(function (s) {
        return '<section class="card help-sec" id="help-' + s[0] + '"><h3>' + s[1] + '</h3><ul>' + s[2].map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>' +
          (['cal', 'search', 'custs', 'info', 'calc', 'bulk', 'history', 'reqs', 'rates', 'docs', 'analysis', 'admin'].indexOf(s[0]) !== -1 ? '<button class="btn btn-sm" data-open="' + (s[0] === 'history' ? 'quotes' : s[0]) + '">' + s[1].split(' · ')[0] + ' 열기 →</button>' : '') + '</section>';
      }).join('') + '</div></div>';
    $$('.help-rail button').forEach(function (b) { b.onclick = function () { var t = $('#help-' + b.dataset.sec); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }; });
    $$('.help-sec [data-open]').forEach(function (b) { b.onclick = function () { state.view = b.dataset.open === 'quotes' ? 'history' : b.dataset.open; render(); window.scrollTo(0, 0); }; });
  }

  /* ───────── 시작 ───────── */

  state.an = newAnState();
  state.cal = newCalState();

  window.addEventListener('beforeunload', function (e) {
    if (state.admin.tariffDirty || state.admin.settingsDirty || state.bulk.running) { e.preventDefault(); e.returnValue = ''; }
  });

  if (state.token) {
    app.innerHTML = '<div class="login-wrap"><div class="muted">불러오는 중…</div></div>';
    api('me').then(function (r) { state.user = r.user; return afterLogin(r.settings); })
      .catch(function (err) {
        // 네트워크 문제일 때는 로그인 정보를 지우지 않고 다시 시도할 수 있게
        if (/만료|필요|중지/.test(err.message)) { clearSession(); render(); return; }
        app.innerHTML = '<div class="login-wrap"><div class="card" style="max-width:420px;text-align:center"><p style="margin:0 0 14px">' + esc(err.message) + '</p><button class="btn btn-primary" onclick="location.reload()">다시 시도</button></div></div>';
      });
  } else {
    render();
  }
})();
