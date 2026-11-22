#!/bin/bash
# 새 서버 배포 (Claude 세션에서 · 관리 API 토큰은 환경에 있어요): Code.js·core.js 를 고치면 이걸 돌려요 → 함수 joil(사이트)·info(기사 사이트) 둘 다
set -e
cd "$(dirname "$0")/functions/joil"
node build.js
R=${SB_REF:-etvpifkfyrxvvpqqrsza}
for s in joil info; do
  curl -sf -X POST "https://api.supabase.com/v1/projects/$R/functions/deploy?slug=$s" -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN:-x}" \
    -F "metadata={\"entrypoint_path\":\"index.ts\",\"name\":\"$s\",\"verify_jwt\":false};type=application/json" \
    -F "file=@index.ts;type=application/typescript" -F "file=@core.js;type=application/javascript" -F "file=@gas.js;type=application/javascript" -F "file=@port.js;type=application/javascript" -F "file=@gas_src.js;type=application/javascript" \
    | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('slug'), d.get('status'), 'v'+str(d.get('version')))"
done
