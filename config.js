/**
 * JOIL 연결 설정
 * Apps Script를 "웹 앱"으로 배포한 뒤 받은 주소(https://script.google.com/macros/s/.../exec)를
 * 아래 API_URL 에 붙여넣으세요. 비워 두면 가짜 데이터로 동작하는 "데모 모드"가 됩니다.
 */
window.JOIL_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxIsfUYOD9xWmA2JAVXsV94-CKcOb1o3OfCCbCwO5ALkqFXjW_Zcy_seTwbPjK26ayj/exec',
  // 기사용 링크 주소 (회사명이 안 드러나는 별도 사이트, driver-site/index.html)
  DRIVER_URL: 'https://truck-stopinfo.github.io/',
  // 카카오 지도 JavaScript 키 (화면에 들어가는 공개용 키 · 카카오 개발자 사이트에 등록한 주소에서만 작동)
  KAKAO_JS_KEY: 'f70cb8ae1c6ad8cba10d83b8a9c6cf33'
};
