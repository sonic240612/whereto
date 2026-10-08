import type { CoordResult, LatLng, RectBounds } from '../types/index.ts'
import type { DestinationCategory } from './categories.ts'
import { readPlaceMetadata } from './place-metadata.ts'
import type { DrawMode } from './draw-mode.ts'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isLatLng(value: unknown): value is LatLng {
  return isRecord(value) && typeof value.lat === 'number' && Number.isFinite(value.lat)
    && typeof value.lng === 'number' && Number.isFinite(value.lng)
    && Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180
}

export function isBounds(value: unknown): value is RectBounds {
  if (!isRecord(value)) return false
  const { minLat, maxLat, minLng, maxLng } = value
  return [minLat, maxLat, minLng, maxLng].every(v => typeof v === 'number' && Number.isFinite(v))
    && typeof minLat === 'number' && typeof maxLat === 'number'
    && typeof minLng === 'number' && typeof maxLng === 'number'
    && minLat >= -85.05112878 && maxLat <= 85.05112878
    && minLng >= -180 && maxLng <= 180 && minLat < maxLat && minLng < maxLng
}

export function parseNumber(value: string | null): number {
  return value === null || value.trim() === '' ? NaN : Number(value)
}

export function parseLatLng(params: URLSearchParams): LatLng | null {
  const value = { lat: parseNumber(params.get('lat')), lng: parseNumber(params.get('lng')) }
  return isLatLng(value) ? value : null
}

export function parseBounds(params: URLSearchParams): RectBounds | null {
  const value = {
    minLat: parseNumber(params.get('minLat')), maxLat: parseNumber(params.get('maxLat')),
    minLng: parseNumber(params.get('minLng')), maxLng: parseNumber(params.get('maxLng')),
  }
  return isBounds(value) ? value : null
}

export function contains(bounds: RectBounds, point: LatLng): boolean {
  return point.lat >= bounds.minLat && point.lat <= bounds.maxLat
    && point.lng >= bounds.minLng && point.lng <= bounds.maxLng
}

export function parseResult(params: URLSearchParams, expectedCategory?: DestinationCategory, expectedProvider?: 'open' | 'kakao', expectedMode?: DrawMode): CoordResult | null {
  // Legacy results were drawn without a category. Never relabel them as restaurant results.
  if (expectedCategory !== undefined && (params.get('resultCategory') ?? 'all') !== expectedCategory) return null
  // A previous OpenStreetMap result is not a newly drawn Kakao place (and vice versa).
  if (expectedProvider !== undefined && (params.get('resultProvider') ?? 'open') !== expectedProvider) return null
  if (expectedMode !== undefined && (params.get('resultMode') ?? 'popular') !== expectedMode) return null
  const point = parseLatLng(params)
  const address = params.get('address')?.trim()
  return point && address && address.length <= 2000 ? { ...point, address, ...readPlaceMetadata(params) } : null
}
