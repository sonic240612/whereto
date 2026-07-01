import type { RectBounds, CoordResult } from '../types'

const MAX_RETRIES = 10

const WATER_KEYWORDS = ['바다', '해양', '강', '호수', '저수지', '하천', '해협']

function isWaterAddress(address: string): boolean {
  return WATER_KEYWORDS.some((kw) => address.includes(kw))
}

export async function generateRandomCoord(
  bounds: RectBounds,
  reverseGeocode: (lat: number, lng: number) => Promise<string>,
): Promise<CoordResult> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    const lat = bounds.minLat + (bounds.maxLat - bounds.minLat) * Math.random()
    const lng = bounds.minLng + (bounds.maxLng - bounds.minLng) * Math.random()
    const address = await reverseGeocode(lat, lng)

    if (!isWaterAddress(address)) {
      return { lat, lng, address }
    }
  }

  const fallbackLat =
    bounds.minLat + (bounds.maxLat - bounds.minLat) * Math.random()
  const fallbackLng =
    bounds.minLng + (bounds.maxLng - bounds.minLng) * Math.random()
  const fallbackAddress = await reverseGeocode(fallbackLat, fallbackLng)
  return { lat: fallbackLat, lng: fallbackLng, address: fallbackAddress }
}
