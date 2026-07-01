import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MapPin, Target } from 'lucide-react'
import MapView from '../components/MapView'
import NavLinks from '../components/NavLinks'
import type { LatLng } from '../types'

export default function Share() {
  const [searchParams] = useSearchParams()
  const [address, setAddress] = useState<string | null>(null)

  const latlng: LatLng | null = useMemo(() => {
    const lat = parseFloat(searchParams.get('lat') ?? '')
    const lng = parseFloat(searchParams.get('lng') ?? '')
    if (isNaN(lat) || isNaN(lng)) return null
    return { lat, lng }
  }, [searchParams])

  useEffect(() => {
    if (!latlng) return
    const paramAddr = searchParams.get('address')
    if (paramAddr) {
      setAddress(decodeURIComponent(paramAddr))
      return
    }

    let cancelled = false
    fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latlng.lat}&lon=${latlng.lng}&format=json&accept-language=ko`,
    )
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setAddress(data.display_name ?? '주소를 찾을 수 없음')
        }
      })
      .catch(() => {
        if (!cancelled) setAddress('주소를 찾을 수 없음')
      })

    return () => {
      cancelled = true
    }
  }, [latlng, searchParams])

  if (!latlng) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh p-8 text-center bg-bg">
        <Target size={48} className="text-border mb-6" />
        <h2 className="text-xl font-bold text-text mb-2">
          잘못된 공유 링크입니다
        </h2>
        <p className="text-sm text-text-light mb-6 max-w-xs">
          지도 좌표 정보가 포함되지 않은 링크입니다.
        </p>
        <a
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all"
          style={{
            background: 'linear-gradient(135deg, #FF6B6B 0%, #ee5a24 100%)',
          }}
        >
          WhereTo 시작하기
        </a>
      </div>
    )
  }

  return (
    <div className="relative min-h-dvh flex flex-col">
      <div className="relative flex-1 min-h-[55dvh]">
        <MapView center={latlng} marker={latlng} className="absolute inset-0" />

        <div className="absolute top-6 left-0 right-0 z-10 flex justify-center">
          <div className="glass rounded-2xl px-4 py-2 shadow-lg flex items-center gap-2">
            <MapPin size={16} className="text-primary" fill="#FF6B6B" />
            <span className="text-xs font-bold text-text">
              {address ?? '주소 로딩 중...'}
            </span>
          </div>
        </div>
      </div>

      <div className="glass-strong rounded-t-3xl p-5 pb-8 space-y-4 shadow-2xl">
        <div className="text-center">
          <h1 className="text-lg font-extrabold text-text mb-1">
            누군가가 공유한 장소
          </h1>
          {address && (
            <p className="text-sm text-text-light leading-relaxed">{address}</p>
          )}
        </div>

        <NavLinks lat={latlng.lat} lng={latlng.lng} />

        <a
          href="/"
          className="block text-center py-3 rounded-xl text-sm font-bold text-text bg-white border border-border transition-all active:scale-[0.97] shadow-md"
        >
          나도 뽑으러 가기
        </a>
      </div>
    </div>
  )
}
