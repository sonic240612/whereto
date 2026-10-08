import test from 'node:test'
import assert from 'node:assert/strict'
import { createKakaoSdkLoader } from './kakao-sdk-loader.ts'

function harness(timeoutMs = 100) {
  let maps: typeof kakao.maps | undefined
  let sdkLoaded: (() => void) | undefined
  const scripts: Array<{ src: string; async: boolean; dataset: Record<string, string>; onload: (() => void) | null; onerror: (() => void) | null; removed: boolean; remove(): void }> = []
  const document = {
    createElement() {
      return { src: '', async: false, dataset: {}, onload: null, onerror: null, removed: false, remove() { this.removed = true } }
    },
    head: { appendChild(script: typeof scripts[number]) { scripts.push(script) } },
  }
  const load = createKakaoSdkLoader({ appKey: 'public-js-key', getMaps: () => maps, document: document as unknown as Document, timeoutMs })
  return {
    load, scripts,
    bootstrap() { maps = { load(callback: () => void) { sdkLoaded = callback } } as typeof kakao.maps; scripts.at(-1)!.onload?.() },
    finish() { maps = { Map: function Map() {}, services: { Places: function Places() {}, Geocoder: function Geocoder() {} } } as unknown as typeof kakao.maps; sdkLoaded?.() },
  }
}

test('SDK consumers share one script and wait for services after the bootstrap loads', async () => {
  const h = harness()
  const first = h.load()
  assert.equal(first, h.load())
  assert.equal(h.scripts.length, 1)
  const url = new URL(h.scripts[0].src)
  assert.equal(url.origin, 'https://dapi.kakao.com')
  assert.equal(url.searchParams.get('autoload'), 'false')
  assert.equal(url.searchParams.get('libraries'), 'services')
  h.bootstrap()
  assert.equal(first, h.load(), 'a bootstrap namespace is not a ready SDK')
  h.finish()
  const api = await first
  assert.equal(await h.load(), api)
  assert.equal(h.scripts.length, 1)
})

test('failed SDK loads remove their script and allow a successful retry', async () => {
  const h = harness()
  const failed = h.load()
  h.scripts[0].onerror?.()
  await assert.rejects(failed, /카카오지도/)
  assert.equal(h.scripts[0].removed, true)
  const retry = h.load()
  assert.equal(h.scripts.length, 2)
  h.bootstrap()
  h.finish()
  await retry
})

test('a timed-out SDK callback cannot complete an expired request', async () => {
  const h = harness(10)
  const expired = h.load()
  h.bootstrap()
  await assert.rejects(expired, /카카오지도/)
  h.finish()
  assert.equal(h.scripts[0].removed, true)
  assert.equal(h.scripts[0].onload, null)
})

test('missing SDK key never starts a remote script', async () => {
  const load = createKakaoSdkLoader({ appKey: ' ', getMaps: () => undefined, document: {} as Document })
  await assert.rejects(load(), /키가 설정되지/)
})
