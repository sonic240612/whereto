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
  id: number
  name: string
  address: string
  rating: number
  note: string
  lat: number
  lng: number
  created_at: string
}

export type AppStatus = 'idle' | 'selecting' | 'result' | 'visit'
