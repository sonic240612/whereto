import type { PlaceCandidate } from './geocode-client.ts'
import { getKakaoCategoryCode, kakaoDestinationCategories, type DestinationCategory, type KakaoDestinationCode } from './categories.ts'
import { isBounds, isLatLng, isRecord } from './validation.ts'
import { placeMetadata } from './place-metadata.ts'
import type { RectBounds } from '../types/index.ts'

type ServiceCallback = (data: unknown, status: string) => void

// Only callback APIs and plain coordinates are needed here. No browser SDK globals
// are imported, so the adapter can also be tested without credentials or a network.
export interface KakaoPlacesServices {
  places: {
    keywordSearch(query: string, callback: ServiceCallback, options: { size: number }): void
    categorySearch(code: KakaoDestinationCode, callback: ServiceCallback, options: {
      x: number; y: number; radius: number; size: number; page: number
    } | { rect: string; size: number; page: number }): void
  }
  geocoder: {
    addressSearch(query: string, callback: ServiceCallback): void
    coord2Address(x: number, y: number, callback: ServiceCallback): void
  }
}

interface KakaoPlacesOptions {
  getServices: () => KakaoPlacesServices | Promise<KakaoPlacesServices>
  timeoutMs?: number
  intervalMs?: number
  random?: () => number
}

function cancelled() { return new DOMException('조회가 취소되었습니다.', 'AbortError') }

function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation
  if (signal.aborted) return Promise.reject(cancelled())
  return new Promise((resolve, reject) => {
    const abort = () => reject(cancelled())
    signal.addEventListener('abort', abort, { once: true })
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(cancelled())
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(cancelled()) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, ms)
    signal?.addEventListener('abort', abort, { once: true })
  })
}

function coordinate(value: unknown): number {
  return typeof value === 'number' ? value
    : typeof value === 'string' && value.trim() ? Number(value) : NaN
}

function text(value: unknown): string { return typeof value === 'string' ? value.trim() : '' }

function addressName(value: unknown): string {
  return isRecord(value) ? text(value.address_name) : ''
}

function placeEntries(data: unknown[], expectedCode?: KakaoDestinationCode) {
  return data.flatMap(item => {
    if (!isRecord(item)) return []
    const point = { lat: coordinate(item.y), lng: coordinate(item.x) }
    if (!isLatLng(point)) return []
    const codes = Array.isArray(item.category_group_code)
      ? item.category_group_code.map(text).filter(Boolean) : [text(item.category_group_code)]
    const code = expectedCode ? (codes.includes(expectedCode) ? expectedCode : '') : (codes[0] ?? '')
    if (expectedCode && code !== expectedCode) return []
    const parts = [text(item.place_name), text(item.road_address_name) || text(item.address_name)].filter(Boolean)
    const address = [...new Set(parts)].join(', ').slice(0, 2000)
    if (!address) return []
    const place: PlaceCandidate = { ...point, address, category: 'kakao', type: code,
      ...placeMetadata({ placeName: item.place_name, kakaoPlaceId: item.id }) }
    const key = text(item.id) || `${point.lat},${point.lng},${address}`
    return [{ key, place }]
  })
}

function addresses(data: unknown[]): PlaceCandidate[] {
  return data.flatMap(item => {
    if (!isRecord(item)) return []
    const point = { lat: coordinate(item.y), lng: coordinate(item.x) }
    const address = addressName(item.road_address) || text(item.address_name) || addressName(item.address)
    if (!isLatLng(point) || !address) return []
    return [{ ...point, address: address.slice(0, 2000), category: 'address', type: '' }]
  })
}

export function createKakaoPlacesClient(options: KakaoPlacesOptions) {
  const timeout = options.timeoutMs ?? 10_000
  const interval = options.intervalMs ?? 150
  const random = options.random ?? Math.random
  const cache = new Map<string, { expires: number; data: unknown[] }>()
  let queue: Promise<unknown> = Promise.resolve()
  let lastStart = 0

  function invoke(
    start: (services: KakaoPlacesServices, callback: ServiceCallback) => void,
    signal?: AbortSignal,
  ): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (error?: unknown, data?: unknown[]) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
        if (error !== undefined) reject(error)
        else resolve(data ?? [])
      }
      const abort = () => finish(cancelled())
      const timer = setTimeout(() => finish(new Error('카카오 장소 조회 시간이 초과되었습니다. 다시 시도해주세요.')), timeout)
      if (signal?.aborted) { abort(); return }
      signal?.addEventListener('abort', abort, { once: true })
      // Loading the SDK is part of the timeout. An expired/aborted load must not
      // issue a Places request when its promise eventually resolves.
      Promise.resolve().then(() => settled ? undefined : options.getServices()).then(services => {
        if (settled || !services) return
        start(services, (data, status) => {
          if (settled) return
          if (status === 'ZERO_RESULT') finish(undefined, [])
          else if (status !== 'OK') finish(new Error('카카오 장소 조회에 실패했습니다. 잠시 후 다시 시도해주세요.'))
          else if (!Array.isArray(data)) finish(new Error('카카오 장소 조회 응답을 읽을 수 없습니다.'))
          else finish(undefined, data)
        })
      }).catch(error => finish(error instanceof Error ? error : new Error('카카오 장소 조회에 실패했습니다. 다시 시도해주세요.')))
    })
  }

  function request(
    key: string,
    start: (services: KakaoPlacesServices, callback: ServiceCallback) => void,
    signal?: AbortSignal,
  ): Promise<unknown[]> {
    if (signal?.aborted) return Promise.reject(cancelled())
    const cached = cache.get(key)
    if (cached && cached.expires > Date.now()) return Promise.resolve(cached.data)
    const operation = queue.then(async () => {
      signal?.throwIfAborted()
      const reused = cache.get(key)
      if (reused && reused.expires > Date.now()) return reused.data
      await pause(Math.max(0, interval - (Date.now() - lastStart)), signal)
      lastStart = Date.now()
      const data = await invoke(start, signal)
      signal?.throwIfAborted()
      if (cache.size >= 100) cache.delete(cache.keys().next().value!)
      cache.set(key, { expires: Date.now() + 300_000, data })
      return data
    })
    queue = operation.catch(() => {})
    // Aborting a queued request rejects its caller immediately without allowing
    // it to overtake a still-running SDK call. Its turn later skips all I/O.
    return abortable(operation, signal)
  }

  async function searchRegionPage(bounds: RectBounds, code: KakaoDestinationCode, page: number, signal?: AbortSignal) {
    if (!isBounds(bounds) || !kakaoDestinationCategories.includes(code) || !Number.isInteger(page) || page < 1 || page > 3) {
      throw new Error('탐색 범위가 올바르지 않습니다.')
    }
    const rect = [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat].join(',')
    const data = await request(`region:${code}:${rect}:${page}`, (services, callback) => {
      // No center or radius: the rectangle is the complete geographic filter.
      services.places.categorySearch(code, callback, { rect, size: 15, page })
    }, signal)
    signal?.throwIfAborted()
    return { places: placeEntries(data, code).map(entry => entry.place), rawCount: data.length }
  }

  return {
    searchRegionPage,
    async searchRegion(bounds: RectBounds, code: KakaoDestinationCode, page: number, signal?: AbortSignal): Promise<PlaceCandidate[]> {
      return (await searchRegionPage(bounds, code, page, signal)).places
    },

    async search(query: string, signal?: AbortSignal): Promise<PlaceCandidate[]> {
      const term = query.trim()
      if (!term || term.length > 200) throw new Error('검색어를 1~200자로 입력해주세요.')
      const places = await request(`keyword:${term}`, (services, callback) => {
        services.places.keywordSearch(term, callback, { size: 5 })
      }, signal)
      signal?.throwIfAborted()
      const candidates = [...new Map(placeEntries(places).map(entry => [entry.key, entry.place])).values()]
      if (candidates.length) return candidates
      const result = await request(`address:${term}`, (services, callback) => {
        services.geocoder.addressSearch(term, callback)
      }, signal)
      signal?.throwIfAborted()
      return addresses(result).slice(0, 5)
    },

    async reverse(lat: number, lng: number, signal?: AbortSignal, category: DestinationCategory = 'all'): Promise<PlaceCandidate[]> {
      if (!isLatLng({ lat, lng })) throw new Error('올바른 지도 좌표가 아닙니다.')
      signal?.throwIfAborted()
      const shuffled = [...kakaoDestinationCategories]
      const selectedCode = getKakaoCategoryCode(category)
      if (!selectedCode) {
        for (let i = shuffled.length - 1; i > 0; i--) {
          const index = Math.floor(random() * (i + 1))
          ;[shuffled[i], shuffled[index]] = [shuffled[index], shuffled[i]]
        }
      }
      const codes: readonly KakaoDestinationCode[] = selectedCode ? [selectedCode] : shuffled.slice(0, 4)
      const candidates = new Map<string, PlaceCandidate>()
      for (const code of codes) {
        const result = await request(`category:${code}:${lat}:${lng}`, (services, callback) => {
          services.places.categorySearch(code, callback, { x: lng, y: lat, radius: 5000, size: 8, page: 1 })
        }, signal)
        signal?.throwIfAborted()
        for (const entry of placeEntries(result, code)) candidates.set(entry.key, entry.place)
      }
      return [...candidates.values()]
    },

    async addressAt(lat: number, lng: number, signal?: AbortSignal): Promise<string | null> {
      if (!isLatLng({ lat, lng })) throw new Error('올바른 지도 좌표가 아닙니다.')
      const result = await request(`coordinate-address:${lat}:${lng}`, (services, callback) => {
        services.geocoder.coord2Address(lng, lat, callback)
      }, signal)
      signal?.throwIfAborted()
      for (const item of result) {
        if (!isRecord(item)) continue
        const address = addressName(item.road_address) || addressName(item.address)
        if (address) return address.slice(0, 2000)
      }
      return null
    },
  }
}
