import type { RectBounds, CoordResult, LatLng } from '../types/index.ts'
import type { PlaceCandidate } from './geocode-client.ts'
import { categoryLabels, matchesCategory, type DestinationCategory } from './categories.ts'
import { contains, isBounds, isLatLng } from './validation.ts'
import { containsPolygon, createPolygonSampler, isPolygon } from './polygon.ts'

// Choose mapped destination coordinates; reject water/administrative categories.
export function isDestination(place: PlaceCandidate, category: DestinationCategory = 'all'): boolean {
  return isLatLng(place) && !!place.address && matchesCategory(place, category)
}

export async function generateRandomCoord(
  bounds: RectBounds,
  lookup: (lat: number, lng: number, signal?: AbortSignal) => Promise<PlaceCandidate[]>,
  signal?: AbortSignal,
  random: () => number = Math.random,
  category: DestinationCategory = 'all',
  polygon?: readonly LatLng[],
): Promise<CoordResult> {
  if (!isBounds(bounds)) throw new Error('탐색 범위가 올바르지 않습니다. 지도를 확대해 다시 선택해주세요.')
  if (polygon && (!isPolygon(polygon) || !polygon.every(point => contains(bounds, point)))) {
    throw new Error('다각형 범위가 올바르지 않습니다. 선이 겹치지 않도록 범위를 다시 선택해주세요.')
  }
  const samplePolygon = polygon ? createPolygonSampler(polygon) : undefined
  for (let i = 0; i < 3; i++) {
    signal?.throwIfAborted()
    const { lat, lng } = samplePolygon ? samplePolygon(random) : {
      lat: bounds.minLat + (bounds.maxLat - bounds.minLat) * random(),
      lng: bounds.minLng + (bounds.maxLng - bounds.minLng) * random(),
    }
    const places = await lookup(lat, lng, signal)
    signal?.throwIfAborted()
    const candidates = places.filter(place => isDestination(place, category) && contains(bounds, place)
      && (!polygon || containsPolygon(polygon, place)))
    if (candidates.length) {
      const selected = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))]
      return { lat: selected.lat, lng: selected.lng, address: selected.address }
    }
  }
  throw new Error(category === 'all'
    ? '이 범위에서 추천할 장소를 찾지 못했어요. 지도를 움직여 다른 범위에서 다시 시도해주세요.'
    : `이 범위에서 "${categoryLabels[category]}" 결과를 찾지 못했어요. 범위를 바꾸거나 전체로 다시 선택해주세요.`)
}
