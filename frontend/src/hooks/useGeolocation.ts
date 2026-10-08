import { useState, useEffect, useCallback, useRef } from 'react'
import { requestGeolocation } from '../lib/geolocation-client'
import type { LatLng } from '../types'

export default function useGeolocation({ automatic = true }: { automatic?: boolean } = {}) {
  const [location, setLocation] = useState<LatLng | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const activeRequest = useRef<AbortController | null>(null)
  const retry = useCallback((fresh = false) => {
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    setError(null)
    setLoading(true)
    void requestGeolocation({ signal: controller.signal, fresh })
      .then(point => {
        if (activeRequest.current === controller && !controller.signal.aborted) setLocation(point)
      })
      .catch(cause => {
        if (activeRequest.current === controller && !controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : '현재 위치를 확인할 수 없습니다. 브라우저 권한과 기기의 위치 설정을 확인해주세요.')
        }
      })
      .finally(() => {
        if (activeRequest.current === controller && !controller.signal.aborted) {
          activeRequest.current = null
          setLoading(false)
        }
      })
  }, [])

  useEffect(() => {
    if (automatic) retry()
    return () => {
      activeRequest.current?.abort()
      activeRequest.current = null
    }
  }, [retry, automatic])

  return { location, error, loading, retry }
}
