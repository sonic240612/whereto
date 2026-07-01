import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Compass, ArrowRight, Image } from 'lucide-react'
import MapView from '../components/MapView'
import FabButton from '../components/FabButton'
import RangeSelector from '../components/RangeSelector'
import useGeolocation from '../hooks/useGeolocation'
import type { RectBounds } from '../types'

export default function Home() {
  const navigate = useNavigate()
  const { location: userLocation, error: geoError } = useGeolocation()
  const [selecting, setSelecting] = useState(false)

  const handlePick = useCallback(() => {
    if (!userLocation) return
    setSelecting(true)
  }, [userLocation])

  const handleConfirm = useCallback(
    (bounds: RectBounds) => {
      setSelecting(false)
      const p = new URLSearchParams({
        minLat: String(bounds.minLat),
        maxLat: String(bounds.maxLat),
        minLng: String(bounds.minLng),
        maxLng: String(bounds.maxLng),
      })
      window.location.href = `/result?${p}`
    },
    [],
  )

  const handleCancel = useCallback(() => {
    setSelecting(false)
  }, [])

  return (
    <>
      <div className="relative flex flex-col min-h-dvh">
        <MapView
          center={userLocation ?? undefined}
          className="absolute inset-0"
        />

        <div className="relative z-10 p-5 pb-0">
          <div className="inline-flex items-center gap-2.5 glass rounded-2xl px-5 py-2.5 shadow-lg">
            <Compass size={22} className="text-primary" />
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-text" style={{ fontFamily: '"Pretendard", sans-serif' }}>
                WhereTo
              </h1>
              <p className="text-[11px] font-semibold text-text-light tracking-wide">
                오늘의 행선지를 랜덤 추첨
              </p>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-auto p-5 pb-8 space-y-3">
          {geoError && (
            <div className="glass-strong rounded-2xl p-4 shadow-lg mb-3">
              <p className="text-sm font-semibold text-text">
                위치 정보를 불러올 수 없습니다
              </p>
              <p className="text-xs text-text-light mt-1">
                브라우저의 위치 권한을 확인해주세요
              </p>
            </div>
          )}

          {userLocation && (
            <div className="flex items-center justify-center">
              <FabButton onClick={handlePick} disabled={selecting} />
            </div>
          )}

          <div className="flex items-center justify-center">
            <button
              onClick={() => navigate('/gallery')}
              className="flex items-center gap-2 px-5 py-2.5 glass rounded-xl shadow-lg text-sm font-semibold text-text hover:bg-white/90 transition-all active:scale-[0.97]"
            >
              <Image size={16} />
              방문 기록 보기
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {selecting && userLocation && (
        <RangeSelector
          userLocation={userLocation}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </>
  )
}
