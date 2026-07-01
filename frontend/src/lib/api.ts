import type { Visit } from '../types'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export async function fetchVisits(): Promise<Visit[]> {
  const res = await fetch(`${API_BASE}/visits`)
  if (!res.ok) throw new Error('Failed to fetch visits')
  return res.json()
}

export async function createVisit(data: {
  name: string
  address: string
  rating: number
  note: string
  lat: number
  lng: number
}): Promise<Visit> {
  const res = await fetch(`${API_BASE}/visits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create visit')
  return res.json()
}

export async function deleteVisit(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/visits/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete visit')
}
