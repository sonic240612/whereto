import { useState, useCallback, useRef, useEffect, useId } from 'react'
import { X, Check, Undo2, LocateFixed, Loader2 } from 'lucide-react'
import MapView from './MapView'
import HomeLink from './HomeLink'
import DesignSettings from './DesignSettings'
import CategoryBar from './CategoryBar'
import useDialog from '../hooks/useDialog'
import useGeolocation from '../hooks/useGeolocation'
import { categoryLabels, type DestinationCategory } from '../lib/categories'
import { getPolygonBounds, isPolygon, MAX_POLYGON_POINTS } from '../lib/polygon'
import { isBounds, isLatLng } from '../lib/validation'
import type { LatLng, RectBounds } from '../types'

interface RangeSelectorProps {
  userLocation: LatLng | null
  zoom?: number
  category: DestinationCategory
  onCategoryChange: (category: DestinationCategory) => void
  onConfirm: (polygon: LatLng[]) => void
  onCancel: () => void
  initialPolygon?: readonly LatLng[] | null
  initialBounds?: RectBounds | null
}

function getInitialPoints(polygon?: readonly LatLng[] | null, bounds?: RectBounds | null): LatLng[] {
  if (isPolygon(polygon)) return polygon.map(point => ({ ...point }))
  if (!isBounds(bounds)) return []
  return [
    { lat: bounds.minLat, lng: bounds.minLng },
    { lat: bounds.minLat, lng: bounds.maxLng },
    { lat: bounds.maxLat, lng: bounds.maxLng },
    { lat: bounds.maxLat, lng: bounds.minLng },
  ]
}

export default function RangeSelector({ userLocation, zoom, category, onCategoryChange, onConfirm, onCancel, initialPolygon, initialBounds }: RangeSelectorProps) {
  const [points, setPoints] = useState<LatLng[]>(() => getInitialPoints(initialPolygon, initialBounds))
  const [dockInset, setDockInset] = useState(134)
  const { location, error: geoError, loading: locating, retry } = useGeolocation({ automatic: false })
  const [locationView, setLocationView] = useState<LatLng | null>(null)
  const locationStatusId = useId()
  // Selection stays in the user's viewport as vertices change. A restored range
  // is fitted only when the map first mounts, including in selection mode.
  const initialView = useRef({
    center: userLocation ?? undefined,
    zoom,
    bounds: points.length ? getPolygonBounds(points) : null,
  })
  const dialogRef = useDialog(onCancel)
  const dockRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (location) setLocationView({ ...location })
  }, [location])

  const locate = () => {
    // Reapply the 100 m view on repeat clicks without changing drafted vertices.
    if (location) setLocationView({ ...location })
    retry(true)
  }

  useEffect(() => {
    const dock = dockRef.current
    if (!dock) return
    const updateInset = () => setDockInset(Math.ceil(dock.offsetHeight + (parseFloat(getComputedStyle(dock).bottom) || 24) + 12))
    const observer = new ResizeObserver(updateInset)
    observer.observe(dock)
    window.addEventListener('resize', updateInset)
    updateInset()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateInset)
    }
  }, [])

  const handlePointAdd = useCallback((point: LatLng) => {
    if (!isLatLng(point)) return
    setPoints(current => {
      if (current.length >= MAX_POLYGON_POINTS
        || current.some(existing => Math.abs(existing.lat - point.lat) <= 1e-7 && Math.abs(existing.lng - point.lng) <= 1e-7)) return current
      return [...current, { ...point }]
    })
  }, [])

  const valid = isPolygon(points)
  const error = points.length >= 3 && !valid
    ? '선이 교차하거나 한 줄로 이어졌어요. 마지막 점을 취소해 조정해주세요.'
    : null
  const instruction = points.length === 0
    ? '지도에 점을 3개 이상 찍어주세요. 끌어서 이동해요.'
    : points.length < 3
      ? `점 ${3 - points.length}개를 더 찍어주세요.`
      : points.length === MAX_POLYGON_POINTS
        ? '최대 50개예요. 되돌리기로 점을 바꿀 수 있어요.'
        : '끝점은 자동으로 연결돼요. 준비되면 지정하세요.'

  const confirmSelection = () => {
    if (isPolygon(points)) onConfirm(points.map(point => ({ ...point })))
  }

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="range-title" aria-describedby="range-instructions" tabIndex={-1} className="fixed inset-0 z-40 overflow-hidden bg-bg">
      <MapView center={locationView ?? initialView.current.center} zoom={locationView ? 15 : initialView.current.zoom} bounds={initialView.current.bounds} polygon={points} selecting onPointAdd={handlePointAdd} topInset={120} bottomInset={dockInset} className="absolute inset-0" />

      <HomeLink onClick={onCancel} />
      <button data-glass="control" type="button" onClick={locate} disabled={locating} aria-busy={locating} aria-label={locating ? '현재 위치 확인 중' : '내 위치로 이동'} aria-describedby={locating || geoError ? locationStatusId : undefined} title="내 위치로 이동" className="fixed right-[116px] top-[calc(env(safe-area-inset-top)+8px)] z-30 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/80 bg-white/95 text-text shadow-md backdrop-blur hover:bg-bg-secondary disabled:opacity-60">
        {locating ? <Loader2 size={19} className="animate-spin" aria-hidden="true" /> : <LocateFixed size={19} aria-hidden="true" />}
      </button>
      <DesignSettings className="fixed right-[64px] top-[calc(env(safe-area-inset-top)+8px)] z-30" />
      <header className="pointer-events-none absolute inset-x-3 top-[calc(env(safe-area-inset-top)+8px)] z-20 flex h-11 items-center justify-end gap-3">
        <h2 id="range-title" className="sr-only">점을 찍어 탐색 범위 지정</h2>
        <button data-glass="control" type="button" aria-label="범위 선택 닫기" onClick={onCancel} className="pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/80 bg-white/95 text-text shadow-md backdrop-blur hover:bg-bg-secondary"><X size={20} aria-hidden="true" /></button>
      </header>
      <CategoryBar category={category} onCategoryChange={onCategoryChange} className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+60px)] z-20" />
      <p id="range-instructions" className="sr-only">지도에서 원하는 경계를 순서대로 눌러 점을 추가하세요. 최소 3개, 최대 50개까지 선택할 수 있고 마지막 점은 첫 점과 자동으로 연결됩니다. 선이 교차하지 않는 범위를 만든 뒤 지정 버튼을 누르세요. 영역을 지정한 다음 뽑기 버튼을 눌러 장소를 추첨합니다. 지도를 끌어서 이동하거나 확대할 수 있습니다. 지도에 초점을 두면 방향키와 더하기, 빼기 키로 이동과 확대를 하고 Enter 또는 스페이스 키로 지도 중심에 점을 추가할 수 있습니다. 되돌리기는 마지막 점을 취소하고, 전체 지우기는 모든 점을 지워 다시 그립니다.</p>

      <div ref={dockRef} className="pointer-events-none absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+24px)] z-20 mx-auto max-w-md">
        <div data-glass="panel" className="pointer-events-auto rounded-2xl border border-white/80 bg-white/95 p-2 shadow-xl backdrop-blur">
          <div aria-live="polite" aria-atomic="true" className="mb-1.5 px-1 text-[11px] leading-4">
            <p className="font-semibold text-text">점 {points.length}/{MAX_POLYGON_POINTS} · {categoryLabels[category]}</p>
            {error ? <p role="alert" className="text-red-700">{error}</p> : <p className="text-text-light">{instruction}</p>}
            {(locating || geoError) && <p id={locationStatusId} role={geoError ? 'alert' : 'status'} className={geoError ? 'mt-1 text-amber-800' : 'mt-1 text-text-light'}>{locating ? '현재 위치를 확인하고 있어요. 찍어둔 점은 유지돼요.' : geoError}</p>}
          </div>
          <div className="flex gap-1.5">
            <button data-glass="action" data-glass-tone="accent" type="button" onClick={confirmSelection} disabled={!valid} className="flex h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-xl bg-primary-dark px-1 text-sm font-bold text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-gray-300">
              <Check size={17} className="shrink-0" aria-hidden="true" />지정
            </button>
            <button data-glass="action" type="button" aria-label="마지막 점 취소" title="마지막 점 취소" onClick={() => setPoints(current => current.slice(0, -1))} disabled={!points.length} className="flex h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-xl border border-border px-1 text-xs font-semibold text-text hover:bg-bg-secondary disabled:cursor-not-allowed disabled:opacity-40">
              <Undo2 size={16} className="shrink-0" aria-hidden="true" />되돌리기
            </button>
            <button data-glass="action" type="button" onClick={() => setPoints([])} disabled={!points.length} className="flex h-11 min-w-0 flex-1 items-center justify-center rounded-xl border border-border px-1 text-xs font-semibold text-text hover:bg-bg-secondary disabled:cursor-not-allowed disabled:opacity-40">전체 지우기</button>
          </div>
        </div>
      </div>
    </div>
  )
}
