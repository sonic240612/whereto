export function getGoogleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
}

export function getAppleMapsUrl(lat: number, lng: number): string {
  return `https://maps.apple.com/?daddr=${lat},${lng}`
}

export function getKakaoMapsUrl(lat: number, lng: number): string {
  return `https://map.kakao.com/link/to/${encodeURIComponent('WhereTo 목적지')},${lat},${lng}`
}

export const navigationApps = [
  {
    id: 'kakao',
    name: '카카오맵',
    getUrl: getKakaoMapsUrl,
  },
  {
    id: 'google',
    name: 'Google Maps',
    getUrl: getGoogleMapsUrl,
  },
  {
    id: 'apple',
    name: 'Apple Maps',
    getUrl: getAppleMapsUrl,
    only: 'ios',
  },
] as const
