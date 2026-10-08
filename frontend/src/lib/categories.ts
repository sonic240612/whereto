const kakaoCategories = [
  { id: 'restaurant', label: '음식점', kakaoCode: 'FD6' },
  { id: 'cafe', label: '카페', kakaoCode: 'CE7' },
  { id: 'convenience', label: '편의점', kakaoCode: 'CS2' },
  { id: 'mart', label: '대형마트', kakaoCode: 'MT1' },
  { id: 'culture', label: '문화시설', kakaoCode: 'CT1' },
  { id: 'attraction', label: '관광명소', kakaoCode: 'AT4' },
  { id: 'lodging', label: '숙박', kakaoCode: 'AD5' },
  { id: 'parking', label: '주차장', kakaoCode: 'PK6' },
  { id: 'gas', label: '주유소·충전소', kakaoCode: 'OL7' },
  { id: 'subway', label: '지하철역', kakaoCode: 'SW8' },
  { id: 'bank', label: '은행', kakaoCode: 'BK9' },
  { id: 'hospital', label: '병원', kakaoCode: 'HP8' },
  { id: 'pharmacy', label: '약국', kakaoCode: 'PM9' },
  { id: 'public', label: '공공기관', kakaoCode: 'PO3' },
  { id: 'realtor', label: '중개업소', kakaoCode: 'AG2' },
  { id: 'school', label: '학교', kakaoCode: 'SC4' },
  { id: 'academy', label: '학원', kakaoCode: 'AC5' },
  { id: 'childcare', label: '어린이집·유치원', kakaoCode: 'PS3' },
] as const

export const destinationCategories = [
  { id: 'all', label: '전체', kakaoCode: undefined },
  ...kakaoCategories,
] as const

export type DestinationCategory = typeof destinationCategories[number]['id']
export type KakaoDestinationCode = typeof kakaoCategories[number]['kakaoCode']
export const kakaoDestinationCategories = kakaoCategories.map(category => category.kakaoCode)
export const categoryLabels = Object.fromEntries(destinationCategories.map(({ id, label }) => [id, label])) as Record<DestinationCategory, string>

export function parseDestinationCategory(value: string | null): DestinationCategory {
  return destinationCategories.find(category => category.id === value)?.id ?? 'all'
}

export function getKakaoCategoryCode(category: DestinationCategory): KakaoDestinationCode | undefined {
  return destinationCategories.find(item => item.id === category)?.kakaoCode
}

// OSM equivalents are used only by the explicit OpenStreetMap/Photon provider.
// Classification and upstream filters share this table so no selected category
// silently falls back to an unrelated place when a provider has sparse coverage.
export const categoryOsmTags: Record<DestinationCategory, readonly string[]> = {
  all: [],
  restaurant: ['amenity:restaurant', 'amenity:fast_food', 'amenity:food_court'],
  cafe: ['amenity:cafe'],
  convenience: ['shop:convenience'],
  mart: ['shop:supermarket', 'shop:department_store', 'shop:wholesale'],
  culture: ['tourism:museum', 'tourism:gallery', 'amenity:arts_centre', 'amenity:theatre', 'amenity:cinema', 'amenity:library'],
  attraction: ['tourism:attraction', 'tourism:viewpoint', 'leisure:park', 'leisure:garden'],
  lodging: ['tourism:hotel', 'tourism:motel', 'tourism:hostel', 'tourism:guest_house', 'tourism:apartment', 'tourism:camp_site'],
  parking: ['amenity:parking'],
  gas: ['amenity:fuel', 'amenity:charging_station'],
  // A generic railway:station does not prove that a station serves the subway.
  subway: ['railway:subway_entrance'],
  bank: ['amenity:bank'],
  hospital: ['amenity:hospital', 'amenity:clinic', 'amenity:doctors'],
  pharmacy: ['amenity:pharmacy'],
  public: ['office:government', 'amenity:townhall', 'amenity:police', 'amenity:fire_station', 'amenity:courthouse', 'amenity:post_office'],
  realtor: ['office:estate_agent'],
  school: ['amenity:school', 'amenity:college', 'amenity:university'],
  academy: ['amenity:language_school', 'amenity:driving_school', 'amenity:music_school', 'amenity:training'],
  childcare: ['amenity:kindergarten', 'amenity:childcare'],
}

// Preserve the original all-mode OSM destinations in addition to the 18 groups.
const destinationTypes: Record<string, Set<string> | null> = {
  amenity: new Set(['cafe', 'restaurant', 'fast_food', 'food_court', 'ice_cream', 'library', 'marketplace', 'arts_centre', 'community_centre', 'theatre', 'cinema']),
  tourism: new Set(['museum', 'gallery', 'attraction', 'viewpoint', 'information']),
  leisure: new Set(['park', 'garden', 'playground', 'sports_centre', 'fitness_station', 'dog_park', 'nature_reserve']),
  shop: null,
  highway: new Set(['pedestrian', 'footway', 'path', 'residential', 'living_street', 'steps', 'cycleway']),
}
const allOsmTags = new Set(Object.values(categoryOsmTags).flat())

export function matchesCategory(
  place: { category: string; type: string },
  selection: DestinationCategory = 'all',
): boolean {
  if (place.category === 'kakao') {
    return selection === 'all'
      ? kakaoDestinationCategories.some(code => code === place.type)
      : place.type === getKakaoCategoryCode(selection)
  }
  const tag = `${place.category}:${place.type}`
  if (selection !== 'all') return categoryOsmTags[selection].includes(tag)
  if (allOsmTags.has(tag)) return true
  if (!Object.hasOwn(destinationTypes, place.category)) return false
  const allowed = destinationTypes[place.category]
  return allowed === null || allowed.has(place.type)
}
