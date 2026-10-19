/* 인천항 임시출입 신청 자동 입력 (1차)
   1) JOIL 삼다수 인천항 탭에서 "출입등록 복사" → 2) 인천항출입등록.bat 실행
   1단계(기사 정보·방문업체·동의)는 자동으로 넣고 "등록"까지 눌러요.
   2단계(날짜·차량 등)는 아직 사람이 직접 진행하고, 그동안 누른 순서와 화면 구조를 기록_*.json에 남겨요
   (기사 이름·생년월일·전화·차량번호는 {이름} 같은 표시로 바꿔서 저장 → 이 파일을 보내 주시면 2단계도 자동으로 만들어요). */
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process'), readline = require('readline');
var { chromium } = require('playwright-core');

var DIR = __dirname, SITE = 'https://www.icpa.or.kr/tpss/';
var log = function (m) { console.log(m); };
var ask = function (q) { var rl = readline.createInterface({ input: process.stdin, output: process.stdout }); return new Promise(function (ok) { rl.question(q, function (a) { rl.close(); ok(a); }); }); };

function loadConf() {
  var f = path.join(DIR, '설정.json');
  if (!fs.existsSync(f)) { fs.copyFileSync(path.join(DIR, '설정.예시.json'), f); }
  var c = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!/^\d{3}-\d{2}-\d{5}$/.test(c['방문업체_사업자등록번호'] || '') || c['방문업체_사업자등록번호'] === '000-00-00000') throw new Error('설정.json에 방문업체 사업자등록번호(000-00-00000 형식)를 넣어 주세요: ' + f);
  return c;
}
/* JOIL에서 복사한 목록: 클립보드 → 없으면 같은 폴더의 기사목록.json */
function loadList() {
  var txt = '';
  try { txt = cp.execSync('powershell -NoProfile -Command "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard -Raw"', { encoding: 'utf8' }); } catch (e) {}
  var f = path.join(DIR, '기사목록.json');
  if (!/"joil"\s*:\s*"icpa"/.test(txt) && fs.existsSync(f)) txt = fs.readFileSync(f, 'utf8');
  var m = txt.match(/\{[\s\S]*"joil"\s*:\s*"icpa"[\s\S]*\}/); if (!m) throw new Error('JOIL 삼다수 인천항 탭에서 "출입등록 복사"를 먼저 눌러 주세요.');
  var d = JSON.parse(m[0]); if (!d.list || !d.list.length) throw new Error('복사한 목록에 기사가 없어요.');
  return d;
}

/* 기록: 사람이 누른 순서와 화면 구조 (기사 정보는 {이름} 등으로 가림) */
function makeMask(dv) {
  var pairs = [['{이름}', dv.name], ['{생년월일}', dv.birth], ['{생년월일6}', dv.birth.slice(2)], ['{휴대전화}', dv.phone], ['{휴대전화숫자}', dv.phone.replace(/-/g, '')], ['{차량번호}', dv.car]].filter(function (p) { return p[1]; });
  pairs.sort(function (a, b) { return b[1].length - a[1].length; });
  return function (s) { s = String(s == null ? '' : s); pairs.forEach(function (p) { s = s.split(p[1]).join(p[0]); }); return s; };
}
var RECORDER = function () {
  if (window.__joilRec) return; window.__joilRec = 1;
  var sel = function (e) {
    if (!e || !e.tagName) return '';
    if (e.id && document.querySelectorAll('#' + CSS.escape(e.id)).length === 1) return '#' + e.id;
    if (e.name) return e.tagName.toLowerCase() + '[name="' + e.name + '"]' + (e.type === 'radio' || e.type === 'checkbox' ? '[value="' + e.value + '"]' : '');
    var t = (e.innerText || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    var on = e.getAttribute('onclick') || e.getAttribute('href') || '';
    var p = [], x = e; for (var i = 0; x && x.tagName && i < 5; i++) { var k = x.tagName.toLowerCase(); if (x.id) { p.unshift('#' + x.id); break; } if (x.className && typeof x.className === 'string') k += '.' + x.className.trim().split(/\s+/).slice(0, 2).join('.'); p.unshift(k); x = x.parentElement; }
    return p.join(' > ') + (t ? ' ["' + t + '"]' : '') + (on ? ' {' + on.slice(0, 80) + '}' : '');
  };
  var send = function (o) { try { o.url = location.pathname; o.t = Date.now(); window.__joilLog(o); } catch (e) {} };
  var shown = {};
  var checkPops = function () { // 클릭 뒤 떠 있는 알림창·레이어 팝업 문구
    [].forEach.call(document.querySelectorAll('.wrap_modal, .wrap_layer, [class*=popup], [id*=popup], [class*=modal]'), function (n) {
      var st = getComputedStyle(n), t = (n.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 300);
      if (st.display === 'none' || st.visibility === 'hidden' || !t || shown[t]) return; shown[t] = 1;
      send({ ev: 'popup', sel: sel(n), text: t, html: n.outerHTML.slice(0, 3000) });
    });
  };
  document.addEventListener('click', function (ev) { var e = ev.target.closest('a,button,input,select,label,li,td,tr,span,div') || ev.target; send({ ev: 'click', sel: sel(e), tag: e.tagName, text: (e.innerText || '').trim().slice(0, 40) }); setTimeout(checkPops, 600); setTimeout(checkPops, 2000); }, true);
  document.addEventListener('change', function (ev) { var e = ev.target; var v = e.tagName === 'SELECT' ? (e.options[e.selectedIndex] || {}).text + ' (value=' + e.value + ')' : (e.type === 'checkbox' || e.type === 'radio') ? (e.checked ? '체크' : '해제') : e.value; send({ ev: 'change', sel: sel(e), type: e.type || e.tagName, value: v }); }, true);
  var snap = function (why) {
    var c = document.documentElement.cloneNode(true);
    c.querySelectorAll('script,style,link,meta,img,svg,iframe,noscript').forEach(function (x) { x.remove(); });
    c.querySelectorAll('input,textarea').forEach(function (x) { x.removeAttribute('value'); x.textContent = ''; });
    send({ ev: 'page', why: why, title: document.title, html: c.outerHTML });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { snap('열림'); }); else snap('열림');
  // 화면 안에서 뜨는 알림창(레이어 팝업)도 기록
  var seen = '';
  new MutationObserver(function (ms) { ms.forEach(function (m) { m.addedNodes.forEach(function (n) {
    if (n.nodeType === 1 && /pop|layer|modal|alert|dialog/i.test((n.className || '') + ' ' + (n.id || ''))) setTimeout(function () { var t = (n.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 300); if (t && t !== seen) { seen = t; send({ ev: 'popup', sel: sel(n), text: t, html: n.outerHTML.slice(0, 3000) }); } }, 150);
  }); }); }).observe(document.documentElement, { childList: true, subtree: true });
};

/* 사이트 알림창(.wrap_modal: 문구 .msg + 확인/취소) */
async function modalOk(page) { await page.waitForSelector('.wrap_modal .msg', { state: 'visible', timeout: 10000 }); await page.click('.wrap_modal button:has-text("확인")'); await page.waitForTimeout(300); }

async function step1(page, dv, conf) {
  await page.goto(SITE, { waitUntil: 'networkidle' });
  await page.evaluate(function () { var e = document.getElementById('popNoti'); if (e) e.remove(); });
  await page.waitForSelector('a[href$="/cardTemp/cardProposalTerms.do"]', { state: 'attached', timeout: 30000 }); await Promise.all([page.waitForURL(/cardProposalTerms/, { timeout: 30000 }), page.evaluate(function () { document.querySelector('a[href$="/cardTemp/cardProposalTerms.do"]').click(); })]); await page.waitForSelector('#confirmNm');
  await page.fill('#confirmNm', dv.name);
  await page.fill('#confirmBirth', dv.birth);
  await page.selectOption('select#confirmGender', conf['성별'] === '여성' ? '0' : '1');
  await page.fill('#confirmPhone', dv.phone);
  // 방문업체: 사업자등록번호로 검색해서 고르기
  await page.click('button:has-text("신청업체 검색")'); await page.waitForSelector('#searchContent');
  await page.selectOption('#searchOption', 'REG_NO'); await page.fill('#searchContent', conf['방문업체_사업자등록번호']); await page.click('#companySearch');
  await page.waitForSelector('#tbodyCompany tr:has-text("' + conf['방문업체_사업자등록번호'] + '")', { timeout: 10000 });
  await page.click('#tbodyCompany tr:has-text("' + conf['방문업체_사업자등록번호'] + '")');
  await modalOk(page); // "(업체)이(가) 맞습니까?" → 확인
  await page.waitForFunction(function () { return document.getElementById('regNo').value; });
  if (await page.isVisible('#searchContent')) await page.click('#layer_findCompany button.close');
  // 동의: 필수·선택 개인정보, 제3자 제공, 본인서약서
  await page.check('#chkTermAgree1'); await page.check('#chkTermAgree2'); await page.check('#chkTermAgree4');
  await page.click('#btnPopupPledge'); await page.check('#chkTermAgree6'); await page.click('.closePledge');
  await page.click('a:has-text("등록")');
  // 등록 뒤: 다음 화면으로 넘어가거나, 사이트 알림창(오류)이 떠요
  var r = await Promise.race([
    page.waitForURL(/cardProposalTemporary|cardProposalMovie/, { timeout: 20000 }).then(function () { return 'ok'; }),
    page.waitForSelector('.wrap_modal .msg', { state: 'visible', timeout: 20000 }).then(function (h) { return h.innerText(); })
  ]).catch(function () { return '응답 없음'; });
  if (r !== 'ok') return { ok: false, msg: String(r).trim().slice(0, 200) };
  if (/cardProposalMovie/.test(page.url())) return { ok: false, msg: '안전교육 시청이 필요해요(90일 지남)' };
  return { ok: true };
}

(async function () {
  var conf, data;
  try { conf = loadConf(); data = loadList(); } catch (e) { log('⚠ ' + e.message); return; }
  log('인천항 임시출입 신청 · ' + data.date + ' · ' + data.list.length + '명');
  data.list.forEach(function (d, i) { log('  ' + (i + 1) + '. ' + d.name + ' ' + d.car); });
  var browser = await chromium.launch({ channel: conf['브라우저'] === 'edge' ? 'msedge' : 'chrome', headless: false, slowMo: conf['천천히_ms'] || 0 })
    .catch(function () { return chromium.launch({ channel: 'msedge', headless: false, slowMo: conf['천천히_ms'] || 0 }); });
  var ctx = await browser.newContext({ viewport: null });

  // 1차: 첫 기사만 1단계 자동 → 2단계는 직접 진행하며 기록
  var dv = data.list[0], mask = makeMask(dv), rec = [];
  await ctx.exposeBinding('__joilLog', function (src, o) {
    ['sel', 'text', 'value', 'html', 'why'].forEach(function (k) { if (o[k] != null) o[k] = mask(o[k]); });
    rec.push(o);
  });
  ctx.on('page', function (p) { rec.push({ ev: 'newWindow', t: Date.now() }); p.on('dialog', function (d) { rec.push({ ev: 'dialog', type: d.type(), text: mask(d.message()), t: Date.now() }); d.accept(); }); });
  var page = await ctx.newPage();
  page.on('dialog', function (d) { rec.push({ ev: 'dialog', type: d.type(), text: mask(d.message()), t: Date.now() }); d.accept(); });

  log('\n▶ ' + dv.name + ' 기사님 1단계(기사 정보·방문업체·동의) 자동 입력 중...');
  var r = await step1(page, dv, conf).catch(function (e) { return { ok: false, msg: e.message.split('\n')[0] }; });
  if (!r.ok) { log('✖ 1단계 실패: ' + r.msg); await ask('\n창을 확인한 뒤 Enter를 누르면 끝나요. '); await browser.close(); return; }
  log('✔ 1단계 완료. 이제 다음 화면은 기록 모드예요.');
  await ctx.addInitScript(RECORDER); await page.evaluate(RECORDER);
  log('\n■ 브라우저에서 날짜 선택부터 마지막 "완료" 팝업까지 평소처럼 직접 진행해 주세요.');
  log('  (확인 창은 자동으로 [확인]을 눌러요)');
  await ask('■ 신청이 끝나면 여기서 Enter를 누르세요. ');
  var f = path.join(DIR, '기록_' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '') + '.json');
  fs.writeFileSync(f, JSON.stringify({ v: 1, date: data.date, conf: { 성별: conf['성별'] }, steps: rec }, null, 1));
  log('\n✔ 기록을 저장했어요: ' + f + '\n  이 파일을 Claude에게 보내 주세요. (기사 정보는 {이름} 같은 표시로 가려져 있어요)');
  if (data.list.length > 1) log('  나머지 ' + (data.list.length - 1) + '명은 이번엔 직접 신청해 주세요. 다음 버전부터 자동이에요.');
  await browser.close();
})().catch(function (e) { log('오류: ' + e.message); });
