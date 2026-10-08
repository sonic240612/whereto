import type { CoordResult, LatLng, RectBounds } from '../types/index.ts'
import type { PlaceCandidate } from './geocode-client.ts'
import { categoryLabels, getKakaoCategoryCode, kakaoDestinationCategories, type DestinationCategory, type KakaoDestinationCode } from './categories.ts'
import { contains, isBounds } from './validation.ts'
import { containsPolygon, isPolygon, polygonIntersectsBounds } from './polygon.ts'
import { isDestination } from './random.ts'
import { placeMetadata } from './place-metadata.ts'

export interface DrawProgress { requests: number; candidates: number }
type RegionLookup = (bounds: RectBounds, code: KakaoDestinationCode, page: number, signal?: AbortSignal) => Promise<PlaceCandidate[]>
interface AreaDrawOptions {
  signal?: AbortSignal
  random?: () => number
  category?: DestinationCategory
  polygon?: readonly LatLng[]
  onProgress?: (progress: DrawProgress) => void
  timeoutMs?: number
}

function split(bounds: RectBounds): RectBounds[] {
  const lat = (bounds.minLat + bounds.maxLat) / 2, lng = (bounds.minLng + bounds.maxLng) / 2
  return [
    { ...bounds, maxLat: lat, maxLng: lng }, { ...bounds, maxLat: lat, minLng: lng },
    { ...bounds, minLat: lat, maxLng: lng }, { ...bounds, minLat: lat, minLng: lng },
  ]
}

// Search geographically separated rectangles, then the whole range, then smaller
// cells if a concave polygon excluded the provider's top results. This is a draw
// from discovered places, not an exhaustive/uniform census of all Kakao places.
export async function generateAreaDestination(bounds: RectBounds, lookup: RegionLookup, options: AreaDrawOptions = {}): Promise<CoordResult> {
  const { signal, polygon, onProgress, category = 'all', random = Math.random } = options
  if (!isBounds(bounds)) throw new Error('탐색 범위가 올바르지 않습니다.')
  if (polygon && (!isPolygon(polygon) || !polygon.every(point => contains(bounds, point)))) throw new Error('다각형 범위가 올바르지 않습니다.')
  signal?.throwIfAborted()
  const unit = () => {
    const value = random()
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('추첨 값을 생성하지 못했습니다.')
    return Math.min(value, 1 - Number.EPSILON)
  }
  const shuffle = <T,>(values: readonly T[]): T[] => {
    const result = [...values]
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(unit() * (i + 1))
      ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
  }
  const selected = getKakaoCategoryCode(category)
  const codes = selected ? [selected] : shuffle(kakaoDestinationCategories)
  // Extremely large rects can return ZERO_RESULT from Kakao even while they
  // enclose Korea. Start with the domestic catalog region, including islands,
  // when it intersects the user's shape; retain the original range as fallback.
  const domestic = {
    minLat: Math.max(bounds.minLat, 32), maxLat: Math.min(bounds.maxLat, 40),
    minLng: Math.max(bounds.minLng, 123), maxLng: Math.min(bounds.maxLng, 133),
  }
  const searchBounds = (bounds.maxLat - bounds.minLat > 10 || bounds.maxLng - bounds.minLng > 10)
    && isBounds(domestic) && (!polygon || polygonIntersectsBounds(polygon, domestic)) ? domestic : bounds
  const controller = new AbortController()
  const cancel = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', cancel, { once: true })
  let timedOut = false, requests = 0, sawPlaces = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, options.timeoutMs ?? 45_000)
  const candidates = new Map<string, PlaceCandidate>()
  const children = (parent: RectBounds) => shuffle(split(parent).filter(cell => !polygon || polygonIntersectsBounds(polygon, cell)))
  const choose = (): CoordResult => {
    const places = [...candidates.values()]
    const place = places[Math.floor(unit() * places.length)]
    return { lat: place.lat, lng: place.lng, address: place.address, ...placeMetadata(place) }
  }
  const search = async (cell: RectBounds, categories: readonly KakaoDestinationCode[]) => {
    for (const code of categories) {
      for (let page = 1; page <= 3 && requests < 96; page++) {
        controller.signal.throwIfAborted()
        requests++
        onProgress?.({ requests, candidates: candidates.size })
        const found = await lookup(cell, code, page, controller.signal)
        controller.signal.throwIfAborted()
        if (found.length) sawPlaces = true
        let accepted = false
        for (const place of found) {
          if (!isDestination(place, category) || !contains(cell, place) || !contains(bounds, place)
            || (polygon && !containsPolygon(polygon, place))) continue
          candidates.set(place.kakaoPlaceId || `${place.lat},${place.lng},${place.address}`, place)
          accepted = true
        }
        onProgress?.({ requests, candidates: candidates.size })
        // More pages help where top results lie outside a lasso's actual shape.
        if (accepted || found.length < 15) break
      }
      if (requests >= 96) break
    }
  }
  try {
    let cells = children(searchBounds)
    // Rotate categories across cells so 'all' is not limited to the same four.
    for (let i = 0; i < cells.length; i++) {
      const offset = i * 4
      const sample = Array.from({ length: Math.min(4, codes.length) }, (_, j) => codes[(offset + j) % codes.length])
      await search(cells[i], sample)
    }
    if (candidates.size) return choose()
    // Sparse ranges (including oceans surrounding an inhabited island) must
    // still query the whole selected rectangle and every selected category.
    await search(searchBounds, codes)
    if (!candidates.size && searchBounds !== bounds) await search(bounds, codes)
    if (candidates.size) return choose()
    // Only a lasso needs further subdivision to recover places hidden behind
    // top results in the unused portions of its enclosing rectangle.
    for (let depth = 0; polygon && sawPlaces && depth < 3 && requests < 96; depth++) {
      cells = shuffle(cells.flatMap(children))
      for (const cell of cells) {
        await search(cell, shuffle(codes))
        if (candidates.size) return choose()
        if (requests >= 96) break
      }
    }
  } catch (error) {
    signal?.throwIfAborted()
    if (!timedOut) throw error
    if (candidates.size) return choose()
    throw new Error('검색 시간이 길어져 중단했어요. 다시 뽑거나 범위를 조정해주세요.')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
  throw new Error(`${category === 'all' ? '선택한 범위' : `선택한 범위의 ${categoryLabels[category]}`}에서 추천할 장소를 찾지 못했어요. 검색 가능한 장소가 적거나 검색 한도에 도달했을 수 있어요. 다시 뽑거나 범위를 조정해주세요.`)
}
