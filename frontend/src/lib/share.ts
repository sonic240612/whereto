import type { CoordResult } from '../types/index.ts'
import { isLatLng } from './validation.ts'
import { writePlaceMetadata } from './place-metadata.ts'

export function getShareUrl(result: CoordResult, origin: string): string {
  if (!isLatLng(result) || !result.address.trim() || result.address.length > 2000) throw new Error('공유할 장소를 확인해주세요.')
  const url = new URL('/share', origin)
  url.search = new URLSearchParams({ lat: String(result.lat), lng: String(result.lng), address: result.address }).toString()
  writePlaceMetadata(url.searchParams, result)
  return url.href
}
