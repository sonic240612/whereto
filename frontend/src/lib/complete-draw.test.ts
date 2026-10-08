import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateCompleteDestination, uniformIndex, type CompleteRegionLookup } from './complete-draw.ts'
import { contains } from './validation.ts'
import { containsPolygon } from './polygon.ts'
import type { PlaceCandidate } from './geocode-client.ts'
import type { RectBounds } from '../types/index.ts'

const bounds = { minLat: 37, maxLat: 38, minLng: 126, maxLng: 128 }
const midpoint = 0x80000000
const place = (id: number, cell: RectBounds, type = 'FD6'): PlaceCandidate => ({
  lat: (cell.minLat + cell.maxLat) / 2, lng: (cell.minLng + cell.maxLng) / 2,
  address: `장소 ${id}`, placeName: `장소 ${id}`, kakaoPlaceId: String(id), category: 'kakao', type,
})

test('nationwide draws search only a small randomly chosen region with metadata preserved', async () => {
  const nation = { minLat: 33, maxLat: 39, minLng: 124, maxLng: 132 }
  let calls = 0
  const result = await generateCompleteDestination(nation, async (cell, code, page) => {
    calls++
    assert.equal(code, 'FD6')
    assert.equal(page, 1)
    assert.ok(cell.maxLat - cell.minLat < 0.02)
    assert.ok(cell.maxLng - cell.minLng < 0.03)
    assert.equal((cell.minLat + cell.maxLat) / 2, 36)
    assert.equal((cell.minLng + cell.maxLng) / 2, 128)
    return { places: [place(1, cell)], rawCount: 1 }
  }, { category: 'restaurant', uint32: () => midpoint })
  assert.equal(calls, 1)
  assert.equal(result.place.placeName, '장소 1')
  assert.equal(result.candidateCount, 1)
  assert.ok(contains(nation, result.place))
})

test('saturated local results use all three pages without recursively scanning the full area', async () => {
  const cells: RectBounds[] = []
  const result = await generateCompleteDestination(bounds, async (cell, _code, page) => {
    cells.push(cell)
    return { places: Array.from({ length: 15 }, (_, i) => place((page - 1) * 15 + i + 1, cell)), rawCount: 15 }
  }, { category: 'restaurant', uint32: () => midpoint })
  assert.equal(cells.length, 3)
  assert.deepEqual(cells[0], cells[2])
  assert.equal(result.candidateCount, 45)
})

test('all checks 18 categories in the selected region and deduplicates place IDs', async () => {
  const codes = new Set<string>()
  const result = await generateCompleteDestination(bounds, async (cell, code) => {
    codes.add(code)
    const places = code === 'FD6' ? [place(1, cell, code), place(2, cell, code)]
      : code === 'CE7' ? [place(1, cell, code)] : []
    return { places, rawCount: places.length }
  }, { uint32: () => midpoint })
  assert.equal(codes.size, 18)
  assert.equal(result.candidateCount, 2)
})

test('empty regions retry at new random locations and widen after two attempts', async () => {
  const cells: RectBounds[] = []
  const values = [0.2, 0.2, 0.6, 0.6, 0.8, 0.8].map(value => Math.floor(value * 2 ** 32))
  const result = await generateCompleteDestination(bounds, async (cell) => {
    cells.push(cell)
    const places = cells.length === 3 ? [place(1, cell)] : []
    return { places, rawCount: places.length }
  }, { category: 'restaurant', uint32: () => values.shift() ?? midpoint })
  assert.equal(cells.length, 3)
  assert.notEqual(cells[0].minLat, cells[1].minLat)
  assert.ok(cells[2].maxLat - cells[2].minLat > 1.9 * (cells[0].maxLat - cells[0].minLat))
  assert.ok(contains(cells[2], result.place))
})

test('out-of-region, wrong-category and invalid places are excluded without aborting valid results', async () => {
  const result = await generateCompleteDestination(bounds, async (cell) => ({
    places: [place(1, cell), { ...place(2, cell), lng: cell.maxLng + 0.001 },
      { ...place(3, cell), type: 'CE7' }, { ...place(4, cell), lat: NaN },
      { ...place(5, cell), kakaoPlaceId: undefined }], rawCount: 5,
  }), { category: 'restaurant', uint32: () => midpoint })
  assert.equal(result.candidateCount, 1)
  assert.equal(result.place.kakaoPlaceId, '1')
})

test('filtered full pages still fetch later pages using the raw response count', async () => {
  const pages: number[] = []
  const result = await generateCompleteDestination(bounds, async (cell, _code, page) => {
    pages.push(page)
    return page === 1 ? { places: [], rawCount: 15 } : { places: [place(1, cell)], rawCount: 1 }
  }, { category: 'restaurant', uint32: () => midpoint })
  assert.deepEqual(pages, [1, 2])
  assert.equal(result.candidateCount, 1)
})

test('concave polygons sample inside the lasso and reject bbox-only destinations', async () => {
  const polygon = [{ lat: 37, lng: 126 }, { lat: 37, lng: 126.01 },
    { lat: 37.004, lng: 126.01 }, { lat: 37.004, lng: 126.004 },
    { lat: 37.01, lng: 126.004 }, { lat: 37.01, lng: 126 }]
  const area = { minLat: 37, maxLat: 37.01, minLng: 126, maxLng: 126.01 }
  const result = await generateCompleteDestination(area, async (cell) => {
    assert.ok(contains(area, { lat: cell.minLat, lng: cell.minLng }))
    assert.ok(contains(area, { lat: cell.maxLat, lng: cell.maxLng }))
    return { places: [{ ...place(1, cell), lat: 37.001, lng: 126.001 },
      { ...place(2, cell), lat: 37.009, lng: 126.009 }], rawCount: 2 }
  }, { category: 'restaurant', polygon, uint32: () => 0 })
  assert.equal(result.candidateCount, 1)
  assert.ok(containsPolygon(polygon, result.place))
})

test('empty retries, request limits, cancellation and timeout are bounded without partial fallback', async () => {
  let calls = 0
  await assert.rejects(generateCompleteDestination(bounds, async () => {
    calls++; return { places: [], rawCount: 0 }
  }, { category: 'restaurant', uint32: () => midpoint }), /조건에 맞는 장소를 찾지 못했어요/)
  assert.equal(calls, 6)
  const lookup: CompleteRegionLookup = async (cell, code) => ({ places: [place(1, cell, code)], rawCount: 1 })
  await assert.rejects(generateCompleteDestination(bounds, lookup, { maxRequests: 1 }), /검색 한도/)
  await assert.rejects(generateCompleteDestination(bounds, async (_cell, _code, _page, signal) => new Promise((_, reject) => {
    signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
  }), { timeoutMs: 10 }), /시간이 초과/)
  const controller = new AbortController()
  await assert.rejects(generateCompleteDestination(bounds, async (...args) => {
    controller.abort(); return lookup(...args)
  }, { signal: controller.signal }), { name: 'AbortError' })
})

test('provider errors and invalid areas cannot produce a destination', async () => {
  await assert.rejects(generateCompleteDestination(bounds, async () => { throw new Error('service unavailable') }), /service unavailable/)
  await assert.rejects(generateCompleteDestination(bounds, async () => ({ places: [], rawCount: 16 })), /응답/)
  await assert.rejects(generateCompleteDestination({ ...bounds, maxLat: 91 }, async () => { throw new Error('must not query') }), /범위/)
  await assert.rejects(generateCompleteDestination(bounds, async () => { throw new Error('must not query') }, { polygon: [] }), /다각형/)
})

test('uniform integer selection rejects the biased tail and maps every candidate to a slot', () => {
  const values = [0xffffffff, 5]
  assert.equal(uniformIndex(3, () => values.shift()!), 2)
  assert.equal(values.length, 0)
  for (let index = 0; index < 70; index++) assert.equal(uniformIndex(70, () => index), index)
  assert.throws(() => uniformIndex(0))
  assert.throws(() => uniformIndex(3, () => NaN))
})
