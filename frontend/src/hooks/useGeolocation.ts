import { useState, useEffect } from 'react'
import type { LatLng } from '../types'

export default function useGeolocation() {
  const [location, setLocation] = useState<LatLng | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      (err) => {
        setError(err.message)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }, [])

  return { location, error }
}
