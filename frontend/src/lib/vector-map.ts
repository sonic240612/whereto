import { maplibreGL } from '@maplibre/maplibre-gl-leaflet'
import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import type L from 'leaflet'

setWorkerUrl(workerUrl)

const STYLE_URL = import.meta.env.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/bright'
const ATTRIBUTION = '<a href="https://openfreemap.org/">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

export function addVectorMap(map: L.Map, onError: () => void) {
  // Probe before adding the Leaflet adapter so unsupported GPUs never leave a partial layer.
  const context = document.createElement('canvas').getContext('webgl2')
  if (!context) throw new Error('WebGL2 unavailable')
  context.getExtension('WEBGL_lose_context')?.loseContext()

  const layer = maplibreGL({
    style: STYLE_URL,
    attributionControl: { customAttribution: import.meta.env.VITE_MAP_ATTRIBUTION || ATTRIBUTION },
    renderWorldCopies: false,
  })
  const getAdapterEvents = layer.getEvents?.bind(layer)
  layer.getEvents = () => {
    const events = getAdapterEvents?.() ?? {}
    return {
      ...events,
      // The adapter queues an uncancelled transition RAF on resize, even with zoomAnimation off.
      // Resize synchronously so removing the layer cannot leave a callback reading its cleared map.
      resize: (event) => {
        const size = layer.getSize()
        const container = layer.getContainer()
        container.style.width = `${size.x}px`
        container.style.height = `${size.y}px`
        layer.getMaplibreMap().resize()
        // Reuse the adapter's synchronous transform/position/center/zoom synchronization.
        events.zoomend?.call(layer, event)
      },
    }
  }
  try {
    layer.addTo(map)
  } catch (error) {
    // Leaflet registers a layer before calling onAdd; handle partially constructed GL maps.
    layer.onRemove = () => {
      layer.getMaplibreMap()?.remove()
      layer.getContainer()?.remove()
      return layer
    }
    layer.remove()
    throw error
  }
  const vectorMap = layer.getMaplibreMap()
  const localize = () => {
    // Only localize the known default schema; custom providers own their style and labels.
    if (import.meta.env.VITE_MAP_STYLE_URL) return
    for (const entry of vectorMap.getStyle().layers) {
      if (entry.type !== 'symbol' || !entry.layout?.['text-field']) continue
      const text = JSON.stringify(entry.layout['text-field'])
      if (!text.includes('"name')) continue // Preserve road numbers and other non-name labels.
      vectorMap.setLayoutProperty(entry.id, 'text-field', [
        'coalesce', ['get', 'name:ko'], ['get', 'name'], ['get', 'name:nonlatin'], ['get', 'name:latin'],
      ])
      const fonts = entry.layout['text-font']
      if (Array.isArray(fonts)) {
        const fontNames = fonts.flatMap(font => typeof font === 'string' ? [font.replace('Italic', 'Regular')] : [])
        if (fontNames.length === fonts.length) vectorMap.setLayoutProperty(entry.id, 'text-font', fontNames)
      }
      vectorMap.setLayoutProperty(entry.id, 'text-letter-spacing', 0)
    }
  }
  vectorMap.on('style.load', localize)
  vectorMap.on('error', onError)
  return () => {
    vectorMap.off('style.load', localize)
    vectorMap.off('error', onError)
    layer.remove()
  }
}
