// 오늘 꼭 가야 하는 센터 목록: 저장(빈 줄·중복 정리) · 직원·협력사 읽기 · 협력사 저장·다른 업체 거절
var M = require('../lib/mock.js'), ok = M.ok, call = M.call, r;
r = call('adm', 'dispatch.mustSave', { cust: '쿠팡부자재', list: [' 가상1 ', '', '가상1', '테스트30'] });
ok('저장: 앞뒤 공백·빈 줄·중복 정리', JSON.stringify(r.list) === '["가상1","테스트30"]', r.error || r.list);
ok('직원이 읽기', JSON.stringify(call('stf', 'dispatch.must', { cust: '쿠팡부자재' }).list) === '["가상1","테스트30"]');
ok('협력사: 자기 업체는 읽기', JSON.stringify(call('ptn', 'dispatch.must', { cust: '쿠팡부자재' }).list) === '["가상1","테스트30"]');
ok('협력사: 저장·다른 업체 읽기 거절', !!call('ptn', 'dispatch.mustSave', { cust: '쿠팡부자재', list: [] }).error && !!call('ptn', 'dispatch.must', { cust: '삼다수' }).error);
ok('업체별로 따로', call('adm', 'dispatch.must', { cust: '삼다수' }).list.length === 0);
