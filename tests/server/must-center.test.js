// 도착지 특이사항(센터마다 멘트): 예전 '꼭 가야 하는 센터' 옮기기 · 저장(빈 줄·중복 정리) · 협력사는 '협력사에도'·'기사에게도'만 · 기사 링크는 '기사에게도'만
var M = require('../lib/mock.js'), ok = M.ok, call = M.call, S = M.sheets, r;
M.props['DISP_MUST_쿠팡부자재'] = JSON.stringify(['가상1']);
r = call('stf', 'dispatch.notes', { cust: '쿠팡부자재' });
ok('예전 목록을 한 번 옮김 (오늘 꼭 가야함 · 협력사에도 · 시간 고정)', r.list.length === 1 && r.list[0].fc === '가상1' && r.list[0].note === '오늘 꼭 가야함' && r.list[0].ptn && r.list[0].lock && !r.list[0].drv && !('DISP_MUST_쿠팡부자재' in M.props), r.error || r.list);
r = call('adm', 'dispatch.notesSave', { cust: '쿠팡부자재', list: [{ fc: ' 가상1 ', note: '오늘 꼭 가야함', ptn: true, lock: true }, { fc: '가상 1 FC', note: '오늘 꼭 가야함' }, { fc: '가상1', note: '14시부터 하차가능', drv: true }, { fc: '테스트30', note: '카고차량 배차가능' }, { fc: '', note: 'x' }, { fc: '빈멘트', note: ' ' }] });
ok('저장: 빈 줄·같은 센터 같은 멘트 정리', !r.error && r.list.length === 3, r.error || r.list);
ok('시트 줄 너비', S['도착지특이사항'].d.every(function (x) { return x.length === S['도착지특이사항'].d[0].length; }));
call('adm', 'dispatch.notesSave', { cust: '삼다수', list: [{ fc: '다른업체', note: '메모' }] });
ok('업체별로 따로 (다른 업체 저장이 지우지 않음)', call('adm', 'dispatch.notes', { cust: '쿠팡부자재' }).list.length === 3 && call('adm', 'dispatch.notes', { cust: '삼다수' }).list.length === 1);
r = call('ptn', 'dispatch.notes', { cust: '쿠팡부자재' });
ok('협력사: 협력사에도·기사에게도 멘트만 (카고차량은 안 감)', !r.error && r.list.length === 2 && !r.list.some(function (x) { return /카고/.test(x.note); }), r.error || r.list);
ok('협력사: 저장·다른 업체 거절', !!call('ptn', 'dispatch.notesSave', { cust: '쿠팡부자재', list: [] }).error && !!call('ptn', 'dispatch.notes', { cust: '삼다수' }).error);
ok('예전 화면용 dispatch.must = 시간 고정 센터', JSON.stringify(call('stf', 'dispatch.must', { cust: '쿠팡부자재' }).list) === '["가상1"]');
// 기사 링크: '기사에게도' 멘트만 공지로
var D = '2026-10-02';
call('adm', 'dispatch.import', { cust: '쿠팡부자재', rows: [{ date: D, key: 'k1', d: { fc: '가상 1 FC - 2층', bundle: '3', date: D, from: '출발' } }] });
var day = call('adm', 'dispatch.day', { cust: '쿠팡부자재', date: D });
r = call('adm', 'dispatch.save', { cust: '쿠팡부자재', date: D, orders: [{ id: day.orders[0].id, truck: 1, seq: 1 }], trucks: [{ no: 1, car: '1가' }] });
var g = call('', 'drv.get', { t: r.trucks[0].token });
ok('기사 링크: 기사에게도 멘트만 (표기가 달라도)', !g.error && g.notes.map(function (x) { return x.text; }).join('|') === '14시부터 하차가능', g.error || g.notes);
