export interface LatLng {
  lat: number
  lng: number
}

export interface RectBounds {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

export interface CoordResult {
  lat: number
  lng: number
  address: string
}

export interface Visit {
  id: string
  name: string | null
  lat: number
  lng: number
  address: string
  rating: number
  note: string | null
  photoUrl: string | null
  photoId: string | null
  createdAt: string
}

export type AppStatus = 'idle' | 'selecting' | 'result' | 'visit'
