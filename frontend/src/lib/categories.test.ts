import { test } from 'node:test'
import assert from 'node:assert/strict'
import { categoryLabels, categoryOsmTags, destinationCategories, getKakaoCategoryCode, kakaoDestinationCategories, matchesCategory, parseDestinationCategory } from './categories.ts'

test('category parsing defaults to all for missing or unsupported URL values', () => {
  assert.equal(parseDestinationCategory(null), 'all')
  assert.equal(parseDestinationCategory(''), 'all')
  assert.equal(parseDestinationCategory('all'), 'all')
  assert.equal(parseDestinationCategory('unknown'), 'all')
  assert.equal(parseDestinationCategory('Restaurant'), 'all')
  assert.equal(parseDestinationCategory('restaurant'), 'restaurant')
  assert.equal(categoryLabels.all, '전체')
  assert.equal(categoryLabels.restaurant, '음식점')
  for (const { id, label } of destinationCategories) {
    assert.equal(parseDestinationCategory(id), id)
    assert.equal(categoryLabels[id], label)
  }
})

test('the ordered category list contains all and each of the 18 official Kakao categories exactly once', () => {
  assert.deepEqual(destinationCategories.map(({ id, label, kakaoCode }) => [id, label, kakaoCode]), [
    ['all', '전체', undefined], ['restaurant', '음식점', 'FD6'], ['cafe', '카페', 'CE7'],
    ['convenience', '편의점', 'CS2'], ['mart', '대형마트', 'MT1'], ['culture', '문화시설', 'CT1'],
    ['attraction', '관광명소', 'AT4'], ['lodging', '숙박', 'AD5'], ['parking', '주차장', 'PK6'],
    ['gas', '주유소·충전소', 'OL7'], ['subway', '지하철역', 'SW8'], ['bank', '은행', 'BK9'],
    ['hospital', '병원', 'HP8'], ['pharmacy', '약국', 'PM9'], ['public', '공공기관', 'PO3'],
    ['realtor', '중개업소', 'AG2'], ['school', '학교', 'SC4'], ['academy', '학원', 'AC5'],
    ['childcare', '어린이집·유치원', 'PS3'],
  ])
  assert.equal(new Set(kakaoDestinationCategories).size, 18)
  assert.equal(getKakaoCategoryCode('all'), undefined)
})

test('all preserves cafes, attractions, parks, shops and walkable roads while rejecting water', () => {
  for (const [category, type] of [
    ['amenity', 'cafe'], ['amenity', 'restaurant'], ['amenity', 'fast_food'], ['amenity', 'food_court'],
    ['tourism', 'museum'], ['leisure', 'park'], ['shop', 'bakery'], ['highway', 'footway'],
  ]) {
    assert.equal(matchesCategory({ category, type }), true, `${category}:${type}`)
    assert.equal(matchesCategory({ category, type }, 'all'), true, `${category}:${type}`)
  }
  assert.equal(matchesCategory({ category: 'waterway', type: 'river' }), false)
  assert.equal(matchesCategory({ category: 'place', type: 'city' }), false)
})

test('restaurant accepts only restaurant, fast food and food court amenity tags', () => {
  for (const type of ['restaurant', 'fast_food', 'food_court']) {
    assert.equal(matchesCategory({ category: 'amenity', type }, 'restaurant'), true)
  }
  for (const [category, type] of [
    ['amenity', 'cafe'], ['amenity', 'bar'], ['amenity', 'pub'], ['amenity', 'ice_cream'],
    ['shop', 'bakery'], ['shop', 'restaurant'], ['tourism', 'attraction'], ['highway', 'residential'],
    ['leisure', 'park'], ['natural', 'water'], ['amenity', ''],
  ]) assert.equal(matchesCategory({ category, type }, 'restaurant'), false, `${category}:${type}`)
})

test('Kakao all accepts every official code and explicit categories accept only their exact code', () => {
  for (const type of kakaoDestinationCategories) {
    assert.equal(matchesCategory({ category: 'kakao', type }, 'all'), true)
    for (const category of destinationCategories) {
      if (category.id === 'all') continue
      assert.equal(matchesCategory({ category: 'kakao', type }, category.id), type === category.kakaoCode)
    }
  }
  for (const type of ['', 'UNKNOWN', 'fd6']) {
    assert.equal(matchesCategory({ category: 'kakao', type }, 'all'), false)
    assert.equal(matchesCategory({ category: 'kakao', type }, 'restaurant'), false)
  }
})

test('Photon fallback uses specific matching tags for each selected category, never an unfiltered request', () => {
  assert.deepEqual(categoryOsmTags.all, [])
  for (const { id } of destinationCategories) {
    if (id === 'all') continue
    assert.ok(categoryOsmTags[id].length > 0, id)
    for (const tag of categoryOsmTags[id]) {
      const [category, type] = tag.split(':')
      assert.ok(category && type)
      assert.equal(matchesCategory({ category, type }, id), true)
      assert.equal(matchesCategory({ category, type }, 'all'), true)
    }
    assert.equal(matchesCategory({ category: 'waterway', type: 'river' }, id), false)
  }
  assert.equal(matchesCategory({ category: 'railway', type: 'station' }, 'subway'), false)
  assert.equal(matchesCategory({ category: 'amenity', type: 'hospital' }, 'pharmacy'), false)
  assert.equal(matchesCategory({ category: 'shop', type: 'convenience' }, 'mart'), false)
})
