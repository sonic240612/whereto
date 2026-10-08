import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isLatLng, isBounds, parseBounds, parseLatLng, parseResult } from './validation.ts'
import { getShareUrl } from './share.ts'
import { destinationCategories } from './categories.ts'

test('coordinates accept equator/prime meridian but reject invalid and partial numbers', () => {
  assert.equal(isLatLng({lat:0,lng:0}), true)
  for (const query of ['lat=Infinity&lng=127','lat=91&lng=0','lat=37abc&lng=127','lat=&lng=127','lng=127']) {
    assert.equal(parseLatLng(new URLSearchParams(query)), null)
  }
})
test('bounds allow any map-sized geographic area but require valid ordered coordinates', () => {
  const good = {minLat:37,maxLat:38,minLng:126,maxLng:127}
  assert.equal(isBounds(good), true)
  assert.equal(isBounds({ minLat: -85, maxLat: 85, minLng: -180, maxLng: 180 }), true)
  for (const bad of [{...good,maxLat:37},{...good,minLng:128},{...good,minLat:-90},{...good,maxLng:181},{...good,maxLat:Infinity}]) {
    assert.equal(isBounds(bad), false)
  }
  assert.deepEqual(parseBounds(new URLSearchParams('minLat=37&maxLat=38&minLng=126&maxLng=127')), good)
})
test('share link roundtrip preserves literal percent, Korean, ampersands and plus', () => {
  const result = {lat:37.5,lng:127,address:'100% 카페 + 공원 & 길'}
  const url = new URL(getShareUrl(result, 'https://example.com'))
  assert.deepEqual(parseResult(url.searchParams), result)
})

test('restored draws keep their category and never reuse an unfiltered result as a restaurant', () => {
  const params = new URLSearchParams({lat:'37.5',lng:'127',address:'테스트 장소'})
  assert.ok(parseResult(params, 'all'))
  assert.equal(parseResult(params, 'restaurant'), null)
  params.set('resultCategory', 'restaurant')
  assert.ok(parseResult(params, 'restaurant'))
  assert.equal(parseResult(params, 'all'), null)
  params.set('resultCategory', 'unknown')
  assert.equal(parseResult(params, 'all'), null)
})

test('switching map providers does not relabel a previously drawn place as a new provider result', () => {
  const params = new URLSearchParams({ lat: '37.5', lng: '127', address: '기존 장소' })
  assert.ok(parseResult(params, 'all', 'open'))
  assert.equal(parseResult(params, 'all', 'kakao'), null)
  params.set('resultProvider', 'kakao')
  assert.ok(parseResult(params, 'all', 'kakao'))
  assert.equal(parseResult(params, 'all', 'open'), null)
  // Saved/shared coordinates continue to work independently of the active map.
  assert.ok(parseResult(params))
})

test('restored draws for every category are rejected after changing the selected category', () => {
  for (const saved of destinationCategories) {
    const params = new URLSearchParams({ lat: '37.5', lng: '127', address: '저장된 목적지', resultCategory: saved.id, resultProvider: 'kakao' })
    for (const selected of destinationCategories) {
      assert.equal(Boolean(parseResult(params, selected.id, 'kakao')), saved.id === selected.id)
    }
  }
})
