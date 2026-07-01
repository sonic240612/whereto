export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

export function isAndroid(): boolean {
  return /Android/.test(navigator.userAgent)
}

export function openGoogleMaps(lat: number, lng: number) {
  window.open(
    `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    '_blank',
  )
}

export function openKakaoMap(lat: number, lng: number) {
  const url = `kakaomap://route?sp=&ep=${lat},${lng}&by=FOOT`
  window.location.href = url
  setTimeout(() => openGoogleMaps(lat, lng), 500)
}

export function openNaverMap(lat: number, lng: number) {
  const url = `nmap://route/walk?dlat=${lat}&dlng=${lng}&dname=운명의+장소`
  window.location.href = url
  setTimeout(() => openGoogleMaps(lat, lng), 500)
}

export function openAppleMaps(lat: number, lng: number) {
  window.open(
    `https://maps.apple.com/?daddr=${lat},${lng}`,
    '_blank',
  )
}

export const navigationApps = [
  {
    id: 'google',
    name: 'Google Maps',
    action: openGoogleMaps,
  },
  {
    id: 'kakao',
    name: '카카오맵',
    action: openKakaoMap,
  },
  {
    id: 'naver',
    name: '네이버 지도',
    action: openNaverMap,
  },
  {
    id: 'apple',
    name: 'Apple Maps',
    action: openAppleMaps,
    only: 'ios',
  },
] as const
