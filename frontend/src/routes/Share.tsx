import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import MapView from '../components/MapView'
import NavLinks from '../components/NavLinks'
import { reverseGeocode } from '../lib/geocode'
import type { LatLng } from '../types'

export default function Share() {
  const [searchParams] = useSearchParams()
  const lat = parseFloat(searchParams.get('lat') || '0')
  const lng = parseFloat(searchParams.get('lng') || '0')
  const [address, setAddress] = useState('')

  useEffect(() => {
    if (lat && lng) {
      reverseGeocode(lat, lng).then(setAddress)
    }
  }, [lat, lng])

  if (!lat || !lng) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-text-light text-sm">잘못된 공유 링크입니다</p>
      </div>
    )
  }

  const marker: LatLng = { lat, lng }

  return (
    <div className="relative w-full h-dvh overflow-hidden">
      <MapView
        center={marker}
        marker={marker}
        className="absolute inset-0"
      />

      <div className="absolute top-4 left-4 z-10">
        <h1 className="text-2xl font-bold text-black">
          어디가?
        </h1>
      </div>

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
        <div className="flex flex-col items-center gap-2">
          <MapPin
            size={48}
            className="text-primary drop-shadow"
            fill="#FF6B6B"
            strokeWidth={1.5}
          />
          {address && (
            <div className="px-4 py-2 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg">
              <p className="text-sm font-medium text-text whitespace-nowrap">
                {address}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-20 p-4 pb-8">
        <NavLinks lat={lat} lng={lng} />
      </div>
    </div>
  )
}
