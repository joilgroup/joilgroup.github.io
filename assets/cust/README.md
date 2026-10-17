# 업체별 배차 파일 (assets/cust/)

배차시트의 **업체 전용 기능**은 여기 업체마다 파일 하나로 둬요. 저장·동기화·권한·탭·호차 공통 화면과 업체별 자료 창(상차지·하차지 주소록·기사 풀·매입 단가표)은 `assets/app.js`에 있어요.

| 파일 | 업체 | 들어 있는 것 |
|---|---|---|
| `coupang.js` | 쿠팡부자재 | 동방 엑셀 붙여넣기(컬리 양식 포함), 하차지 주소록과 주소 비교, AI 도움 · AI 한번에 짜기 |
| `sds.js` | 삼다수 | 메일 오더 표 붙여넣기 → 18파렛트 = 1대, 하차지 이름 연결, 문자 양식, 쿠팡(WF) 예약, 인천항 생년월일, 삼다수 배차 표(한 줄 = 차 한 대) |

## 새 업체 추가 = 파일 하나 + script 한 줄

1. `assets/cust/새업체.js`를 만들어요 (아래 틀). 업체 이름은 배차시트 "업체 고르기"에 나오는 이름이고, 서버 저장 키(`업체+탭 접미사`)에도 그대로 쓰여요.
2. `index.html`에서 `assets/app.js` **위에** `<script src="assets/cust/새업체.js"></script>` 한 줄을 넣어요. 업체 고르기 순서 = script 순서 (맨 앞이 기본 업체).

```js
/* 새업체 배차 */
(window.JOIL_CUST = window.JOIL_CUST || []).push({ name: '새업체', make: function (H) {
  'use strict';
  var esc = H.esc, won = H.won, parseTsv = H.parseTsv; // app.js가 넘겨주는 공용 도우미 (app.js의 custHelpers 목록)
  return {
    // 오더 붙여넣기 (꼭 있어야 해요) → { items: [{ date, key, d: { from, fc, item, bundle, kg, addr, ... } }], warn }
    parse: function (text, tab, date) { return H.cust('쿠팡부자재').parse(text, tab, date); }, // 동방 양식 그대로 쓰기
    pasteHint: function (st) { return '엑셀에서 C열부터 복사해서 붙여넣으세요'; }
  };
} });
```

## 쓸 수 있는 훅 (없으면 기본 = 동방(쿠팡부자재)식 화면)

| 훅 | 하는 일 |
|---|---|
| `parse(text, tab, date)` | 붙여넣은 글자 → 오더 줄 |
| `pasteHtml(html)` | 메일 표(HTML)를 복사했을 때 칸을 맞춘 글자로 (합친 칸 풀기) |
| `pasteHint(st)` | ① 오더 붙여넣기 안내 문구 |
| `tabs` | 서버가 예전 버전일 때 쓸 기본 탭 `[{ name, suf, prefix }]` |
| `load()` | 화면 열 때 더 불러올 것 (Promise) |
| `autoTruck` | `true`면 가져온 줄마다 호차 한 대씩 자동 |
| `noMap` | `true`면 기사 링크·지도·추천 순서·좌표 찾기를 안 써요 |
| `ton` | 운송비 계산 톤수 고정 (예: `'18톤'`) |
| `destName(d, tab)` | 단가표 도착명 (없으면 주소의 시·군으로 자동) |
| `orderHead(orders, 번들, kg)` · `orderWarn(orders)` | ② 오더 제목 · 경고 |
| `orderButtons(D)` | ② 오더 위 버튼 (예: AI 도움) |
| `ordHead` · `ordCells(o, tab)` · `addrFlag(o)` | ② 오더 표의 칸 |
| `orderEdit` · `fcLabel` | 오더 고치기 칸 목록 · 센터명 대신 부를 이름 |
| `message(D, no)` | 호차 문자 |
| `truckTable(D, ns)` | ③ 호차 표를 통째로 업체 것으로 |
| `noOrderTable` | `true`면 ② 오더 표를 숨기고 배차 표만 (삼다수: 한 줄 = 차 한 대, 빈 줄은 바로 한 대씩) |
| `sheetRows(D, ns)` | "엑셀로 복사" 줄 (업체 표와 같은 칸 순서) |
| `trkFields` · `trkW` | 차량정보 입력 칸 목록 · 한 줄의 입력 칸 수(↑↓ 이동) |
| `truckLabel(D, no)` | 오늘 할 일에 호차 번호 대신 보일 이름 |
| `bind(box, { st, D, tn, redraw, applyGroups })` | 업체 버튼·입력칸 연결 (화면 그린 뒤 매번) |

서버(`apps-script/Code.js`)는 한 파일 그대로예요. 서버에 업체 기능을 더하면 `assets/demo.js`에도 같이 넣어요.
