import type { Visit } from '../types'

const API_BASE = import.meta.env.VITE_API_URL || ''

export async function fetchVisits(): Promise<Visit[]> {
  const res = await fetch(`${API_BASE}/api/visits`)
  if (!res.ok) throw new Error('Failed to fetch visits')
  return res.json()
}

export async function createVisit(data: {
  lat: number
  lng: number
  address: string
  comment?: string
  photoUrl?: string
}): Promise<Visit> {
  const res = await fetch(`${API_BASE}/api/visits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create visit')
  return res.json()
}
