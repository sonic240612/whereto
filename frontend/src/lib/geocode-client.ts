import type { CoordResult } from '../types/index.ts'
import { categoryOsmTags, type DestinationCategory } from './categories.ts'
import { isLatLng, isRecord } from './validation.ts'

export interface PlaceCandidate extends CoordResult { category: string; type: string }

export function parsePlaces(data: unknown): PlaceCandidate[] {
  if (!isRecord(data) || !Array.isArray(data.features)) throw new Error('장소 조회 응답을 읽을 수 없습니다.')
  return data.features.flatMap((feature: unknown) => {
    if (!isRecord(feature) || !isRecord(feature.geometry) || !isRecord(feature.properties)) return []
    const coords = feature.geometry.coordinates
    if (feature.geometry.type !== 'Point' || !Array.isArray(coords)) return []
    const point = { lat: coords[1], lng: coords[0] }
    if (!isLatLng(point)) return []
    const p = feature.properties
    const parts = ['name', 'street', 'housenumber', 'district', 'city', 'state', 'country']
      .map(key => p[key]).filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    const address = [...new Set(parts)].join(', ').slice(0, 2000)
    if (!address) return []
    return [{
      ...point, address,
      category: typeof p.osm_key === 'string' ? p.osm_key : '',
      type: typeof p.osm_value === 'string' ? p.osm_value : '',
    }]
  })
}

function cancelled() { return new DOMException('조회가 취소되었습니다.', 'AbortError') }

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(cancelled())
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(cancelled()) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, ms)
    signal?.addEventListener('abort', abort, { once: true })
  })
}

export function createGeocodeClient(options: {
  baseUrl: string; fetcher?: typeof fetch; intervalMs?: number; timeoutMs?: number
}) {
  const fetcher = options.fetcher ?? fetch
  const interval = options.intervalMs ?? 1100
  const timeout = options.timeoutMs ?? 10000
  const cache = new Map<string, { expires: number; value: PlaceCandidate[] }>()
  let queue: Promise<unknown> = Promise.resolve()
  let lastStart = 0

  async function request(path: string, params: URLSearchParams, signal?: AbortSignal) {
    if (signal?.aborted) throw cancelled()
    const url = new URL(path, options.baseUrl.replace(/\/?$/, '/'))
    url.search = params.toString()
    const key = url.href
    const cached = cache.get(key)
    if (cached && cached.expires > Date.now()) return cached.value
    const operation = queue.catch(() => {}).then(async () => {
      if (signal?.aborted) throw cancelled()
      const reused = cache.get(key)
      if (reused && reused.expires > Date.now()) return reused.value
      await wait(Math.max(0, interval - (Date.now() - lastStart)), signal)
      const controller = new AbortController()
      const abort = () => controller.abort()
      signal?.addEventListener('abort', abort, { once: true })
      const timer = setTimeout(abort, timeout)
      lastStart = Date.now()
      try {
        const response = await fetcher(url, { signal: controller.signal })
        if (!response.ok) throw new Error(response.status === 429
          ? '장소 조회가 많습니다. 잠시 후 다시 시도해주세요.' : '장소 조회에 실패했습니다. 다시 시도해주세요.')
        const value = parsePlaces(await response.json())
        if (cache.size >= 100) cache.delete(cache.keys().next().value!)
        cache.set(key, { expires: Date.now() + 300000, value })
        return value
      } catch (error) {
        if (signal?.aborted) throw cancelled()
        if (controller.signal.aborted) throw new Error('장소 조회 시간이 초과되었습니다. 다시 시도해주세요.')
        if (error instanceof TypeError) throw new Error('인터넷 연결을 확인한 뒤 다시 시도해주세요.')
        throw error
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
      }
    })
    queue = operation
    return operation
  }

  return {
    reverse: (lat: number, lng: number, signal?: AbortSignal, category: DestinationCategory = 'all') => {
      if (!isLatLng({lat, lng})) return Promise.reject(new Error('올바른 지도 좌표가 아닙니다.'))
      const params = new URLSearchParams({
        lat: String(lat), lon: String(lng), limit: '8', radius: '5',
      })
      // Photon supports repeated osm_tag filters for reverse queries. Keep these
      // in the URL so both server-side candidate selection and cache keys differ.
      for (const tag of categoryOsmTags[category]) params.append('osm_tag', tag)
      return request('reverse', params, signal)
    },
    search: (query: string, signal?: AbortSignal) => {
      const term = query.trim()
      if (!term || term.length > 200) return Promise.reject(new Error('검색어를 1~200자로 입력해주세요.'))
      return request('api', new URLSearchParams({ q: term, limit: '5' }), signal)
    },
  }
}
