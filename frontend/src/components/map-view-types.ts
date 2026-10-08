import type { LatLng, RectBounds } from '../types'

export interface MapViewProps {
  center?: LatLng
  zoom?: number
  bounds?: RectBounds | null
  polygon?: readonly LatLng[] | null
  marker?: LatLng | null
  onPointAdd?: (point: LatLng) => void
  onViewportChange?: (center: LatLng, zoom: number, bounds: RectBounds) => void
  selecting?: boolean
  className?: string
  topInset?: number
  bottomInset?: number
}

export function createVertexElement(index?: number) {
  const element = document.createElement('span')
  const numbered = index !== undefined
  element.setAttribute('aria-hidden', 'true')
  element.textContent = numbered ? String(index + 1) : ''
  element.style.cssText = `display:flex;align-items:center;justify-content:center;width:${numbered ? 22 : 8}px;height:${numbered ? 22 : 8}px;border:2px solid white;border-radius:50%;background:#e05555;color:white;font:bold 11px/1 sans-serif;box-shadow:0 1px 4px #172b4455;pointer-events:none;box-sizing:border-box`
  return element
}

// Observe gestures without capture/preventDefault so the map retains native drag and pinch zoom.
export function listenForMapTap(container: HTMLElement, onTap: (event: PointerEvent) => void) {
  const pointers = new Map<number, { x: number; y: number }>()
  let blocked = false
  const cancel = () => { blocked = true }
  const down = (event: PointerEvent) => {
    if (!pointers.size) blocked = false
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest('a,button,input,select,[role="button"],.leaflet-control'))) {
      blocked = true
      return
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.size > 1) blocked = true
  }
  const move = (event: PointerEvent) => {
    const start = pointers.get(event.pointerId)
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 6) blocked = true
  }
  const up = (event: PointerEvent) => {
    const start = pointers.get(event.pointerId)
    move(event)
    pointers.delete(event.pointerId)
    if (!start || blocked || pointers.size) return
    const rect = container.getBoundingClientRect()
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return
    container.focus({ preventScroll: true })
    onTap(event)
  }
  const cancelled = (event: PointerEvent) => { blocked = true; pointers.delete(event.pointerId) }
  const blur = () => { blocked = true; pointers.clear() }
  const options = { capture: true, passive: true }
  container.addEventListener('pointerdown', down, options)
  window.addEventListener('pointermove', move, options)
  window.addEventListener('pointerup', up, options)
  window.addEventListener('pointercancel', cancelled, options)
  window.addEventListener('blur', blur)
  return {
    cancel,
    dispose: () => {
      container.removeEventListener('pointerdown', down, options)
      window.removeEventListener('pointermove', move, options)
      window.removeEventListener('pointerup', up, options)
      window.removeEventListener('pointercancel', cancelled, options)
      window.removeEventListener('blur', blur)
      pointers.clear()
    },
  }
}

export function getMapPadding(height: number, topInset: number, bottomInset: number, hasMarker = false, safeAreaTop = 0) {
  const mapHeight = Number.isFinite(height) ? Math.max(0, height) : 0
  const availablePadding = Math.max(0, mapHeight - 96)
  const header = (Number.isFinite(topInset) ? Math.max(0, topInset) : 80) + (Number.isFinite(safeAreaTop) ? Math.max(0, safeAreaTop) : 0)
  const dock = Number.isFinite(bottomInset) ? Math.max(0, bottomInset) : 0
  // Leave usable map space even in landscape, and keep the full 44px marker below the header.
  const top = Math.min(header + (hasMarker ? 44 : 0), availablePadding)
  const bottom = Math.min(dock + 24, Math.max(0, availablePadding - top))
  return { top, bottom }
}
