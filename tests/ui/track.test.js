// 차량 위치 화면(데모): 메뉴·권한 · 목록(15분 넘으면 회색)·지도 표시 · 차 누르면 그날 경로 · 등록 → 앱 설정 안내 · 관리자 Supabase 연결 칸
var T = require('../lib/browser.js'), ok = T.ok, api = T.api;
T.run(async function () {
  var o = await T.open({ login: false, config: "window.JOIL_CONFIG={API_URL:'',KAKAO_JS_KEY:'x'};", init: function () {
    window.__pins = [];
    function LatLng(a, b) { this.a = a; this.b = b; }
    function Map(el) { el.innerHTML = '<div class="tile" style="width:100%;height:100%"></div>'; }
    Map.prototype = { setBounds: function () {}, setLevel: function () {}, getLevel: function () { return 8; }, setCenter: function () {}, getProjection: function () { return { coordsFromContainerPoint: function () { return new LatLng(0, 0); } }; }, setDraggable: function () {}, setZoomable: function () {} };
    function Overlay(o) { this.o = o; window.__pins.push(this); this.on = true; }
    Overlay.prototype.setMap = function (m) { this.on = !!m; };
    function Line(o) { window.__line = o.path.length; }
    Line.prototype.setMap = function () { window.__line = 0; };
    window.kakao = { maps: { LatLng: LatLng, Map: Map, LatLngBounds: function () { this.extend = function () {}; }, CustomOverlay: Overlay, Polyline: Line, Point: function (x, y) { this.x = x; this.y = y; } } };
  } }), p = o.page;
  await T.login(p, 'admin', 'demo1234');
  ok('관리자: 상단에 차량 위치 메뉴', !!(await p.$('.nav button[data-view="track"]')));
  await p.click('.nav button[data-view="track"]');
  await p.waitForSelector('.tr-item', { timeout: 8000 }); await p.waitForTimeout(300);
  var items = await p.$$eval('.tr-item', function (l) { return l.map(function (x) { return { t: x.innerText.replace(/\s+/g, ' '), old: !!x.querySelector('.tr-dot.old') }; }); });
  ok('목록 3대 · 50분 전 차만 회색', items.length === 3 && items.filter(function (x) { return x.old; }).length === 1 && /00다0003/.test(items.filter(function (x) { return x.old; })[0].t), items);
  ok('목록에 소속·톤수·차종·배터리', /데모업체 · 지입 · 5톤 · 윙바디/.test(items[0].t) && /🔋/.test(items[0].t), items[0]);
  var pins = await p.evaluate(function () { return window.__pins.filter(function (x) { return x.on; }).map(function (x) { return { t: x.o.content.textContent, c: x.o.content.className }; }); });
  ok('지도: 차마다 마지막 위치 표시 (오래된 차는 회색)', pins.length === 3 && pins.filter(function (x) { return /old/.test(x.c); }).length === 1, pins);

  await p.click('.tr-item[data-tv="1"]');
  await p.waitForFunction(function () { return /위치 \d+개/.test((document.querySelector('#trRoute') || {}).innerText || ''); }, null, { timeout: 8000 });
  var route = await T.text(p, '#trRoute'), line = await p.evaluate(function () { return window.__line; });
  pins = await p.evaluate(function () { return window.__pins.filter(function (x) { return x.on; }).map(function (x) { return x.o.content.textContent; }); });
  ok('차를 누르면 그날 경로 (선 + 출발·마지막)', /00가0001/.test(route) && line > 1 && pins.length === 2 && /출발/.test(pins.join('|')), { route: route, line: line, pins: pins });
  await p.fill('#trDate', '2020-01-01'); await p.dispatchEvent('#trDate', 'change');
  await p.waitForFunction(function () { return /2020-01-01/.test((document.querySelector('#trRoute') || {}).innerText || ''); }, null, { timeout: 8000 });
  ok('날짜를 바꾸면 그날 경로', /2020-01-01/.test(await T.text(p, '#trRoute')));
  await p.click('#trAll'); await p.waitForTimeout(200);
  ok('전체 차량 보기로 돌아감', (await p.evaluate(function () { return window.__pins.filter(function (x) { return x.on; }).length; })) === 3);

  await p.fill('#trQ', '가짜기사2'); await p.waitForTimeout(150);
  ok('검색', (await p.$$('.tr-item')).length === 1);
  await p.fill('#trQ', '');

  // 등록 → 안내
  await p.click('#trAdd'); await p.waitForSelector('[data-tf="plate"]');
  await p.fill('[data-tf="plate"]', '00라 0004'); await p.fill('[data-tf="driver_name"]', '가짜기사4'); await p.selectOption('[data-tf="affiliation"]', '용차'); await p.fill('[data-tf="ton"]', '8톤'); await p.fill('[data-tf="body_type"]', '카고');
  await p.click('#trSave'); await p.waitForSelector('#trD', { timeout: 8000 });
  ok('등록하면 앱 설정 안내: 기기 ID = 차량번호(띄어쓰기 뺌) · 서버 주소 · 300초', (await T.text(p, '#trD')) === '00라0004' && /functions\/v1\/track\//.test(await T.text(p, '#trU')) && /300/.test(await T.text(p, '.modal')), await T.text(p, '.modal'));
  await p.click('.modal [data-close]'); await p.waitForTimeout(200);
  ok('새 차는 위치 없음(회색)으로 목록에', /00라 0004.*위치 없음/.test(await T.text(p, '#trList')), [await T.text(p, '#trList'), await T.text(p, '.modal')]);
  await p.click('.tr-item[data-tv="4"] [data-te]'); await p.waitForSelector('[data-tf="plate"]');
  await p.uncheck('[data-tf="active"]'); await p.click('#trSave'); await p.waitForTimeout(500);
  ok('고치기: 사용 안 함', /00라 0004.*사용 안 함/.test(await T.text(p, '#trList')));
  var dup = await api(p, 'track.save', { vehicle: { plate: '00가0001' } });
  ok('같은 번호 두 번 거절', /이미 등록/.test(dup.error || ''), dup);

  // 용차 위치 링크
  await p.click('#trLink'); await p.waitForSelector('#tlPlate');
  await p.fill('#tlPlate', '00마 0005'); await p.fill('#tlName', '가짜용차'); await p.fill('#tlPhone', '010-0000-0000');
  await p.click('#tlMake'); await p.waitForSelector('#tlSms', { timeout: 8000 });
  var sms = await T.text(p, '#tlSms');
  ok('링크 만들기: 문자 내용 = 차량번호·안내·loc.html 링크', /00마 0005/.test(sms) && /Traccar Client/.test(sms) && /종료/.test(sms) && /loc\.html\?t=[a-f0-9]{40}$/.test(sms), sms);
  ok('링크 만들기: 폰 문자 앱 버튼(번호 넣어서)', /^sms:01000000000\?body=/.test(await p.$eval('#tlOut a', function (a) { return a.getAttribute('href'); })));
  ok('링크 만들기: 오늘 링크 목록 · 차량 목록에 링크 대기', /00마 0005 가짜용차 · .* · 대기/.test(await T.text(p, '#tlToday')) && /00마 0005.*용차.*링크 대기/.test(await T.text(p, '#trList')), [await T.text(p, '#tlToday'), await T.text(p, '#trList')]);
  await p.click('[data-tlend]'); await p.waitForTimeout(500);
  ok('링크 끝내기', /· 종료/.test(await T.text(p, '#tlToday')) && /링크 종료/.test(await T.text(p, '#trList')));
  await p.click('.modal [data-close]'); await p.waitForTimeout(200);

  // 관리자: 직원 권한 칩 · Supabase 연결 칸
  var mk = await api(p, 'admin.createUser', { id: 'trk01', name: '위치직원', role: 'user', perms: ['track'] });
  var mk2 = await api(p, 'admin.createUser', { id: 'qte01', name: '견적직원', role: 'user', perms: ['quote'] });
  await p.evaluate(function () { location.hash = '#/admin/users'; }); await p.waitForTimeout(1200);
  ok('관리자 화면: 직원 권한에 차량 위치', !!(await p.$('[data-perm="track"]')), await T.text(p, '#main'));
  await p.evaluate(function () { location.hash = '#/admin/keys'; }); await p.waitForSelector('#saveSb', { timeout: 8000 });
  await p.fill('#sbUrl', 'https://demo.supabase.co'); await p.fill('#sbKey', 'fake-key'); await p.click('#saveSb'); await p.waitForTimeout(800);
  ok('관리자 API 키: Supabase 연결 저장 → 연결됨', /차량 위치 서버 \(Supabase\) 연결됨/.test(await T.text(p, '#adminBody')), await T.text(p, '#adminBody'));
  var mk3 = await api(p, 'admin.createUser', { id: 'ptn01', name: '협력', role: 'partner', dispTabs: ['쿠팡부자재/평택'] });
  ok('(준비) 계정 만들기', !mk.error && !mk2.error && !mk3.error, [mk, mk2, mk3]);
  await p.evaluate(function () { var s = JSON.parse(localStorage.getItem('joil-demo')); s.users.forEach(function (u) { u.pw = u.id === 'admin' ? u.pw : 'pw1234'; u.mustChange = false; }); localStorage.setItem('joil-demo', JSON.stringify(s)); });

  // 권한 받은 직원 / 없는 직원 / 협력사
  await T.relog(p, 'trk01', 'pw1234'); await p.waitForTimeout(500);
  ok('차량 위치 권한 직원: 메뉴 보이고 목록 읽힘', !!(await p.$('.nav button[data-view="track"]')) && !(await api(p, 'track.list')).error);
  await T.relog(p, 'qte01', 'pw1234'); await p.waitForTimeout(500);
  ok('권한 없는 직원: 메뉴 없음 · 서버도 거절', !(await p.$('.nav button[data-view="track"]')) && /권한/.test((await api(p, 'track.list')).error || ''));
  await T.relog(p, 'ptn01', 'pw1234'); await p.waitForTimeout(500);
  ok('협력사: 메뉴 없음 · 서버도 거절', !(await p.$('.nav button[data-view="track"]')) && !!(await api(p, 'track.list')).error);
  await T.done(o);
});
