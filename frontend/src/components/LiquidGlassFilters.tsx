import { useEffect, useId, useRef } from 'react'
import { glassGeometry, glassGeometryKey, glassNormalMap, glassScales, supportsGlassSvg, type GlassGeometry } from '../lib/glass-optics'

const SVG_NS = 'http://www.w3.org/2000/svg'
const selector = ['control', 'panel', 'accent', 'category', 'lens', 'toggle'].map(value => `[data-glass="${value}"]`).join(',')
const CACHE_LIMIT = 32
const REGENERATE_INTERVAL = 120

interface Surface {
  element: HTMLElement
  visible: boolean
  originalFilter: string
  originalPriority: string
  originalStatus: string | null
  filter: SVGFilterElement | null
  image: SVGFEImageElement | null
  displacement: SVGFEDisplacementMapElement[]
  geometry: GlassGeometry | null
  key: string
  lastRaster: number
  timer: number
}

function svgElement<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value))
  return element
}

function normalMapUrl(geometry: GlassGeometry): string {
  const canvas = document.createElement('canvas')
  canvas.width = geometry.rasterWidth
  canvas.height = geometry.rasterHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable')
  const image = context.createImageData(canvas.width, canvas.height)
  image.data.set(glassNormalMap(geometry))
  context.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}

function measuredRadius(element: HTMLElement, width: number, height: number): number {
  const radius = getComputedStyle(element).borderTopLeftRadius
  return radius.includes('%') ? parseFloat(radius) / 100 * Math.min(width, height) : parseFloat(radius)
}

/** The only image generated here contains surface normals. SourceGraphic is
 * the browser's live backdrop, supplied by CSS backdrop-filter on ::before. */
export default function LiquidGlassFilters({ enabled = true }: { enabled?: boolean }) {
  const prefix = `glass-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const defsRef = useRef<SVGDefsElement>(null)

  useEffect(() => {
    const defs = defsRef.current
    if (!enabled || !defs) return
    const supported = supportsGlassSvg(navigator.userAgent, CSS.supports('backdrop-filter', 'url("#glass-support")'))
    const surfaces = new Map<HTMLElement, Surface>()
    const pending = new Set<Surface>()
    const cache = new Map<string, string>()
    let frame = 0
    let sequence = 0
    let disposed = false

    const blur = (surface: Surface) => {
      // An explicit neutral value prevents a nested lens inheriting its rail's
      // differently sized SVG filter before its own filter is ready.
      surface.element.style.setProperty('--glass-filter', 'blur(0px)')
      surface.element.setAttribute('data-glass-optics', 'blur')
    }
    const releaseFilter = (surface: Surface) => {
      surface.filter?.remove()
      surface.filter = null
      surface.image = null
      surface.displacement = []
      surface.geometry = null
      surface.key = ''
      clearTimeout(surface.timer)
      surface.timer = 0
      pending.delete(surface)
      blur(surface)
    }
    const updatePressure = (surface: Surface) => {
      if (!surface.geometry) return
      const scales = glassScales(surface.geometry, Number(surface.element.getAttribute('data-glass-pressure') ?? 0))
      surface.displacement.forEach((node, index) => node.setAttribute('scale', scales[index].toFixed(3)))
    }
    const cachedMap = (geometry: GlassGeometry, key: string) => {
      const previous = cache.get(key)
      if (previous) {
        cache.delete(key)
        cache.set(key, previous)
        return previous
      }
      const url = normalMapUrl(geometry)
      cache.set(key, url)
      if (cache.size > CACHE_LIMIT) {
        const oldest = cache.keys().next().value
        if (oldest !== undefined) cache.delete(oldest)
      }
      return url
    }
    const buildFilter = (surface: Surface, geometry: GlassGeometry, url: string) => {
      const id = `${prefix}-${++sequence}`
      const filter = svgElement('filter', {
        id, x: 0, y: 0, width: geometry.width, height: geometry.height,
        filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB',
      })
      const mapImage = svgElement('feImage', {
        href: url, x: 0, y: 0, width: geometry.width, height: geometry.height,
        preserveAspectRatio: 'none', result: 'normal-map',
      })
      filter.append(mapImage)
      const displacement: SVGFEDisplacementMapElement[] = []
      for (const [index, channel] of ['red', 'green', 'blue'].entries()) {
        const shift = svgElement('feDisplacementMap', {
          in: 'SourceGraphic', in2: 'normal-map', xChannelSelector: 'R', yChannelSelector: 'G',
          scale: 0, result: `${channel}-shift`,
        })
        displacement.push(shift)
        filter.append(shift)
        // Keep one channel from each displaced live backdrop. Arithmetic
        // addition combines channels; feMerge would paint opaque black over them.
        const matrix = Array.from({ length: 20 }, (_, position) => position === 18 || position === index * 6 ? 1 : 0)
        filter.append(svgElement('feColorMatrix', {
          in: `${channel}-shift`, type: 'matrix', values: matrix.join(' '), result: channel,
        }))
      }
      filter.append(svgElement('feComposite', { in: 'red', in2: 'green', operator: 'arithmetic', k1: 0, k2: 1, k3: 1, k4: 0, result: 'red-green' }))
      filter.append(svgElement('feComposite', { in: 'red-green', in2: 'blue', operator: 'arithmetic', k1: 0, k2: 1, k3: 1, k4: 0 }))
      defs.append(filter)
      surface.filter = filter
      surface.image = mapImage
      surface.displacement = displacement
      surface.element.style.setProperty('--glass-filter', `url("#${id}")`)
      surface.element.setAttribute('data-glass-optics', 'svg')
    }

    const queue = (surface: Surface) => {
      if (disposed || !supported || !surface.visible) return
      pending.add(surface)
      if (!frame) frame = requestAnimationFrame(flush)
    }
    const measure = (surface: Surface) => {
      const { element } = surface
      if (!element.isConnected || !surface.visible) return
      // Layout dimensions ignore the interaction's scale/translation transform.
      const width = element.offsetWidth
      const height = element.offsetHeight
      if (!width || !height) { releaseFilter(surface); return }
      const geometry = glassGeometry(width, height, measuredRadius(element, width, height))
      const key = glassGeometryKey(geometry)
      // Stretch an existing map while the selected pill's width springs. This
      // keeps the filter region in sync without rasterizing on every frame.
      surface.filter?.setAttribute('width', String(width))
      surface.filter?.setAttribute('height', String(height))
      surface.image?.setAttribute('width', String(width))
      surface.image?.setAttribute('height', String(height))
      if (key === surface.key) return
      const elapsed = performance.now() - surface.lastRaster
      if (surface.filter && elapsed < REGENERATE_INTERVAL) {
        if (!surface.timer) surface.timer = window.setTimeout(() => {
          surface.timer = 0
          queue(surface)
        }, REGENERATE_INTERVAL - elapsed)
        return
      }
      try {
        const url = cachedMap(geometry, key)
        if (!surface.filter) buildFilter(surface, geometry, url)
        else surface.image?.setAttribute('href', url)
        surface.geometry = geometry
        surface.key = key
        surface.lastRaster = performance.now()
        updatePressure(surface)
      } catch {
        // A disabled canvas or implementation failure retains the CSS blur.
        releaseFilter(surface)
      }
    }
    function flush() {
      frame = 0
      let count = 0
      for (const surface of pending) {
        pending.delete(surface)
        measure(surface)
        if (++count === 4) break
      }
      if (pending.size && !disposed) frame = requestAnimationFrame(flush)
    }

    const resize = new ResizeObserver(entries => {
      for (const entry of entries) {
        const surface = surfaces.get(entry.target as HTMLElement)
        if (surface) queue(surface)
      }
    })
    const visibility = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const surface = surfaces.get(entry.target as HTMLElement)
        if (!surface) continue
        surface.visible = entry.isIntersecting
        if (surface.visible) queue(surface)
        else releaseFilter(surface)
      }
    })
    const unregister = (surface: Surface) => {
      resize.unobserve(surface.element)
      visibility.unobserve(surface.element)
      releaseFilter(surface)
      if (surface.originalFilter) surface.element.style.setProperty('--glass-filter', surface.originalFilter, surface.originalPriority)
      else surface.element.style.removeProperty('--glass-filter')
      if (surface.originalStatus === null) surface.element.removeAttribute('data-glass-optics')
      else surface.element.setAttribute('data-glass-optics', surface.originalStatus)
      surfaces.delete(surface.element)
    }
    const register = (element: HTMLElement) => {
      if (surfaces.has(element) || !element.matches(selector)) return
      const surface: Surface = {
        element, visible: false, originalFilter: element.style.getPropertyValue('--glass-filter'),
        originalPriority: element.style.getPropertyPriority('--glass-filter'), originalStatus: element.getAttribute('data-glass-optics'),
        filter: null, image: null, displacement: [], geometry: null, key: '', lastRaster: 0, timer: 0,
      }
      surfaces.set(element, surface)
      blur(surface)
      if (supported) {
        resize.observe(element, { box: 'border-box' })
        visibility.observe(element)
      }
    }
    const discover = (node: Node) => {
      if (!(node instanceof Element) || defs.contains(node)) return
      if (node instanceof HTMLElement && node.matches(selector)) register(node)
      node.querySelectorAll<HTMLElement>(selector).forEach(register)
    }
    const mutations = new MutationObserver(records => {
      let removed = false
      for (const record of records) {
        if (defs.contains(record.target)) continue
        if (record.type === 'childList') {
          record.addedNodes.forEach(discover)
          removed ||= record.removedNodes.length > 0
        } else if (record.target instanceof HTMLElement) {
          const surface = surfaces.get(record.target)
          if (record.attributeName === 'data-glass-pressure') {
            if (surface) updatePressure(surface)
          } else if (!record.target.matches(selector)) {
            if (surface) unregister(surface)
          } else if (surface) queue(surface)
          else register(record.target)
        }
      }
      if (removed) for (const surface of surfaces.values()) if (!surface.element.isConnected) unregister(surface)
    })
    const remeasure = () => { for (const surface of surfaces.values()) queue(surface) }
    discover(document.body)
    mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-glass', 'data-glass-pressure'] })
    window.addEventListener('resize', remeasure, { passive: true })
    return () => {
      disposed = true
      mutations.disconnect()
      resize.disconnect()
      visibility.disconnect()
      window.removeEventListener('resize', remeasure)
      cancelAnimationFrame(frame)
      for (const surface of surfaces.values()) unregister(surface)
      pending.clear()
      cache.clear()
    }
  }, [enabled, prefix])

  if (!enabled) return null
  return <svg aria-hidden="true" focusable="false" width="0" height="0" style={{ position: 'fixed', pointerEvents: 'none', overflow: 'hidden' }}><defs ref={defsRef} /></svg>
}
