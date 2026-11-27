// 일반업체 시트 스크립트(apps-script/GenSync.js): 탭 이름 → 날짜(해 넘김) · 제목 줄 찾기 · 배차일보 제목·빈 줄 빼기 · 마스터시트 날짜별 묶기 · 1,500줄씩 나눠 보내기 (가짜 시트)
var vm = require('vm'), fs = require('fs'), path = require('path'), ok = require('../lib/mock.js').ok;
var sent = [], props = { GEN_URL: 'https://example.invalid/joil', GEN_KEY: 'k' };
function sheet(name, vals) { return { getName: function () { return name; }, getDataRange: function () { return { getValues: function () { return vals; } }; } }; }
var H = ['매출처', '발지', '착지', '중량', '배차금액', '차량번호', '기사명', '차량전화', '비고', '문자', '-', '비고2', '예약시간'];
var tab = [H, ['', '', '', '', '', '', '', '', '', '전지'], ['가상 배차일보', '', '', '', '', '', '', '', '', ''], ['', '', '', '', '', '', '', '', '', ''],
  ['000001', '오창', '오창', 5, '', '0930ㅅ', '', '', '사외 : 30km', '[단독배송]', '-', '', '★ 필독 ★'], ['000002', '오창', '대전', 1, 3841, '', '', '', '', '']];
var big = [H].concat(Array.from({ length: 1600 }, function (_, i) { return ['x' + i, 'a', 'b', 1, 1, '', '', '', '', '']; }));
var master = [['날짜'].concat(H.slice(0, 10)), [null, '울산가상', '울산', '서산', 2.5, 450000, '', '', '', '', ''], ['2026-07-22', '가상', '대전', '오창', 1, 100, '', '', '', '', ''], ['', '', '', '', '', '', '', '', '', '', '']];
var sheets = [sheet('마스터시트', master), sheet('11월30일', tab), sheet('12월 1일', big), sheet('1월3일', [H]), sheet('블랙', tab), sheet('11월30일 (1)', tab)];
var ctx = {
  SpreadsheetApp: { getActive: function () { return { getSheets: function () { return sheets; }, getSheetByName: function (n) { return sheets.filter(function (s) { return s.getName() === n; })[0]; } }; } },
  PropertiesService: { getScriptProperties: function () { return { getProperty: function (k) { return props[k]; } }; } },
  UrlFetchApp: { fetch: function (url, o) { var b = JSON.parse(o.payload); sent.push(b); var rows = b.days.reduce(function (a, d) { return a + d.rows.length; }, 0); return { getResponseCode: function () { return 200; }, getContentText: function () { return JSON.stringify({ ok: true, dates: b.days.length, rows: rows }); } }; } },
  Utilities: { formatDate: function (d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); } },
  Session: { getScriptTimeZone: function () { return 'Asia/Seoul'; } }, Logger: { log: function () {} }, ScriptApp: {}
};
vm.createContext(ctx); master[1][0] = vm.runInContext('new Date(2026, 6, 21)', ctx); // 시트 날짜 칸(그 안의 Date)
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script', 'GenSync.js'), 'utf8'), ctx);
var td = function (n, y, m) { return ctx.genTabDate_(n, new Date(y, m - 1, 15)); };
ok('탭 이름 → 날짜', td('11월30일', 2026, 11) === '2026-11-30' && td('12월 1일', 2026, 11) === '2026-12-01' && td('9월5일', 2026, 11) === '2026-09-05');
ok('해 넘김: 1월에 보이는 12월 탭은 작년 · 12월에 보이는 1월 탭은 내년', td('12월31일', 2027, 1) === '2026-12-31' && td('1월2일', 2026, 12) === '2027-01-02');
ok('날짜 탭이 아니면 빈 값', td('블랙', 2026, 11) === '' && td('11월30일 (1)', 2026, 11) === '' && td('13월1일', 2026, 11) === '');
var rows = ctx.genRows_(tab, false);
ok('제목 줄·빈 줄·배차일보 줄은 빼고 오더 2줄 · 10칸만(오른쪽 칸 버림)', rows.length === 2 && rows[0].length === 10 && rows[0][0] === '000001' && rows[0][5] === '0930ㅅ' && rows[1][4] === '3841' && rows[0].indexOf('★ 필독 ★') === -1, rows);
var r = ctx.genSend_(ctx.genTabs_());
var dates = [].concat.apply([], sent.map(function (b) { return b.days.map(function (d) { return d.date; }); }));
ok('날짜 탭만 보냄(빈 탭도 그 날짜로 · 마스터·블랙·복사본 탭 빼고)', dates.length === 3 && dates.every(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); }) && r.rows === 1602, [dates, r]);
ok('1,500줄 넘으면 나눠 보냄(한 날짜는 안 쪼갬) · 키 같이', sent.length === 3 && sent[1].days.length === 1 && sent[1].days[0].rows.length === 1600 && sent.every(function (b) { return b.action === 'gen.sync' && b.key === 'k'; }), sent.map(function (b) { return b.days.length; }));
var m = ctx.genMaster_();
ok('마스터시트: 날짜별로 묶고 날짜 칸은 빼서 10칸', m.length === 2 && m[0].date === '2026-07-21' && m[0].rows[0].length === 10 && m[0].rows[0][0] === '울산가상' && m[1].date === '2026-07-22' && m[0].origin === '마스터시트', m);
props.GEN_KEY = ''; var e = ''; try { ctx.genSend_([]); } catch (x) { e = x.message; }
ok('키를 안 넣으면 안내', /GEN_URL·GEN_KEY/.test(e), e);
