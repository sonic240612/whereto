import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Image, History, Target, Crosshair } from 'lucide-react'
import MapView from '../components/MapView'
import RangeSelector from '../components/RangeSelector'
import FabButton from '../components/FabButton'
import { useStore } from '../store/useStore'
import type { LatLng, RectBounds } from '../types'

function getCurrentPosition(): Promise<LatLng> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ lat: 37.5665, lng: 126.978 })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve({ lat: 37.5665, lng: 126.978 }),
      { timeout: 5000 },
    )
  })
}

export default function Home() {
  const navigate = useNavigate()
  const { userLocation, setUserLocation, setBounds, bounds, setStatus, status } =
    useStore()
  const [showSelector, setShowSelector] = useState(false)
  useEffect(() => {
    if (!userLocation) {
      getCurrentPosition().then(setUserLocation)
    }
  }, [userLocation, setUserLocation])

  const handlePick = useCallback(() => {
    if (bounds) {
      setStatus('selecting')
      navigate('/result')
    } else {
      setShowSelector(true)
    }
  }, [bounds, setStatus, navigate])

  const handleBoundsConfirm = useCallback(
    (b: RectBounds) => {
      setBounds(b)
      setShowSelector(false)
      setStatus('selecting')
      navigate('/result')
    },
    [setBounds, setStatus, navigate],
  )

  return (
    <div className="relative w-full h-dvh overflow-hidden">
      <MapView
        center={userLocation ?? undefined}
        bounds={bounds && status !== 'selecting' ? bounds : null}
        onMapLoad={() => {}}
        className="absolute inset-0"
      />

      <div className="absolute top-4 left-4 z-10">
        <h1 className="text-2xl font-bold text-black">
          어디가?
        </h1>
      </div>

      {status === 'idle' && !bounds && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-3 pointer-events-none">
          <Target size={64} className="text-white/80 drop-shadow-lg" />
          <p className="text-black text-base font-semibold text-center leading-relaxed">
            지도를 드래그하여
            <br />
            탐색 범위를 지정하세요
          </p>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 z-20 pb-8 px-4 flex flex-col items-center gap-4 pointer-events-none">
        <div className="pointer-events-auto">
          <FabButton
            onClick={handlePick}
            label={bounds ? '운명의 좌표 뽑기' : '범위부터 지정하기'}
          />
        </div>

        <div className="flex items-center gap-6 pointer-events-auto">
          <button
            onClick={() => setShowSelector(true)}
            className="flex flex-col items-center gap-1"
          >
            <div className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm shadow flex items-center justify-center">
              <Crosshair size={18} className="text-text" />
            </div>
            <span className="text-[13px] text-black">
              범위 설정
            </span>
          </button>
          <button
            onClick={() => navigate('/gallery')}
            className="flex flex-col items-center gap-1"
          >
            <div className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm shadow flex items-center justify-center">
              <Image size={18} className="text-text" />
            </div>
            <span className="text-[13px] text-black">
              갤러리
            </span>
          </button>
          <button className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm shadow flex items-center justify-center">
              <History size={18} className="text-text" />
            </div>
            <span className="text-[13px] text-black">
              내 기록
            </span>
          </button>
        </div>
      </div>

      {showSelector && (
        <RangeSelector
          userLocation={userLocation}
          onConfirm={handleBoundsConfirm}
          onCancel={() => setShowSelector(false)}
        />
      )}
    </div>
  )
}
