import { Router } from 'express'
import prisma from '../lib/prisma'
import type { CreateVisitBody } from '../types'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const visits = await prisma.visit.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    res.json(visits)
  } catch (error) {
    console.error('Failed to fetch visits:', error)
    res.status(500).json({ error: 'Failed to fetch visits' })
  }
})

router.get('/:id', async (req, res) => {
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
    console.error('Failed to fetch visit:', error)
    res.status(500).json({ error: 'Failed to fetch visit' })
  }
})

router.post('/', async (req, res) => {
  try {
    const body = req.body as CreateVisitBody
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
    console.error('Failed to create visit:', error)
    res.status(500).json({ error: 'Failed to create visit' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    await prisma.visit.delete({ where: { id } })
    res.status(204).end()
  } catch (error) {
    console.error('Failed to delete visit:', error)
    res.status(500).json({ error: 'Failed to delete visit' })
  }
})

export default router
