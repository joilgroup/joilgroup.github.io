// 용차 위치 링크 화면(loc.html): 동의하고 시작 → 위치 전송 · 다시 열면 이어서 · 못 보낸 위치는 모아 두었다 보냄 · 종료 · 지난 링크 (받는 함수는 가짜로)
var T = require('../lib/browser.js'), ok = T.ok;
var TK = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', srv = { state: 'ready', posts: [], down: false, date: '2026-11-20', today: '2026-11-20' };
T.run(async function () {
  var o = await T.open({ login: false, config: "window.JOIL_CONFIG={API_URL:'',TRACK_URL:'https://fake.track/functions/v1/track'};",
    context: { viewport: { width: 390, height: 800 }, geolocation: { latitude: 37.5, longitude: 127.0, accuracy: 10 }, permissions: ['geolocation', 'clipboard-read', 'clipboard-write'] } }), p = o.page;
  await p.route('https://fake.track/**', function (r) {
    var u = r.request().url(), m = r.request().method();
    if (srv.down && m === 'POST') return r.abort();
    if (!/\/l\/[a-f0-9]{32}$/.test(u) || u.indexOf(TK) === -1) return r.fulfill({ status: 404, body: 'no link' });
    var j = function (st, b) { r.fulfill({ status: st, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(b) }); };
    if (m === 'GET') return j(200, { plate: '00가0001', date: srv.date, today: srv.today, state: srv.state });
    var b = JSON.parse(r.request().postData() || '{}'); srv.posts.push(b);
    if (b.end) { srv.state = 'ended'; return j(200, { state: 'ended' }); }
    if (srv.state === 'ended' || srv.state === 'expired') return j(410, { state: srv.state });
    srv.state = 'started'; j(200, { state: 'started', saved: (b.points || []).length });
  });
  var go = async function (t) { await p.goto(T.url + 'loc.html?t=' + (t || TK)); await p.waitForTimeout(700); };

  await go('zz'); ok('틀린 링크: 안내', /링크가 맞지 않아요/.test(await T.text(p, '#app')));
  await go('ffffffffffffffffffffffffffffffff'); ok('없는 링크: 안내', /링크가 맞지 않아요/.test(await T.text(p, '#app')));

  await go();
  var t = await T.text(p, '#app');
  ok('처음: 차량번호·날짜·동의 안내·시작 버튼 (아직 안 보냄)', /00가0001 · 11월 20일 하루/.test(t) && /동의하고 이 화면으로 공유 시작/.test(t) && /화면을 켜 둬야/.test(t) && /방법 1 · 앱/.test(t) && /Traccar Client 설치/.test(t) && /정지 감지/.test(t) && srv.posts.length === 0, t);
  await p.click('#cp'); await p.waitForTimeout(300);
  var clip = await p.evaluate(function () { return navigator.clipboard.readText(); });
  ok('앱 방식: 주소 복사 = 이 링크 전용 받는 주소', clip === 'https://fake.track/functions/v1/track/l/' + TK && /복사했어요/.test(await T.text(p, '#cp')), clip);
  srv.state = 'started'; await go();
  t = await T.text(p, '#app');
  ok('앱으로 보내는 중인 링크를 열면: 안내 + 종료 버튼 (이 화면은 저절로 시작 안 함)', /지금 위치가 들어오고 있어요/.test(t) && !!(await p.$('#stop')) && srv.posts.length === 0, t);
  srv.state = 'ready'; await go();
  await p.click('#go'); await p.waitForTimeout(1200);
  var pts = srv.posts.map(function (b) { return b.points || []; }).reduce(function (a, b) { return a.concat(b); }, []);
  ok('시작: 바로 위치 1개 전송', pts.length === 1 && pts[0].lat === 37.5 && pts[0].lng === 127, srv.posts);
  t = await T.text(p, '#app');
  ok('시작 뒤: 공유 중 · 마지막 전송 시각 · 종료 버튼', /위치 공유 중/.test(t) && /마지막 전송 \d\d:\d\d/.test(t) && /위치 공유 종료/.test(t), t);

  srv.down = true; srv.posts = [];
  await go(); await p.waitForTimeout(800);
  ok('다시 열면 누르지 않아도 이어서 (인터넷 끊김 → 못 보낸 위치 표시)', /못 보낸 위치 1개/.test(await T.text(p, '#app')), await T.text(p, '#app'));
  srv.down = false;
  await go(); await p.waitForTimeout(800);
  pts = srv.posts.map(function (b) { return b.points || []; }).reduce(function (a, b) { return a.concat(b); }, []);
  ok('연결되면 모아 둔 위치까지 한 번에 보냄', pts.length === 2 && !/못 보낸 위치 \d/.test(await T.text(p, '#app')), [srv.posts.length, await T.text(p, '#app')]);

  await p.click('#stop'); await p.waitForTimeout(800);
  ok('종료: 서버에 알리고 끝 화면', srv.posts.some(function (b) { return b.end; }) && /위치 공유를 마쳤어요/.test(await T.text(p, '#app')));
  srv.posts = []; await go();
  ok('종료한 링크를 다시 열면 끝 화면 (안 보냄)', /위치 공유를 마쳤어요/.test(await T.text(p, '#app')) && srv.posts.length === 0);

  srv.state = 'expired'; await go();
  ok('지난 날짜 링크: 기간 끝 안내', /기간이 끝났어요/.test(await T.text(p, '#app')));
  srv.state = 'ready'; srv.date = '2026-11-21'; await go();
  ok('다음 날 링크를 미리 열면: 그날 다시 안내', /11월 21일<\/b>|11월 21일에 쓰는 링크/.test(await T.text(p, '#app')), await T.text(p, '#app'));
  await T.done(o);
});
