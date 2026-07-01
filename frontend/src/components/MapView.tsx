import { useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng, RectBounds } from '../types'

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
const TILE_ATTR = '&copy; <a href="https://openstreetmap.org/copyright">OSM</a> | <a href="https://carto.com">CARTO</a>'
const TILE_SUBDOMAINS = 'abcd'

const DEFAULT_CENTER: [number, number] = [37.5665, 126.978]
const DEFAULT_ZOOM = 13

interface MapViewProps {
  center?: LatLng
  bounds?: RectBounds | null
  marker?: LatLng | null
  onBoundsChange?: (bounds: RectBounds) => void
  onMapLoad?: (map: any) => void
  selecting?: boolean
  className?: string
}

export default function MapView({
  center,
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
      zoom: DEFAULT_ZOOM,
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

    const mk = L.marker([marker.lat, marker.lng]).addTo(mapRef.current)
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
    let rect: L.Rectangle | null = null

    const onMouseDown = (e: L.LeafletMouseEvent) => {
      startPos = e.latlng
    }

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (!startPos) return
      if (rect) rect.remove()
      rect = L.rectangle([[startPos.lat, startPos.lng], [e.latlng.lat, e.latlng.lng]], {
        color: '#FF6B6B',
        weight: 2,
        fillColor: '#FF6B6B',
        fillOpacity: 0.15,
      }).addTo(map)
    }

    const onMouseUp = (e: L.LeafletMouseEvent) => {
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

    return () => {
      if (rect) rect.remove()
      map.off('mousedown', onMouseDown)
      map.off('mousemove', onMouseMove)
      map.off('mouseup', onMouseUp)
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
    />
  )
}
