import type { Visit } from '../types'

const STORAGE_KEY = 'whereto_visits'

export async function fetchVisits(): Promise<Visit[]> {
  const data = localStorage.getItem(STORAGE_KEY)
  return data ? JSON.parse(data) : []
}

export async function createVisit(data: {
  name?: string
  address: string
  rating: number
  note?: string
  lat: number
  lng: number
}): Promise<Visit> {
  const visits = await fetchVisits()
  const newVisit: Visit = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    name: data.name ?? null,
    lat: data.lat,
    lng: data.lng,
    address: data.address,
    rating: data.rating,
    note: data.note ?? null,
    photoUrl: null,
    photoId: null,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...visits, newVisit]))
  return newVisit
}

export async function deleteVisit(id: string): Promise<void> {
  const visits = await fetchVisits()
  const filtered = visits.filter((v) => v.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
}
