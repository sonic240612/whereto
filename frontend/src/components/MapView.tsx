import { lazy, Suspense } from 'react'
import { usesKakaoMaps } from '../lib/map-provider'
import type { MapViewProps } from './map-view-types'

const KakaoMapView = lazy(() => import('./KakaoMapView'))
const OpenMapView = lazy(() => import('./OpenMapView'))

export default function MapView(props: MapViewProps) {
  const ProviderMap = usesKakaoMaps ? KakaoMapView : OpenMapView
  return (
    <Suspense fallback={<div className={`h-full w-full bg-bg-secondary ${props.className ?? ''}`}><span role="status" className="sr-only">지도를 불러오는 중입니다.</span></div>}>
      <ProviderMap {...props} />
    </Suspense>
  )
}
