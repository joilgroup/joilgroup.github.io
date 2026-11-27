/**
 * 일반업체 시트 → 조일 Supabase '일반업체 기록' (매일 밤 자동)
 *
 * 이 파일은 조일 사이트 서버(Code.js)가 아니라 **일반업체 구글 시트**의 Apps Script 에 붙여넣어요.
 * (시트 → 확장 프로그램 → Apps Script → 왼쪽 '파일 +' → 스크립트 → 이름 GenSync → 이 내용 전체 붙여넣기 → 저장)
 *
 * 처음 한 번:
 *  1) 왼쪽 톱니바퀴(프로젝트 설정) → 맨 아래 '스크립트 속성' → 속성 추가
 *       GEN_URL = 조일 서버 주소 (조일 사이트 → 일반업체 기록 → '시트 연결 키'에 나와요)
 *       GEN_KEY = 시트 연결 키 (같은 곳에서 관리자가 만들어요 · 시트 칸에는 적지 마세요)
 *  2) 위 함수 고르기에서 genStart 실행 → 권한 허용 → 지금 날짜 탭을 보내고, 매일 밤 11시에 자동으로 보내요.
 *  3) (마스터시트를 지우기 전에 한 번만) genMoveMaster 실행 → 마스터시트 전체 + 날짜 탭을 옮겨요.
 * 그만두려면 genStop 실행.
 *
 * 날짜 탭: 이름이 "11월30일"·"12월 1일" 같은 탭만. 해는 탭 이름에 없어서 지금 달에서 가장 가까운 해로 정해요(1월에 보이는 12월 탭 = 작년).
 * 줄: 1~5줄 중 '매출처'·'착지'가 있는 줄을 제목 줄로 보고, 그 아래에서 발지나 착지가 적힌 줄만 보내요(배차일보 제목 줄·빈 줄은 빠짐).
 * 같은 날짜는 Supabase 에서 통째로 바꿔요 → 고친 건·취소 건 반영, 두 번 안 쌓임. 탭을 지워도 Supabase 기록은 남아요.
 */
var GEN_HEAD = ['매출처', '발지', '착지', '중량', '배차금액', '차량번호', '기사명', '차량전화', '비고', '문자'];
var GEN_BATCH = 1500; // 한 번에 보내는 줄 수

function genStart() {
  genStop();
  ScriptApp.newTrigger('genNightly').timeBased().atHour(23).everyDays(1).create();
  var r = genNightly();
  Logger.log('매일 밤 11시 자동 보내기를 켰어요. 지금 보낸 것: ' + r.dates + '일 ' + r.rows + '줄');
}
function genStop() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'genNightly') ScriptApp.deleteTrigger(t); });
}
/** 매일 밤: 지금 있는 날짜 탭 전부 */
function genNightly() { return genSend_(genTabs_()); }
/** 한 번만: 마스터시트 전체 → 그다음 날짜 탭(같은 날짜면 날짜 탭이 이겨요) */
function genMoveMaster() {
  var a = genSend_(genMaster_()), b = genNightly();
  Logger.log('마스터시트 ' + a.dates + '일 ' + a.rows + '줄 + 날짜 탭 ' + b.dates + '일 ' + b.rows + '줄을 옮겼어요.');
}

/** 탭 이름 → yyyy-MM-dd (날짜 탭이 아니면 '') */
function genTabDate_(name, now) {
  var m = String(name).match(/^\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*$/); if (!m) return '';
  var mo = Number(m[1]), d = Number(m[2]); if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  var cy = now.getFullYear(), cm = now.getMonth() + 1, y = mo - cm > 6 ? cy - 1 : cm - mo > 6 ? cy + 1 : cy;
  return y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
}
function genCell_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), v.getHours() || v.getMinutes() ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
  return String(v == null ? '' : v).trim();
}
/** 표(값 2차원) → 10칸 줄들 (제목 줄을 1~5줄에서 찾고, 발지·착지가 있는 줄만) */
function genRows_(vals, withDate) {
  var hr = -1, idx = {};
  for (var i = 0; i < Math.min(5, vals.length); i++) { var r = vals[i].map(genCell_); if (r.indexOf('매출처') !== -1 && r.indexOf('착지') !== -1) { hr = i; r.forEach(function (h, j) { if (!(h in idx)) idx[h] = j; }); break; } }
  if (hr < 0) return [];
  var out = [];
  for (var k = hr + 1; k < vals.length; k++) {
    var row = GEN_HEAD.map(function (h) { return idx[h] == null ? '' : genCell_(vals[k][idx[h]]); });
    if (!row[1] && !row[2]) continue;
    if (withDate) row.date = idx['날짜'] == null ? '' : genCell_(vals[k][idx['날짜']]).slice(0, 10).replace(/\./g, '-');
    out.push(row);
  }
  return out;
}
function genTabs_() {
  var now = new Date(), days = [];
  SpreadsheetApp.getActive().getSheets().forEach(function (sh) {
    var date = genTabDate_(sh.getName(), now); if (!date) return;
    days.push({ date: date, origin: sh.getName(), rows: genRows_(sh.getDataRange().getValues(), false) });
  });
  return days;
}
function genMaster_() {
  var sh = SpreadsheetApp.getActive().getSheetByName('마스터시트'); if (!sh) throw new Error('마스터시트 탭이 없어요.');
  var by = {}, order = [];
  genRows_(sh.getDataRange().getValues(), true).forEach(function (r) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return;
    if (!by[r.date]) { by[r.date] = []; order.push(r.date); }
    by[r.date].push(r.slice(0, GEN_HEAD.length));
  });
  return order.map(function (d) { return { date: d, origin: '마스터시트', rows: by[d] }; });
}
/** 날짜들을 1,500줄 안팎씩 나눠 보냄 (한 날짜는 쪼개지 않음) */
function genSend_(days) {
  var p = PropertiesService.getScriptProperties(), url = p.getProperty('GEN_URL'), key = p.getProperty('GEN_KEY');
  if (!url || !key) throw new Error('프로젝트 설정 → 스크립트 속성에 GEN_URL·GEN_KEY 를 넣어 주세요.');
  var total = { dates: 0, rows: 0 }, pack = [], n = 0;
  var flush = function () {
    if (!pack.length) return;
    var res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ action: 'gen.sync', key: key, days: pack }), muteHttpExceptions: true });
    var j = {}; try { j = JSON.parse(res.getContentText()); } catch (e) { /* 아래에서 오류 */ }
    if (!j.ok) throw new Error('보내기 실패: ' + (j.error || ('서버 응답 ' + res.getResponseCode())));
    total.dates += j.dates; total.rows += j.rows; pack = []; n = 0;
  };
  days.forEach(function (d) { if (n && n + d.rows.length > GEN_BATCH) flush(); pack.push(d); n += d.rows.length; });
  flush();
  return total;
}
