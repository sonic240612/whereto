import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requestGeolocation } from './geolocation-client.ts'

function position(lat = 37.5, lng = 127): GeolocationPosition {
  return { coords: { latitude: lat, longitude: lng } } as GeolocationPosition
}

function failure(code: number): GeolocationPositionError {
  return { code } as GeolocationPositionError
}

function pendingProvider() {
  let success: PositionCallback = () => { throw new Error('Request has not started') }
  let error: PositionErrorCallback = () => { throw new Error('Request has not started') }
  let requestOptions: PositionOptions | undefined
  let calls = 0
  const provider: Pick<Geolocation, 'getCurrentPosition'> = {
    getCurrentPosition(onSuccess, onError, options) {
      success = onSuccess
      error = onError!
      requestOptions = options
      calls += 1
    },
  }
  return {
    getGeolocation: () => provider,
    succeed: (value = position()) => success(value),
    fail: (code: number) => error(failure(code)),
    get options() { return requestOptions },
    get calls() { return calls },
  }
}

test('successful automatic lookup preserves native options and returns validated coordinates', async () => {
  const provider = pendingProvider()
  const result = requestGeolocation({ getGeolocation: provider.getGeolocation })
  assert.deepEqual(provider.options, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 })
  provider.succeed()
  assert.deepEqual(await result, { lat: 37.5, lng: 127 })
  provider.fail(1)
  assert.deepEqual(await result, { lat: 37.5, lng: 127 })
})

test('manual fresh lookup only disables the native cached-position allowance', async () => {
  const provider = pendingProvider()
  const result = requestGeolocation({ getGeolocation: provider.getGeolocation, fresh: true })
  assert.deepEqual(provider.options, { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 })
  provider.succeed()
  await result
})

for (const [name, code, expected] of [
  ['denied', 1, /접근이 차단/],
  ['unavailable', 2, /확인할 수 없습니다/],
  ['native timeout', 3, /대기 시간이 지났습니다/],
] as const) {
  test(`${name} explains browser permissions and device location settings`, async () => {
    const provider = pendingProvider()
    const result = requestGeolocation({ getGeolocation: provider.getGeolocation })
    provider.fail(code)
    await assert.rejects(result, error => {
      assert.ok(error instanceof Error)
      assert.match(error.message, expected)
      assert.match(error.message, /브라우저.*위치 권한/)
      assert.match(error.message, /기기의 위치 서비스/)
      return true
    })
  })
}

test('an unanswered permission prompt reaches its independent deadline and ignores late callbacks', async () => {
  const provider = pendingProvider()
  const result = requestGeolocation({ getGeolocation: provider.getGeolocation, deadlineMs: 5 })
  await assert.rejects(result, /대기 시간이 지났습니다/)
  provider.succeed()
  provider.fail(1)
  await assert.rejects(result, /대기 시간이 지났습니다/)
})

test('synchronous API and provider-access exceptions become actionable failures', async () => {
  await assert.rejects(requestGeolocation({ getGeolocation: () => ({
    getCurrentPosition: () => { throw new DOMException('blocked', 'SecurityError') },
  }) }), /위치 접근이 차단.*브라우저.*기기의 위치 서비스/)
  await assert.rejects(requestGeolocation({ getGeolocation: () => { throw new Error('provider failed') } }), /브라우저 위치 권한과 기기의 위치 서비스/)
})

test('unsupported geolocation and invalid coordinates fail without inventing a location', async () => {
  await assert.rejects(requestGeolocation({ getGeolocation: () => undefined }), /이 브라우저.*기기의 위치 설정/)
  const provider = pendingProvider()
  const result = requestGeolocation({ getGeolocation: provider.getGeolocation })
  provider.succeed(position(Number.NaN, 127))
  await assert.rejects(result, /올바른 위치 정보를 받지 못했습니다/)
})

test('already-aborted requests never call the native location API', async () => {
  const provider = pendingProvider()
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(requestGeolocation({ getGeolocation: provider.getGeolocation, signal: controller.signal }), { name: 'AbortError' })
  assert.equal(provider.calls, 0)
})

test('cancellation rejects promptly and late callbacks cannot affect a replacement request', async () => {
  const oldProvider = pendingProvider(), nextProvider = pendingProvider()
  const controller = new AbortController()
  const oldResult = requestGeolocation({ getGeolocation: oldProvider.getGeolocation, signal: controller.signal })
  controller.abort()
  await assert.rejects(oldResult, { name: 'AbortError' })
  const nextResult = requestGeolocation({ getGeolocation: nextProvider.getGeolocation })
  oldProvider.succeed(position(1, 2))
  oldProvider.fail(1)
  nextProvider.succeed()
  assert.deepEqual(await nextResult, { lat: 37.5, lng: 127 })
  await assert.rejects(oldResult, { name: 'AbortError' })
})

test('completion and cancellation release deadline timers and abort listeners', async t => {
  const clearTimer = t.mock.method(globalThis, 'clearTimeout')
  for (const outcome of ['success', 'failure', 'abort', 'throw'] as const) {
    const provider = pendingProvider()
    const controller = new AbortController()
    const removeListener = t.mock.method(controller.signal, 'removeEventListener')
    const initialClears = clearTimer.mock.callCount()
    const result = requestGeolocation({
      getGeolocation: outcome === 'throw' ? () => { throw new Error('failed') } : provider.getGeolocation,
      signal: controller.signal,
    })
    if (outcome === 'success') provider.succeed()
    if (outcome === 'failure') provider.fail(2)
    if (outcome === 'abort') controller.abort()
    if (outcome === 'success') await result
    else await assert.rejects(result)
    assert.equal(clearTimer.mock.callCount(), initialClears + 1)
    assert.equal(removeListener.mock.callCount(), 1)
    assert.equal(removeListener.mock.calls[0].arguments[0], 'abort')
  }
})
