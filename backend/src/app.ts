import { randomBytes, timingSafeEqual } from 'node:crypto'
import express, { type ErrorRequestHandler, type RequestHandler } from 'express'
import cors from 'cors'
import { PrismaClient } from '@prisma/client'

export type Database = Pick<PrismaClient, 'visit' | 'share'>

export interface AppOptions {
  database?: () => Database
  enabled?: boolean
  apiToken?: string
  allowedOrigins?: string[]
  requestsPerMinute?: number
  now?: () => number
  logError?: (operation: string, code: string) => void
}

let prisma: PrismaClient | undefined
const getDatabase = () => (prisma ??= new PrismaClient())
const SHARE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000
const tokenPattern = /^[A-Za-z0-9_-]{32}$/
const idPattern = /^[A-Za-z0-9_-]{1,128}$/

type LocationInput = { lat: number; lng: number; address: string }
type VisitInput = LocationInput & {
  name?: string | null
  rating: number
  note?: string | null
  photoUrl?: string | null
  photoId?: string | null
}

function locationInput(body: Record<string, unknown>): LocationInput | undefined {
  if (
    typeof body.lat !== 'number' || !Number.isFinite(body.lat) || Math.abs(body.lat) > 90 ||
    typeof body.lng !== 'number' || !Number.isFinite(body.lng) || Math.abs(body.lng) > 180 ||
    typeof body.address !== 'string' || !body.address.trim() || body.address.length > 1000
  ) return undefined
  return { lat: body.lat, lng: body.lng, address: body.address.trim() }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalText(value: unknown, maxLength: number) {
  return value == null || (typeof value === 'string' && value.length <= maxLength)
}

function visitInput(body: Record<string, unknown>): VisitInput | undefined {
  const location = locationInput(body)
  const rating = body.rating === undefined ? 3 : body.rating
  const fields = ['lat', 'lng', 'address', 'name', 'rating', 'note', 'photoUrl', 'photoId']
  if (!location || Object.keys(body).some((key) => !fields.includes(key)) ||
      typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5 ||
      !optionalText(body.name, 120) || !optionalText(body.note, 5000) ||
      !optionalText(body.photoId, 200) || !optionalText(body.photoUrl, 2048)) return undefined
  if (body.photoUrl) {
    try {
      const url = new URL(body.photoUrl as string)
      if (url.protocol !== 'https:' || url.username || url.password) return undefined
    } catch { return undefined }
  }
  return {
    ...location,
    rating,
    name: body.name as string | null | undefined,
    note: body.note as string | null | undefined,
    photoUrl: body.photoUrl as string | null | undefined,
    photoId: body.photoId as string | null | undefined,
  }
}

function errorCode(error: unknown) {
  if (isRecord(error) && typeof error.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(error.code)) {
    return error.code
  }
  return 'UNKNOWN'
}

export function createApp(options: AppOptions = {}) {
  const app = express()
  const database = options.database ?? getDatabase
  const enabled = options.enabled ?? process.env.ENABLE_VISIT_API === 'true'
  const apiToken = options.apiToken ?? process.env.SERVER_API_TOKEN ?? ''
  const allowedOrigins = options.allowedOrigins ?? (process.env.CORS_ORIGINS ?? '')
    .split(',').map((origin) => origin.trim()).filter(Boolean)
  const now = options.now ?? Date.now
  const logError = options.logError ?? ((operation, code) => console.error('Database operation failed', { operation, code }))
  const requestsPerMinute = options.requestsPerMinute ?? 60
  let windowStart = now()
  let requestCount = 0

  app.disable('x-powered-by')
  app.use((req, res, next) => {
    const origin = req.get('Origin')
    if (origin && !allowedOrigins.includes(origin)) {
      res.status(403).json({ error: 'Origin is not allowed' })
      return
    }
    next()
  })
  app.use(cors({
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)),
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  }))
  app.get('/api/health', (_req, res) => { res.json({ status: 'ok' }) })
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    const timestamp = now()
    if (timestamp - windowStart >= 60_000) {
      windowStart = timestamp
      requestCount = 0
    }
    // This is a process-wide safeguard, not a distributed quota or per-user limit.
    if (++requestCount > requestsPerMinute) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((windowStart + 60_000 - timestamp) / 1000))))
      res.status(429).json({ error: 'Too many requests. Try again later.' })
      return
    }
    next()
  })

  const requireEnabled: RequestHandler = (_req, res, next) => {
    if (!enabled || apiToken.length < 32) {
      res.status(503).json({ error: 'Database API is disabled' })
      return
    }
    next()
  }
  const requireAdmin: RequestHandler = (req, res, next) => {
    const supplied = req.get('Authorization') ?? ''
    const expected = `Bearer ${apiToken}`
    const suppliedBuffer = Buffer.from(supplied)
    const expectedBuffer = Buffer.from(expected)
    if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) {
      res.set('WWW-Authenticate', 'Bearer')
      res.status(401).json({ error: 'Administrator authorization required' })
      return
    }
    next()
  }
  const requireJson: RequestHandler = (req, res, next) => {
    if (!req.is('application/json')) {
      res.status(415).json({ error: 'Content-Type must be application/json' })
      return
    }
    next()
  }
  const parseJson = express.json({ limit: '32kb' })
  const validId: RequestHandler = (req, res, next) => {
    if (!idPattern.test(req.params.id)) {
      res.status(400).json({ error: 'Invalid visit ID' })
      return
    }
    next()
  }
  const validToken: RequestHandler = (req, res, next) => {
    if (!tokenPattern.test(req.params.token)) {
      res.status(404).json({ error: 'Share not found' })
      return
    }
    next()
  }

  app.use('/api/visits', requireEnabled, requireAdmin)
  app.get('/api/visits', async (_req, res) => {
    try {
      res.json(await database().visit.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }))
    } catch (error) {
      logError('listVisits', errorCode(error))
      res.status(500).json({ error: 'Failed to fetch visits' })
    }
  })
  app.get('/api/visits/:id', validId, async (req, res) => {
    try {
      const visit = await database().visit.findUnique({ where: { id: req.params.id } })
      if (!visit) { res.status(404).json({ error: 'Visit not found' }); return }
      res.json(visit)
    } catch (error) {
      logError('getVisit', errorCode(error))
      res.status(500).json({ error: 'Failed to fetch visit' })
    }
  })
  app.post('/api/visits', requireJson, parseJson, async (req, res) => {
    const data = isRecord(req.body) ? visitInput(req.body) : undefined
    if (!data) { res.status(400).json({ error: 'Invalid visit fields' }); return }
    try {
      res.status(201).json(await database().visit.create({ data }))
    } catch (error) {
      logError('createVisit', errorCode(error))
      res.status(500).json({ error: 'Failed to create visit' })
    }
  })
  app.delete('/api/visits/:id', validId, async (req, res) => {
    try {
      await database().visit.delete({ where: { id: req.params.id } })
      res.status(204).end()
    } catch (error) {
      if (errorCode(error) === 'P2025') { res.status(404).json({ error: 'Visit not found' }); return }
      logError('deleteVisit', errorCode(error))
      res.status(500).json({ error: 'Failed to delete visit' })
    }
  })

  app.use('/api/shares', requireEnabled)
  app.post('/api/shares', requireAdmin, requireJson, parseJson, async (req, res) => {
    const body: unknown = req.body
    const data = isRecord(body) && Object.keys(body).every((key) => ['lat', 'lng', 'address'].includes(key))
      ? locationInput(body) : undefined
    if (!data) { res.status(400).json({ error: 'Invalid share fields' }); return }
    try {
      const share = await database().share.create({ data: { ...data, token: randomBytes(24).toString('base64url') } })
      res.status(201).json({ ...share, expiresAt: new Date(share.createdAt.getTime() + SHARE_LIFETIME_MS).toISOString() })
    } catch (error) {
      logError('createShare', errorCode(error))
      res.status(500).json({ error: 'Failed to create share' })
    }
  })
  app.get('/api/shares/:token', validToken, async (req, res) => {
    try {
      const share = await database().share.findUnique({ where: { token: req.params.token } })
      if (!share || now() >= share.createdAt.getTime() + SHARE_LIFETIME_MS) {
        res.status(404).json({ error: 'Share not found' })
        return
      }
      res.json({ lat: share.lat, lng: share.lng, address: share.address,
        expiresAt: new Date(share.createdAt.getTime() + SHARE_LIFETIME_MS).toISOString() })
    } catch (error) {
      logError('getShare', errorCode(error))
      res.status(500).json({ error: 'Failed to fetch share' })
    }
  })
  app.delete('/api/shares/:token', requireAdmin, validToken, async (req, res) => {
    try {
      await database().share.delete({ where: { token: req.params.token } })
      res.status(204).end()
    } catch (error) {
      if (errorCode(error) === 'P2025') { res.status(404).json({ error: 'Share not found' }); return }
      logError('deleteShare', errorCode(error))
      res.status(500).json({ error: 'Failed to delete share' })
    }
  })

  app.use((_req, res) => { res.status(404).json({ error: 'Route not found' }) })
  const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    const type = isRecord(error) ? error.type : undefined
    if (type === 'entity.too.large') {
      res.status(413).json({ error: 'Request body exceeds 32 KB' })
    } else if (error instanceof SyntaxError || error instanceof URIError || (isRecord(error) && error.status === 400)) {
      res.status(400).json({ error: 'Invalid request' })
    } else {
      logError('request', errorCode(error))
      res.status(500).json({ error: 'Request failed' })
    }
  }
  app.use(handleError)
  return app
}
