// 지도 미리보기(체크한 오더만 · 호차 안 바꿈) · 태블릿 손가락 동작 (카카오 지도는 막혀 있어서 흉내 낸 가짜 지도로)
var T = require('../lib/browser.js'), ok = T.ok, api = T.api, DATE = '2026-11-10';
T.run(async function () {
  var o = await T.open({ login: false, config: "window.JOIL_CONFIG={API_URL:'',KAKAO_JS_KEY:'x'};", init: function () {
    window.__demoGeo = { '가상도 출발로 1': { lat: 37.0, lng: 127.0 }, '가상도 먼곳 1': { lat: 37.6, lng: 127.0 }, '가상도 가까운곳 1': { lat: 37.1, lng: 127.0 }, '가상도 중간 1': { lat: 37.3, lng: 127.0 } };
    window.__log = [];
    function LatLng(a, b) { this.a = a; this.b = b; }
    function Map(el) { this.lv = 8; el.innerHTML = '<div class="tile" style="width:100%;height:100%"></div>'; }
    Map.prototype = { setBounds: function () {}, setLevel: function (l, o) { window.__log.push('level ' + l + (o && o.anchor ? ' anchor' : '')); this.lv = l; }, getLevel: function () { return this.lv; },
      getProjection: function () { return { coordsFromContainerPoint: function (q) { return new LatLng(q.x, q.y); } }; }, setCenter: function (c) { window.__log.push('center ' + Math.round(c.a) + ',' + Math.round(c.b)); },
      setDraggable: function (v) { window.__log.push('drag ' + v); }, setZoomable: function (v) { window.__log.push('zoom ' + v); } };
    window.kakao = { maps: { LatLng: LatLng, Map: Map, LatLngBounds: function () { this.extend = function () {}; }, CustomOverlay: function () {}, Polyline: function () {}, Point: function (x, y) { this.x = x; this.y = y; } } };
  } }), p = o.page;
  await T.login(p, 'admin', 'demo1234');
  await api(p, 'loading.save', { cust: '쿠팡부자재', place: { name: '테스트출발', addr: '가상도 출발로 1' } });
  await p.reload(); await p.waitForTimeout(800); await T.dispatch(p, DATE, '쿠팡부자재');
  await T.paste(p, [T.orderRow(DATE, 1, '먼센터', '가상도 먼곳 1', 5), T.orderRow(DATE, 2, '가까운센터', '가상도 가까운곳 1', 3), T.orderRow(DATE, 3, '중간센터', '가상도 중간 1', 4)].join('\n'));
  await p.waitForTimeout(2000);
  var cbs = await p.$$('tr[data-o] [data-sel]'); for (var i = 0; i < cbs.length; i++) await cbs[i].check();
  await p.click('#dpPeek'); await p.waitForSelector('#dpMap .tile', { timeout: 8000 });
  var t = await T.text(p, '.modal');
  ok('미리보기 창: 착지·번들·무게 요약', /체크한 오더 지도/.test(t) && /3곳 · 12번들 · 1,200kg/.test(t) && /호차는 바뀌지 않아요/.test(t), t.slice(0, 300));
  var route = await p.$$eval('.dp-route li', function (l) { return l.map(function (x) { return x.innerText.replace(/\s+/g, ' '); }); });
  ok('추천 순서 (가까운 → 중간 → 먼)', /가까운센터/.test(route[1]) && /중간센터/.test(route[2]) && /먼센터/.test(route[3]), route);

  // 손가락 동작
  var res = await p.evaluate(function () {
    var el = document.querySelector('#dpMap'), tile = el.querySelector('.tile'), r = el.getBoundingClientRect();
    var ev = function (type, id, x, y, kind) { tile.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: kind || 'touch', clientX: r.left + x, clientY: r.top + y })); };
    window.__log = []; ev('pointerdown', 1, 100, 100); ev('pointermove', 1, 130, 110); ev('pointermove', 1, 150, 150); ev('pointerup', 1, 150, 150);
    return new Promise(function (done) { setTimeout(function () {
      var drag = window.__log.slice(); window.__log = [];
      ev('pointerdown', 1, 100, 100); ev('pointerdown', 2, 140, 100); ev('pointermove', 2, 220, 100); ev('pointermove', 1, 40, 100); var mid = tile.style.transform; ev('pointerup', 2, 0, 0); ev('pointerup', 1, 0, 0);
      var pin = window.__log.slice(), after = tile.style.transform; window.__log = [];
      ev('pointerdown', 9, 10, 10, 'mouse'); ev('pointermove', 9, 50, 10, 'mouse');
      done({ drag: drag, pin: pin, mid: mid, after: after, mouse: window.__log.slice(), w: el.clientWidth / 2, h: el.clientHeight / 2, touch: getComputedStyle(el).touchAction });
    }, 100); });
  });
  ok('한 손가락 끌기: 움직인 만큼(50,50) 지도 중심 이동', res.drag.indexOf('center ' + Math.round(res.w - 50) + ',' + Math.round(res.h - 50)) !== -1 && res.drag[res.drag.length - 1] === 'drag true', res.drag);
  ok('두 손가락: 벌리는 동안 화면을 늘림', /scale\(4\.5\)/.test(res.mid), res.mid);
  ok('손을 떼면 가까운 단계(2단계 확대)로 맞추고 늘림 해제', res.pin.indexOf('level 6 anchor') !== -1 && res.after === '', [res.pin, res.after]);
  ok('마우스는 지도에 맡김 · 브라우저가 손가락 동작을 가져가지 않음', res.mouse.length === 0 && res.touch === 'none', [res.mouse, res.touch]);
  await p.click('.modal [data-close]'); await p.waitForTimeout(400);
  var d = await api(p, 'dispatch.day', { cust: '쿠팡부자재', date: DATE });
  ok('미리보기 뒤에도 오더는 그대로 미배정', d.orders.length === 3 && d.orders.every(function (x) { return x.truck === '' || x.truck == null; }));
  await T.done(o);
});
