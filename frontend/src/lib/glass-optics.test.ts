import { test } from 'node:test'
import assert from 'node:assert/strict'
import { glassGeometry, glassNormalMap, glassScales, supportsGlassSvg } from './glass-optics.ts'

test('normal maps remain bounded even on large or high aspect ratio surfaces', () => {
  for (const [width, height] of [[4000, 2000], [20000, 30], [30, 20000], [0, -10], [NaN, Infinity]]) {
    const geometry = glassGeometry(width, height, 9999)
    assert.ok(geometry.rasterWidth >= 1 && geometry.rasterWidth <= 512)
    assert.ok(geometry.rasterHeight >= 1 && geometry.rasterHeight <= 512)
    assert.ok(geometry.rasterWidth * geometry.rasterHeight <= 65_536)
    assert.ok(geometry.radius <= Math.min(geometry.width, geometry.height) / 2)
    assert.equal(glassNormalMap(geometry).length, geometry.rasterWidth * geometry.rasterHeight * 4)
  }
})

test('refraction samples inward at opposite rims and leaves the center neutral', () => {
  const geometry = glassGeometry(120, 60, 20)
  const pixels = glassNormalMap(geometry)
  const pixel = (x: number, y: number) => Array.from(pixels.slice((y * 120 + x) * 4, (y * 120 + x) * 4 + 4))
  assert.ok(pixel(1, 30)[0] > 220)
  assert.ok(pixel(118, 30)[0] < 35)
  assert.ok(pixel(60, 1)[1] > 220)
  assert.ok(pixel(60, 58)[1] < 35)
  assert.deepEqual(pixel(60, 30), [128, 128, 128, 255])
  assert.deepEqual(pixel(0, 0), [128, 128, 128, 255])
  assert.equal(pixel(1, 30)[0] + pixel(118, 30)[0], 255)
})

test('pressure is bounded and changes RGB strengths without changing geometry', () => {
  const geometry = glassGeometry(120, 44, 999)
  const rest = glassScales(geometry, 0)
  const pressed = glassScales(geometry, 1)
  assert.ok(rest[0] > rest[1] && rest[1] > rest[2])
  assert.ok(pressed.every((value, index) => value > rest[index]))
  assert.ok(rest[0] - rest[2] < 2)
  assert.deepEqual(glassScales(geometry, NaN), rest)
  assert.deepEqual(glassScales(geometry, -10), rest)
  assert.deepEqual(glassScales(geometry, 10), pressed)
})

test('syntax support does not activate unsupported SVG backdrop implementations', () => {
  assert.equal(supportsGlassSvg('Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36', true), true)
  assert.equal(supportsGlassSvg('Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36', false), false)
  assert.equal(supportsGlassSvg('Mozilla/5.0 Version/26.0 Safari/605.1.15', true), false)
  assert.equal(supportsGlassSvg('Mozilla/5.0 Firefox/143.0', true), false)
  assert.equal(supportsGlassSvg('Mozilla/5.0 iPhone CriOS/140.0 Mobile Safari/604.1', true), false)
})
