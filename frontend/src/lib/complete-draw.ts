import type { CoordResult, LatLng, RectBounds } from '../types/index.ts'
import type { PlaceCandidate } from './geocode-client.ts'
import type { DrawProgress } from './area-draw.ts'
import { getKakaoCategoryCode, kakaoDestinationCategories, type DestinationCategory, type KakaoDestinationCode } from './categories.ts'
import { contains, isBounds, isLatLng } from './validation.ts'
import { containsPolygon, createPolygonSampler, isPolygon } from './polygon.ts'
import { placeMetadata } from './place-metadata.ts'

export type CompleteRegionLookup = (bounds: RectBounds, code: KakaoDestinationCode, page: number, signal?: AbortSignal) => Promise<{ places: PlaceCandidate[]; rawCount: number }>
const SEARCH_LIMIT = '검색 한도에 도달했어요. 다시 뽑거나 영역을 바꿔주세요.'

// Rejection sampling avoids modulo bias within the discovered candidate pool.
export function uniformIndex(length: number, uint32: () => number = () => crypto.getRandomValues(new Uint32Array(1))[0]): number {
  if (!Number.isSafeInteger(length) || length < 1 || length > 0x1_0000_0000) throw new Error('추첨 후보 수가 올바르지 않습니다.')
  const limit = 0x1_0000_0000 - (0x1_0000_0000 % length)
  while (true) {
    const value = uint32()
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new Error('추첨 값을 생성하지 못했습니다.')
    if (value < limit) return value % length
  }
}

interface CompleteDrawOptions {
  category?: DestinationCategory
  polygon?: readonly LatLng[]
  signal?: AbortSignal
  onProgress?: (progress: DrawProgress) => void
  timeoutMs?: number
  maxRequests?: number
  uint32?: () => number
}

// The public mode name remains "완전 랜덤". Select a location first, then draw
// from its local search results; this is not a census of the user's entire area.
export async function generateCompleteDestination(bounds: RectBounds, lookup: CompleteRegionLookup, options: CompleteDrawOptions = {}): Promise<{ place: CoordResult; candidateCount: number }> {
  const { category = 'all', polygon, signal, onProgress, uint32 } = options
  if (!isBounds(bounds)) throw new Error('탐색 범위가 올바르지 않습니다.')
  if (polygon && (!isPolygon(polygon) || !polygon.every(point => contains(bounds, point)))) throw new Error('다각형 범위가 올바르지 않습니다.')
  signal?.throwIfAborted()
  const samplePolygon = polygon ? createPolygonSampler(polygon) : undefined
  const unit = () => uniformIndex(0x1_0000_0000, uint32) / 0x1_0000_0000
  const code = getKakaoCategoryCode(category)
  const codes = code ? [code] : kakaoDestinationCategories
  const maxRequests = options.maxRequests ?? 108
  const controller = new AbortController()
  const cancel = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', cancel, { once: true })
  let timedOut = false, requests = 0
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, options.timeoutMs ?? 25_000)
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      controller.signal.throwIfAborted()
      const center = samplePolygon ? samplePolygon(unit) : {
        lat: bounds.minLat + (bounds.maxLat - bounds.minLat) * unit(),
        lng: bounds.minLng + (bounds.maxLng - bounds.minLng) * unit(),
      }
      // About 2km square initially; empty regions retry at a fresh random
      // location, widening to 4km and 8km without scanning the whole range.
      const halfHeight = (1000 * 2 ** Math.floor(attempt / 2)) / 111_320
      const halfWidth = halfHeight / Math.cos(center.lat * Math.PI / 180)
      const region = {
        minLat: Math.max(bounds.minLat, center.lat - halfHeight),
        maxLat: Math.min(bounds.maxLat, center.lat + halfHeight),
        minLng: Math.max(bounds.minLng, center.lng - halfWidth),
        maxLng: Math.min(bounds.maxLng, center.lng + halfWidth),
      }
      const pool = new Map<string, PlaceCandidate>()
      const progress = () => onProgress?.({ requests, candidates: pool.size })
      progress()
      for (const categoryCode of codes) {
        for (let page = 1; page <= 3; page++) {
          controller.signal.throwIfAborted()
          if (requests >= maxRequests) throw new Error(SEARCH_LIMIT)
          requests++
          progress()
          const batch = await lookup(region, categoryCode, page, controller.signal)
          controller.signal.throwIfAborted()
          if (!Number.isInteger(batch.rawCount) || batch.rawCount < 0 || batch.rawCount > 15 || batch.places.length > batch.rawCount) {
            throw new Error('검색 응답을 읽을 수 없어요. 잠시 후 다시 시도해주세요.')
          }
          for (const place of batch.places) {
            const metadata = placeMetadata(place)
            // Out-of-query results from Kakao are filtered, not fatal. Raw
            // counts still drive pagination even when every place is excluded.
            if (!metadata.kakaoPlaceId || !place.address || !isLatLng(place)
              || place.category !== 'kakao' || place.type !== categoryCode
              || !contains(region, place) || (polygon && !containsPolygon(polygon, place))) continue
            pool.set(metadata.kakaoPlaceId, place)
          }
          progress()
          if (batch.rawCount < 15) break
        }
      }
      controller.signal.throwIfAborted()
      if (pool.size) {
        const places = [...pool.values()]
        const selected = places[uniformIndex(places.length, uint32)]
        return { place: { lat: selected.lat, lng: selected.lng, address: selected.address, ...placeMetadata(selected) }, candidateCount: places.length }
      }
    }
    throw new Error('무작위로 고른 구역에서 조건에 맞는 장소를 찾지 못했어요. 다시 뽑거나 영역·카테고리를 바꿔주세요.')
  } catch (error) {
    signal?.throwIfAborted()
    if (timedOut) throw new Error('검색 시간이 초과됐어요. 다시 뽑거나 영역을 바꿔주세요.')
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}
