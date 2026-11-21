/**
 * JOIL 연결 설정
 * Apps Script를 "웹 앱"으로 배포한 뒤 받은 주소(https://script.google.com/macros/s/.../exec)를
 * 아래 API_URL 에 붙여넣으세요. 비워 두면 가짜 데이터로 동작하는 "데모 모드"가 됩니다.
 */
window.JOIL_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxIsfUYOD9xWmA2JAVXsV94-CKcOb1o3OfCCbCwO5ALkqFXjW_Zcy_seTwbPjK26ayj/exec',
  // 기사용 링크 주소 (회사명이 안 드러나는 별도 사이트, driver-site/index.html)
  DRIVER_URL: 'https://truck-stopinfo.github.io/',
  // 차량 위치 받는 함수 주소 (Supabase · 비밀 키 아님 — 용차 위치 링크 화면 loc.html 이 씀)
  TRACK_URL: 'https://etvpifkfyrxvvpqqrsza.supabase.co/functions/v1/track',
  // 서버 이전(Supabase · docs/서버이전.md): 새 서버 주소와 공개 키(공개용이라 여기 있어도 됨). SB_ROUTE 가 없으면 지금처럼 전부 Apps Script
  SB_FN: 'https://etvpifkfyrxvvpqqrsza.supabase.co/functions/v1/joil',
  SB_REST: 'https://etvpifkfyrxvvpqqrsza.supabase.co',
  SB_ROUTE: 'all', // 2026-11-21 전체 전환: 모든 메뉴가 Supabase (배차만 되돌리기: 'dispatch' · 전부 되돌리기: 이 줄 지우기 · docs/서버이전.md)
  SB_ANON: 'sb_publishable_kNRcMBnVAyV0xdng-QzrhQ_gGYKz8Bz',
  // 카카오 지도 JavaScript 키 (화면에 들어가는 공개용 키 · 카카오 개발자 사이트에 등록한 주소에서만 작동)
  KAKAO_JS_KEY: 'f70cb8ae1c6ad8cba10d83b8a9c6cf33'
};
