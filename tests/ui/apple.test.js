// 애플 업체(초기): 업체 고르기 · 간단 붙여넣기 · 짧은 문자 + 출발·도착 버튼 링크(go.html) · 기사 화면 버튼(위치 거부해도 시각) · 되돌리기 · 배차 화면 기록 · 쿠팡부자재 문자는 그대로 (데모)
var T = require('../lib/browser.js'), ok = T.ok, api = T.api;
T.run(async function () {
  var o = await T.open({ context: { geolocation: { latitude: 37.5, longitude: 127.0, accuracy: 10 }, permissions: ['geolocation', 'clipboard-read', 'clipboard-write'] } }), p = o.page;
  var D = await p.evaluate(function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); });
  // 붙여넣기 (엑셀 탭 · / 로 나눈 글 · 제목 줄)
  var pr = await p.evaluate(function (D) {
    var c = window.JOIL_CUST.filter(function (x) { return x.name === '애플'; })[0].make({ esc: function (s) { return s; }, parseTsv: function (t) { return t.split('\n').filter(Boolean).map(function (l) { return l.split('\t'); }); } });
    return [c.parse('가상상차\t하차A\t가상시 1\t09:00~15:00\t4\t부품\n가상상차\t하차B\t가상시 2\t\t2\t', '애플', D), c.parse('가상상차 / 하차C / 가상시 3 / 10시~16시 / 3', '애플', D), c.parse('상차지\t하차지\t주소\t수량\n가상상차\t하차D\t가상시 4\t5', '애플', D)];
  }, D);
  ok('붙여넣기: 탭·/·제목 줄', pr[0].items.length === 2 && pr[0].items[0].d.hours === '09:00~15:00' && pr[1].items[0].d.fc === '하차C' && pr[1].items[0].d.hours === '10시~16시' && pr[2].items[0].d.fc === '하차D' && pr[2].items[0].d.bundle === '5', pr);

  await api(p, 'loading.save', { place: { name: '가상상차', addr: '가상시 상차로 1', time: '08:00~16:00' }, cust: '애플' });
  await api(p, 'dispatch.import', { cust: '애플', rows: pr[0].items });
  var dp = await api(p, 'dispatch.day', { cust: '애플', date: D });
  await api(p, 'dispatch.save', { cust: '애플', date: D, orders: dp.orders.map(function (x, i) { return { id: x.id, truck: 1, seq: i + 1 }; }), trucks: [{ no: 1, car: '12가3456', driver: '가짜기사' }] });
  var tok = (await api(p, 'dispatch.day', { cust: '애플', date: D })).trucks[0].token;
  ok('호차 링크코드', /^[0-9a-f]{20}$/.test(tok || ''), tok);

  await T.dispatch(p, D, '애플'); await p.waitForTimeout(800);
  ok('업체 고르기에 애플 · 애플 탭', /애플/.test(await T.text(p, '#dpTabs')));
  ok('배차 화면: 출발·도착 기록 칸', /출발·도착 기록/.test(await T.text(p, '.ap-ev')) && /아직 누른 기사가 없어요/.test(await T.text(p, '.ap-ev')));
  var b = await p.$$('[data-copy]'); if (b.length) await b[0].click(); await p.waitForTimeout(500);
  var clip = await p.evaluate(function () { return navigator.clipboard.readText(); });
  ok('애플 문자: 짧게 · 상차·하차 순서 · go.html 링크', /^\[배차\]/.test(clip) && /상차: 가상상차/.test(clip) && /1\) 하차A/.test(clip) && /2\) 하차B/.test(clip) && clip.indexOf('go.html#' + tok) !== -1 && !/착지·길안내/.test(clip) && clip.split('\n').length <= 10, clip);

  await api(p, 'track.save', { vehicle: { plate: '12가 3456', track_mode: 'work' } }); // 차량 위치 '배차 출발~도착만' 차(022)
  // 기사 화면
  var g = await o.ctx.newPage(); g.errs = []; g.on('pageerror', function (e) { g.errs.push(e.message); }); g.on('dialog', function (d) { d.accept(); });
  await g.route('**/config.js', function (r) { r.fulfill({ contentType: 'application/javascript', body: "window.JOIL_CONFIG={API_URL:''};" }); });
  await g.route(/^https?:\/\/(?!localhost)/, function (r) { r.abort(); });
  await g.setViewportSize({ width: 390, height: 800 });
  await g.goto(T.url + 'go.html#' + tok); await g.waitForSelector('[data-ev="dep"]');
  var gt = await T.text(g, 'body');
  ok('기사 화면: 상차지·하차 2곳·큰 버튼·한 줄 안내', /가상상차/.test(gt) && /하차 2곳/.test(gt) && /상차지 출발/.test(gt) && /하차A 도착/.test(gt) && /그 시각과 그때 위치/.test(gt) && /인수증 올리기/.test(gt), gt);
  ok('출발~도착만 차: 마지막 하차지에만 작은 안내(팝업 없음)', (await g.$$eval('.tip', function (l) { return l.filter(function (x) { return /도착을 누르면 위치 전송이 종료됩니다/.test(x.textContent); }).map(function (x) { return x.closest('.card').id; }); })).join() === 'st1');
  var bh = await g.$eval('[data-ev="dep"]', function (x) { return x.getBoundingClientRect().height; }); ok('버튼이 커요 (60px 이상)', bh >= 60, bh);
  await g.click('[data-ev="dep"]'); await g.waitForSelector('.big.done');
  var ev = await api(p, 'dispatch.events', { cust: '애플', date: D });
  ok('출발: 시각과 위치 기록', ev.events.length === 1 && ev.events[0].kind === 'dep' && ev.events[0].lat === 37.5, ev);
  await g.click('[data-undo]'); await g.waitForSelector('[data-ev="dep"]');
  ok('되돌리기', (await api(p, 'dispatch.events', { cust: '애플', date: D })).events.length === 0);
  await g.click('[data-ev="dep"]'); await g.waitForSelector('.big.done');
  // 위치 거부: 권한 지우기만으론 브라우저가 1분 안에 받은 위치(maximumAge)를 돌려줄 때가 있어 시각·타이밍마다 갈렸어요 → 거부 응답을 직접
  await g.evaluate(function () { navigator.geolocation.getCurrentPosition = function (ok, no) { setTimeout(function () { no({ code: 1, message: 'denied' }); }, 10); }; });
  await g.click('[data-ev="arr"][data-stop="0"]'); await g.waitForSelector('#st0 .big.done', { timeout: 10000 });
  ev = await api(p, 'dispatch.events', { cust: '애플', date: D });
  var a0 = ev.events.filter(function (x) { return x.kind === 'arr'; })[0];
  ok('위치를 거부해도 도착 시각은 기록', a0 && a0.stop === 0 && a0.lat == null && a0.fc === '하차A', ev);
  ok('기사 화면 오류 없음', !g.errs.length, g.errs);
  await o.ctx.grantPermissions(['clipboard-read', 'clipboard-write']);

  // 배차 화면에 기록
  await p.reload(); await T.dispatch(p, D, '애플'); await p.waitForTimeout(1200);
  var at = await T.text(p, '.ap-ev'); ok('배차 화면: 1호차 출발·하차A 도착 시각', /1호차/.test(at) && /출발 \d{2}:\d{2}/.test(at) && /하차A 도착 \d{2}:\d{2}/.test(at), at);

  // 쿠팡부자재 문자는 그대로 (drv 링크 · 착지·길안내)
  var K = '쿠팡부자재/평택';
  await api(p, 'dispatch.import', { cust: K, rows: [{ date: D, key: 'cp1', d: { fc: '쿠팡센터', bundle: '2', kg: '200', date: D, from: '출발', addr: '가상시 가상로 9' } }] });
  var cd = await api(p, 'dispatch.day', { cust: K, date: D });
  await api(p, 'dispatch.save', { cust: K, date: D, orders: [{ id: cd.orders[0].id, truck: 1, seq: 1 }], trucks: [{ no: 1, car: '34나5678' }] });
  await T.dispatch(p, D, '쿠팡부자재'); await p.waitForTimeout(500);
  var tabs = await p.$$('#dpTabs button'); for (var tb of tabs) { if (/평택/.test(await tb.textContent()) && !/보스턴|선진|컬리/.test(await tb.textContent())) { await tb.click(); break; } }
  await p.waitForTimeout(800);
  ok('쿠팡부자재 화면엔 출발·도착 기록 칸 없음', !(await p.$('.ap-ev')));
  var cb = await p.$$('[data-copy]'); if (cb.length) { await cb[0].click(); await p.waitForTimeout(600); if (!/착지/.test(await p.evaluate(function () { return navigator.clipboard.readText(); }))) { await cb[0].click(); await p.waitForTimeout(600); } }
  var cc = await p.evaluate(function () { return navigator.clipboard.readText(); });
  ok('쿠팡부자재 문자: 예전 그대로 (착지·길안내 · go.html 아님)', /착지·길안내·인수증 올리기/.test(cc) && cc.indexOf('go.html') === -1, cc);
  ok('화면 오류 없음', !p.errs.length, p.errs);
  await T.done(o);
});
