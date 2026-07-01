import express from 'express'
import cors from 'cors'
import serverless from 'serverless-http'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.get('/api/visits', async (_req, res) => {
  try {
    const visits = await prisma.visit.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    res.json(visits)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch visits' })
  }
})

app.get('/api/visits/:id', async (req, res) => {
  try {
    const visit = await prisma.visit.findUnique({
      where: { id: req.params.id },
    })
    if (!visit) {
      res.status(404).json({ error: 'Visit not found' })
      return
    }
    res.json(visit)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch visit' })
  }
})

app.post('/api/visits', async (req, res) => {
  try {
    const body = req.body
    if (body.lat == null || body.lng == null || !body.address) {
      res.status(400).json({ error: 'lat, lng, address are required' })
      return
    }
    const visit = await prisma.visit.create({
      data: {
        name: body.name,
        lat: body.lat,
        lng: body.lng,
        address: body.address,
        rating: body.rating,
        note: body.note,
        photoUrl: body.photoUrl,
        photoId: body.photoId,
      },
    })
    res.status(201).json(visit)
  } catch (error) {
    res.status(500).json({ error: 'Failed to create visit' })
  }
})

app.delete('/api/visits/:id', async (req, res) => {
  try {
    const { id } = req.params
    await prisma.visit.delete({ where: { id } })
    res.status(204).end()
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete visit' })
  }
})

app.post('/api/shares', async (req, res) => {
  try {
    const body = req.body
    if (!body.lat || !body.lng || !body.address) {
      res.status(400).json({ error: 'lat, lng, address are required' })
      return
    }
    const token = Math.random().toString(36).substring(2, 10)
    const share = await prisma.share.create({
      data: {
        lat: body.lat,
        lng: body.lng,
        address: body.address,
        token,
      },
    })
    res.status(201).json(share)
  } catch (error) {
    res.status(500).json({ error: 'Failed to create share' })
  }
})

app.get('/api/shares/:token', async (req, res) => {
  try {
    const share = await prisma.share.findUnique({
      where: { token: req.params.token },
    })
    if (!share) {
      res.status(404).json({ error: 'Share not found' })
      return
    }
    res.json(share)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch share' })
  }
})

export default serverless(app)
