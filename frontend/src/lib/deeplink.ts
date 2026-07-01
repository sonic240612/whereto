export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

export function isAndroid(): boolean {
  return /Android/.test(navigator.userAgent)
}

export function getGoogleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
}

export function getAppleMapsUrl(lat: number, lng: number): string {
  return `https://maps.apple.com/?daddr=${lat},${lng}`
}

export const navigationApps = [
  {
    id: 'google',
    name: 'Google Maps',
    getUrl: getGoogleMapsUrl,
  },
  {
    id: 'apple',
    name: 'Apple Maps',
    getUrl: getAppleMapsUrl,
    only: 'ios',
  },
] as const
