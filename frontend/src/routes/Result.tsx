import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Loader2, RefreshCw, ScanLine, Share2, ChevronDown, Ellipsis, Bookmark, History } from 'lucide-react'
import MapView from '../components/MapView'
import ResultPin from '../components/ResultPin'
import NavLinks from '../components/NavLinks'
import KakaoPlaceLink from '../components/KakaoPlaceLink'
import VisitForm from '../components/VisitForm'
import CategoryBar from '../components/CategoryBar'
import RangeSelector from '../components/RangeSelector'
import { reverseGeocode, searchKakaoRegion, searchKakaoRegionPage } from '../lib/geocode'
import { generateRandomCoord } from '../lib/random'
import { generateAreaDestination, type DrawProgress } from '../lib/area-draw'
import { generateCompleteDestination } from '../lib/complete-draw'
import { drawModeLabels } from '../lib/draw-mode'
import useDesignTheme from '../hooks/useDesignTheme'
import { createVisit } from '../lib/api'
import { contains, parseBounds, parseResult } from '../lib/validation'
import { containsPolygon, getPolygonBounds, isPolygon, parsePolygon, serializePolygon } from '../lib/polygon'
import { getShareUrl } from '../lib/share'
import { categoryLabels, parseDestinationCategory, type DestinationCategory } from '../lib/categories'
import { usesKakaoMaps } from '../lib/map-provider'
import { writePlaceMetadata } from '../lib/place-metadata'
import type { CoordResult, LatLng } from '../types'

export default function Result() {
  const { drawMode } = useDesignTheme()
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
    const result = parseResult(new URLSearchParams(query), category, usesKakaoMaps ? 'kakao' : 'open', drawMode)
    return result && bounds && contains(bounds, result) && (!polygon || containsPolygon(polygon, result)) ? result : null
  }, [query, bounds, polygon, category, drawMode])
  const [result, setResult] = useState<CoordResult | null>(restored)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<DrawProgress>({ requests: 0, candidates: 0 })
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
  }, [query, restored, drawMode])

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
    setProgress({ requests: 0, candidates: 0 })
    setError('')
    setShowForm(false)
    setExpanded(false)
    setShowLink(false)
    setNotice('')
    try {
      let value: CoordResult
      let candidateCount: number | undefined
      const options = { signal: controller.signal, category, polygon: polygon ?? undefined,
        onProgress: (value: DrawProgress) => { if (!controller.signal.aborted) setProgress(value) } }
      if (drawMode === 'complete') {
        if (!usesKakaoMaps) throw new Error('현재 지도에서는 이 추첨 방식을 사용할 수 없어요. 인기 순 랜덤으로 변경해주세요.')
        const complete = await generateCompleteDestination(bounds, searchKakaoRegionPage, options)
        value = complete.place
        candidateCount = complete.candidateCount
      } else {
        value = usesKakaoMaps ? await generateAreaDestination(bounds, searchKakaoRegion, options)
          : await generateRandomCoord(bounds, (lat, lng, signal) => reverseGeocode(lat, lng, signal, category), controller.signal, Math.random, category, polygon ?? undefined)
      }
      if (controller.signal.aborted) return
      setResult(value)
      const next = new URLSearchParams(query)
      next.set('lat', String(value.lat))
      next.set('lng', String(value.lng))
      next.set('address', value.address)
      writePlaceMetadata(next, value)
      next.set('resultCategory', category)
      next.set('resultProvider', usesKakaoMaps ? 'kakao' : 'open')
      next.set('resultMode', drawMode)
      if (candidateCount !== undefined) next.set('candidateCount', String(candidateCount))
      else next.delete('candidateCount')
      setParams(next, { replace: true })
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '장소를 찾지 못했습니다.')
    } finally {
      if (!controller.signal.aborted) { setLoading(false); pending.current = false }
    }
  }

  const handleCancelDraw = () => {
    drawRequest.current?.abort()
    pending.current = false
    setLoading(false)
    setResult(restored)
    setNotice('검색을 취소했어요.')
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
    for (const key of ['lat', 'lng', 'address', 'placeName', 'kakaoPlaceId', 'resultCategory', 'resultProvider', 'resultMode', 'candidateCount']) next.delete(key)
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
      <p>유효한 범위를 선택해 다시 시작해주세요.</p>
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
            {expanded ? <ChevronDown size={20} aria-hidden="true" /> : <Ellipsis size={22} aria-hidden="true" />}
          </button>
        </div>
        {error && <div role="alert" className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-800 [overflow-wrap:anywhere]">{error}</div>}
        <div className="mt-3 grid grid-cols-2 items-end gap-2">
          {result && <><KakaoPlaceLink place={result} compact /><NavLinks {...result} compact /></>}
          <button data-glass="action" data-glass-tone={!result ? 'accent' : undefined} ref={drawTrigger} type="button" onClick={loading ? handleCancelDraw : handleDraw} className={`flex min-h-11 min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-border px-1.5 py-2.5 text-xs font-semibold sm:text-sm ${!result ? 'bg-primary-dark text-white' : ''}`}><RefreshCw size={16} className="hidden shrink-0 sm:block" aria-hidden="true" />{loading ? '검색 취소' : error ? '다시 시도' : result ? '다시 뽑기' : '뽑기'}</button>
          <button data-glass="action" ref={rangeTrigger} type="button" onClick={handleReselect} className="flex min-h-11 min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-border px-1.5 py-2.5 text-xs font-semibold hover:bg-bg-secondary sm:text-sm"><ScanLine size={16} className="hidden shrink-0 sm:block" aria-hidden="true" />영역 재지정</button>
        </div>
        <p className="mt-2 text-xs text-text-light">{drawModeLabels[drawMode]}{drawMode === 'complete' && result && /^[1-9]\d{0,4}$/.test(params.get('candidateCount') ?? '') ? ` · 검색 후보 ${Number(params.get('candidateCount'))}곳` : ''}</p>
        {loading && usesKakaoMaps && <p role="status" className="mt-1 text-xs text-text-light">{drawMode === 'complete' ? '무작위로 고른 구역에서 찾고 있어요' : '여러 구역에서 찾고 있어요'} · 검색 {progress.requests}회 · 후보 {progress.candidates}곳</p>}
        <div id={moreId} hidden={!expanded} className="mt-3 space-y-3 border-t border-border pt-3">
          {result && <>
            <div className="grid grid-cols-2 gap-2">
              <button data-glass="action" type="button" onClick={() => setShowForm(true)} disabled={loading} className="flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl bg-bg-secondary px-2 py-2 text-sm font-semibold disabled:opacity-40"><Bookmark size={16} aria-hidden="true" />방문 기록하기</button>
              <button data-glass="action" type="button" onClick={handleShare} className="flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl bg-bg-secondary px-2 py-2 text-sm font-semibold"><Share2 size={16} aria-hidden="true" />장소 공유하기</button>
            </div>
            <details open={showLink} onToggle={event => setShowLink(event.currentTarget.open)} className="text-xs text-text-light"><summary className="cursor-pointer py-3">공유 링크 직접 복사</summary><input aria-label="공유 링크" readOnly value={getShareUrl(result, window.location.origin)} onFocus={event => event.target.select()} className="min-w-0 w-full rounded-lg border border-border p-2" /></details>
            <p className="text-xs leading-relaxed text-text-light">{usesKakaoMaps
              ? drawMode === 'complete' ? '영역 안에서 위치를 먼저 무작위로 고르고, 주변 구역에서 검색한 장소 중 하나를 뽑습니다. 모든 장소의 당첨 확률이 같지는 않아요. 실제 영업·출입 여부는 방문 전에 확인해주세요.' : category === 'all' ? '여러 구역과 카테고리에서 찾은 후보 중 뽑습니다. 범위 안 모든 장소의 당첨 확률이 같지는 않아요. 실제 영업·출입 여부는 방문 전에 확인해주세요.' : `카카오맵에서 찾은 범위 안 ${categoryLabels[category]} 후보 중 뽑습니다. 실제 영업·출입 여부는 방문 전에 확인해주세요.`
              : '선택 범위와 카테고리에 맞게 지도에 등록된 장소를 추천합니다. 실제 출입 가능 여부는 방문 전에 확인해주세요.'}</p>
          </>}
          <Link data-glass="action" to="/gallery" className="relative flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-bg-secondary px-3 py-2.5 text-sm font-semibold shadow-sm hover:bg-border/60">
            <History size={16} aria-hidden="true" />방문 기록 보기
          </Link>
        </div>
        <p role="status" className={notice ? 'mt-3 text-xs leading-relaxed text-teal-800 [overflow-wrap:anywhere]' : 'sr-only'}>{notice}</p>
      </section>
      {showForm && result && <VisitForm placeName="" defaultAddress={result.address} onSubmit={handleSave} onCancel={() => setShowForm(false)} />}
    </main>
    {selecting && <RangeSelector userLocation={viewport.current?.center ?? result ?? { lat: (bounds.minLat + bounds.maxLat) / 2, lng: (bounds.minLng + bounds.maxLng) / 2 }} zoom={viewport.current?.zoom} initialPolygon={polygon} initialBounds={bounds} category={draftCategory} onCategoryChange={setDraftCategory} onConfirm={handleRangeConfirm} onCancel={handleRangeCancel} />}
    </>
  )
}
