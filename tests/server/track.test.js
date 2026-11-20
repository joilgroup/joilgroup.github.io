// 차량 위치: 권한(track·협력사 막힘) · 키 저장(틀리면 되돌림, 화면에 안 돌려줌) · 목록·경로·저장을 가짜 Supabase로
var M = require('../lib/mock.js'), ok = M.ok, call = M.call, r;
var db = { vehicles: [], links: [], app_settings: [{ key: 'track_key', value: 'k123' }] }, seen = [], goodKey = 'svc-secret', nextId = 1;
M.ctx.UrlFetchApp = { fetch: function (url, o) {
  seen.push({ url: url, o: o });
  var res = function (code, body) { return { getResponseCode: function () { return code; }, getContentText: function () { return body == null ? '' : JSON.stringify(body); } }; };
  if (o.headers.apikey !== goodKey) return res(401, { message: 'Invalid API key' });
  var m = /\/rest\/v1\/(\w+)\??(.*)$/.exec(url), t = m[1], q = decodeURIComponent(m[2]);
  if (t === 'app_settings') return res(200, db.app_settings);
  if (t === 'track_links') {
    if (o.method === 'post') { db.links.push(JSON.parse(o.payload)); return res(201, null); }
    if (o.method === 'patch') { var tk = /token=eq\.(\w+)/.exec(q)[1]; db.links.forEach(function (l) { if (l.token === tk && !l.ended_at) Object.assign(l, JSON.parse(o.payload)); }); return res(204, null); }
    var gte = /date=gte\.([\d-]+)/.exec(q)[1]; return res(200, db.links.filter(function (l) { return l.date >= gte; }));
  }
  var pf = /plate=eq\.([^&]+)/.exec(q); if (t === 'vehicles' && o.method === 'get' && pf) return res(200, db.vehicles.filter(function (v) { return v.plate === pf[1]; }));
  if (t === 'positions') return res(200, /vehicle_id=eq\.1&fix_time=gte\.2026-11-19T15:00:00/.test(q) ? [{ fix_time: '2026-11-20T00:10:00+00:00', lat: 37.1, lng: 127.1, speed: 30, battery: 80 }] : []);
  if (o.method === 'post') { var b = JSON.parse(o.payload); if (db.vehicles.some(function (v) { return v.plate === b.plate || v.device_id === b.device_id; })) return res(409, { message: 'duplicate key value' }); b.id = nextId++; db.vehicles.push(b); return res(201, [b]); }
  if (o.method === 'patch') { var id = Number(/id=eq\.(\d+)/.exec(q)[1]), v = db.vehicles.filter(function (x) { return x.id === id; })[0]; if (!v) return res(200, []); Object.assign(v, JSON.parse(o.payload)); return res(200, [v]); }
  return res(200, db.vehicles);
} };

ok('연결 전: 안내 문구', /연결되지 않았어요/.test(call('adm', 'track.list').error || ''));
ok('직원(권한 없음)·협력사는 못 씀', /차량 위치 권한/.test(call('stf', 'track.list').error || '') && !!call('ptn', 'track.list').error);
ok('직원은 키 저장 못 함', !!call('stf', 'admin.saveTrackKeys', { url: 'https://abc.supabase.co', key: goodKey }).error);
r = call('adm', 'admin.saveTrackKeys', { url: 'https://abc.supabase.co/', key: 'wrong' });
ok('틀린 키: 오류 + 저장 안 됨', /서비스 키가 맞지 않아요/.test(r.error || '') && !M.props.SB_KEY, r);
ok('주소 형식 확인', /형식/.test(call('adm', 'admin.saveTrackKeys', { url: 'http://evil.example', key: goodKey }).error || ''));
r = call('adm', 'admin.saveTrackKeys', { url: 'https://abc.supabase.co/', key: goodKey });
ok('맞는 키: 저장, 키 값은 안 돌려줌', !r.error && r.keys.track === true && JSON.stringify(r).indexOf(goodKey) === -1 && M.props.SB_URL === 'https://abc.supabase.co', r);
ok('예전 형식이 아닌 키는 Authorization 안 붙임', !seen[seen.length - 1].o.headers.Authorization);

r = call('adm', 'track.save', { vehicle: { plate: '12가 3456', driver_name: '가짜기사', affiliation: '지입', ton: '5', body_type: '윙바디' } });
ok('등록: 기기 ID = 차량번호(띄어쓰기 뺌)', !r.error && db.vehicles[0].device_id === '12가3456' && r.vehicles.length === 1, r.error || db.vehicles);
ok('앱 주소 = 함수 주소 + 비밀 키', r.appUrl === 'https://abc.supabase.co/functions/v1/track/k123', r.appUrl);
ok('같은 번호 두 번 → 안내', /이미 등록/.test(call('adm', 'track.save', { vehicle: { plate: '12가 3456' } }).error || ''));
ok('소속 확인', /소속/.test(call('adm', 'track.save', { vehicle: { plate: '1나1', affiliation: '외부' } }).error || ''));
ok('차량번호 없으면 거절', /차량번호/.test(call('adm', 'track.save', { vehicle: { plate: ' ' } }).error || ''));
r = call('adm', 'track.save', { vehicle: { id: 1, plate: '12가 3456', device_id: 'abc-1', memo: '메모', active: false } });
ok('수정·사용 안 함', !r.error && db.vehicles[0].device_id === 'ABC1' && db.vehicles[0].active === false && db.vehicles[0].memo === '메모', r.error || db.vehicles[0]);
ok('이상한 id 거절', !!call('adm', 'track.save', { vehicle: { id: '1;drop', plate: 'x' } }).error);

r = call('adm', 'track.route', { id: 1, date: '2026-11-20' });
ok('경로: 한국 날짜 하루(전날 15시 UTC부터)', !r.error && r.points.length === 1 && r.points[0].lat === 37.1, r.error || r);
ok('경로: 날짜·id 형식 확인', !!call('adm', 'track.route', { id: '1&x=1', date: '2026-11-20' }).error && !!call('adm', 'track.route', { id: 1, date: '어제' }).error);
// 용차 위치 링크
var today = M.ctx.Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
r = call('adm', 'track.linkMake', { plate: '34나 5678', driver_name: '가짜용차', driver_phone: '010-0000-0000' });
var nv = db.vehicles.filter(function (v) { return v.plate === '34나 5678'; })[0];
ok('링크: 없는 차는 용차로 등록 + 오늘 링크', !r.error && nv && nv.affiliation === '용차' && nv.device_id === '34나5678' && db.links.length === 1 && db.links[0].date === today && db.links[0].vehicle_id === nv.id && /^[a-f0-9]{40}$/.test(r.token) && r.token === db.links[0].token, r.error || db.links);
ok('링크: 목록에 오늘 링크', r.links.length === 1 && r.today === today, r.links);
r = call('adm', 'track.linkMake', { plate: '34나 5678', driver_name: '다른용차' });
ok('링크: 있는 차는 그대로 쓰고 기사 이름만 바꿈 · 연락처는 안 지움', !r.error && db.vehicles.filter(function (v) { return v.plate === '34나 5678'; }).length === 1 && nv.driver_name === '다른용차' && nv.driver_phone === '010-0000-0000' && db.links.length === 2, r.error || nv);
ok('링크: 지난 날짜·차량번호 없음 거절', /오늘이나 이후/.test(call('adm', 'track.linkMake', { plate: '1가1', date: '2020-01-01' }).error || '') && /차량번호/.test(call('adm', 'track.linkMake', { plate: '' }).error || ''));
r = call('adm', 'track.linkEnd', { link: db.links[0].token });
ok('링크 끝내기', !r.error && !!db.links[0].ended_at && !db.links[1].ended_at, r.error);
ok('링크 끝내기: 이상한 값 거절', !!call('adm', 'track.linkEnd', { link: 'x&y' }).error);
ok('링크: 권한 없는 직원·협력사 거절', !!call('stf', 'track.linkMake', { plate: '1가1' }).error && !!call('ptn', 'track.linkMake', { plate: '1가1' }).error);

// '차량 위치' 권한을 받은 직원
var real = M.ctx.requireSession_;
M.ctx.requireSession_ = function (t) { return t === 'trk' ? { id: 't', name: '위치직원', role: 'staff', perms: ['track'] } : real(t); };
r = call('trk', 'track.list');
ok('track 권한 직원: 목록 보기', !r.error && r.vehicles.length === 2, r.error);
ok('track 권한 직원: 견적·키 저장은 못 함', !!call('trk', 'history.list').error && !!call('trk', 'admin.saveTrackKeys', { key: 'x' }).error);
M.ctx.requireSession_ = real;
