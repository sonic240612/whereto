import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGeocodeClient, parsePlaces } from './geocode-client.ts'
const response = {features:[{geometry:{type:'Point',coordinates:[127,37.5]},properties:{name:'강남 카페',city:'서울',osm_key:'amenity',osm_value:'cafe'}}]}
test('parser validates geometry and preserves type metadata instead of address keyword heuristics', () => {
  const places = parsePlaces(response)
  assert.equal(places[0].address,'강남 카페, 서울')
  assert.equal(places[0].category,'amenity')
  assert.deepEqual(parsePlaces({features:[{geometry:{type:'Point',coordinates:[500,300]},properties:{name:'bad'}}]}),[])
  assert.throws(()=>parsePlaces({}), /응답/)
})
test('concurrent calls are serialized and completed results are reused', async () => {
  let active = 0, maximum = 0, calls = 0
  const fetcher: typeof fetch = async () => {
    active++; calls++; maximum = Math.max(active,maximum)
    await new Promise(resolve=>setTimeout(resolve,5))
    active--
    return Response.json(response)
  }
  const client = createGeocodeClient({baseUrl:'https://example.com/',fetcher,intervalMs:1})
  await Promise.all([client.reverse(37.5,127),client.reverse(37.6,127),client.reverse(37.5,127)])
  assert.equal(maximum,1)
  assert.equal(calls,2)
})
test('timeout, failed response and cancellation reject with actionable errors; queue recovers', async () => {
  const fetcher: typeof fetch = async (_url, options) => new Promise((_resolve,reject)=>{
    options?.signal?.addEventListener('abort',()=>reject(new DOMException('abort','AbortError')),{once:true})
  })
  const timeout = createGeocodeClient({baseUrl:'https://example.com/',fetcher,timeoutMs:5,intervalMs:0})
  await assert.rejects(timeout.reverse(37,127),/시간이 초과/)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(timeout.reverse(37,127,controller.signal),{name:'AbortError'})
  let calls=0
  const recovering=createGeocodeClient({baseUrl:'https://example.com/',intervalMs:0,fetcher:async()=>++calls===1 ? new Response('',{status:429}):Response.json(response)})
  await assert.rejects(recovering.reverse(37,127),/조회가 많습니다/)
  assert.equal((await recovering.reverse(37,127)).length,1)
})

test('restaurant reverse queries send repeated Photon filters and keep category caches separate', async () => {
  const urls: URL[] = []
  const client = createGeocodeClient({
    baseUrl: 'https://example.com/', intervalMs: 0,
    fetcher: async input => {
      const url = new URL(String(input))
      urls.push(url)
      return Response.json(url.searchParams.has('osm_tag')
        ? { features: [{ ...response.features[0], properties: { name: '식당', osm_key: 'amenity', osm_value: 'restaurant' } }] }
        : response)
    },
  })
  const [all, restaurants, sameRestaurants] = await Promise.all([
    client.reverse(37.5, 127),
    client.reverse(37.5, 127, undefined, 'restaurant'),
    client.reverse(37.5, 127, undefined, 'restaurant'),
  ])
  assert.equal(urls.length, 2)
  assert.equal(urls[0].pathname, '/reverse')
  assert.deepEqual(Object.fromEntries(urls[0].searchParams), { lat: '37.5', lon: '127', limit: '8', radius: '5' })
  assert.deepEqual(urls[1].searchParams.getAll('osm_tag'), ['amenity:restaurant', 'amenity:fast_food', 'amenity:food_court'])
  assert.equal(all[0].type, 'cafe')
  assert.equal(restaurants[0].type, 'restaurant')
  assert.deepEqual(sameRestaurants, restaurants)
  assert.deepEqual(await client.reverse(37.5, 127, undefined, 'all'), all)
  assert.deepEqual(await client.reverse(37.5, 127, undefined, 'restaurant'), restaurants)
  assert.equal(urls.length, 2)
})

test('cancelled restaurant lookups do not request unfiltered results or poison the queue', async () => {
  const urls: URL[] = []
  const client = createGeocodeClient({
    baseUrl: 'https://example.com/', intervalMs: 0,
    fetcher: async input => { urls.push(new URL(String(input))); return Response.json({ features: [] }) },
  })
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(client.reverse(37.5, 127, controller.signal, 'restaurant'), { name: 'AbortError' })
  assert.equal(urls.length, 0)
  assert.deepEqual(await client.reverse(37.5, 127, undefined, 'restaurant'), [])
  assert.equal(urls.length, 1)
  assert.equal(urls[0].searchParams.getAll('osm_tag').length, 3)
})

test('Photon cafe and pharmacy queries remain filtered and cache separately at the same coordinate', async () => {
  const urls: URL[] = []
  const client = createGeocodeClient({
    baseUrl: 'https://example.com/', intervalMs: 0,
    fetcher: async input => {
      const url = new URL(String(input))
      urls.push(url)
      const type = url.searchParams.get('osm_tag') === 'amenity:pharmacy' ? 'pharmacy' : 'cafe'
      return Response.json({ features: [{ ...response.features[0], properties: { name: type, osm_key: 'amenity', osm_value: type } }] })
    },
  })
  const cafe = await client.reverse(37.5, 127, undefined, 'cafe')
  const pharmacy = await client.reverse(37.5, 127, undefined, 'pharmacy')
  assert.deepEqual(urls.map(url => url.searchParams.getAll('osm_tag')), [['amenity:cafe'], ['amenity:pharmacy']])
  assert.equal(cafe[0].type, 'cafe')
  assert.equal(pharmacy[0].type, 'pharmacy')
  assert.deepEqual(await client.reverse(37.5, 127, undefined, 'cafe'), cafe)
  assert.deepEqual(await client.reverse(37.5, 127, undefined, 'pharmacy'), pharmacy)
  assert.equal(urls.length, 2)
})
