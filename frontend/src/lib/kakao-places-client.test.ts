import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createKakaoPlacesClient, type KakaoPlacesServices } from './kakao-places-client.ts'
import { destinationCategories, matchesCategory } from './categories.ts'
import { generateRandomCoord } from './random.ts'

const restaurant = {
  id: '123456789', place_name: '강남 식당', road_address_name: '서울 강남구 테스트로 1',
  address_name: '서울 강남구 테스트동 1', category_group_code: 'FD6', x: '127', y: '37.5',
}

function services(): KakaoPlacesServices {
  return {
    places: {
      keywordSearch: (_query, callback) => callback([], 'ZERO_RESULT'),
      categorySearch: (_code, callback) => callback([], 'ZERO_RESULT'),
    },
    geocoder: {
      addressSearch: (_query, callback) => callback([], 'ZERO_RESULT'),
      coord2Address: (_x, _y, callback) => callback([], 'ZERO_RESULT'),
    },
  }
}

test('restaurant lookup uses only FD6 and preserves actual Kakao category and coordinates', async () => {
  const sdk = services()
  let calls = 0
  sdk.places.categorySearch = (code, callback, options) => {
    calls++
    assert.equal(code, 'FD6')
    assert.deepEqual(options, { x: 127.1, y: 37.6, radius: 5000, size: 8, page: 1 })
    callback([restaurant, { ...restaurant, id: 'cafe', category_group_code: 'CE7' },
      { ...restaurant, id: 'missing', category_group_code: '' },
      { ...restaurant, id: 'bad', y: 'Infinity' }, { ...restaurant, id: 'bad-2', x: '' }], 'OK')
  }
  const client = createKakaoPlacesClient({ getServices: () => sdk, intervalMs: 0 })
  const result = await client.reverse(37.6, 127.1, undefined, 'restaurant')
  assert.equal(calls, 1)
  assert.deepEqual(result, [{ lat: 37.5, lng: 127, address: '강남 식당, 서울 강남구 테스트로 1', placeName: '강남 식당', kakaoPlaceId: '123456789', category: 'kakao', type: 'FD6' }])
  assert.equal(matchesCategory(result[0], 'restaurant'), true)
})

test('all samples four distinct categories without fixing the result to restaurants', async () => {
  const sdk = services()
  const codes: string[] = []
  sdk.places.categorySearch = (code, callback) => {
    codes.push(code)
    callback([{ ...restaurant, id: code, category_group_code: code }], 'OK')
  }
  const client = createKakaoPlacesClient({ getServices: () => sdk, intervalMs: 0, random: () => 0 })
  const result = await client.reverse(37.5, 127)
  assert.deepEqual(codes, ['CE7', 'CS2', 'MT1', 'CT1'])
  assert.equal(new Set(codes).size, 4)
  assert.deepEqual(result.map(place => place.type), codes)
  assert.ok(result.every(place => matchesCategory(place, 'all')))
  assert.ok(result.every(place => !matchesCategory(place, 'restaurant')))
})

test('each of the 18 selected categories performs one exact-code query and keeps category caches isolated', async () => {
  const sdk = services()
  const calls: string[] = []
  sdk.places.categorySearch = (code, callback) => {
    calls.push(code)
    callback([
      { ...restaurant, id: code, category_group_code: code },
      { ...restaurant, id: 'wrong', category_group_code: code === 'FD6' ? 'CE7' : 'FD6' },
    ], 'OK')
  }
  const client = createKakaoPlacesClient({ getServices: () => sdk, intervalMs: 0 })
  const selected = destinationCategories.filter(item => item.id !== 'all')
  for (const item of selected) {
    const result = await client.reverse(37.5, 127, undefined, item.id)
    assert.equal(result.length, 1)
    assert.equal(result[0].type, item.kakaoCode)
    assert.ok(matchesCategory(result[0], item.id))
  }
  assert.deepEqual(calls, selected.map(item => item.kakaoCode))
  await client.reverse(37.5, 127, undefined, 'pharmacy')
  await client.reverse(37.5, 127, undefined, 'hospital')
  assert.equal(calls.length, 18)
})

test('all can draw from newly added categories while making at most four requests', async () => {
  const sdk = services()
  const calls: string[] = []
  sdk.places.categorySearch = (code, callback) => {
    calls.push(code)
    callback([{ ...restaurant, id: code, category_group_code: code }], 'OK')
  }
  let randomCalls = 0
  const client = createKakaoPlacesClient({
    getServices: () => sdk, intervalMs: 0, random: () => randomCalls++ === 0 ? 0 : 0.999,
  })
  const result = await client.reverse(37.5, 127)
  assert.equal(calls.length, 4)
  assert.equal(new Set(calls).size, 4)
  assert.ok(result.some(place => place.type === 'PS3'))
  assert.ok(result.every(place => matchesCategory(place, 'all')))
})

test('an empty explicit category does not switch to all or to a different category', async () => {
  const sdk = services()
  const calls: string[] = []
  sdk.places.categorySearch = (code, callback) => { calls.push(code); callback([], 'ZERO_RESULT') }
  const client = createKakaoPlacesClient({ getServices: () => sdk, intervalMs: 0 })
  assert.deepEqual(await client.reverse(37.5, 127, undefined, 'pharmacy'), [])
  assert.deepEqual(calls, ['PM9'])
})

test('multi-category Kakao results retain a matching provider code without admitting cafes to restaurant draws', async () => {
  const sdk = services()
  sdk.places.categorySearch = (_code, callback) => callback([
    { ...restaurant, category_group_code: ['CE7', 'FD6'] },
    { ...restaurant, id: 'cafe-only', category_group_code: ['CE7'] },
  ], 'OK')
  const client = createKakaoPlacesClient({ getServices: () => sdk, intervalMs: 0 })
  const result = await client.reverse(37.5, 127, undefined, 'restaurant')
  assert.equal(result.length, 1)
  assert.equal(result[0].category, 'kakao')
  assert.equal(result[0].type, 'FD6')
})

test('all deduplicates provider IDs across category responses', async () => {
  const sdk = services()
  sdk.places.categorySearch = (code, callback) => callback([
    { ...restaurant, id: 'same-place', category_group_code: code },
    { ...restaurant, id: 'same-place', category_group_code: code },
  ], 'OK')
  const client = createKakaoPlacesClient({ getServices: () => sdk, intervalMs: 0, random: () => 0 })
  assert.equal((await client.reverse(37.5, 127)).length, 1)
})

test('search keeps unclassified keyword matches and uses address search only when there are no places', async () => {
  const sdk = services()
  let addressCalls = 0
  sdk.places.keywordSearch = (query, callback, options) => {
    assert.equal(options.size, 5)
    callback(query === '건물' ? [{ ...restaurant, category_group_code: '' }] : [], query === '건물' ? 'OK' : 'ZERO_RESULT')
  }
  sdk.geocoder.addressSearch = (query, callback) => {
    addressCalls++
    assert.equal(query, '서울 테스트로 2')
    callback([{ x: '127.2', y: '37.7', address_name: '지번 주소', road_address: { address_name: query } }], 'OK')
  }
  const client = createKakaoPlacesClient({ getServices: () => sdk, intervalMs: 0 })
  assert.equal((await client.search('  건물  '))[0].type, '')
  assert.equal(addressCalls, 0)
  assert.deepEqual(await client.search('서울 테스트로 2'), [{
    lat: 37.7, lng: 127.2, address: '서울 테스트로 2', category: 'address', type: '',
  }])
  assert.equal(addressCalls, 1)
})

test('addressAt uses the exact input coordinate, prefers road address and handles missing addresses', async () => {
  const sdk = services()
  let index = 0
  sdk.geocoder.coord2Address = (x, y, callback) => {
    assert.equal(x, 127)
    assert.equal(y, 37.5 + index)
    index++
    if (index === 1) callback([{ road_address: { address_name: '도로명 주소' }, address: { address_name: '지번 주소' } }], 'OK')
    else if (index === 2) callback([{ road_address: null, address: { address_name: '지번 주소' } }], 'OK')
    else callback([], 'ZERO_RESULT')
  }
  const client = createKakaoPlacesClient({ getServices: () => sdk, intervalMs: 0 })
  assert.equal(await client.addressAt(37.5, 127), '도로명 주소')
  assert.equal(await client.addressAt(38.5, 127), '지번 주소')
  assert.equal(await client.addressAt(39.5, 127), null)
})

test('ZERO_RESULT is empty; service errors do not fall back or get cached and the queue recovers', async () => {
  const sdk = services()
  let calls = 0
  sdk.places.categorySearch = (_code, callback) => {
    calls++
    callback(calls === 3 ? [restaurant] : [], calls === 1 ? 'ZERO_RESULT' : calls === 2 ? 'ERROR' : 'OK')
  }
  const client = createKakaoPlacesClient({ getServices: () => sdk, intervalMs: 0 })
  assert.deepEqual(await client.reverse(37.4, 127, undefined, 'restaurant'), [])
  await assert.rejects(client.reverse(37.5, 127, undefined, 'restaurant'), /카카오 장소 조회에 실패/)
  assert.equal((await client.reverse(37.5, 127, undefined, 'restaurant')).length, 1)
  assert.equal(calls, 3)
  sdk.places.keywordSearch = (_query, callback) => callback([], 'ERROR')
  sdk.geocoder.addressSearch = () => { throw new Error('Address fallback must not run after service failure') }
  await assert.rejects(client.search('강남'), /카카오 장소 조회에 실패/)
})

test('invalid coordinates and queries fail before loading the SDK; zero coordinates remain valid', async () => {
  const sdk = services()
  let loads = 0
  const client = createKakaoPlacesClient({ getServices: () => { loads++; return sdk }, intervalMs: 0 })
  for (const [lat, lng] of [[NaN, 127], [91, 127], [37, Infinity], [37, -181]]) {
    await assert.rejects(client.reverse(lat, lng), /좌표/)
    await assert.rejects(client.addressAt(lat, lng), /좌표/)
  }
  await assert.rejects(client.search('   '), /검색어/)
  await assert.rejects(client.search('x'.repeat(201)), /검색어/)
  assert.equal(loads, 0)
  assert.deepEqual(await client.reverse(0, 0, undefined, 'restaurant'), [])
  assert.equal(loads, 1)
})

test('concurrent requests are serialized and the per-category cache reuses only matching queries', async () => {
  const sdk = services()
  let calls = 0, active = 0, maximum = 0
  sdk.places.categorySearch = (code, callback) => {
    calls++; active++; maximum = Math.max(maximum, active)
    setTimeout(() => { active--; callback([{ ...restaurant, id: code, category_group_code: code }], 'OK') }, 5)
  }
  const client = createKakaoPlacesClient({ getServices: () => sdk, intervalMs: 0, random: () => 0 })
  const [first, second] = await Promise.all([
    client.reverse(37.5, 127, undefined, 'restaurant'), client.reverse(37.5, 127, undefined, 'restaurant'),
  ])
  assert.deepEqual(first, second)
  assert.equal(calls, 1)
  assert.equal(maximum, 1)
  const all = await client.reverse(37.5, 127)
  assert.equal(calls, 5)
  assert.equal(all.length, 4)
  assert.ok(all.every(place => place.type !== 'FD6'))
  await client.reverse(37.5, 127)
  assert.equal(calls, 5)
})

test('abort during SDK loading prevents the eventual service call', async () => {
  const sdk = services()
  let loadStarted!: () => void
  const started = new Promise<void>(resolve => { loadStarted = resolve })
  let finishLoad!: (value: KakaoPlacesServices) => void
  const loading = new Promise<KakaoPlacesServices>(resolve => { finishLoad = resolve })
  let calls = 0
  sdk.places.categorySearch = () => { calls++ }
  const client = createKakaoPlacesClient({ getServices: () => { loadStarted(); return loading }, intervalMs: 0 })
  const controller = new AbortController()
  const pending = client.reverse(37.5, 127, controller.signal, 'restaurant')
  await started
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  finishLoad(sdk)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(calls, 0)
})

test('loading timeout prevents late SDK calls, while missing callbacks time out and late results are ignored', async () => {
  const sdk = services()
  let finishLoad!: (value: KakaoPlacesServices) => void
  const loading = new Promise<KakaoPlacesServices>(resolve => { finishLoad = resolve })
  let calls = 0
  sdk.places.categorySearch = () => { calls++ }
  const loadingClient = createKakaoPlacesClient({ getServices: () => loading, intervalMs: 0, timeoutMs: 5 })
  await assert.rejects(loadingClient.reverse(37.5, 127, undefined, 'restaurant'), /시간이 초과/)
  finishLoad(sdk)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(calls, 0)

  let lateCallback!: Parameters<KakaoPlacesServices['places']['categorySearch']>[1]
  sdk.places.categorySearch = (_code, callback) => { calls++; lateCallback = callback }
  const client = createKakaoPlacesClient({ getServices: () => sdk, intervalMs: 0, timeoutMs: 5 })
  await assert.rejects(client.reverse(37.5, 127, undefined, 'restaurant'), /시간이 초과/)
  lateCallback([restaurant], 'OK')
  sdk.places.categorySearch = (_code, callback) => { calls++; callback([], 'ZERO_RESULT') }
  assert.deepEqual(await client.reverse(37.5, 127, undefined, 'restaurant'), [])
  assert.equal(calls, 2)
})

test('queued cancellation rejects immediately and never issues an extra request', async () => {
  const sdk = services()
  let callStarted!: () => void
  const started = new Promise<void>(resolve => { callStarted = resolve })
  let finishFirst!: Parameters<KakaoPlacesServices['places']['categorySearch']>[1]
  let calls = 0
  sdk.places.categorySearch = (_code, callback) => { calls++; finishFirst = callback; callStarted() }
  const client = createKakaoPlacesClient({ getServices: () => sdk, intervalMs: 0 })
  const first = client.reverse(37.5, 127, undefined, 'restaurant')
  await started
  const controller = new AbortController()
  const queued = client.reverse(37.6, 127, controller.signal, 'restaurant')
  controller.abort()
  await assert.rejects(queued, { name: 'AbortError' })
  assert.equal(calls, 1)
  finishFirst([restaurant], 'OK')
  await first
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(calls, 1)
})

test('cancellation after a service starts ignores its late callback and does not cache the stale result', async () => {
  const sdk = services()
  let callStarted!: () => void
  const started = new Promise<void>(resolve => { callStarted = resolve })
  let lateCallback!: Parameters<KakaoPlacesServices['places']['categorySearch']>[1]
  let calls = 0
  sdk.places.categorySearch = (_code, callback) => { calls++; lateCallback = callback; callStarted() }
  const client = createKakaoPlacesClient({ getServices: () => sdk, intervalMs: 0 })
  const controller = new AbortController()
  const pending = client.reverse(37.5, 127, controller.signal, 'restaurant')
  await started
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  lateCallback([restaurant], 'OK')
  sdk.places.categorySearch = (_code, callback) => { calls++; callback([], 'ZERO_RESULT') }
  assert.deepEqual(await client.reverse(37.5, 127, undefined, 'restaurant'), [])
  assert.equal(calls, 2)
})

test('Kakao restaurant candidates still cannot escape the chosen rectangle or fall back to cafes', async () => {
  const sdk = services()
  sdk.places.categorySearch = (_code, callback) => callback([
    { ...restaurant, id: 'outside', y: '38.5' },
    { ...restaurant, id: 'cafe', category_group_code: 'CE7' },
  ], 'OK')
  const client = createKakaoPlacesClient({ getServices: () => sdk, intervalMs: 0 })
  await assert.rejects(generateRandomCoord({ minLat: 37, maxLat: 38, minLng: 126, maxLng: 128 },
    (lat, lng, signal) => client.reverse(lat, lng, signal, 'restaurant'), undefined, () => 0.5, 'restaurant'), /음식점.*결과를 찾지 못했어요/)
})
