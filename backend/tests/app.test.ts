import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import handler from '../api/index.js'
import { createApp, type AppOptions, type Database } from '../src/app.js'

const adminToken = 'test-admin-secret-01234567890123456789'
const admin = { Authorization: `Bearer ${adminToken}` }
const json = { ...admin, 'Content-Type': 'application/json' }
const location = { lat: 0, lng: 0, address: '100% Cafe, 강남구' }
const timestamp = Date.parse('2026-10-08T00:00:00Z')

async function close(server: Server) {
  const closed = new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  server.closeAllConnections()
  await closed
}

async function withApp(callback: (base: string) => Promise<void>, options: AppOptions = {}) {
  const server = createApp({
    enabled: true, apiToken: adminToken, now: () => timestamp,
    database: () => { throw new Error('Unexpected database access') },
    logError: () => {}, ...options,
  }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  try { await callback(`http://127.0.0.1:${(server.address() as AddressInfo).port}`) }
  finally { await close(server) }
}

test('Vercel export is a working Node request handler, health never needs a database', async () => {
  const server = createServer(handler).listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/health`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { status: 'ok' })
  } finally { await close(server) }
  await withApp(async (base) => {
    assert.equal((await fetch(`${base}/api/health`)).status, 200)
    const missing = await fetch(`${base}/api/missing`)
    assert.equal(missing.status, 404)
    assert.deepEqual(await missing.json(), { error: 'Route not found' })
  }, { enabled: false })
})

test('all database routes fail closed unless activation and a strong server token are configured', async () => {
  for (const options of [{ enabled: false }, { apiToken: '' }, { apiToken: 'short' }]) {
    await withApp(async (base) => {
      for (const [path, method] of [
        ['/api/visits', 'GET'], ['/api/visits', 'POST'], ['/api/visits/visit-1', 'DELETE'],
        ['/api/shares', 'POST'], [`/api/shares/${'a'.repeat(32)}`, 'GET'],
      ]) {
        assert.equal((await fetch(`${base}${path}`, { method, headers: admin })).status, 503)
      }
    }, options)
  }
})

test('visits and share mutations reject unauthenticated and incorrect bearer requests', async () => {
  await withApp(async (base) => {
    for (const [path, method] of [
      ['/api/visits', 'GET'], ['/api/visits/visit-1', 'GET'], ['/api/visits', 'POST'],
      ['/api/visits/visit-1', 'DELETE'], ['/api/shares', 'POST'], [`/api/shares/${'a'.repeat(32)}`, 'DELETE'],
    ]) {
      for (const headers of [{}, { Authorization: 'Bearer incorrect' }] as Record<string, string>[]) {
        const response = await fetch(`${base}${path}`, { method, headers })
        assert.equal(response.status, 401)
        assert.equal(response.headers.get('www-authenticate'), 'Bearer')
      }
    }
  })
})

test('strict inputs reject wrong types, non-finite/range coordinates, unsafe URLs and excessive fields', async () => {
  await withApp(async (base) => {
    const invalidBodies = [null, [], {}, { ...location, lat: '0' }, { ...location, lat: 91 },
      { ...location, lng: -181 }, { ...location, address: '   ' }, { ...location, address: 'x'.repeat(1001) },
      { ...location, rating: 0 }, { ...location, rating: 6 }, { ...location, rating: 1.5 },
      { ...location, rating: null }, { ...location, name: 3 }, { ...location, name: 'x'.repeat(121) },
      { ...location, note: 'x'.repeat(5001) }, { ...location, photoId: 'x'.repeat(201) },
      { ...location, photoUrl: 'javascript:alert(1)' }, { ...location, photoUrl: 'https://user:pass@example.com' },
      { ...location, unexpected: true }]
    for (const body of invalidBodies) {
      const response = await fetch(`${base}/api/visits`, { method: 'POST', headers: json, body: JSON.stringify(body) })
      assert.equal(response.status, 400, `body should fail: ${JSON.stringify(body).slice(0, 100)}`)
    }
    for (const body of ['{"lat":1e999,"lng":0,"address":"Cafe"}', '{broken']) {
      assert.equal((await fetch(`${base}/api/visits`, { method: 'POST', headers: json, body })).status, 400)
    }
    assert.equal((await fetch(`${base}/api/visits`, { method: 'POST', headers: admin, body: 'text' })).status, 415)
    assert.equal((await fetch(`${base}/api/visits`, {
      method: 'POST', headers: json, body: JSON.stringify({ ...location, note: 'x'.repeat(33_000) }),
    })).status, 413)
    assert.equal((await fetch(`${base}/api/visits/%E0%A4%A`, { headers: admin })).status, 400)
    assert.equal((await fetch(`${base}/api/shares`, {
      method: 'POST', headers: json, body: JSON.stringify({ ...location, lng: 181 }),
    })).status, 400)
  })
})

test('zero coordinates and default rating persist, missing visit lookup/deletion return 404', async () => {
  const created: unknown[] = []
  const database = {
    visit: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data)
        return { ...data, id: 'visit-1' }
      },
      findMany: async () => [],
      findUnique: async () => null,
      delete: async () => { throw { code: 'P2025' } },
    }, share: {},
  } as unknown as Database
  await withApp(async (base) => {
    const response = await fetch(`${base}/api/visits`, {
      method: 'POST', headers: json, body: JSON.stringify(location),
    })
    assert.equal(response.status, 201)
    assert.deepEqual(await response.json(), { ...location, rating: 3, id: 'visit-1' })
    assert.equal(created.length, 1)
    assert.equal((await fetch(`${base}/api/visits`, { headers: admin })).status, 200)
    for (const method of ['GET', 'DELETE']) {
      assert.equal((await fetch(`${base}/api/visits/missing`, { method, headers: admin })).status, 404)
    }
  }, { database: () => database })
})

test('shares use unguessable unique tokens, expire after seven days, and can be revoked', async () => {
  type Share = typeof location & { id: string; token: string; createdAt: Date }
  const shares = new Map<string, Share>()
  let currentTime = timestamp
  const database = {
    visit: {},
    share: {
      create: async ({ data }: { data: typeof location & { token: string } }) => {
        const share = { ...data, id: `share-${shares.size + 1}`, createdAt: new Date(currentTime) }
        shares.set(share.token, share)
        return share
      },
      findUnique: async ({ where }: { where: { token: string } }) => shares.get(where.token) ?? null,
      delete: async ({ where }: { where: { token: string } }) => {
        if (!shares.delete(where.token)) throw { code: 'P2025' }
      },
    },
  } as unknown as Database
  await withApp(async (base) => {
    const tokens: string[] = []
    for (let i = 0; i < 2; i++) {
      const response = await fetch(`${base}/api/shares`, { method: 'POST', headers: json, body: JSON.stringify(location) })
      assert.equal(response.status, 201)
      const share = await response.json() as { token: string }
      assert.match(share.token, /^[A-Za-z0-9_-]{32}$/)
      tokens.push(share.token)
    }
    assert.notEqual(tokens[0], tokens[1])
    const publicResponse = await fetch(`${base}/api/shares/${tokens[0]}`)
    assert.equal(publicResponse.status, 200)
    assert.deepEqual(await publicResponse.json(), { ...location, expiresAt: '2026-10-15T00:00:00.000Z' })
    assert.equal((await fetch(`${base}/api/shares/${tokens[0]}`, { method: 'DELETE', headers: admin })).status, 204)
    assert.equal((await fetch(`${base}/api/shares/${tokens[0]}`)).status, 404)
    assert.equal((await fetch(`${base}/api/shares/${tokens[0]}`, { method: 'DELETE', headers: admin })).status, 404)
    currentTime += 7 * 24 * 60 * 60 * 1000
    assert.equal((await fetch(`${base}/api/shares/${tokens[1]}`)).status, 404)
    assert.equal((await fetch(`${base}/api/shares/oldtoken`)).status, 404)
  }, { database: () => database, now: () => currentTime })
})

test('CORS uses exact origins, private API responses are not cached', async () => {
  await withApp(async (base) => {
    const allowed = await fetch(`${base}/api/health`, { headers: { Origin: 'https://whereto.example' } })
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://whereto.example')
    const denied = await fetch(`${base}/api/health`, { headers: { Origin: 'https://whereto.example.attacker.com' } })
    assert.equal(denied.status, 403)
    assert.equal(denied.headers.get('access-control-allow-origin'), null)
    const preflight = await fetch(`${base}/api/visits`, {
      method: 'OPTIONS', headers: { Origin: 'https://whereto.example', 'Access-Control-Request-Method': 'POST' },
    })
    assert.equal(preflight.status, 204)
    const unauthorized = await fetch(`${base}/api/visits`)
    assert.equal(unauthorized.headers.get('cache-control'), 'no-store')
  }, { allowedOrigins: ['https://whereto.example'] })
})

test('request limits include authentication failures, reset after a minute and exempt health', async () => {
  let currentTime = timestamp
  await withApp(async (base) => {
    assert.equal((await fetch(`${base}/api/visits`)).status, 401)
    const limited = await fetch(`${base}/api/visits`)
    assert.equal(limited.status, 429)
    assert.equal(limited.headers.get('retry-after'), '60')
    assert.equal((await fetch(`${base}/api/health`)).status, 200)
    currentTime += 60_000
    assert.equal((await fetch(`${base}/api/visits`)).status, 401)
  }, { requestsPerMinute: 1, now: () => currentTime })
})

test('database failures return generic responses and log only operation/error code', async () => {
  const logs: unknown[] = []
  await withApp(async (base) => {
    const response = await fetch(`${base}/api/visits`, { headers: admin })
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { error: 'Failed to fetch visits' })
    assert.deepEqual(logs, [['listVisits', 'P1001']])
  }, {
    database: () => { throw { code: 'P1001', message: 'postgresql://private-secret' } },
    logError: (operation, code) => { logs.push([operation, code]) },
  })
})
