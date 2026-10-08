import { createGeocodeClient } from './geocode-client.ts'
import { createKakaoPlacesClient, type KakaoPlacesServices } from './kakao-places-client.ts'
import { loadKakaoMaps } from './kakao-sdk.ts'
import { usesKakaoMaps } from './map-provider.ts'
export type { PlaceCandidate } from './geocode-client.ts'

const photon = createGeocodeClient({
  baseUrl: import.meta.env.VITE_GEOCODER_URL || 'https://photon.komoot.io/',
})

let services: KakaoPlacesServices | undefined
const kakaoClient = createKakaoPlacesClient({
  getServices: async () => {
    if (services) return services
    const maps = await loadKakaoMaps()
    const places = new maps.services.Places()
    const geocoder = new maps.services.Geocoder()
    const loaded: KakaoPlacesServices = {
      places: {
        keywordSearch: (query, callback, options) => places.keywordSearch(query, callback, options),
        categorySearch: (code, callback, options) => places.categorySearch(code, callback, { ...options, sort: 'rect' in options ? maps.services.SortBy.ACCURACY : maps.services.SortBy.DISTANCE }),
      },
      geocoder: {
        addressSearch: (query, callback) => geocoder.addressSearch(query, callback, { size: 5, page: 1, analyze_type: maps.services.AnalyzeType.SIMILAR }),
        coord2Address: (x, y, callback) => geocoder.coord2Address(x, y, callback),
      },
    }
    services = loaded
    return loaded
  },
})

// The map and place source always switch together. A configured Kakao failure is
// reported instead of silently drawing from a different provider's place data.
const client = usesKakaoMaps ? kakaoClient : photon
export const reverseGeocode = client.reverse
export const searchKakaoRegion = kakaoClient.searchRegion
export const searchKakaoRegionPage = kakaoClient.searchRegionPage
export const searchPlaces = client.search
export async function addressAt(lat: number, lng: number, signal?: AbortSignal): Promise<string | null> {
  if (usesKakaoMaps) return kakaoClient.addressAt(lat, lng, signal)
  return (await photon.reverse(lat, lng, signal))[0]?.address ?? null
}
