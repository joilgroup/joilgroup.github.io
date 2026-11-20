# Supabase (차량 위치 · 서버 이전 1단계)

조일 사이트를 구글 시트 + Apps Script에서 Supabase로 옮기는 첫 단계예요. 지금은 **차량 위치**만 여기에 있어요.
키·실데이터는 이 폴더에 넣지 않아요(저장소가 공개예요).

- `migrations/` — 표 만들기 SQL. 순서대로 Supabase SQL Editor(또는 관리 API `database/query`)에서 실행.
  - `001_tracking.sql`: `vehicles`(차량 등록 + 마지막 위치) · `positions`(위치 기록, 기본 키 = 차량+시각) · `app_settings`(앱 주소 비밀 키 `track_key`, DB 안에서 만듦). RLS 켜고 정책 없음 = 브라우저 공개 키로는 못 읽음, 서비스 키만.
  - `002_positions_throttle.sql`: 같은 차 위치는 1분에 1개만 저장(무료 500MB 보호).
- `functions/track/index.ts` — 기사 폰 **Traccar Client** 위치를 받는 함수(`verify_jwt = false`, 대신 주소 경로의 비밀 키 확인).
  주소: `https://<프로젝트>.supabase.co/functions/v1/track/<track_key>` (조일 '차량 위치' → 앱 설정 안내에 나옴).
  예전 앱(쿼리 `id·lat·lon·timestamp·speed(노트)…`)과 새 앱(JSON `device_id`·`location.coords`, 속도 m/s) 모두 받음.
  응답: 저장 200 · 키 틀림 401 · 등록 안 된 기기 404(앱이 모아 두었다가 등록되면 다시 보냄).
  배포: 관리 API `POST /v1/projects/<ref>/functions/deploy?slug=track` (metadata `{"entrypoint_path":"index.ts","name":"track","verify_jwt":false}` + 파일) 또는 `supabase functions deploy track --no-verify-jwt`.
- 조일 서버(`apps-script/Code.js`의 `track.*`)는 스크립트 속성 `SB_URL`·`SB_KEY`(관리자 → API 키에서 입력)로 PostgREST를 읽어요.

용량: 20대 × 5분 간격 × 하루 14시간 ≈ 하루 0.5MB → 무료 500MB로 약 2~3년. 넘으면 오래된 기록을 줄이거나 유료 요금제.
