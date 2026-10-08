// JavaScript SDK keys are public browser keys; keep REST/admin secrets out of Vite variables.
export const kakaoMapAppKey = (import.meta.env.VITE_KAKAO_MAP_APP_KEY || '').trim()
export const usesKakaoMaps = kakaoMapAppKey.length > 0
