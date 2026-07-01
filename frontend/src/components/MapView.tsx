import { useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng, RectBounds } from '../types'

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
const TILE_ATTR = '&copy; <a href="https://openstreetmap.org/copyright">OSM</a> | <a href="https://carto.com">CARTO</a>'
const TILE_SUBDOMAINS = 'abcd'

const DEFAULT_CENTER: [number, number] = [37.5665, 126.978]
const DEFAULT_ZOOM = 13

const customIcon = L.icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
})

interface MapViewProps {
  center?: LatLng
  zoom?: number
  bounds?: RectBounds | null
  marker?: LatLng | null
  onBoundsChange?: (bounds: RectBounds) => void
  onMapLoad?: (map: any) => void
  selecting?: boolean
  className?: string
}

export default function MapView({
  center,
  zoom,
  bounds,
  marker,
  onBoundsChange,
  onMapLoad,
  selecting = false,
  className = '',
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const drawingRef = useRef<L.Rectangle | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const initializedRef = useRef(false)

  const initMap = useCallback(() => {
    if (!containerRef.current || initializedRef.current) return
    initializedRef.current = true

    const map = L.map(containerRef.current, {
      center: [center?.lat ?? DEFAULT_CENTER[0], center?.lng ?? DEFAULT_CENTER[1]],
      zoom: zoom ?? DEFAULT_ZOOM,
      zoomControl: true,
      zoomSnap: 0.5,
      attributionControl: false,
    })
    map.zoomControl?.setPosition('bottomright')
    L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map)

    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, subdomains: TILE_SUBDOMAINS }).addTo(map)

    mapRef.current = map
    onMapLoad?.(map)
  }, [center, onMapLoad])

  useEffect(() => {
    initMap()
  }, [initMap])

  useEffect(() => {
    if (!mapRef.current || !center) return
    mapRef.current.setView([center.lat, center.lng])
  }, [center?.lat, center?.lng])

  useEffect(() => {
    if (!mapRef.current) return

    if (markerRef.current) {
      markerRef.current.remove()
      markerRef.current = null
    }

    if (!marker) return

    const mk = L.marker([marker.lat, marker.lng], { icon: customIcon }).addTo(mapRef.current)
    markerRef.current = mk
    mapRef.current.setView([marker.lat, marker.lng])
  }, [marker?.lat, marker?.lng])

  useEffect(() => {
    if (!mapRef.current || !selecting) return

    const map = mapRef.current
    map.dragging.disable()
    map.doubleClickZoom.disable()
    map.boxZoom.disable()

    if (drawingRef.current) {
      drawingRef.current.remove()
      drawingRef.current = null
    }

    if (!onBoundsChange) return

    let startPos: L.LatLng | null = null

    const onMouseDown = (e: any) => {
      startPos = e.latlng
    }
    const onMouseMove = (e: any) => {
      if (!startPos) return
      if (drawingRef.current) drawingRef.current.remove()
      drawingRef.current = L.rectangle([[startPos.lat, startPos.lng], [e.latlng.lat, e.latlng.lng]], {
        color: '#FF6B6B',
        weight: 2,
        fillColor: '#FF6B6B',
        fillOpacity: 0.15,
      }).addTo(map)
    }
    const onMouseUp = (e: any) => {
      if (!startPos) return
      const swLat = Math.min(startPos.lat, e.latlng.lat)
      const swLng = Math.min(startPos.lng, e.latlng.lng)
      const neLat = Math.max(startPos.lat, e.latlng.lat)
      const neLng = Math.max(startPos.lng, e.latlng.lng)
      onBoundsChange({ minLat: swLat, maxLat: neLat, minLng: swLng, maxLng: neLng })
      startPos = null
    }

    map.on('mousedown', onMouseDown)
    map.on('mousemove', onMouseMove)
    map.on('mouseup', onMouseUp)

    const container = map.getContainer()
    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      const rect = container.getBoundingClientRect()
      const point = L.point(touch.clientX - rect.left, touch.clientY - rect.top)
      startPos = map.containerPointToLatLng(point)
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!startPos) return
      e.preventDefault()
      const touch = e.touches[0]
      const rect = container.getBoundingClientRect()
      const point = L.point(touch.clientX - rect.left, touch.clientY - rect.top)
      const latlng = map.containerPointToLatLng(point)
      if (drawingRef.current) drawingRef.current.remove()
      drawingRef.current = L.rectangle([[startPos.lat, startPos.lng], [latlng.lat, latlng.lng]], {
        color: '#FF6B6B',
        weight: 2,
        fillColor: '#FF6B6B',
        fillOpacity: 0.15,
      }).addTo(map)
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (!startPos) return
      const touch = e.changedTouches[0]
      const rect = container.getBoundingClientRect()
      const point = L.point(touch.clientX - rect.left, touch.clientY - rect.top)
      const latlng = map.containerPointToLatLng(point)
      const swLat = Math.min(startPos.lat, latlng.lat)
      const swLng = Math.min(startPos.lng, latlng.lng)
      const neLat = Math.max(startPos.lat, latlng.lat)
      const neLng = Math.max(startPos.lng, latlng.lng)
      onBoundsChange({ minLat: swLat, maxLat: neLat, minLng: swLng, maxLng: neLng })
      startPos = null
    }

    container.addEventListener('touchstart', onTouchStart, { passive: false })
    container.addEventListener('touchmove', onTouchMove, { passive: false })
    container.addEventListener('touchend', onTouchEnd)

    return () => {
      if (drawingRef.current) drawingRef.current.remove()
      map.off('mousedown', onMouseDown)
      map.off('mousemove', onMouseMove)
      map.off('mouseup', onMouseUp)
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchmove', onTouchMove)
      container.removeEventListener('touchend', onTouchEnd)
      map.dragging.enable()
      map.doubleClickZoom.enable()
      map.boxZoom.enable()
    }
  }, [selecting, onBoundsChange])

  useEffect(() => {
    if (!mapRef.current || !bounds || selecting) return

    if (drawingRef.current) {
      drawingRef.current.remove()
    }

    drawingRef.current = L.rectangle(
      [[bounds.minLat, bounds.minLng], [bounds.maxLat, bounds.maxLng]],
      { color: '#FF6B6B', weight: 2, fillColor: '#FF6B6B', fillOpacity: 0.15 },
    ).addTo(mapRef.current)

    mapRef.current.fitBounds(
      L.latLngBounds(
        L.latLng(bounds.minLat, bounds.minLng),
        L.latLng(bounds.maxLat, bounds.maxLng),
      ),
    )
  }, [bounds, selecting])

  useEffect(() => {
    if (onMapLoad && mapRef.current) {
      onMapLoad(mapRef.current)
    }
  }, [onMapLoad])

  return (
    <div
      ref={containerRef}
      className={`w-full h-full z-0 ${selecting ? 'cursor-crosshair' : 'cursor-default'} ${className}`}
      style={{ touchAction: 'none' }}
    />
  )
}
