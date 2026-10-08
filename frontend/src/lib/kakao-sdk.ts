import { createKakaoSdkLoader } from './kakao-sdk-loader'
import { kakaoMapAppKey } from './map-provider'

let loader: (() => Promise<typeof kakao.maps>) | undefined

export function loadKakaoMaps(): Promise<typeof kakao.maps> {
  loader ??= createKakaoSdkLoader({
    appKey: kakaoMapAppKey,
    document,
    getMaps: () => (window as Window & { kakao?: { maps: typeof kakao.maps } }).kakao?.maps,
  })
  return loader()
}
