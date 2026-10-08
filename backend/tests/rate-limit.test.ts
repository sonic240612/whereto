import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalClientIp, createClientLimiter, validateTrustedProxyCidrs } from '../src/rate-limit.js'

test('equivalent IPv6 and IPv4-mapped forms share a canonical client key', () => {
  assert.equal(canonicalClientIp('2001:0db8:0:0:0:0:0:1'), canonicalClientIp('2001:db8::1'))
  assert.equal(canonicalClientIp('::ffff:127.0.0.1'), '127.0.0.1')
  assert.equal(canonicalClientIp('::ffff:7f00:1'), '127.0.0.1')
  assert.equal(canonicalClientIp('attacker-text'), undefined)
  assert.equal(canonicalClientIp(undefined), undefined)
})

test('client quotas are independent and resets/retry-after use the current window', () => {
  let now = 1000
  const consume = createClientLimiter({ requestsPerMinute: 1, now: () => now })
  assert.equal(consume('client-a').allowed, true)
  assert.equal(consume('client-b').allowed, true)
  now += 30_000
  assert.deepEqual(consume('client-a'), { allowed: false, retryAfter: 30 })
  now += 30_000
  assert.deepEqual(consume('client-a'), { allowed: true, retryAfter: 60 })
})

test('capacity is bounded without evicting blocked clients or sharing overflow quotas', () => {
  let now = 0
  const consume = createClientLimiter({ requestsPerMinute: 2, maxClients: 2, now: () => now })
  consume('a'); consume('a'); consume('b')
  for (let index = 0; index < 100; index++) assert.equal(consume(`new-${index}`).allowed, false)
  assert.equal(consume('a').allowed, false)
  assert.equal(consume('b').allowed, true)
  now = 60_000
  assert.equal(consume('new-client').allowed, true)
  assert.equal(consume('a').allowed, true)
})

test('unsafe quota values and blanket or non-IP proxy settings fail at startup', () => {
  for (const value of [0, -1, NaN, Infinity, 1.5]) {
    assert.throws(() => createClientLimiter({ requestsPerMinute: value }))
    assert.throws(() => createClientLimiter({ maxClients: value }))
  }
  const allowed = ['127.0.0.1', '192.0.2.0/24', '2001:db8::/32', '::1/128']
  assert.deepEqual(validateTrustedProxyCidrs(allowed), allowed)
  for (const value of ['true', '1', 'loopback', '0.0.0.0/0', '::/0', '127.0.0.1/33', '::1/129', '127.0.0.1/', '127.0.0.1/32/1']) {
    assert.throws(() => validateTrustedProxyCidrs([value]))
  }
})
