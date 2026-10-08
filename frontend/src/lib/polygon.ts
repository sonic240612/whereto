import type { LatLng, RectBounds } from '../types/index.ts'
import { contains, isBounds, isLatLng } from './validation.ts'

export const MAX_POLYGON_POINTS = 50
const INVALID_POLYGON = '다각형 범위가 올바르지 않습니다. 선이 겹치지 않도록 점을 다시 선택해주세요.'

function cross(a: LatLng, b: LatLng, c: LatLng): number {
  return (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng)
}

function orientation(a: LatLng, b: LatLng, c: LatLng): number {
  const first = (b.lng - a.lng) * (c.lat - a.lat)
  const second = (b.lat - a.lat) * (c.lng - a.lng)
  const determinant = first - second
  const tolerance = (Math.abs(first) + Math.abs(second)) * Number.EPSILON * 16
  return Math.abs(determinant) <= tolerance ? 0 : Math.sign(determinant)
}

function onSegment(point: LatLng, a: LatLng, b: LatLng): boolean {
  return orientation(a, b, point) === 0
    && point.lat >= Math.min(a.lat, b.lat) && point.lat <= Math.max(a.lat, b.lat)
    && point.lng >= Math.min(a.lng, b.lng) && point.lng <= Math.max(a.lng, b.lng)
}

function intersects(a: LatLng, b: LatLng, c: LatLng, d: LatLng): boolean {
  const abC = orientation(a, b, c), abD = orientation(a, b, d)
  const cdA = orientation(c, d, a), cdB = orientation(c, d, b)
  if (abC * abD < 0 && cdA * cdB < 0) return true
  return (abC === 0 && onSegment(c, a, b)) || (abD === 0 && onSegment(d, a, b))
    || (cdA === 0 && onSegment(a, c, d)) || (cdB === 0 && onSegment(b, c, d))
}

// Translate around the first vertex before accumulating area to avoid subtracting
// large latitude/longitude products for small polygons around e.g. Seoul.
function signedDoubleArea(points: readonly LatLng[]): number {
  let area = 0
  for (let i = 1; i < points.length - 1; i++) area += cross(points[0], points[i], points[i + 1])
  return area
}

export function getPolygonBounds(points: readonly LatLng[]): RectBounds {
  if (!points.length || !points.every(isLatLng)) throw new Error(INVALID_POLYGON)
  return {
    minLat: Math.min(...points.map(point => point.lat)), maxLat: Math.max(...points.map(point => point.lat)),
    minLng: Math.min(...points.map(point => point.lng)), maxLng: Math.max(...points.map(point => point.lng)),
  }
}

export function isPolygon(value: unknown): value is LatLng[] {
  if (!Array.isArray(value) || value.length < 3 || value.length > MAX_POLYGON_POINTS || !value.every(isLatLng)) return false
  if (!isBounds(getPolygonBounds(value))) return false
  if (new Set(value.map(point => `${point.lat},${point.lng}`)).size !== value.length) return false
  let areaMagnitude = 0
  for (let i = 1; i < value.length - 1; i++) areaMagnitude += Math.abs(cross(value[0], value[i], value[i + 1]))
  if (Math.abs(signedDoubleArea(value)) <= areaMagnitude * Number.EPSILON * 32) return false

  for (let i = 0; i < value.length; i++) {
    const previous = value[(i + value.length - 1) % value.length]
    const current = value[i], next = value[(i + 1) % value.length]
    // Collinear points along a straight edge are fine; reversing over that same
    // edge creates an overlapping boundary and is not a simple polygon.
    if (orientation(previous, current, next) === 0
      && (onSegment(next, previous, current) || onSegment(previous, current, next))) return false
    for (let j = i + 1; j < value.length; j++) {
      if (j === i + 1 || (i === 0 && j === value.length - 1)) continue
      if (intersects(current, next, value[j], value[(j + 1) % value.length])) return false
    }
  }
  return true
}

export function containsPolygon(points: readonly LatLng[], point: LatLng): boolean {
  if (!isLatLng(point) || !isPolygon(points) || !contains(getPolygonBounds(points), point)) return false
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j], b = points[i]
    if (onSegment(point, a, b)) return true
    if ((a.lat > point.lat) !== (b.lat > point.lat)) {
      const longitude = a.lng + (point.lat - a.lat) * (b.lng - a.lng) / (b.lat - a.lat)
      if (point.lng < longitude) inside = !inside
    }
  }
  return inside
}

export function parsePolygon(value: string | null): LatLng[] | null {
  if (!value || value.length > 16_384) return null
  try {
    // URLSearchParams already decoded the query value. Coordinates have the
    // single documented JSON representation [[lat, lng], ...].
    const raw: unknown = JSON.parse(value)
    if (!Array.isArray(raw) || raw.length < 3 || raw.length > MAX_POLYGON_POINTS) return null
    if (!raw.every(point => Array.isArray(point) && point.length === 2)) return null
    const points = raw.map(point => ({ lat: point[0], lng: point[1] }))
    return isPolygon(points) ? points : null
  } catch { return null }
}

export function serializePolygon(points: readonly LatLng[]): string {
  if (!isPolygon(points)) throw new Error(INVALID_POLYGON)
  return JSON.stringify(points.map(point => [point.lat, point.lng]))
}

type Triangle = readonly [LatLng, LatLng, LatLng]

function inTriangle(point: LatLng, a: LatLng, b: LatLng, c: LatLng): boolean {
  return orientation(a, b, point) >= 0 && orientation(b, c, point) >= 0 && orientation(c, a, point) >= 0
}

function triangulate(points: readonly LatLng[]): Triangle[] {
  const vertices = points.map(point => ({ ...point }))
  // Straight-edge intermediate vertices do not change the area and can block an
  // otherwise valid ear when they sit exactly on a candidate triangle boundary.
  for (let i = 0; vertices.length > 3 && i < vertices.length;) {
    const previous = vertices[(i + vertices.length - 1) % vertices.length]
    const next = vertices[(i + 1) % vertices.length]
    if (onSegment(vertices[i], previous, next)) { vertices.splice(i, 1); i = 0 }
    else i++
  }
  if (signedDoubleArea(vertices) < 0) vertices.reverse()
  const triangles: Triangle[] = []
  while (vertices.length > 3) {
    let clipped = false
    for (let i = 0; i < vertices.length; i++) {
      const previous = vertices[(i + vertices.length - 1) % vertices.length]
      const current = vertices[i], next = vertices[(i + 1) % vertices.length]
      if (orientation(previous, current, next) <= 0) continue
      if (vertices.some(point => point !== previous && point !== current && point !== next
        && inTriangle(point, previous, current, next))) continue
      triangles.push([previous, current, next])
      vertices.splice(i, 1)
      clipped = true
      break
    }
    if (!clipped) throw new Error(INVALID_POLYGON)
  }
  if (vertices.length !== 3 || orientation(vertices[0], vertices[1], vertices[2]) <= 0) throw new Error(INVALID_POLYGON)
  triangles.push([vertices[0], vertices[1], vertices[2]])
  return triangles
}

function unitRandom(random: () => number): number {
  const value = random()
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('추첨 값을 생성하지 못했습니다. 다시 시도해주세요.')
  return value
}

// Area-weighted ear clipping samples uniformly in the latitude/longitude plane.
// It does not depend on the polygon occupying a large part of its bounding box.
export function createPolygonSampler(points: readonly LatLng[]): (random?: () => number) => LatLng {
  if (!isPolygon(points)) throw new Error(INVALID_POLYGON)
  const polygon = points.map(point => ({ ...point }))
  const triangles = triangulate(polygon)
  const areas = triangles.map(([a, b, c]) => cross(a, b, c) / 2)
  const total = areas.reduce((sum, area) => sum + area, 0)
  return (random = Math.random) => {
    let remaining = unitRandom(random) * total
    let selected = triangles.length - 1
    for (let i = 0; i < triangles.length; i++) {
      if (remaining < areas[i]) { selected = i; break }
      remaining -= areas[i]
    }
    const [a, b, c] = triangles[selected]
    const radius = Math.sqrt(unitRandom(random)), ratio = unitRandom(random)
    const point = {
      lat: a.lat + radius * ((1 - ratio) * (b.lat - a.lat) + ratio * (c.lat - a.lat)),
      lng: a.lng + radius * ((1 - ratio) * (b.lng - a.lng) + ratio * (c.lng - a.lng)),
    }
    // Never turn a numerical/geometry failure into a bounding-box fallback.
    if (!containsPolygon(polygon, point)) throw new Error(INVALID_POLYGON)
    return point
  }
}
