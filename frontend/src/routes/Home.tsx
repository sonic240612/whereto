import { useState, useCallback, useEffect, useRef } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Image, LocateFixed, Search, Loader2, X } from 'lucide-react'
import MapView from '../components/MapView'
import FabButton from '../components/FabButton'
import RangeSelector from '../components/RangeSelector'
import CategoryBar from '../components/CategoryBar'
import useGeolocation from '../hooks/useGeolocation'
import { searchPlaces } from '../lib/geocode'
import type { PlaceCandidate } from '../lib/geocode'
import { getPolygonBounds, isPolygon, serializePolygon } from '../lib/polygon'
import { parseDestinationCategory, type DestinationCategory } from '../lib/categories'
import type { LatLng } from '../types'

const DEFAULT_ZOOM = 15
const DEFAULT_CENTER: LatLng = { lat: 37.5665, lng: 126.978 }
const mapButtonClass = 'pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/80 bg-white/95 text-text shadow-md backdrop-blur transition-colors hover:bg-bg-secondary disabled:opacity-60'

export default function Home() {
  const navigate = useNavigate()
  const [pageParams, setPageParams] = useSearchParams()
  const category = parseDestinationCategory(pageParams.get('category'))
  const { location: userLocation, error: geoError, loading: locating, retry } = useGeolocation()
  const [selecting, setSelecting] = useState(false)
  const [center, setCenter] = useState<LatLng>(DEFAULT_CENTER)
  const [viewport, setViewport] = useState({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM })
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<PlaceCandidate[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [locationNotice, setLocationNotice] = useState(false)
  const searchRequest = useRef<AbortController | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const searchTrigger = useRef<HTMLButtonElement>(null)
  const searchedLocation = useRef(false)
  const rangeTrigger = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (userLocation && !searchedLocation.current) setCenter(userLocation)
  }, [userLocation])
  useEffect(() => () => searchRequest.current?.abort(), [])
  useEffect(() => {
    if (!searchOpen) return
    const frame = requestAnimationFrame(() => searchInput.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [searchOpen])

  const handleViewport = useCallback((nextCenter: LatLng, zoom: number) => {
    setViewport({ center: nextCenter, zoom })
  }, [])

  const handleConfirm = useCallback((polygon: LatLng[]) => {
    if (!isPolygon(polygon)) return
    const bounds = getPolygonBounds(polygon)
    setSelecting(false)
    const params = new URLSearchParams({
      minLat: String(bounds.minLat), maxLat: String(bounds.maxLat),
      minLng: String(bounds.minLng), maxLng: String(bounds.maxLng),
      polygon: serializePolygon(polygon),
    })
    if (category !== 'all') params.set('category', category)
    navigate(`/result?${params}`)
  }, [navigate, category])
  const handleCategoryChange = (nextCategory: DestinationCategory) => {
    const next = new URLSearchParams(pageParams)
    if (nextCategory === 'all') next.delete('category')
    else next.set('category', nextCategory)
    setPageParams(next, { replace: true })
  }
  const handleCancel = useCallback(() => {
    setSelecting(false)
    requestAnimationFrame(() => rangeTrigger.current?.focus())
  }, [])

  const closeSearch = () => {
    searchRequest.current?.abort()
    setSearching(false)
    setSearchOpen(false)
    setResults([])
    setSearchError(null)
    requestAnimationFrame(() => searchTrigger.current?.focus())
  }

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = query.trim()
    if (!text) return
    searchRequest.current?.abort()
    const request = new AbortController()
    searchRequest.current = request
    setSearching(true)
    setSearchError(null)
    setResults([])
    try {
      const next = await searchPlaces(text, request.signal)
      if (request.signal.aborted) return
      setResults(next.slice(0, 6))
      if (!next.length) setSearchError('검색 결과가 없습니다. 다른 지역명이나 주소로 검색해주세요.')
    } catch (error) {
      if (request.signal.aborted) return
      setSearchError(error instanceof Error ? error.message : '지역을 검색하지 못했습니다. 다시 시도해주세요.')
    } finally {
      if (!request.signal.aborted) setSearching(false)
    }
  }

  const moveToResult = (place: PlaceCandidate) => {
    searchedLocation.current = true
    setCenter({ lat: place.lat, lng: place.lng })
    closeSearch()
  }

  const locate = () => {
    searchedLocation.current = false
    setLocationNotice(true)
    if (userLocation) setCenter({ ...userLocation })
    retry()
  }

  const locationLabel = locating ? '현재 위치 확인 중' : geoError ? '현재 위치 다시 시도' : '내 위치로 이동'

  return (
    <>
      <main inert={selecting} className="relative h-dvh overflow-hidden bg-bg">
        <MapView center={center} onViewportChange={handleViewport} topInset={120} bottomInset={96} className="absolute inset-0" />

        <header className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-[calc(env(safe-area-inset-top)+8px)]">
          <div className="flex h-11 items-center justify-end gap-2">
            <h1 className="sr-only">WhereTo · 오늘의 행선지를 랜덤 추첨</h1>
            <nav aria-label="지도 도구" className="mr-[46px] flex gap-0.5">
              <button data-glass="control" ref={searchTrigger} type="button" aria-label={searchOpen ? '지역 검색 닫기' : '지역 검색 열기'} aria-expanded={searchOpen} aria-controls="place-search-panel" title="지역 검색" onClick={() => searchOpen ? closeSearch() : setSearchOpen(true)} className={mapButtonClass}>
                {searchOpen ? <X size={19} aria-hidden="true" /> : <Search size={19} aria-hidden="true" />}
              </button>
              <button data-glass="control" type="button" onClick={locate} disabled={locating} aria-label={geoError ? `${locationLabel}. ${geoError} 위치 없이도 지도를 이용할 수 있습니다.` : locationLabel} title={geoError ? `${geoError} 다시 시도` : locationLabel} className={`${mapButtonClass} ${geoError ? 'text-amber-700' : ''}`}>
                {locating ? <Loader2 size={19} className="animate-spin" aria-hidden="true" /> : <LocateFixed size={19} aria-hidden="true" />}
              </button>
              <button data-glass="control" type="button" onClick={() => navigate('/gallery')} aria-label="방문 기록 보기" title="방문 기록" className={mapButtonClass}><Image size={19} aria-hidden="true" /></button>
            </nav>
          </div>

          <CategoryBar category={category} onCategoryChange={handleCategoryChange} className="pointer-events-auto mt-2" />

          {searchOpen && (
            <section data-glass="panel" id="place-search-panel" aria-label="지역 검색" className="pointer-events-auto mt-2 max-h-[calc(100dvh-232px)] overflow-y-auto rounded-2xl border border-border bg-white/95 p-2 shadow-xl backdrop-blur sm:ml-auto sm:max-w-md" onKeyDown={(event) => {
              if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeSearch() }
            }}>
              <form onSubmit={handleSearch} className="flex gap-2">
                <label htmlFor="place-search" className="sr-only">지역명 또는 주소 검색</label>
                <input ref={searchInput} id="place-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={200} placeholder="지역명 또는 주소 검색" className="min-w-0 flex-1 rounded-xl border border-border bg-white px-3 py-2.5 text-sm" />
                <button type="submit" aria-label="지역 검색" disabled={searching || !query.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-text text-white disabled:opacity-40">
                  {searching ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
                </button>
              </form>
              {searching && <p role="status" className="px-2 pt-2 text-xs text-text-light">지역을 검색하는 중...</p>}
              {searchError && <p role="alert" className="px-2 pt-2 text-sm text-red-700">{searchError}</p>}
              {results.length > 0 && (
                <div className="mt-2 border-t border-border">
                  <div className="flex items-center justify-between px-2 py-1 text-xs font-bold text-text-light">
                    <span role="status">검색 결과 {results.length}개</span>
                    <button type="button" aria-label="검색 결과 닫기" onClick={closeSearch} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-bg-secondary"><X size={16} aria-hidden="true" /></button>
                  </div>
                  <ul aria-label="지역 검색 결과">
                    {results.map((place, index) => (
                      <li key={`${place.lat},${place.lng},${index}`}>
                        <button type="button" onClick={() => moveToResult(place)} className="w-full rounded-xl px-3 py-3 text-left text-sm break-words hover:bg-bg-secondary">{place.address}</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {!searchOpen && locationNotice && geoError && (
            <div role="status" className="pointer-events-auto ml-auto mt-2 flex max-w-sm items-start gap-2 rounded-2xl border border-border bg-white/95 py-3 pl-3 pr-1 shadow-lg">
              <div className="min-w-0 text-xs leading-relaxed"><p className="font-semibold text-text">{geoError}</p><p className="mt-1 text-text-light">지역을 검색하거나 지도를 움직여 바로 이용할 수 있어요.</p></div>
              <button type="button" onClick={() => setLocationNotice(false)} aria-label="위치 안내 닫기" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-bg-secondary"><X size={16} aria-hidden="true" /></button>
            </div>
          )}
        </header>

        <p role="status" className="sr-only">{locating ? '현재 위치 확인 중입니다. 지도는 바로 사용할 수 있습니다.' : geoError ? `${geoError} 위치 없이도 지역을 검색하거나 지도를 움직여 추첨할 수 있습니다.` : '지도를 움직여 원하는 지역을 찾아보세요.'}</p>

        <div className="pointer-events-none absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+24px)] z-10 flex justify-center">
          <div className="pointer-events-auto">
            <FabButton label="영역 지정" onClick={() => {
              rangeTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
              setSelecting(true)
            }} disabled={selecting} />
          </div>
        </div>
      </main>
      {selecting && <RangeSelector userLocation={viewport.center} zoom={viewport.zoom} category={category} onCategoryChange={handleCategoryChange} onConfirm={handleConfirm} onCancel={handleCancel} />}
    </>
  )
}
