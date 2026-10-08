import type { CoordResult } from '../types/index.ts'

// Store an identifier, never a provider-supplied or shared arbitrary URL.
export function placeMetadata(value: { placeName?: unknown; kakaoPlaceId?: unknown }): Pick<CoordResult, 'placeName' | 'kakaoPlaceId'> {
  const result: Pick<CoordResult, 'placeName' | 'kakaoPlaceId'> = {}
  const name = typeof value.placeName === 'string' ? value.placeName.trim() : ''
  if (name && name.length <= 200 && !/\p{Cc}/u.test(name)) result.placeName = name
  if (typeof value.kakaoPlaceId === 'string' && /^[1-9]\d{0,19}$/.test(value.kakaoPlaceId)) {
    result.kakaoPlaceId = value.kakaoPlaceId
  }
  return result
}

export function readPlaceMetadata(params: URLSearchParams) {
  return placeMetadata({ placeName: params.get('placeName'), kakaoPlaceId: params.get('kakaoPlaceId') })
}

export function writePlaceMetadata(params: URLSearchParams, value: CoordResult) {
  params.delete('placeName')
  params.delete('kakaoPlaceId')
  const metadata = placeMetadata(value)
  if (metadata.placeName) params.set('placeName', metadata.placeName)
  if (metadata.kakaoPlaceId) params.set('kakaoPlaceId', metadata.kakaoPlaceId)
}
