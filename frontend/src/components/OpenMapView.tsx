import { useEffect, useRef, useState, type CSSProperties } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { isBounds, isLatLng } from '../lib/validation'
import type { LatLng, RectBounds } from '../types'
import { createVertexElement, getMapPadding, listenForMapTap, type MapViewProps } from './map-view-types'

const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTR = (import.meta.env.VITE_MAP_TILE_URL && import.meta.env.VITE_MAP_ATTRIBUTION) || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const DEFAULT_CENTER: LatLng = { lat: 37.5665, lng: 126.978 }
const DEFAULT_ZOOM = 15
const RECTANGLE_STYLE = { color: '#e05555', weight: 2, fillColor: '#FF6B6B', fillOpacity: 0.15, interactive: false }

const customIcon = L.divIcon({
  className: 'whereto-marker',
  html: '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44" aria-hidden="true"><path d="M18 42S2 27 2 18a16 16 0 1 1 32 0c0 9-16 24-16 24Z" fill="#e05555" stroke="white" stroke-width="3"/><circle cx="18" cy="18" r="6" fill="white"/></svg>',
  iconSize: [36, 44],
  iconAnchor: [18, 42],
  popupAnchor: [0, -42],
})

interface OpenMapViewProps extends MapViewProps {
  onMapLoad?: (map: L.Map) => void
}

function toRectBounds(bounds: L.LatLngBounds): RectBounds {
  return {
    minLat: bounds.getSouth(), maxLat: bounds.getNorth(),
    minLng: bounds.getWest(), maxLng: bounds.getEast(),
  }
}

export default function MapView({
  center, zoom, bounds, polygon, marker, onPointAdd, onMapLoad, onViewportChange,
  selecting = false, className = '', topInset = 80, bottomInset = 0,
}: OpenMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const reloadRef = useRef<((raster?: boolean) => void) | null>(null)
  const boundsRef = useRef<L.Rectangle | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const initialFitMapRef = useRef<L.Map | null>(null)
  const initialView = useRef({ center, zoom })
  const callbacks = useRef({ onPointAdd, onMapLoad, onViewportChange })
  const [tileError, setTileError] = useState(false)
  const [fallback, setFallback] = useState(false)
  const hasMarker = isLatLng(marker)
  const hasPolygon = polygon != null

  useEffect(() => {
    callbacks.current = { onPointAdd, onMapLoad, onViewportChange }
  }, [onPointAdd, onMapLoad, onViewportChange])

  useEffect(() => {
    if (!containerRef.current) return
    const initialCenter = isLatLng(initialView.current.center) ? initialView.current.center : DEFAULT_CENTER
    const initialZoom = Number.isFinite(initialView.current.zoom) ? initialView.current.zoom : DEFAULT_ZOOM
    const map = L.map(containerRef.current, {
      center: [initialCenter.lat, initialCenter.lng],
      zoom: initialZoom,
      minZoom: 3,
      maxZoom: 19,
      zoomControl: true,
      zoomSnap: 0.5,
      // The adapter's zoom-transition RAF can outlive a removed map. Direct zoom keeps teardown safe.
      zoomAnimation: false,
      markerZoomAnimation: false,
      maxBounds: [[-85, -180], [85, 180]],
      maxBoundsViscosity: 1,
      attributionControl: false,
    })
    map.zoomControl.setPosition('bottomright')
    L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map)
    mapRef.current = map
    let disposed = false
    let generation = 0
    let removeBaseMap: (() => void) | undefined
    const loadBaseMap = async (raster = false) => {
      const currentGeneration = ++generation
      removeBaseMap?.()
      removeBaseMap = undefined
      setTileError(false)
      setFallback(raster && !import.meta.env.VITE_MAP_TILE_URL)
      const showError = () => { if (!disposed && currentGeneration === generation) setTileError(true) }
      const addRaster = () => {
        const tiles = L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19, noWrap: true })
        tiles.on('tileerror', showError).addTo(map)
        removeBaseMap = () => { tiles.off('tileerror', showError); tiles.remove() }
      }
      if (raster || import.meta.env.VITE_MAP_TILE_URL) { addRaster(); return }
      try {
        const { addVectorMap } = await import('../lib/vector-map')
        if (disposed || currentGeneration !== generation) return
        removeBaseMap = addVectorMap(map, showError)
      } catch {
        if (disposed || currentGeneration !== generation) return
        setFallback(true)
        addRaster()
      }
    }
    reloadRef.current = (raster) => { void loadBaseMap(raster) }
    void loadBaseMap()

    const publishViewport = () => {
      const current = map.getCenter()
      callbacks.current.onViewportChange?.({ lat: current.lat, lng: current.lng }, map.getZoom(), toRectBounds(map.getBounds()))
    }
    map.on('moveend zoomend', publishViewport)
    callbacks.current.onMapLoad?.(map)
    publishViewport()
    const resizeObserver = new ResizeObserver(() => map.invalidateSize())
    resizeObserver.observe(containerRef.current)

    return () => {
      disposed = true
      resizeObserver.disconnect()
      removeBaseMap?.()
      map.off('moveend zoomend', publishViewport)
      map.remove()
      mapRef.current = null
      reloadRef.current = null
      boundsRef.current = null
      markerRef.current = null
      initialFitMapRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!mapRef.current || !isLatLng(center)) return
    mapRef.current.setView([center.lat, center.lng], Number.isFinite(zoom) ? zoom : mapRef.current.getZoom())
  }, [center, zoom])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markerRef.current?.remove()
    markerRef.current = null
    if (!isLatLng(marker)) return
    markerRef.current = L.marker([marker.lat, marker.lng], { icon: customIcon, title: '선택한 목적지', alt: '선택한 목적지' }).addTo(map)
    const frame = () => {
      const point = map.project([marker.lat, marker.lng], map.getZoom())
      const height = map.getSize().y
      const safeTop = parseFloat(getComputedStyle(map.getContainer()).getPropertyValue('--map-safe-top')) || 0
      const padding = getMapPadding(height, topInset, bottomInset, true, safeTop)
      const targetY = Math.max(padding.top, Math.min(height / 2, height - padding.bottom))
      map.panTo(map.unproject(point.add([0, height / 2 - targetY]), map.getZoom()), { animate: false })
    }
    frame()
    map.on('resize', frame)
    return () => { map.off('resize', frame) }
  }, [marker, topInset, bottomInset])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !selecting) return
    const container = map.getContainer()
    const doubleClickZoom = map.doubleClickZoom.enabled()
    map.doubleClickZoom.disable()
    const addPoint = (latlng: L.LatLng) => {
      const point = { lat: latlng.lat, lng: latlng.lng }
      if (mapRef.current === map && isLatLng(point)) callbacks.current.onPointAdd?.(point)
    }
    const tap = listenForMapTap(container, event => addPoint(map.mouseEventToLatLng(event)))
    const keyboard = (event: KeyboardEvent) => {
      if (event.target !== container || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        event.stopPropagation()
        if (!event.repeat) addPoint(map.getCenter())
      }
    }
    container.addEventListener('keydown', keyboard)
    map.on('dragstart zoomstart', tap.cancel)
    return () => {
      tap.dispose()
      container.removeEventListener('keydown', keyboard)
      map.off('dragstart zoomstart', tap.cancel)
      if (mapRef.current === map && doubleClickZoom) map.doubleClickZoom.enable()
    }
  }, [selecting])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !polygon?.every(isLatLng)) return
    const points = polygon.map(point => L.latLng(point.lat, point.lng))
    const layers = L.layerGroup().addTo(map)
    if (points.length >= 3) layers.addLayer(L.polygon(points, RECTANGLE_STYLE))
    else if (points.length === 2) layers.addLayer(L.polyline(points, RECTANGLE_STYLE))
    if (selecting || points.length < 3) {
      points.forEach((point, index) => {
        const size = selecting ? 22 : 8
        layers.addLayer(L.marker(point, {
          icon: L.divIcon({ className: '', html: createVertexElement(selecting ? index : undefined), iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
          interactive: false, keyboard: false,
        }))
      })
    }
    return () => { layers.remove() }
  }, [polygon, selecting])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const first = initialFitMapRef.current !== map
    initialFitMapRef.current = map
    boundsRef.current?.remove()
    boundsRef.current = null
    if (!isBounds(bounds)) return
    const rectangle = L.latLngBounds([bounds.minLat, bounds.minLng], [bounds.maxLat, bounds.maxLng])
    if (!hasPolygon) boundsRef.current = L.rectangle(rectangle, RECTANGLE_STYLE).addTo(map)
    if (selecting && !first) return
    const fit = () => {
      const safeTop = parseFloat(getComputedStyle(map.getContainer()).getPropertyValue('--map-safe-top')) || 0
      const padding = getMapPadding(map.getSize().y, topInset, bottomInset, hasMarker, safeTop)
      map.fitBounds(rectangle, {
        paddingTopLeft: [24, padding.top],
        paddingBottomRight: [24, padding.bottom],
        maxZoom: 17,
        animate: false,
      })
    }
    fit()
    if (selecting) return
    map.on('resize', fit)
    return () => { map.off('resize', fit) }
  }, [bounds, selecting, hasMarker, hasPolygon, topInset, bottomInset])

  const bannerTop = `min(calc(env(safe-area-inset-top, 0px) + ${Number.isFinite(topInset) ? Math.max(0, topInset) : 80}px), max(0px, calc(100% - 160px)))`
  return (
    <div className={`whereto-map w-full h-full z-0 ${className}`} style={{ '--map-bottom-inset': `${bottomInset}px`, '--map-safe-top': 'env(safe-area-inset-top, 0px)' } as CSSProperties}>
      <div className="relative w-full h-full">
        <div ref={containerRef} style={{ cursor: selecting ? 'crosshair' : undefined }} className="absolute inset-0" aria-label={selecting ? '지도. 클릭해 꼭짓점 추가. 방향키로 이동하고 Enter 또는 Space로 중심점 추가' : '지도. 방향키로 이동하고 더하기와 빼기 키로 확대 또는 축소'} />
        {tileError && (
          <div role="alert" style={{ top: bannerTop, maxHeight: `max(0px, calc(100% - ${bannerTop} - 24px))` }} className="absolute left-3 right-3 z-[1000] mx-auto max-w-sm overflow-y-auto rounded-xl bg-white p-3 shadow-lg text-sm text-text">
            <p>지도를 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.</p>
            <button type="button" className="mt-2 min-h-11 font-bold text-primary-dark underline" onClick={() => reloadRef.current?.()}>
              지도 다시 불러오기
            </button>
            {!fallback && <button type="button" className="ml-4 min-h-11 underline" onClick={() => reloadRef.current?.(true)}>기본 지도 사용</button>}
          </div>
        )}
        {fallback && !tileError && <div role="status" style={{ top: bannerTop }} className="absolute left-3 z-[1000] max-w-[calc(100%-5rem)] rounded-xl bg-white/95 px-3 py-1 shadow text-xs text-text-light">기본 지도 표시 중 <button type="button" className="ml-2 min-h-9 text-primary-dark underline" onClick={() => reloadRef.current?.()}>벡터 지도 재시도</button></div>}
      </div>
    </div>
  )
}
