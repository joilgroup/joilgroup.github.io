// 서버가 늦을 때: 5초 넘으면 '기다리는 중' 안내 · 응답이 오면 사라짐 · 끝내 응답이 없으면 '다시 시도' (데모 서버를 일부러 늦춰요)
var T = require('../lib/browser.js'), ok = T.ok;
T.run(async function () {
  var o = await T.open(), p = o.page;
  await p.evaluate(function () { window.__netWatch = 1; window.__call0 = window.JoilDemo.call; });
  await T.slow(p, 7000);
  await p.evaluate(function () { location.hash = '#/dispatch'; });
  await p.waitForTimeout(3000); ok('5초 전에는 안내 없음', !(await p.$('#netBar')));
  await p.waitForSelector('#netBar', { timeout: 4000 }); ok('5초 넘으면 기다리는 중 안내', /기다리는 중/.test(await T.text(p, '#netBar')));
  await p.waitForSelector('#netBar', { state: 'detached', timeout: 6000 }); ok('응답이 오면 사라짐', !(await p.$('#netBar')));
  // 끝내 응답이 없을 때 (시간 초과처럼)
  await p.evaluate(function () { window.JoilDemo.call = window.__call0; }); await p.waitForSelector('#dpDate', { timeout: 30000 }); await p.waitForSelector('#netBar', { state: 'detached', timeout: 20000 }); // 늦게 보낸 요청들이 다 끝나길 기다려요
  await p.evaluate(function () { var c = window.JoilDemo.call; window.JoilDemo.call = function (req) { if (req.action === 'dispatch.day' || req.action === 'dispatch.dayAll') { var e = new Error('서버 응답이 너무 늦습니다. 잠시 후 다시 시도하세요.'); e.slow = true; return Promise.reject(e); } return c(req); }; });
  await p.evaluate(function () { var d = document.querySelector('#dpDate'); d.value = '2026-09-01'; d.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForSelector('#netRetry', { timeout: 15000 }); ok('실패하면 다시 시도 버튼', /응답하지 않았어요/.test(await T.text(p, '#netBar')));
  await p.click('#netX'); ok('닫기', !(await p.$('#netBar')));
  await T.done(o);
});
