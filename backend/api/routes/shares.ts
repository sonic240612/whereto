import { Router } from 'express'
import { customAlphabet } from 'nanoid'
import prisma from '../lib/prisma'
import type { CreateShareBody } from '../types'

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 8)

const router = Router()

router.post('/', async (req, res) => {
  try {
    const body = req.body as CreateShareBody
    if (!body.lat || !body.lng || !body.address) {
      res.status(400).json({ error: 'lat, lng, address are required' })
      return
    }
    const token = nanoid()
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
    console.error('Failed to create share:', error)
    res.status(500).json({ error: 'Failed to create share' })
  }
})

router.get('/:token', async (req, res) => {
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
    console.error('Failed to fetch share:', error)
    res.status(500).json({ error: 'Failed to fetch share' })
  }
})

export default router
