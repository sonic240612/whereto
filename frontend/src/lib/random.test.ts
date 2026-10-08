import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateRandomCoord } from './random.ts'
import type { PlaceCandidate } from './geocode-client.ts'
import { categoryLabels, destinationCategories } from './categories.ts'
import { containsPolygon, getPolygonBounds } from './polygon.ts'

const bounds = {minLat:37,maxLat:38,minLng:126,maxLng:128}
const cafe: PlaceCandidate = {lat:37.5,lng:127,address:'서울특별시 강남구 강남카페',category:'amenity',type:'cafe'}
test('강남 is accepted without retries and result uses actual destination coordinate', async () => {
  let calls = 0
  const result = await generateRandomCoord(bounds, async () => {calls++; return [cafe]}, undefined, () => 0.1)
  assert.equal(calls,1)
  assert.deepEqual(result,{lat:cafe.lat,lng:cafe.lng,address:cafe.address})
})
test('water and out-of-range destinations never become a fallback result', async () => {
  let calls = 0
  await assert.rejects(generateRandomCoord(bounds, async () => {
    calls++
    return [{...cafe,category:'waterway',type:'river'},{...cafe,lat:39}]
  }), /장소를 찾지 못했어요/)
  assert.equal(calls,3)
})
test('invalid bounds, network errors and aborts do not silently become successful coordinates', async () => {
  let calls = 0
  await assert.rejects(generateRandomCoord({...bounds,maxLat:37},async()=>{calls++; return [cafe]}))
  assert.equal(calls,0)
  await assert.rejects(generateRandomCoord(bounds,async()=>{throw new Error('network')}), /network/)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(generateRandomCoord(bounds,async()=>{calls++;return [cafe]},controller.signal),{name:'AbortError'})
  assert.equal(calls,0)
})

test('restaurant selection uses only matching destinations inside the selected bounds', async () => {
  const restaurant = { ...cafe, address: '강남 식당', type: 'restaurant' }
  let calls = 0
  const result = await generateRandomCoord(bounds, async () => {
    calls++
    return [cafe, { ...restaurant, lat: 39 }, { ...restaurant, category: 'shop' }, restaurant]
  }, undefined, () => 0, 'restaurant')
  assert.equal(calls, 1)
  assert.deepEqual(result, { lat: restaurant.lat, lng: restaurant.lng, address: restaurant.address })
})

test('restaurant selection never falls back to cafes, other destinations or out-of-bounds restaurants', async () => {
  let calls = 0
  await assert.rejects(generateRandomCoord(bounds, async () => {
    calls++
    return [cafe, { ...cafe, category: 'leisure', type: 'park' }, { ...cafe, type: 'restaurant', lng: 129 }]
  }, undefined, () => 0.5, 'restaurant'), /음식점.*결과를 찾지 못했어요/)
  assert.equal(calls, 3)
})

test('fast food and food courts remain eligible for restaurant selection', async () => {
  for (const type of ['fast_food', 'food_court']) {
    const result = await generateRandomCoord(bounds, async () => [{ ...cafe, type }], undefined, () => 0.5, 'restaurant')
    assert.deepEqual(result, { lat: cafe.lat, lng: cafe.lng, address: cafe.address })
  }
})

test('every explicit Kakao category excludes other categories and out-of-bounds results', async () => {
  for (const item of destinationCategories) {
    if (item.id === 'all') continue
    const matching: PlaceCandidate = { ...cafe, category: 'kakao', type: item.kakaoCode, address: item.label }
    const result = await generateRandomCoord(bounds, async () => [
      { ...matching, type: item.kakaoCode === 'FD6' ? 'CE7' : 'FD6' },
      { ...matching, lat: 39 }, matching,
    ], undefined, () => 0, item.id)
    assert.deepEqual(result, { lat: matching.lat, lng: matching.lng, address: item.label })
  }
})

test('empty category draws identify the selected category and never relax the filter', async () => {
  for (const category of ['cafe', 'pharmacy', 'childcare'] as const) {
    let calls = 0
    await assert.rejects(generateRandomCoord(bounds, async () => {
      calls++
      return [{ ...cafe, category: 'kakao', type: 'FD6' }]
    }, undefined, () => 0.5, category), (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.ok(error.message.includes(categoryLabels[category]))
      assert.match(error.message, /결과를 찾지 못했어요/)
      return true
    })
    assert.equal(calls, 3)
  }
})

const polygon = [
  { lat: 37, lng: 127 }, { lat: 37, lng: 128 }, { lat: 37.2, lng: 128 },
  { lat: 37.2, lng: 127.2 }, { lat: 38, lng: 127.2 }, { lat: 38, lng: 127 },
]

test('polygon draws sample inside the actual shape and exclude a bbox-only destination', async () => {
  const inside = { ...cafe, lat: 37.8, lng: 127.1, address: '다각형 안 카페' }
  const outside = { ...cafe, lat: 37.8, lng: 127.8, address: '사각형 안이지만 다각형 밖 카페' }
  let calls = 0
  const result = await generateRandomCoord(getPolygonBounds(polygon), async (lat, lng) => {
    calls++
    assert.equal(containsPolygon(polygon, { lat, lng }), true)
    return [outside, inside]
  }, undefined, () => 0, 'all', polygon)
  assert.equal(calls, 1)
  assert.deepEqual(result, { lat: inside.lat, lng: inside.lng, address: inside.address })
})

test('polygon draws include destinations on the boundary and preserve the selected category', async () => {
  const boundary = { ...cafe, lat: 37.8, lng: 127.2, category: 'kakao', type: 'PM9', address: '경계 약국' }
  const result = await generateRandomCoord(getPolygonBounds(polygon), async () => [
    { ...boundary, category: 'amenity', type: 'cafe' }, boundary,
  ], undefined, () => 0.5, 'pharmacy', polygon)
  assert.deepEqual(result, { lat: boundary.lat, lng: boundary.lng, address: boundary.address })
})

test('no in-polygon candidates never becomes an out-of-polygon fallback', async () => {
  let calls = 0
  await assert.rejects(generateRandomCoord(getPolygonBounds(polygon), async (lat, lng) => {
    calls++
    assert.equal(containsPolygon(polygon, { lat, lng }), true)
    return [{ ...cafe, lat: 37.8, lng: 127.8 }]
  }, undefined, () => 0.8, 'all', polygon), /장소를 찾지 못했어요/)
  assert.equal(calls, 3)
})

test('invalid polygons and polygons outside the supplied bounds reject before any lookup', async () => {
  let calls = 0
  const lookup = async () => { calls++; return [cafe] }
  for (const invalid of [[], polygon.slice(0, 2), [...polygon, polygon[0]],
    [{ lat: 37, lng: 127 }, { lat: 38, lng: 128 }, { lat: 38, lng: 127 }, { lat: 37, lng: 128 }],
  ]) await assert.rejects(generateRandomCoord(bounds, lookup, undefined, Math.random, 'all', invalid), /다각형/)
  await assert.rejects(generateRandomCoord({ minLat: 37, maxLat: 37.5, minLng: 127, maxLng: 128 },
    lookup, undefined, Math.random, 'all', polygon), /다각형/)
  assert.equal(calls, 0)
})
