type MapsApi = typeof kakao.maps

const loadError = () => new Error('카카오지도를 불러오지 못했습니다. 인터넷 연결과 지도 서비스 설정을 확인한 뒤 다시 시도해주세요.')

function ready(maps: MapsApi | undefined): maps is MapsApi {
  return typeof maps?.Map === 'function' && typeof maps.services?.Places === 'function'
    && typeof maps.services?.Geocoder === 'function'
}

export function createKakaoSdkLoader(options: {
  appKey: string
  getMaps: () => MapsApi | undefined
  document: Pick<Document, 'head' | 'createElement'>
  timeoutMs?: number
}): () => Promise<MapsApi> {
  let pending: Promise<MapsApi> | null = null

  return () => {
    if (!options.appKey.trim()) return Promise.reject(new Error('카카오지도 JavaScript 키가 설정되지 않았습니다.'))
    const existing = options.getMaps()
    if (ready(existing)) return Promise.resolve(existing)
    if (pending) return pending

    const operation = new Promise<MapsApi>((resolve, reject) => {
      const script = options.document.createElement('script')
      let settled = false
      const finish = (maps?: MapsApi) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        script.onload = null
        script.onerror = null
        if (maps) resolve(maps)
        else { script.remove(); reject(loadError()) }
      }
      const timer = setTimeout(() => finish(), options.timeoutMs ?? 15000)
      const url = new URL('https://dapi.kakao.com/v2/maps/sdk.js')
      url.search = new URLSearchParams({ appkey: options.appKey.trim(), autoload: 'false', libraries: 'services' }).toString()
      script.src = url.href
      script.async = true
      script.dataset.wheretoKakaoSdk = 'true'
      script.onerror = () => finish()
      script.onload = () => {
        if (settled) return
        const maps = options.getMaps()
        if (!maps || typeof maps.load !== 'function') { finish(); return }
        try {
          maps.load(() => {
            if (settled) return
            const loaded = options.getMaps()
            finish(ready(loaded) ? loaded : undefined)
          })
        } catch { finish() }
      }
      try { options.document.head.appendChild(script) } catch { finish() }
    })
    pending = operation
    // A failed script can be retried. An individual component never cancels the shared load.
    void operation.catch(() => { if (pending === operation) pending = null })
    return operation
  }
}
