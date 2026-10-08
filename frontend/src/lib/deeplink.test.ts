import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getDestinationName, getKakaoMapsUrl, getKakaoPlaceUrl } from './deeplink.ts'
import { placeMetadata, readPlaceMetadata, writePlaceMetadata } from './place-metadata.ts'
import { getShareUrl } from './share.ts'
import { parseResult } from './validation.ts'
import { generateRandomCoord } from './random.ts'

const place = { lat: 37.5, lng: 127, address: '100% 식당 & 카페, 서울 강남구 테스트로 1', placeName: '100% 식당 & 카페', kakaoPlaceId: '123456789' }

test('Kakao details use the place ID while directions retain the exact shop name and coordinates', () => {
  assert.equal(getKakaoPlaceUrl(place), 'https://place.map.kakao.com/123456789')
  assert.equal(getKakaoMapsUrl(place.lat, place.lng, getDestinationName(place)), `https://map.kakao.com/link/to/${encodeURIComponent(place.placeName)},37.5,127`)
  assert.equal(getDestinationName(place), place.placeName)
})

test('legacy results search the full address and directions use their destination instead of a generic name', () => {
  const legacy = { lat: place.lat, lng: place.lng, address: place.address }
  assert.equal(getKakaoPlaceUrl(legacy), `https://map.kakao.com/link/search/${encodeURIComponent(place.address)}`)
  assert.equal(getKakaoMapsUrl(legacy.lat, legacy.lng, getDestinationName(legacy)), `https://map.kakao.com/link/to/${encodeURIComponent(place.address)},37.5,127`)
})

test('new named places without an ID preserve punctuation and Korean in directions', () => {
  assert.equal(getKakaoMapsUrl(place.lat, place.lng, place.placeName), `https://map.kakao.com/link/to/${encodeURIComponent(place.placeName)},37.5,127`)
})

test('untrusted IDs cannot change the host or introduce arbitrary links', () => {
  for (const kakaoPlaceId of ['https://evil.example', '//evil.example', '../123', '123/456', '123?url=evil', '1e9', '-1', '0', '1'.repeat(21)]) {
    assert.deepEqual(placeMetadata({ kakaoPlaceId }), {})
    assert.equal(getKakaoPlaceUrl({ ...place, kakaoPlaceId }), `https://map.kakao.com/link/search/${encodeURIComponent(place.address)}`)
  }
  assert.deepEqual(placeMetadata({ placeName: 'x'.repeat(201) }), {})
  assert.deepEqual(placeMetadata({ placeName: 'bad\nname' }), {})
})

test('random selection, result restoration and sharing retain identity without leaking provider-only fields', async () => {
  const selected = await generateRandomCoord({ minLat: 37, maxLat: 38, minLng: 126, maxLng: 128 },
    async () => [{ ...place, category: 'kakao', type: 'FD6' }], undefined, () => 0, 'restaurant')
  assert.deepEqual(selected, place)
  const params = new URLSearchParams({ lat: String(selected.lat), lng: String(selected.lng), address: selected.address, resultCategory: 'restaurant', resultProvider: 'kakao' })
  writePlaceMetadata(params, selected)
  assert.deepEqual(parseResult(params, 'restaurant', 'kakao'), place)
  const shared = new URL(getShareUrl(selected, 'https://example.com'))
  assert.deepEqual(parseResult(shared.searchParams), place)
  assert.equal(getKakaoPlaceUrl(parseResult(shared.searchParams)!), getKakaoPlaceUrl(place))
})

test('replacing a result removes previous identity when the new result has no metadata', () => {
  const params = new URLSearchParams({ placeName: place.placeName, kakaoPlaceId: place.kakaoPlaceId })
  writePlaceMetadata(params, { lat: 37, lng: 127, address: '다른 장소' })
  assert.equal(params.has('placeName'), false)
  assert.equal(params.has('kakaoPlaceId'), false)
  assert.deepEqual(readPlaceMetadata(params), {})
  params.set('kakaoPlaceId', '//evil.example')
  assert.deepEqual(readPlaceMetadata(params), {})
})
