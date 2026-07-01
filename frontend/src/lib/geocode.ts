let lastRequest = 0

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const now = Date.now()
  const elapsed = now - lastRequest
  if (elapsed < 1000) {
    await new Promise((r) => setTimeout(r, 1000 - elapsed))
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ko`,
      { headers: { 'User-Agent': 'WhereTo/1.0' } },
    )
    lastRequest = Date.now()
    if (!res.ok) throw new Error()
    const data = await res.json()
    return data.display_name ?? `${lat.toFixed(6)}, ${lng.toFixed(6)}`
  } catch {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
  }
}
