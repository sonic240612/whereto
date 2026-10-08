import { useState, useEffect, useCallback, useRef } from 'react'
import { isLatLng } from '../lib/validation'
import type { LatLng } from '../types'

export default function useGeolocation() {
  const [location, setLocation] = useState<LatLng | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)
  const retry = useCallback(() => {
    const id = ++requestId.current
    setError(null)
    if (!navigator.geolocation) {
      setError('이 브라우저에서는 현재 위치를 사용할 수 없습니다.')
      setLoading(false)
      return
    }
    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (id !== requestId.current) return
        const next = { lat: position.coords.latitude, lng: position.coords.longitude }
        if (isLatLng(next)) setLocation(next)
        else setError('올바른 위치 정보를 받지 못했습니다.')
        setLoading(false)
      },
      (failure) => {
        if (id !== requestId.current) return
        setError(failure.code === 1
          ? '현재 위치를 사용하려면 브라우저에서 위치 권한을 허용해주세요.'
          : failure.code === 3 ? '위치를 확인하는 데 시간이 오래 걸리고 있습니다.' : '현재 위치를 확인할 수 없습니다.')
        setLoading(false)
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    )
  }, [])

  useEffect(() => {
    retry()
    return () => { requestId.current += 1 }
  }, [retry])

  return { location, error, loading, retry }
}
