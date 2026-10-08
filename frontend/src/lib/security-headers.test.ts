import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const deployment = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'))
const headers = Object.fromEntries(deployment.headers.find((entry: { source: string }) => entry.source === '/(.*)').headers.map(({ key, value }: { key: string; value: string }) => [key.toLowerCase(), value]))
const policy = new Map<string, string[]>(headers['content-security-policy'].split(';').map((directive: string) => {
  const [key, ...sources] = directive.trim().split(/\s+/)
  return [key, sources]
}))

test('deployment blocks framing, object injection, base overrides and inline/eval scripts', () => {
  for (const directive of ['frame-ancestors', 'frame-src', 'object-src', 'base-uri', 'form-action', 'script-src-attr']) {
    assert.deepEqual(policy.get(directive), ["'none'"])
  }
  assert.deepEqual(policy.get('default-src'), ["'self'"])
  assert.deepEqual(policy.get('script-src'), ["'self'", 'https://dapi.kakao.com/v2/', 'https://t1.kakaocdn.net/mapjsapi/'])
  assert.equal(headers['x-frame-options'], 'DENY')
  assert.equal(headers['x-content-type-options'], 'nosniff')
  assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin')
  assert.match(headers['permissions-policy'], /geolocation=\(self\)/)
  assert.match(headers['permissions-policy'], /camera=\(\), microphone=\(\)/)
})

test('deployment permits map providers, image-based glass optics and map workers', () => {
  assert.ok(policy.get('img-src')?.includes('data:'))
  assert.ok(policy.get('worker-src')?.includes('blob:'))
  for (const provider of ['https://dapi.kakao.com', 'https://tiles.openfreemap.org', 'https://photon.komoot.io']) {
    assert.ok(policy.get('connect-src')?.includes(provider))
  }
  assert.ok(policy.has('upgrade-insecure-requests'))
})
