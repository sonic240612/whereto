import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Loader2, RefreshCw, ScanLine, Share2, ChevronUp, Ellipsis, Bookmark } from 'lucide-react'
import MapView from '../components/MapView'
import ResultPin from '../components/ResultPin'
import NavLinks from '../components/NavLinks'
import VisitForm from '../components/VisitForm'
import CategoryBar from '../components/CategoryBar'
import RangeSelector from '../components/RangeSelector'
import { reverseGeocode } from '../lib/geocode'
import { generateRandomCoord } from '../lib/random'
import { createVisit } from '../lib/api'
import { contains, parseBounds, parseResult } from '../lib/validation'
import { containsPolygon, getPolygonBounds, isPolygon, parsePolygon, serializePolygon } from '../lib/polygon'
import { getShareUrl } from '../lib/share'
import { categoryLabels, parseDestinationCategory, type DestinationCategory } from '../lib/categories'
import { usesKakaoMaps } from '../lib/map-provider'
import type { CoordResult, LatLng } from '../types'

export default function Result() {
  const [params, setParams] = useSearchParams()
  const query = params.toString()
  const category = parseDestinationCategory(params.get('category'))
  const area = useMemo(() => {
    const saved = new URLSearchParams(query)
    const polygon = parsePolygon(saved.get('polygon'))
    // A malformed polygon must never silently become its larger bounding box.
    if (saved.has('polygon') && !polygon) return null
    const bounds = polygon ? getPolygonBounds(polygon) : parseBounds(saved)
    return bounds ? { bounds, polygon } : null
  }, [query])
  const bounds = area?.bounds ?? null
  const polygon = area?.polygon ?? null
  const restored = useMemo(() => {
    const result = parseResult(new URLSearchParams(query), category, usesKakaoMaps ? 'kakao' : 'open')
    return result && bounds && contains(bounds, result) && (!polygon || containsPolygon(polygon, result)) ? result : null
  }, [query, bounds, polygon, category])
  const [result, setResult] = useState<CoordResult | null>(restored)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [showLink, setShowLink] = useState(false)
  const [dockInset, setDockInset] = useState(164)
  const dockRef = useRef<HTMLElement>(null)
  const moreId = useId()
  const pending = useRef(false)
  const drawRequest = useRef<AbortController | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [draftCategory, setDraftCategory] = useState(category)
  const viewport = useRef<{ center: LatLng; zoom: number } | null>(null)
  const rangeTrigger = useRef<HTMLButtonElement>(null)
  const drawTrigger = useRef<HTMLButtonElement>(null)
  const hasBounds = Boolean(bounds)
  const homeUrl = category === 'all' ? '/' : `/?category=${category}`

  useEffect(() => {
    const dock = dockRef.current
    if (!dock) return
    const updateInset = () => setDockInset(Math.ceil(dock.offsetHeight + (parseFloat(getComputedStyle(dock).bottom) || 24) + 12))
    const observer = new ResizeObserver(updateInset)
    observer.observe(dock)
    updateInset()
    return () => observer.disconnect()
  }, [hasBounds])

  useEffect(() => {
    // A URL restores either a chosen area or a completed draw. Only the draw
    // button starts a request, including after a reload or category change.
    drawRequest.current?.abort()
    pending.current = false
    setResult(restored)
    setLoading(false)
    setError('')
    setNotice('')
    setExpanded(false)
    setShowLink(false)
    setShowForm(false)
    return () => { drawRequest.current?.abort(); pending.current = false }
  }, [query, restored])

  const handleViewport = useCallback((center: LatLng, zoom: number) => {
    viewport.current = { center, zoom }
  }, [])

  const handleReselect = () => {
    drawRequest.current?.abort()
    pending.current = false
    setResult(restored)
    setLoading(false)
    setError('')
    setDraftCategory(category)
    setShowForm(false)
    setExpanded(false)
    setSelecting(true)
  }

  const handleRangeCancel = useCallback(() => {
    setSelecting(false)
    requestAnimationFrame(() => rangeTrigger.current?.focus())
  }, [])

  const handleRangeConfirm = (points: LatLng[]) => {
    if (!isPolygon(points)) return
    const nextBounds = getPolygonBounds(points)
    const next = new URLSearchParams({
      minLat: String(nextBounds.minLat), maxLat: String(nextBounds.maxLat),
      minLng: String(nextBounds.minLng), maxLng: String(nextBounds.maxLng),
      polygon: serializePolygon(points),
    })
    if (draftCategory !== 'all') next.set('category', draftCategory)
    drawRequest.current?.abort()
    pending.current = false
    setResult(null)
    setLoading(false)
    setError('')
    setNotice('')
    setShowLink(false)
    setSelecting(false)
    if (next.toString() !== query) setParams(next, { replace: true })
    requestAnimationFrame(() => drawTrigger.current?.focus())
  }

  const handleDraw = async () => {
    if (!bounds || selecting || pending.current) return
    const controller = new AbortController()
    drawRequest.current = controller
    pending.current = true
    setResult(null)
    setLoading(true)
    setError('')
    setShowForm(false)
    setExpanded(false)
    setShowLink(false)
    setNotice('')
    try {
      const value = await generateRandomCoord(bounds, (lat, lng, signal) => reverseGeocode(lat, lng, signal, category), controller.signal, Math.random, category, polygon ?? undefined)
      if (controller.signal.aborted) return
      setResult(value)
      const next = new URLSearchParams(query)
      next.set('lat', String(value.lat))
      next.set('lng', String(value.lng))
      next.set('address', value.address)
      next.set('resultCategory', category)
      next.set('resultProvider', usesKakaoMaps ? 'kakao' : 'open')
      setParams(next, { replace: true })
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '장소를 찾지 못했습니다.')
    } finally {
      if (!controller.signal.aborted) { setLoading(false); pending.current = false }
    }
  }

  const handleCategoryChange = (nextCategory: DestinationCategory) => {
    if (nextCategory === category) return
    drawRequest.current?.abort()
    pending.current = false
    setResult(null)
    setLoading(false)
    setError('')
    setNotice('')
    setShowForm(false)
    setExpanded(false)
    setShowLink(false)
    const next = new URLSearchParams(params)
    if (nextCategory === 'all') next.delete('category')
    else next.set('category', nextCategory)
    for (const key of ['lat', 'lng', 'address', 'resultCategory', 'resultProvider']) next.delete(key)
    setParams(next, { replace: true })
  }

  const handleSave = useCallback(async (data: { name: string; address: string; rating: number; note: string }) => {
    if (!result) throw new Error('저장할 장소가 없습니다.')
    await createVisit({ ...data, lat: result.lat, lng: result.lng })
    setShowForm(false)
    setNotice('방문 기록을 이 브라우저에 저장했습니다.')
  }, [result])

  const handleShare = async () => {
    if (!result) return
    const url = getShareUrl(result, window.location.origin)
    try {
      if (navigator.share) await navigator.share({ title: 'WhereTo에서 고른 장소', text: result.address, url })
      else { await navigator.clipboard.writeText(url); setNotice('공유 링크를 복사했습니다.') }
    } catch (reason) {
      if (reason instanceof Error && reason.name === 'AbortError') return
      setExpanded(true)
      setShowLink(true)
      setNotice('자동 복사를 사용할 수 없습니다. 아래 링크를 길게 누르거나 선택해 복사해주세요.')
    }
  }

  if (!bounds) return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-bold">탐색 범위를 확인해주세요</h1>
      <p>유효한 범위를 선택하거나 지도를 확대해 다시 시작해주세요.</p>
      <Link to={homeUrl} className="rounded-xl bg-primary px-6 py-3 font-bold text-white">처음으로 돌아가기</Link>
    </main>
  )

  return (
    <>
    <main inert={selecting} className="relative h-dvh overflow-hidden">
      <h1 className="sr-only">{result ? '추첨 결과' : '선택한 영역에서 장소 뽑기'}</h1>
      <MapView center={result ?? undefined} marker={result} bounds={bounds} polygon={polygon} onViewportChange={handleViewport} topInset={120} bottomInset={dockInset} className="absolute inset-0" />
      <CategoryBar category={category} onCategoryChange={handleCategoryChange} className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+60px)] z-20" />
      <section data-glass="panel" ref={dockRef} aria-label="추첨 결과" className="absolute inset-x-3 z-10 mx-auto max-h-[70dvh] max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-white/80 bg-white/95 p-3 shadow-xl backdrop-blur-sm" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
        <div className="flex items-start gap-2">
          {result ? <ResultPin label={category === 'all' ? '이번 목적지' : `${categoryLabels[category]} · 이번 목적지`} address={result.address} expanded={expanded} /> : (
            <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-1 text-sm font-semibold" role="status">
              {loading && <Loader2 size={18} className="shrink-0 animate-spin text-teal-700" aria-hidden="true" />}
              {loading ? `범위 안에서 ${category === 'all' ? '장소' : categoryLabels[category]} 찾는 중…` : error ? '장소를 다시 찾아볼까요?' : '영역이 지정됐어요. 뽑기를 눌러주세요.'}
            </div>
          )}
          <button data-glass="action" type="button" aria-expanded={expanded} aria-controls={moreId} aria-label={expanded ? '장소 더보기 접기' : '장소 더보기'} onClick={() => setExpanded(value => !value)} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-text-light hover:bg-bg-secondary">
            {expanded ? <ChevronUp size={20} aria-hidden="true" /> : <Ellipsis size={22} aria-hidden="true" />}
          </button>
        </div>
        {error && <div role="alert" className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-800 [overflow-wrap:anywhere]">{error}</div>}
        <div className={`mt-3 grid items-end gap-2 ${result ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {result && <NavLinks lat={result.lat} lng={result.lng} compact />}
          <button data-glass="action" data-glass-tone={!result ? 'accent' : undefined} ref={drawTrigger} type="button" onClick={handleDraw} disabled={loading} className={`flex min-h-11 min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-border px-1.5 py-2.5 text-xs font-semibold disabled:opacity-40 sm:text-sm ${!result ? 'bg-primary-dark text-white' : ''}`}><RefreshCw size={16} className="hidden shrink-0 sm:block" aria-hidden="true" />{loading ? '뽑는 중…' : error ? '다시 시도' : result ? '다시 뽑기' : '뽑기'}</button>
          <button data-glass="action" ref={rangeTrigger} type="button" onClick={handleReselect} className="flex min-h-11 min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-border px-1.5 py-2.5 text-xs font-semibold hover:bg-bg-secondary sm:text-sm"><ScanLine size={16} className="hidden shrink-0 sm:block" aria-hidden="true" />영역 재지정</button>
        </div>
        <div id={moreId} hidden={!expanded} className="mt-3 space-y-3 border-t border-border pt-3">
          {result && <>
            <div className="grid grid-cols-2 gap-2">
              <button data-glass="action" type="button" onClick={() => setShowForm(true)} disabled={loading} className="flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl bg-bg-secondary px-2 py-2 text-sm font-semibold disabled:opacity-40"><Bookmark size={16} aria-hidden="true" />방문 기록하기</button>
              <button data-glass="action" type="button" onClick={handleShare} className="flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl bg-bg-secondary px-2 py-2 text-sm font-semibold"><Share2 size={16} aria-hidden="true" />장소 공유하기</button>
            </div>
            <details open={showLink} onToggle={event => setShowLink(event.currentTarget.open)} className="text-xs text-text-light"><summary className="cursor-pointer py-3">공유 링크 직접 복사</summary><input aria-label="공유 링크" readOnly value={getShareUrl(result, window.location.origin)} onFocus={event => event.target.select()} className="min-w-0 w-full rounded-lg border border-border p-2" /></details>
            <p className="text-xs leading-relaxed text-text-light">{usesKakaoMaps
              ? category === 'all' ? '카카오맵의 18개 분류 중 일부를 무작위로 조회해 범위 안의 장소를 뽑습니다. 실제 영업·출입 여부는 방문 전에 확인해주세요.' : `카카오맵에 ${categoryLabels[category]} 분류로 등록된 곳에서 뽑습니다. 실제 영업·출입 여부는 방문 전에 확인해주세요.`
              : '선택 범위와 카테고리에 맞게 지도에 등록된 장소를 추천합니다. 실제 출입 가능 여부는 방문 전에 확인해주세요.'}</p>
          </>}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs font-semibold">
            <Link to="/gallery" className="flex min-h-11 items-center">방문 기록 보기</Link>
          </div>
        </div>
        <p role="status" className={notice ? 'mt-3 text-xs leading-relaxed text-teal-800 [overflow-wrap:anywhere]' : 'sr-only'}>{notice}</p>
      </section>
      {showForm && result && <VisitForm placeName="" defaultAddress={result.address} onSubmit={handleSave} onCancel={() => setShowForm(false)} />}
    </main>
    {selecting && <RangeSelector userLocation={viewport.current?.center ?? result ?? { lat: (bounds.minLat + bounds.maxLat) / 2, lng: (bounds.minLng + bounds.maxLng) / 2 }} zoom={viewport.current?.zoom} initialPolygon={polygon} initialBounds={bounds} category={draftCategory} onCategoryChange={setDraftCategory} onConfirm={handleRangeConfirm} onCancel={handleRangeCancel} />}
    </>
  )
}
