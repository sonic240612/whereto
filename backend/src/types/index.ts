export interface CreateVisitBody {
  lat: number
  lng: number
  address: string
  photoUrl?: string
  photoId?: string
  comment?: string
}

export interface CreateShareBody {
  lat: number
  lng: number
  address: string
}
