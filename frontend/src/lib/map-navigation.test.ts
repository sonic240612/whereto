import { test } from 'node:test'
import assert from 'node:assert/strict'
import { constrainMapViewport } from './map-navigation.ts'

test('an in-bounds viewport stays still and retains the broadest supported zoom', () => {
  assert.deepEqual(constrainMapViewport({ left: -200, right: 1600, top: -200, bottom: 1000 }, 1280, 720, 14),
    { maxLevel: 14, dx: 0, dy: 0 })
})

test('all four edges constrain the whole viewport instead of only its center', () => {
  for (const [left, top, dx, dy] of [[100, 80, 100, 80], [-900, -800, -380, -320], [-200, 80, 0, 80], [100, -200, 100, 0]]) {
    const result = constrainMapViewport({ left, right: left + 1800, top, bottom: top + 1200 }, 1280, 720, 14)!
    assert.equal(result.dx, dx)
    assert.equal(result.dy, dy)
    const corrected = { left: left - dx, right: left + 1800 - dx, top: top - dy, bottom: top + 1200 - dy }
    assert.equal(constrainMapViewport(corrected, 1280, 720, 14)!.dx, 0)
    assert.equal(constrainMapViewport(corrected, 1280, 720, 14)!.dy, 0)
  }
})

test('wide and tall windows reduce maximum zoom-out to avoid empty borders', () => {
  const extent = { left: 0, right: 1800, top: 0, bottom: 1200 }
  assert.equal(constrainMapViewport(extent, 2560, 720, 14)!.maxLevel, 13)
  assert.equal(constrainMapViewport(extent, 1280, 2400, 14)!.maxLevel, 12)
  assert.equal(constrainMapViewport(extent, 390, 844, 14)!.maxLevel, 14)
  assert.equal(constrainMapViewport({ left: 0, right: 3600, top: 0, bottom: 2400 }, 2560, 720, 13)!.maxLevel, 13)
})

test('temporarily hidden or invalid layouts do not issue camera corrections', () => {
  const extent = { left: 0, right: 1800, top: 0, bottom: 1200 }
  assert.equal(constrainMapViewport(extent, 0, 0, 14), null)
  assert.equal(constrainMapViewport({ ...extent, left: NaN }, 1280, 720, 14), null)
  assert.equal(constrainMapViewport({ ...extent, right: 0 }, 1280, 720, 14), null)
})
