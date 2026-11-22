// 진짜 표로 정리 3단계(014): 시트를 모두 칸 있는 표(joil.gs_…)로 옮긴 상태에서 sb-gas 비교를 그대로 다시 돌려요 (같은 요청 → 같은 응답 · 저장 뒤도)
process.env.JOIL_TABLES = '1';
require('./sb-gas.test.js');
