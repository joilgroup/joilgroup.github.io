# 테스트

사이트를 고친 뒤 기존 기능이 깨지지 않았는지 확인하는 테스트예요. **가짜 데이터만** 써요(실제 주소·연락처·금액·거래처 넣지 않기).

```
node tests/run.js            # 전부 (3~5분)
node tests/run.js server     # 서버(Code.js)만 — 몇 초
node tests/run.js ui         # 화면만
node tests/run.js month      # 파일 이름에 month가 들어간 것만
```

맨 끝에 `합계: 통과 N · 실패 N`이 나오고, 실패가 있으면 그 줄(`FAIL …`)을 보여 줘요.

## 구성
- `lib/mock.js` — 구글 Apps Script(SpreadsheetApp·LockService·PropertiesService 등)를 흉내 낸 목. `apps-script/Code.js`를 node에서 불러 `M.call('adm' | 'stf' | 'ptn', '액션', {...})`으로 호출해요(관리자·직원·협력사). 시트에 쓸 때 줄 너비가 헤더와 다르면 실패로 잡아요.
- `lib/browser.js` — Playwright로 사이트를 **데모 모드**로 여는 도우미(`open`·`api`·`dispatch`·`paste`·`tab`·`relog`·`slow`). 바깥 인터넷은 막아서 카카오 지도·엑셀 내려받기는 확인하지 못해요(지도는 가짜 지도로 동작만 확인).
- `server/*.test.js` — 서버: 그날 줄만 읽기, 금액 칸·권한, 로그인 유지.
- `server/sb-*.test.js` · `sb/` — 서버 이전(Supabase) 새 서버: 이 컴퓨터에 **빈 Postgres 를 잠깐 띄워**(`sb/pg.js`, 마이그레이션 적용) 지금 서버(Code.js 목)와 같은 요청 → 같은 응답인지(`sb-parity`), 시험 복사·비교(`sb-copy`), 로그인·권한(`sb-auth`), Deno 로 함수 입구(`sb-deno`). Postgres·Deno 가 없으면 건너뜀. 처음엔 `tests/sb` 에 postgres.js·Deno 를 받아요(저장소에는 안 올라감). `node tests/run.js sb` 로 이것만.
- `ui/*.test.js` — 화면: 오더 붙여넣기·공지, 월별 기록·금액, 날짜 이동 속도, 지도, 메뉴·창·검색칸.

## 테스트를 추가할 때
- 기능을 고치면 **같은 커밋에서** 테스트도 고쳐요(안 고치면 다음 사람이 "원래 실패하던 것"과 새 버그를 구분 못 해요).
- 파일 이름은 `무엇.test.js`, 확인 한 줄은 `ok('무엇이 어떻게 돼야 하는지', 조건, 실패하면 보여 줄 값)`.
- 화면 테스트는 준비(오더 넣기·호차 묶기)를 `api(p, '액션', …)`로 하고, 확인하려는 동작만 화면에서 눌러요.
