// 화면 테스트 도우미: 데모 모드(가짜 서버)로 사이트를 열어요. 바깥 인터넷은 막아요(카카오 지도·엑셀 CDN 없음) · 가짜 데이터만 써요.
var pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
var PORT = process.env.PORT || 8765, fails = 0;
exports.devices = pw.devices;
exports.url = 'http://localhost:' + PORT + '/';
exports.ok = function (name, cond, info) { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined && !cond ? ' :: ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };
/** opts: { login: false, context: {…}, config: 'config.js 내용', init: 함수(페이지 시작 전에 실행), initArg } */
exports.open = async function (opts) {
  opts = opts || {};
  var browser = await pw.chromium.launch();
  var ctx = await browser.newContext(Object.assign({ viewport: { width: 1600, height: 1000 } }, opts.context || {}));
  var page = await ctx.newPage(); page.errs = [];
  page.on('pageerror', function (e) { page.errs.push(e.message); });
  page.on('dialog', function (d) { d.accept(); });
  await page.route('**/config.js', function (r) { r.fulfill({ contentType: 'application/javascript', body: opts.config || "window.JOIL_CONFIG={API_URL:''};" }); });
  await page.route(/^https?:\/\/(?!localhost)/, function (r) { r.abort(); });
  if (opts.init) await ctx.addInitScript(opts.init, opts.initArg);
  await page.goto(exports.url);
  if (opts.login !== false) await exports.login(page, 'admin', 'demo1234', opts.touch);
  return { browser: browser, page: page, ctx: ctx };
};
exports.login = async function (page, id, pw_, touch) {
  await page.waitForSelector('#lid'); await page.fill('#lid', id); await page.fill('#lpw', pw_);
  if (touch) await page.tap('#loginForm button[type=submit]'); else await page.click('#loginForm button[type=submit]');
  await page.waitForTimeout(800);
};
/** 다른 계정으로 다시 로그인 (임시 비밀번호면 바꾸기까지) */
exports.relog = async function (page, id, pw_) {
  await page.evaluate(function () { sessionStorage.clear(); try { localStorage.removeItem('joil-keep'); } catch (e) {} location.hash = ''; }); await page.reload(); await exports.login(page, id, pw_);
  if (await page.$('#pwSave')) { await page.fill('#pwCur', pw_); await page.fill('#pwNew', 'test1234a'); await page.fill('#pwNew2', 'test1234a'); await page.click('#pwSave'); await page.waitForTimeout(800); }
};
/** 데모 서버를 바로 부르기 (화면을 거치지 않고 준비·확인) */
exports.api = async function (page, action, req) {
  return page.evaluate(async function (a) {
    var tok = null; for (var i = 0; i < sessionStorage.length; i++) { var k = sessionStorage.key(i), v = sessionStorage.getItem(k); if (/^[0-9a-f]{16,}$/i.test(v) || /token/i.test(k)) tok = v; }
    window.__noDelay = 1; try { return await window.JoilDemo.call(Object.assign({ token: tok }, a)); } catch (e) { return { error: e.message }; } finally { window.__noDelay = 0; }
  }, Object.assign({ action: action }, req));
};
/** 데모 서버를 일부러 늦추기 (exports.api로 부르는 것은 안 늦춰요) */
exports.slow = async function (page, ms) { await page.evaluate(function (ms) { var c = window.JoilDemo.call; window.JoilDemo.call = function (req) { if (window.__noDelay) return c(req); return new Promise(function (ok) { setTimeout(ok, ms); }).then(function () { return c(req); }); }; }, ms); };
exports.dispatch = async function (page, date, cust) {
  await page.evaluate(function () { location.hash = '#/dispatch'; });
  await page.waitForSelector('#dpCust', { timeout: 10000 }); if (cust) await page.selectOption('#dpCust', cust);
  await page.waitForSelector('#dpDate', { timeout: 10000 });
  if (date) { await page.fill('#dpDate', date); await page.dispatchEvent('#dpDate', 'change'); await page.waitForTimeout(600); await page.waitForSelector('#dpDate'); }
};
/** 배차 탭 고르기 (위 탭 줄에 없으면 '더 보기' 목록에서) */
exports.tab = async function (page, name) {
  await page.waitForSelector('#dpTabs', { timeout: 15000 });
  var hit = await page.evaluate(function (n) { var b = document.querySelector('#dpTabs [data-tab="' + n + '"]'); if (b) b.click(); return !!b; }, name);
  if (!hit) await page.selectOption('#dpTabMore', name);
  await page.waitForTimeout(500);
};
/** 오더 붙여넣기 → 가져오기 (미리보기 글을 돌려줘요) */
exports.paste = async function (page, text) {
  await page.evaluate(function () { var d = document.querySelector('details.dp-paste'); if (d) d.open = true; });
  await page.fill('#dpPasteIn', text); await page.dispatchEvent('#dpPasteIn', 'input'); await page.waitForTimeout(300);
  var info = await page.textContent('#dpPasteInfo'); await page.click('#dpImport'); await page.waitForTimeout(1500); return info;
};
/** 동방 오더 한 줄 (30칸, 탭 구분) — 전부 가짜 값 */
exports.orderRow = function (date, i, fc, addr, bundle, extra) {
  var r = new Array(30).fill(''); r[0] = (extra && extra.from) || '테스트출발'; r[1] = '제조A'; r[2] = '품목' + i; r[3] = date; r[4] = '10'; r[5] = '10'; r[6] = 'D' + i; r[7] = fc; r[8] = 'PO' + i; r[9] = 'BL' + i; r[10] = String(bundle); r[16] = String(bundle * 100); r[25] = addr || '가상도 가상시 가상로 ' + i; r[26] = '09~18';
  if (extra) Object.keys(extra).forEach(function (k) { if (/^\d+$/.test(k)) r[Number(k)] = extra[k]; });
  return r.join('\t');
};
exports.text = function (page, sel) { return page.$eval(sel, function (e) { return e.innerText.replace(/\s+/g, ' '); }).catch(function () { return null; }); };
exports.done = async function (o) { exports.ok('화면 오류 없음', !o.page.errs.length, o.page.errs); await o.browser.close(); if (fails) process.exitCode = 1; };
exports.run = function (fn) { fn().catch(function (e) { console.log('FAIL 테스트 중단 :: ' + (e && e.message || e).split('\n')[0]); process.exit(1); }); };
