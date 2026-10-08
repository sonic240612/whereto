import assert from 'node:assert/strict'
import { test } from 'node:test'
import { containsPolygon, createPolygonSampler, getPolygonBounds, isPolygon, MAX_POLYGON_POINTS, parsePolygon, serializePolygon } from './polygon.ts'
import { contains, parseResult } from './validation.ts'
import type { LatLng } from '../types/index.ts'

const point = (x: number, y: number): LatLng => ({ lng: 127 + x, lat: 37 + y })
const concave = [point(0, 0), point(1, 0), point(1, 0.2), point(0.2, 0.2), point(0.2, 1), point(0, 1)]

function randomSequence(seed = 42) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 2 ** 32
  }
}

test('concave polygons accept either winding and include edges and vertices, not the bounding-box notch', () => {
  assert.equal(isPolygon(concave), true)
  const reversed = [...concave].reverse()
  assert.equal(isPolygon(reversed), true)
  assert.deepEqual(getPolygonBounds(concave), { minLat: 37, maxLat: 38, minLng: 127, maxLng: 128 })
  for (const polygon of [concave, reversed]) {
    for (const included of [point(0.1, 0.8), point(0.8, 0.1), point(0.2, 0.7), point(0.8, 0.2), point(0, 0), point(1, 0.2)]) {
      assert.equal(containsPolygon(polygon, included), true, JSON.stringify(included))
    }
    for (const excluded of [point(0.8, 0.8), point(1.1, 0.1), point(0.200001, 0.8)]) {
      assert.equal(containsPolygon(polygon, excluded), false, JSON.stringify(excluded))
    }
  }
})

test('validation rejects crossings, touching/overlapping edges, duplicate points and zero-area shapes', () => {
  const invalid = [
    [point(0, 0), point(1, 1), point(0, 1), point(1, 0)],
    [point(0, 0), point(1, 0.8), point(0, 1), point(0.8, 0)],
    [point(0, 0), point(1, 0), point(1, 1), point(0.5, 0), point(0, 1)],
    [point(0, 0), point(1, 0), point(0.5, 0), point(1, 1), point(0, 1)],
    [...concave, concave[0]],
    [point(0, 0), point(0.5, 0.5), point(1, 1)],
    [point(0, 0), point(0, 0), point(1, 1)],
  ]
  for (const polygon of invalid) {
    assert.equal(isPolygon(polygon), false, JSON.stringify(polygon))
    assert.equal(containsPolygon(polygon, point(0.1, 0.1)), false)
    assert.throws(() => serializePolygon(polygon), /다각형/)
    assert.throws(() => createPolygonSampler(polygon), /다각형/)
  }
  const straightEdgePoints = [point(0, 0), point(0.5, 0), point(1, 0), point(1, 1), point(0, 1)]
  assert.equal(isPolygon(straightEdgePoints), true)
  assert.equal(containsPolygon(straightEdgePoints, createPolygonSampler(straightEdgePoints)(() => 0.3)), true)
})

test('polygon limits reject invalid coordinates/extents and permit at most fifty vertices', () => {
  assert.equal(MAX_POLYGON_POINTS, 50)
  const circle = (count: number) => Array.from({ length: count }, (_, index) => point(
    0.5 + 0.4 * Math.cos(index * Math.PI * 2 / count), 0.5 + 0.4 * Math.sin(index * Math.PI * 2 / count),
  ))
  assert.equal(isPolygon(circle(50)), true)
  assert.equal(isPolygon(circle(51)), false)
  for (const invalid of [null, {}, [], [point(0, 0), point(1, 0)],
    [{ lat: NaN, lng: 127 }, point(1, 0), point(0, 1)],
    [{ lat: Infinity, lng: 127 }, point(1, 0), point(0, 1)],
    [{ lat: '37', lng: 127 }, point(1, 0), point(0, 1)],
    [{ lat: 89, lng: 0 }, { lat: 89, lng: 1 }, { lat: 90, lng: 0 }],
  ]) assert.equal(isPolygon(invalid), false)
  assert.equal(isPolygon([{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 0 }]), true)
  assert.throws(() => getPolygonBounds([]), /다각형/)
})

test('URL round-trips preserve vertices; malformed, encoded-again and oversized values are rejected', () => {
  const url = new URL('https://example.com/result')
  url.searchParams.set('polygon', serializePolygon(concave))
  assert.deepEqual(parsePolygon(new URL(url.href).searchParams.get('polygon')), concave)
  const circle = Array.from({ length: 51 }, (_, index) => [37 + Math.sin(index) * 0.2, 127 + Math.cos(index) * 0.2])
  for (const invalid of [null, '', '%', '{broken', 'null', '{}', '[]', '[[37,127],[37,128]]',
    JSON.stringify(concave), '[[37,127,0],[37,128,0],[38,127,0]]', '[["37",127],[37,128],[38,127]]',
    '[[1e999,127],[37,128],[38,127]]', JSON.stringify(circle), ' '.repeat(16_385), encodeURIComponent(serializePolygon(concave)),
  ]) assert.equal(parsePolygon(invalid), null)
})

test('a restored result inside the envelope can still be rejected by the original polygon', () => {
  const params = new URLSearchParams({ lat: '37.8', lng: '127.8', address: '영역 밖 장소', polygon: serializePolygon(concave) })
  const polygon = parsePolygon(params.get('polygon'))
  const restored = parseResult(params)
  assert.ok(polygon && restored)
  assert.equal(contains(getPolygonBounds(polygon), restored), true)
  assert.equal(containsPolygon(polygon, restored), false)
})

test('area-weighted sampling stays within an L shape and weights its unequal arms by their area', () => {
  const sample = createPolygonSampler(concave)
  const random = randomSequence()
  let bottomArm = 0
  const samples = 2500
  for (let i = 0; i < samples; i++) {
    const result = sample(random)
    assert.equal(containsPolygon(concave, result), true)
    if (result.lat < 37.2) bottomArm++
  }
  // The horizontal rectangle has area .2; the remaining vertical rectangle .16.
  assert.ok(Math.abs(bottomArm / samples - 0.2 / 0.36) < 0.04)
})

test('very thin concave polygons sample directly without bounding-box rejection or fallback', () => {
  const width = 0.000001
  const thin = [point(0, 0), point(1, 0), point(1, width), point(width, width),
    point(width, 1 - width), point(1, 1 - width), point(1, 1), point(0, 1)]
  assert.equal(isPolygon(thin), true)
  for (const polygon of [thin, [...thin].reverse()]) {
    const sample = createPolygonSampler(polygon)
    const random = randomSequence(7)
    for (let i = 0; i < 300; i++) assert.equal(containsPolygon(polygon, sample(random)), true)
    assert.equal(containsPolygon(polygon, sample(() => 0)), true)
    assert.equal(containsPolygon(polygon, sample(() => 1)), true)
  }
})

test('sampler snapshots its input and rejects invalid random values instead of leaking an outside point', () => {
  const source = concave.map(value => ({ ...value }))
  const sample = createPolygonSampler(source)
  source[0].lat = 80
  assert.equal(containsPolygon(concave, sample(() => 0.5)), true)
  for (const value of [NaN, Infinity, -0.1, 1.1]) assert.throws(() => sample(() => value), /추첨 값/)
})
