import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDrawMode, readDrawMode } from './draw-mode.ts'
import { parseResult } from './validation.ts'

test('mode defaults remain compatible and unavailable browser storage is tolerated', () => {
  assert.equal(parseDrawMode('complete'), 'complete')
  for (const value of [null, '', 'popular', 'invalid']) assert.equal(parseDrawMode(value), 'popular')
  assert.equal(readDrawMode(), 'popular')
})

test('legacy and popular results are never relabeled as complete random results', () => {
  const params = new URLSearchParams({ lat: '37', lng: '127', address: '식당', resultCategory: 'restaurant', resultProvider: 'kakao' })
  assert.ok(parseResult(params, 'restaurant', 'kakao', 'popular'))
  assert.equal(parseResult(params, 'restaurant', 'kakao', 'complete'), null)
  params.set('resultMode', 'complete')
  assert.ok(parseResult(params, 'restaurant', 'kakao', 'complete'))
  assert.equal(parseResult(params, 'restaurant', 'kakao', 'popular'), null)
  params.set('resultMode', 'fake')
  assert.equal(parseResult(params, 'restaurant', 'kakao', 'complete'), null)
})
