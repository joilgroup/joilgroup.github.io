// 배포 전에: apps-script/Calc.js + Code.js 를 글자 하나로 묶어 gas_src.js 로 (Supabase 함수가 Code.js 를 그대로 실행해요)
// node supabase/functions/joil/build.js  →  gas_src.js (저장소에는 안 올림 · .gitignore)
var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..', '..', '..');
var src = ['Calc.js', 'Code.js'].map(function (f) { return fs.readFileSync(path.join(root, 'apps-script', f), 'utf8'); }).join('\n;\n');
fs.writeFileSync(path.join(__dirname, 'gas_src.js'), '// 자동 생성 (build.js) — 고치지 마세요\nexport const SRC = ' + JSON.stringify(src) + ';\nexport const CALC = ' + JSON.stringify(fs.readFileSync(path.join(root, 'apps-script', 'Calc.js'), 'utf8')) + ';\n');
console.log('gas_src.js ' + Math.round(src.length / 1024) + 'KB');
