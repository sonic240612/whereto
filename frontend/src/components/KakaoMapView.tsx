import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { loadKakaoMaps } from '../lib/kakao-sdk'
import { isBounds, isLatLng } from '../lib/validation'
import { constrainMapViewport, KAKAO_NAVIGATION_BOUNDS } from '../lib/map-navigation'
import type { LatLng, RectBounds } from '../types'
import { createVertexElement, getMapPadding, listenForMapTap, type MapViewProps } from './map-view-types'

const DEFAULT_CENTER: LatLng = { lat: 37.5665, lng: 126.978 }
const RECTANGLE_STYLE = { strokeColor: '#e05555', strokeWeight: 2, strokeOpacity: 1, fillColor: '#FF6B6B', fillOpacity: 0.15 }
const MARKER_HTML = '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44" aria-hidden="true"><path d="M18 42S2 27 2 18a16 16 0 1 1 32 0c0 9-16 24-16 24Z" fill="#e05555" stroke="white" stroke-width="3"/><circle cx="18" cy="18" r="6" fill="white"/></svg>'

type MapSession = { map: kakao.maps.Map; maps: typeof kakao.maps; disposed: boolean; stableCenter: kakao.maps.LatLng; maxLevel: number }
type ViewState = Pick<MapViewProps, 'center' | 'zoom' | 'bounds' | 'marker' | 'selecting' | 'topInset' | 'bottomInset'> & { session: MapSession; hasPolygon: boolean }

function toLevel(zoom = 15) {
  return Math.max(1, Math.min(14, Math.round(19 - (Number.isFinite(zoom) ? zoom : 15))))
}

function fromBounds(bounds: kakao.maps.LatLngBounds): RectBounds {
  const sw = bounds.getSouthWest()
  const ne = bounds.getNorthEast()
  return { minLat: sw.getLat(), maxLat: ne.getLat(), minLng: sw.getLng(), maxLng: ne.getLng() }
}

function samePoint(a?: LatLng | null, b?: LatLng | null) {
  return a?.lat === b?.lat && a?.lng === b?.lng
}

function sameBounds(a?: RectBounds | null, b?: RectBounds | null) {
  return a?.minLat === b?.minLat && a?.maxLat === b?.maxLat && a?.minLng === b?.minLng && a?.maxLng === b?.maxLng
}

export default function KakaoMapView({
  center, zoom, bounds, polygon, marker, onPointAdd, onViewportChange,
  selecting = false, className = '', topInset = 80, bottomInset = 0,
}: MapViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onPointAdd, onViewportChange })
  const initialView = useRef({ center, zoom })
  const previousView = useRef<ViewState | null>(null)
  const reframeRef = useRef<(() => void) | null>(null)
  const boundsRef = useRef<kakao.maps.Rectangle | null>(null)
  const markerRef = useRef<kakao.maps.CustomOverlay | null>(null)
  const polygonOverlaysRef = useRef<Array<kakao.maps.Polygon | kakao.maps.Polyline | kakao.maps.CustomOverlay>>([])
  const [session, setSession] = useState<MapSession | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [zoomState, setZoomState] = useState({ level: 4, maxLevel: 14 })
  const hasPolygon = polygon != null

  useEffect(() => {
    callbacks.current = { onPointAdd, onViewportChange }
    initialView.current = { center, zoom }
  }, [center, zoom, onPointAdd, onViewportChange])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let disposed = false
    let cleanup: (() => void) | undefined
    setSession(null)
    setError(null)
    void loadKakaoMaps().then((maps) => {
      if (disposed) return
      const initial = isLatLng(initialView.current.center) ? initialView.current.center : DEFAULT_CENTER
      const map = new maps.Map(host, {
        center: new maps.LatLng(initial.lat, initial.lng), level: toLevel(initialView.current.zoom),
        keyboardShortcuts: false, disableDoubleClickZoom: true, tileAnimation: false,
      })
      const next: MapSession = { map, maps, disposed: false, stableCenter: map.getCenter(), maxLevel: 14 }
      let correcting = false
      let viewportFrame = 0
      const navigation = KAKAO_NAVIGATION_BOUNDS
      const corners = [
        new maps.LatLng(navigation.maxLat, navigation.minLng), new maps.LatLng(navigation.maxLat, navigation.maxLng),
        new maps.LatLng(navigation.minLat, navigation.minLng), new maps.LatLng(navigation.minLat, navigation.maxLng),
      ]
      let observer: ResizeObserver | undefined
      let layoutWidth = host.clientWidth
      let layoutHeight = host.clientHeight
      const layoutChanged = () => host.clientWidth !== layoutWidth || host.clientHeight !== layoutHeight
      const publish = () => {
        if (next.disposed || layoutChanged() || correcting) return
        correcting = true
        try {
          const current = map.getCenter()
          const lat = Math.max(navigation.minLat, Math.min(navigation.maxLat, current.getLat()))
          const lng = Math.max(navigation.minLng, Math.min(navigation.maxLng, current.getLng()))
          if (lat !== current.getLat() || lng !== current.getLng()) map.setCenter(new maps.LatLng(lat, lng))
          for (let i = 0; i < 3; i++) {
            const level = map.getLevel()
            const projection = map.getProjection()
            const [nw, ne, sw, se] = corners.map(point => projection.containerPointFromCoords(point))
            const limits = constrainMapViewport({
              left: Math.max(nw.x, sw.x), right: Math.min(ne.x, se.x),
              top: Math.max(nw.y, ne.y), bottom: Math.min(sw.y, se.y),
            }, host.clientWidth, host.clientHeight, level)
            if (!limits) break
            if (next.maxLevel !== limits.maxLevel) {
              next.maxLevel = limits.maxLevel
              map.setMaxLevel(limits.maxLevel)
            }
            if (map.getLevel() !== level) continue
            if (map.getLevel() > limits.maxLevel) {
              map.setLevel(limits.maxLevel, { animate: false })
              continue
            }
            if (Math.abs(limits.dx) > 0.5 || Math.abs(limits.dy) > 0.5) {
              const middle = projection.containerPointFromCoords(map.getCenter())
              map.setCenter(projection.coordsFromContainerPoint(new maps.Point(middle.x + limits.dx, middle.y + limits.dy)))
            }
            break
          }
        } finally { correcting = false }
        const point = map.getCenter()
        next.stableCenter = point
        setZoomState(previous => previous.level === map.getLevel() && previous.maxLevel === next.maxLevel
          ? previous : { level: map.getLevel(), maxLevel: next.maxLevel })
        callbacks.current.onViewportChange?.({ lat: point.getLat(), lng: point.getLng() }, 19 - map.getLevel(), fromBounds(map.getBounds()))
      }
      // Kakao emits center_changed while processing its camera update. Correct
      // after that update so a nested setCenter cannot leave tiles out of sync.
      const schedulePublish = () => {
        if (next.disposed || correcting || viewportFrame) return
        viewportFrame = requestAnimationFrame(() => { viewportFrame = 0; publish() })
      }
      const imageError = (event: Event) => {
        if (!next.disposed && event.target instanceof HTMLImageElement) setError('카카오 지도 이미지를 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.')
      }
      cleanup = () => {
        if (next.disposed) return
        next.disposed = true
        observer?.disconnect()
        cancelAnimationFrame(viewportFrame)
        host.removeEventListener('error', imageError, true)
        maps.event.removeListener(map, 'idle', schedulePublish)
        maps.event.removeListener(map, 'center_changed', schedulePublish)
        maps.event.removeListener(map, 'zoom_changed', schedulePublish)
        map.setDraggable(false)
        map.setZoomable(false)
        map.setKeyboardShortcuts(false)
        boundsRef.current?.setMap(null)
        markerRef.current?.setMap(null)
        polygonOverlaysRef.current.forEach(overlay => overlay.setMap(null))
        polygonOverlaysRef.current = []
        boundsRef.current = null
        markerRef.current = null
        reframeRef.current = null
        previousView.current = null
        // Kakao has no public destroy method; release our listeners, overlays and DOM references.
        host.replaceChildren()
      }
      map.setMinLevel(1)
      map.setMaxLevel(14)
      map.setCopyrightPosition(maps.CopyrightPosition.BOTTOMLEFT, false)
      maps.event.addListener(map, 'idle', schedulePublish)
      // Programmatic setCenter/setLevel calls need not emit idle; also observe their camera events.
      maps.event.addListener(map, 'center_changed', schedulePublish)
      maps.event.addListener(map, 'zoom_changed', schedulePublish)
      host.addEventListener('error', imageError, true)
      observer = new ResizeObserver(() => {
        if (next.disposed || !layoutChanged()) return
        // getCenter() may already reflect the new DOM size; preserve the last settled center.
        const current = next.stableCenter
        map.relayout()
        map.setCenter(current)
        reframeRef.current?.()
        layoutWidth = host.clientWidth
        layoutHeight = host.clientHeight
        publish()
      })
      observer.observe(host)
      setSession(next)
      publish()
    }).catch((cause: unknown) => {
      if (!disposed) {
        cleanup?.()
        host.replaceChildren()
        setError(cause instanceof Error ? cause.message : '카카오 지도를 불러오지 못했습니다. 다시 시도해주세요.')
      }
    })
    return () => { disposed = true; cleanup?.() }
  }, [attempt])

  useEffect(() => {
    if (!session || session.disposed) return
    const { map, maps } = session
    const host = hostRef.current
    if (!host) return
    const previous = previousView.current
    const first = previous?.session !== session
    // A fresh center object is an explicit search/GPS navigation request, even
    // when its coordinates match the previous request. Ordinary viewport
    // updates retain the same object, so dragging still survives other renders.
    const changedCenter = first || previous?.center !== center
    const changedBounds = first || !sameBounds(previous?.bounds, bounds)
    const changedMarker = first || !samePoint(previous?.marker, marker)
    const changedInset = first || previous?.topInset !== topInset || previous?.bottomInset !== bottomInset
    const finishedDrawing = previous?.selecting && !selecting
    const toLatLng = (point: LatLng) => new maps.LatLng(point.lat, point.lng)
    const sdkBounds = isBounds(bounds) ? new maps.LatLngBounds(
      new maps.LatLng(bounds.minLat, bounds.minLng), new maps.LatLng(bounds.maxLat, bounds.maxLng),
    ) : null
    if (changedBounds || previous?.hasPolygon !== hasPolygon) {
      boundsRef.current?.setMap(null)
      boundsRef.current = sdkBounds && !hasPolygon ? new maps.Rectangle({ map, bounds: sdkBounds, ...RECTANGLE_STYLE }) : null
    }
    if (changedMarker) {
      markerRef.current?.setMap(null)
      markerRef.current = null
      if (isLatLng(marker)) {
        const content = document.createElement('div')
        content.setAttribute('role', 'img')
        content.setAttribute('aria-label', '선택한 목적지')
        content.style.pointerEvents = 'none'
        content.style.lineHeight = '0'
        content.innerHTML = MARKER_HTML
        markerRef.current = new maps.CustomOverlay({ map, position: toLatLng(marker), content, xAnchor: 0.5, yAnchor: 1, zIndex: 5 })
      }
    }
    if (changedCenter && isLatLng(center)) {
      // Keep an explicit search/GPS target even when it arrives during a pending resize.
      session.stableCenter = toLatLng(center)
      map.setCenter(session.stableCenter)
    }
    // Reapply an explicit zoom on every navigation request, including repeat GPS
    // clicks after manual zooming. An omitted zoom preserves the current scale.
    if (first || (Number.isFinite(zoom) && (changedCenter || previous?.zoom !== zoom))) {
      map.setLevel(toLevel(zoom), { animate: false })
    }
    const fitBounds = () => {
      if (!sdkBounds || session.disposed) return
      const safeTop = parseFloat(getComputedStyle(host).getPropertyValue('--map-safe-top')) || 0
      const padding = getMapPadding(host.clientHeight, topInset, bottomInset, isLatLng(marker), safeTop)
      map.setBounds(sdkBounds, padding.top, 24, padding.bottom, 24)
    }
    const frameMarker = () => {
      if (!isLatLng(marker) || session.disposed) return
      const projection = map.getProjection()
      const point = projection.containerPointFromCoords(toLatLng(marker))
      const height = host.clientHeight
      const safeTop = parseFloat(getComputedStyle(host).getPropertyValue('--map-safe-top')) || 0
      const padding = getMapPadding(height, topInset, bottomInset, true, safeTop)
      const targetY = Math.max(padding.top, Math.min(height / 2, height - padding.bottom))
      const offset = height / 2 - targetY
      map.setCenter(projection.coordsFromContainerPoint(new maps.Point(point.x, point.y + offset)))
    }
    if (sdkBounds && (first || (!selecting && (changedBounds || changedInset || finishedDrawing)))) fitBounds()
    else if (isLatLng(marker) && (changedMarker || changedCenter || changedInset)) frameMarker()
    reframeRef.current = () => {
      if (!selecting && sdkBounds) fitBounds()
      else if (isLatLng(marker)) frameMarker()
    }
    previousView.current = { session, center, zoom, bounds, marker, selecting, topInset, bottomInset, hasPolygon }
  }, [session, center, zoom, bounds, marker, selecting, topInset, bottomInset, hasPolygon])

  useEffect(() => {
    if (!session || session.disposed || !polygon?.every(isLatLng)) return
    const { map, maps } = session
    const path = polygon.map(point => new maps.LatLng(point.lat, point.lng))
    const overlays: Array<kakao.maps.Polygon | kakao.maps.Polyline | kakao.maps.CustomOverlay> = []
    if (path.length >= 3) overlays.push(new maps.Polygon({ map, path, ...RECTANGLE_STYLE }))
    else if (path.length === 2) overlays.push(new maps.Polyline({ map, path, strokeColor: '#e05555', strokeWeight: 2, strokeOpacity: 1 }))
    if (selecting || path.length < 3) {
      path.forEach((position, index) => overlays.push(new maps.CustomOverlay({
        map, position, content: createVertexElement(selecting ? index : undefined), xAnchor: 0.5, yAnchor: 0.5, zIndex: 4,
      })))
    }
    polygonOverlaysRef.current = overlays
    return () => {
      overlays.forEach(overlay => overlay.setMap(null))
      if (polygonOverlaysRef.current === overlays) polygonOverlaysRef.current = []
    }
  }, [session, polygon, selecting])

  useEffect(() => {
    if (!session || session.disposed) return
    const { map, maps } = session
    const host = hostRef.current
    if (!host) return
    map.setDraggable(true)
    map.setZoomable(true)
    map.setCursor(selecting ? 'crosshair' : 'grab')
    const addPoint = (latlng: kakao.maps.LatLng) => {
      const point = { lat: latlng.getLat(), lng: latlng.getLng() }
      if (!session.disposed && isLatLng(point)) callbacks.current.onPointAdd?.(point)
    }
    const tap = selecting ? listenForMapTap(host, (event) => {
      const rect = host.getBoundingClientRect()
      addPoint(map.getProjection().coordsFromContainerPoint(new maps.Point(event.clientX - rect.left, event.clientY - rect.top)))
    }) : null
    const keyboard = (event: KeyboardEvent) => {
      if (event.target !== host || event.altKey || event.ctrlKey || event.metaKey || session.disposed) return
      const offset = event.shiftKey ? 160 : 80
      const delta: Record<string, [number, number]> = { ArrowLeft: [-offset, 0], ArrowRight: [offset, 0], ArrowUp: [0, -offset], ArrowDown: [0, offset] }
      if (event.key === '+' || event.key === '=' || event.key === '-' || event.key === '−') {
        event.preventDefault()
        tap?.cancel()
        map.setLevel(Math.max(1, Math.min(session.maxLevel, map.getLevel() + (event.key === '-' || event.key === '−' ? 1 : -1))), { animate: false })
      } else if (delta[event.key]) {
        event.preventDefault()
        tap?.cancel()
        const [dx, dy] = delta[event.key]
        const projection = map.getProjection()
        const point = projection.containerPointFromCoords(map.getCenter())
        map.setCenter(projection.coordsFromContainerPoint(new maps.Point(point.x + dx, point.y + dy)))
      } else if (selecting && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault()
        event.stopPropagation()
        if (!event.repeat) addPoint(map.getCenter())
      }
    }
    host.addEventListener('keydown', keyboard)
    if (tap) {
      maps.event.addListener(map, 'dragstart', tap.cancel)
      maps.event.addListener(map, 'zoom_start', tap.cancel)
    }
    return () => {
      host.removeEventListener('keydown', keyboard)
      if (tap) {
        maps.event.removeListener(map, 'dragstart', tap.cancel)
        maps.event.removeListener(map, 'zoom_start', tap.cancel)
        tap.dispose()
      }
    }
  }, [session, selecting])

  const changeZoom = (difference: number) => {
    if (session && !session.disposed) session.map.setLevel(Math.max(1, Math.min(session.maxLevel, session.map.getLevel() + difference)), { animate: false })
  }
  const bannerTop = `min(calc(env(safe-area-inset-top, 0px) + ${Number.isFinite(topInset) ? Math.max(0, topInset) : 80}px), max(0px, calc(100% - 160px)))`
  return (
    <div className={`whereto-map h-full w-full bg-[#edf1ed] ${className}`} style={{ '--map-safe-top': 'env(safe-area-inset-top, 0px)' } as CSSProperties}>
      <div className="relative h-full w-full">
      <div ref={hostRef} tabIndex={0} role="region" aria-label={selecting ? '카카오 지도. 클릭해 꼭짓점 추가. 방향키로 이동하고 Enter 또는 Space로 중심점 추가' : '카카오 지도. 방향키로 이동하고 더하기와 빼기 키로 확대 또는 축소'} className="absolute inset-0 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-primary-dark" />
      {session && !error && <div data-glass="control" aria-label="지도 확대 및 축소" className="absolute right-3 z-10 flex flex-col overflow-hidden rounded-xl bg-white shadow-lg" style={{ bottom: `min(${Math.max(0, bottomInset) + 32}px, calc(100% - 176px))` }}>
        <button type="button" aria-label="지도 확대" disabled={zoomState.level <= 1} onClick={() => changeZoom(-1)} className="h-11 w-11 border-b border-border text-2xl text-text hover:bg-bg-secondary disabled:cursor-default disabled:opacity-35">+</button>
        <button type="button" aria-label="지도 축소" disabled={zoomState.level >= zoomState.maxLevel} onClick={() => changeZoom(1)} className="h-11 w-11 text-2xl text-text hover:bg-bg-secondary disabled:cursor-default disabled:opacity-35">−</button>
      </div>}
      {!session && !error && <div role="status" style={{ top: bannerTop }} className="pointer-events-none absolute inset-x-3 z-10 mx-auto max-w-sm rounded-xl bg-white/95 p-3 text-center text-sm text-text shadow">카카오 지도를 불러오는 중이에요.</div>}
      {error && <div role="alert" style={{ top: bannerTop, maxHeight: `max(0px, calc(100% - ${bannerTop} - 24px))` }} className="absolute inset-x-3 z-10 mx-auto max-w-sm overflow-y-auto rounded-xl bg-white p-3 text-sm text-text shadow-lg">
        <p>{error}</p>
        <button type="button" onClick={() => setAttempt(value => value + 1)} className="mt-2 min-h-11 font-bold text-primary-dark underline">카카오 지도 다시 불러오기</button>
      </div>}
      </div>
    </div>
  )
}
