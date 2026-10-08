export interface GlassGeometry {
  width: number
  height: number
  radius: number
  rasterWidth: number
  rasterHeight: number
  bevel: number
}

const MAX_SIDE = 512
const MAX_PIXELS = 65_536
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback

/** Rasterize the surface's normals, never the content behind it. Resolution is
 * independent of devicePixelRatio so a large dock cannot allocate a huge map. */
export function glassGeometry(width: number, height: number, radius: number): GlassGeometry {
  const w = Math.max(1, Math.round(finite(width, 1)))
  const h = Math.max(1, Math.round(finite(height, 1)))
  const ratio = Math.min(1, MAX_SIDE / Math.max(w, h), Math.sqrt(MAX_PIXELS / (w * h)))
  return {
    width: w,
    height: h,
    radius: Math.round(clamp(finite(radius, 0), 0, Math.min(w, h) / 2) * 2) / 2,
    rasterWidth: Math.max(1, Math.floor(w * ratio)),
    rasterHeight: Math.max(1, Math.floor(h * ratio)),
    bevel: clamp(Math.min(w, h) * 0.24, 6, 22),
  }
}

export function glassGeometryKey(geometry: GlassGeometry): string {
  return `${geometry.width}:${geometry.height}:${geometry.radius}`
}

/** Rounded-rectangle signed distance and its outward normal produce a smooth
 * inward sampling offset at the rim. R/G are signed X/Y offsets in sRGB space;
 * the center is neutral. This is a generated normal map, not a screenshot. */
export function glassNormalMap(geometry: GlassGeometry): Uint8ClampedArray {
  const { width, height, radius, rasterWidth, rasterHeight, bevel } = geometry
  const pixels = new Uint8ClampedArray(rasterWidth * rasterHeight * 4)
  const halfWidth = width / 2
  const halfHeight = height / 2
  for (let y = 0; y < rasterHeight; y += 1) {
    for (let x = 0; x < rasterWidth; x += 1) {
      const px = (x + 0.5) * width / rasterWidth - halfWidth
      const py = (y + 0.5) * height / rasterHeight - halfHeight
      const qx = Math.abs(px) - (halfWidth - radius)
      const qy = Math.abs(py) - (halfHeight - radius)
      const ox = Math.max(qx, 0)
      const oy = Math.max(qy, 0)
      const outside = Math.hypot(ox, oy)
      const distance = -(outside + Math.min(Math.max(qx, qy), 0) - radius)
      let nx = 0
      let ny = 0
      if (outside > 0.0001) {
        nx = ox / outside * Math.sign(px)
        ny = oy / outside * Math.sign(py)
      } else if (qx > qy) nx = Math.sign(px)
      else ny = Math.sign(py)
      const edge = distance >= 0 ? Math.sin((1 - clamp(distance / bevel, 0, 1)) * Math.PI / 2) ** 2 : 0
      const index = (y * rasterWidth + x) * 4
      pixels[index] = Math.round(127.5 - nx * edge * 112)
      pixels[index + 1] = Math.round(127.5 - ny * edge * 112)
      pixels[index + 2] = 128
      pixels[index + 3] = 255
    }
  }
  return pixels
}

export function glassScales(geometry: GlassGeometry, pressure: number): readonly [number, number, number] {
  const force = clamp(finite(pressure, 0), 0, 1)
  const strength = clamp(Math.min(geometry.width, geometry.height) * 0.5, 12, 30) * (1 + force * 0.18)
  const dispersion = 0.75 + force * 0.25
  return [strength + dispersion, strength, strength - dispersion]
}

/** CSS.supports only tests syntax. SVG backdrop displacement is enabled on the
 * Chromium implementation that we exercise; other engines keep CSS blur. */
export function supportsGlassSvg(userAgent: string, supportsUrl: boolean): boolean {
  return supportsUrl && /(?:Chrome|Chromium|Edg|OPR)\//.test(userAgent) && !/(?:iPhone|iPad|iPod|CriOS|EdgiOS)/.test(userAgent)
}
