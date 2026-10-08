import type { LatLng } from '../types/index.ts'
import { isLatLng } from './validation.ts'

const unavailableMessage = '현재 위치를 확인할 수 없습니다. 브라우저 위치 권한과 기기의 위치 서비스를 확인한 뒤 다시 시도해주세요.'
const deniedMessage = '위치 접근이 차단되었습니다. 브라우저의 이 사이트 위치 권한을 허용하고 기기의 위치 서비스를 켠 뒤 다시 시도해주세요.'
const timeoutMessage = '위치 확인 대기 시간이 지났습니다. 브라우저의 위치 권한 요청에 응답하고 기기의 위치 서비스를 확인한 뒤 다시 시도해주세요.'

type GeolocationProvider = Pick<Geolocation, 'getCurrentPosition'>

export function requestGeolocation(options: {
  signal?: AbortSignal
  fresh?: boolean
  getGeolocation?: () => GeolocationProvider | undefined
  deadlineMs?: number
} = {}): Promise<LatLng> {
  const { signal, fresh = false, deadlineMs = 15000 } = options
  if (signal?.aborted) return Promise.reject(new DOMException('위치 조회가 취소되었습니다.', 'AbortError'))

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (result: LatLng | Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      if (result instanceof Error) reject(result)
      else resolve(result)
    }
    const abort = () => finish(new DOMException('위치 조회가 취소되었습니다.', 'AbortError'))
    // The native timeout does not bound time spent waiting for a permission prompt.
    const timer = setTimeout(() => finish(new Error(timeoutMessage)), deadlineMs)
    signal?.addEventListener('abort', abort, { once: true })

    try {
      const geolocation = options.getGeolocation
        ? options.getGeolocation()
        : typeof navigator === 'undefined' ? undefined : navigator.geolocation
      if (settled) return
      if (!geolocation) {
        finish(new Error('이 브라우저에서는 현재 위치를 사용할 수 없습니다. 위치를 지원하는 브라우저에서 권한과 기기의 위치 설정을 확인해주세요.'))
        return
      }
      geolocation.getCurrentPosition(
        position => {
          if (settled) return
          const point = { lat: position.coords.latitude, lng: position.coords.longitude }
          finish(isLatLng(point) ? point : new Error(`올바른 위치 정보를 받지 못했습니다. ${unavailableMessage}`))
        },
        failure => finish(new Error(failure.code === 1 ? deniedMessage : failure.code === 3 ? timeoutMessage : unavailableMessage)),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: fresh ? 0 : 60000 },
      )
    } catch (error) {
      finish(new Error(error instanceof Error && error.name === 'SecurityError' ? deniedMessage : unavailableMessage))
    }
  })
}
