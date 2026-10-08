import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_SPRING_DELTA, stepSpring, type SpringConfig, type SpringState } from './glass-spring.ts'

test('spring state is immutable and large or negative frame durations are bounded', () => {
  const original = Object.freeze({ value: 2, velocity: 3 })
  assert.deepEqual(stepSpring(original, 5, 60), stepSpring(original, 5, MAX_SPRING_DELTA))
  assert.deepEqual(stepSpring(original, 5, -1), original)
  assert.notEqual(stepSpring(original, 5, 0), original)
  assert.deepEqual(original, { value: 2, velocity: 3 })
})

test('underdamped, critically damped and overdamped springs converge at different refresh rates', () => {
  const configs: SpringConfig[] = [{}, { stiffness: 100, damping: 20 }, { stiffness: 100, damping: 40 }, { stiffness: 200, damping: 30, mass: 2 }]
  for (const config of configs) {
    for (const hz of [30, 60, 120]) {
      let state: SpringState = { value: -8, velocity: 25 }
      for (let frame = 0; frame < hz * 12; frame++) state = stepSpring(state, 6, 1 / hz, config)
      assert.deepEqual(state, { value: 6, velocity: 0 })
    }
  }
})

test('analytic stepping produces the same trajectory across frame subdivisions', () => {
  for (const config of [{}, { stiffness: 100, damping: 20 }, { stiffness: 100, damping: 40 }]) {
    const start = { value: 0, velocity: 0 }
    const one = stepSpring(start, 8, 1 / 30, config)
    const two = stepSpring(stepSpring(start, 8, 1 / 60, config), 8, 1 / 60, config)
    assert.ok(Math.abs(one.value - two.value) < 1e-12)
    assert.ok(Math.abs(one.velocity - two.velocity) < 1e-12)
  }
})

test('release preserves velocity and briefly overshoots before returning to rest', () => {
  let state: SpringState = { value: 8, velocity: 0 }
  let minimum = 8
  for (let frame = 0; frame < 180; frame++) {
    state = stepSpring(state, 0, 1 / 60)
    minimum = Math.min(minimum, state.value)
  }
  assert.ok(minimum < 0 && minimum > -0.5)
  assert.deepEqual(state, { value: 0, velocity: 0 })
})

test('reduced motion immediately settles even with accumulated velocity or a zero delta', () => {
  assert.deepEqual(stepSpring({ value: 8, velocity: 90 }, 0, 0, { reducedMotion: true }), { value: 0, velocity: 0 })
  assert.deepEqual(stepSpring({ value: 0, velocity: -50 }, 1, 1 / 60, { reducedMotion: true }), { value: 1, velocity: 0 })
})

test('invalid physical values cannot silently produce NaN styles', () => {
  for (const config of [{ stiffness: 0 }, { damping: -1 }, { mass: 0 }, { mass: Infinity }]) {
    assert.throws(() => stepSpring({ value: 0, velocity: 0 }, 1, 0.016, config), RangeError)
  }
  assert.throws(() => stepSpring({ value: NaN, velocity: 0 }, 1, 0.016), RangeError)
  assert.throws(() => stepSpring({ value: 0, velocity: 0 }, Infinity, 0.016), RangeError)
  assert.throws(() => stepSpring({ value: 0, velocity: 0 }, 1, NaN), RangeError)
})
