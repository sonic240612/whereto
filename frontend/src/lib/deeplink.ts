import type { CoordResult } from '../types/index.ts'
import { placeMetadata } from './place-metadata.ts'

export function getGoogleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
}

export function getAppleMapsUrl(lat: number, lng: number): string {
  return `https://maps.apple.com/?daddr=${lat},${lng}`
}

export function getKakaoMapsUrl(lat: number, lng: number, name = '선택한 위치'): string {
  // ID routes may resolve an indoor shop to its parent building's name.
  // Pass the selected name and coordinates to retain the actual destination.
  return `https://map.kakao.com/link/to/${encodeURIComponent(name.trim() || '선택한 위치')},${lat},${lng}`
}

export function getDestinationName(place: CoordResult): string {
  return placeMetadata(place).placeName || place.address.trim() || '선택한 위치'
}

export function getKakaoPlaceUrl(place: CoordResult): string {
  const id = placeMetadata(place).kakaoPlaceId
  if (id) return `https://place.map.kakao.com/${id}`
  // Older shared links have no place ID. Search the full address to distinguish branches.
  return `https://map.kakao.com/link/search/${encodeURIComponent(place.address.trim() || getDestinationName(place))}`
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
