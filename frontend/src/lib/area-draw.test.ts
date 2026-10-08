import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateAreaDestination } from './area-draw.ts'
import { contains } from './validation.ts'
import { getPolygonBounds, isPolygon, polygonIntersectsBounds } from './polygon.ts'
import type { PlaceCandidate } from './geocode-client.ts'

const world = { minLat: -85, maxLat: 85, minLng: -180, maxLng: 180 }
const korea = { minLat: 33, maxLat: 39, minLng: 124, maxLng: 132 }
const place: PlaceCandidate = { lat: 37.5, lng: 127, address: '서울 식당', placeName: '서울 식당', kakaoPlaceId: '123', category: 'kakao', type: 'FD6' }

test('world-sized and nationwide lassos can draw real places with identity intact', async () => {
  for (const bounds of [world, korea]) {
    const polygon = [{ lat: bounds.minLat, lng: bounds.minLng }, { lat: bounds.minLat, lng: bounds.maxLng },
      { lat: bounds.maxLat, lng: bounds.maxLng }, { lat: bounds.maxLat, lng: bounds.minLng }]
    assert.ok(isPolygon(polygon))
    const result = await generateAreaDestination(bounds, async cell => contains(cell, place) ? [place] : [], { category: 'restaurant', polygon, random: () => 0.5 })
    assert.deepEqual(result, { lat: place.lat, lng: place.lng, address: place.address, placeName: place.placeName, kakaoPlaceId: place.kakaoPlaceId })
  }
})

test('collects candidates across four regions instead of stopping at the first populated region', async () => {
  const visited = new Set<string>(), progress: number[] = []
  await generateAreaDestination(korea, async cell => {
    visited.add(JSON.stringify(cell))
    return [{ ...place, lat: (cell.minLat + cell.maxLat) / 2, lng: (cell.minLng + cell.maxLng) / 2 }]
  }, { category: 'restaurant', onProgress: value => progress.push(value.requests) })
  assert.equal(visited.size, 4)
  assert.equal(progress.at(-1), 4)
})

test('huge Kakao rectangles returning empty still find domestic places through smaller intersecting queries', async () => {
  let usableQueries = 0
  const result = await generateAreaDestination(world, async cell => {
    if (cell.maxLng - cell.minLng > 10 || cell.maxLat - cell.minLat > 10) return []
    usableQueries++
    return contains(cell, place) ? [place] : []
  }, { category: 'restaurant' })
  assert.ok(usableQueries > 0)
  assert.equal(result.kakaoPlaceId, place.kakaoPlaceId)
})

test('whole-region fallback checks all categories, recovering a rare category missed by initial probes', async () => {
  const codes = new Set<string>()
  const result = await generateAreaDestination(world, async (cell, code) => {
    if (cell !== world) return []
    codes.add(code)
    return code === 'PS3' ? [{ ...place, type: code }] : []
  })
  assert.equal(codes.size, 18)
  assert.equal(result.kakaoPlaceId, '123')
})

const concave = [{ lat: 33, lng: 124 }, { lat: 33, lng: 132 }, { lat: 34, lng: 132 },
  { lat: 34, lng: 125 }, { lat: 39, lng: 125 }, { lat: 39, lng: 124 }]
const outside = { ...place, lat: 37, lng: 130 }
const inside = { ...place, lat: 37, lng: 124.5 }

test('later pages recover an in-lasso place hidden behind out-of-lasso results', async () => {
  let laterPage = false
  const result = await generateAreaDestination(getPolygonBounds(concave), async (_cell, _code, page) => {
    if (page === 1) return Array.from({ length: 15 }, () => outside)
    laterPage = true
    return [inside]
  }, { polygon: concave, category: 'restaurant' })
  assert.ok(laterPage)
  assert.equal(result.lng, inside.lng)
})

test('subdivision recovers concave-lasso places and retains thin edge intersections', async () => {
  const result = await generateAreaDestination(getPolygonBounds(concave), async cell => {
    if (cell.maxLng - cell.minLng <= 2 && contains(cell, inside)) return [inside]
    return [outside]
  }, { polygon: concave, category: 'restaurant' })
  assert.equal(result.lng, inside.lng)
  const thin = [{ lat: 33, lng: 124 }, { lat: 39, lng: 130 }, { lat: 39, lng: 130.01 }, { lat: 33, lng: 124.01 }]
  assert.equal(polygonIntersectsBounds(thin, { minLat: 35, maxLat: 36, minLng: 125, maxLng: 129 }), true)
  assert.equal(polygonIntersectsBounds(thin, { minLat: 35, maxLat: 36, minLng: 130, maxLng: 131 }), false)
})

test('no result is fabricated or category relaxed; requests have a fixed upper bound', async () => {
  let calls = 0
  await assert.rejects(generateAreaDestination(korea, async () => {
    calls++
    return [{ ...place, type: 'CE7' }, { ...outside, lng: 160 }, outside]
  }, { polygon: concave, category: 'restaurant' }), /찾지 못했어요/)
  assert.ok(calls <= 96)
})

test('cancellation and network errors stop immediately, without stale successful results', async () => {
  const controller = new AbortController()
  let calls = 0
  await assert.rejects(generateAreaDestination(korea, async () => {
    calls++
    controller.abort()
    return [place]
  }, { signal: controller.signal }), { name: 'AbortError' })
  assert.equal(calls, 1)
  await assert.rejects(generateAreaDestination(korea, async () => { throw new Error('network') }), /network/)
})

test('a deadline aborts active work and reports a retryable timeout', async () => {
  await assert.rejects(generateAreaDestination(world, async (_cell, _code, _page, signal) => new Promise((_, reject) => {
    signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
  }), { timeoutMs: 10 }), /검색 시간이/)
})

test('malformed areas reject before requesting places', async () => {
  const lookup = async () => { throw new Error('should not query') }
  await assert.rejects(generateAreaDestination({ ...world, maxLng: 181 }, lookup), /범위/)
  await assert.rejects(generateAreaDestination(korea, lookup, { polygon: concave.slice(0, 2) }), /다각형/)
})
