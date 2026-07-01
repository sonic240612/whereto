export interface CreateVisitBody {
  name?: string
  lat: number
  lng: number
  address: string
  rating?: number
  note?: string
  photoUrl?: string
  photoId?: string
}

export interface CreateShareBody {
  lat: number
  lng: number
  address: string
}
