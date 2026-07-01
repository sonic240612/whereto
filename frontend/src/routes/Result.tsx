import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Share2, Flag } from 'lucide-react'
import MapView from '../components/MapView'
import ResultPin from '../components/ResultPin'
import NavLinks from '../components/NavLinks'
import VisitForm from '../components/VisitForm'
import { useStore } from '../store/useStore'
import { generateRandomCoord } from '../lib/random'
import { reverseGeocode } from '../lib/geocode'
import type { CoordResult, RectBounds } from '../types'

export default function Result() {
  const navigate = useNavigate()
  const {
    bounds,
    result,
    setResult,
    userLocation,
    clearResult,
  } = useStore()
  const [loading, setLoading] = useState(false)
  const [showVisit, setShowVisit] = useState(false)
  const [pinVisible, setPinVisible] = useState(false)
  const [currentBounds, setCurrentBounds] = useState<RectBounds | null>(null)
  const [currentMarker, setCurrentMarker] = useState<CoordResult | null>(null)
  const generating = useRef(false)

  useEffect(() => {
    if (!bounds) {
      navigate('/', { replace: true })
    }
  }, [bounds, navigate])

  const pickCoord = useCallback(async () => {
    if (!bounds || generating.current) return
    generating.current = true
    setLoading(true)
    setPinVisible(false)
    setCurrentMarker(null)

    try {
      const coord = await generateRandomCoord(bounds, reverseGeocode)
      setCurrentMarker(coord)
      setResult(coord)
      setCurrentBounds(bounds)
    } finally {
      setLoading(false)
      generating.current = false
    }
  }, [bounds, setResult])

  useEffect(() => {
    if (!result && bounds && !generating.current) {
      pickCoord()
    }
  }, [result, bounds, pickCoord])

  const handleBack = useCallback(() => {
    clearResult()
    navigate('/')
  }, [clearResult, navigate])

  const handleReroll = useCallback(() => {
    pickCoord()
  }, [pickCoord])

  const handleSetNewBounds = useCallback(() => {
    clearResult()
    navigate('/')
  }, [clearResult, navigate])

  const handleVisitSubmit = useCallback(
    () => {
      setShowVisit(false)
      alert('도착 인증이 완료되었습니다!')
    },
    [],
  )

  const shareUrl = currentMarker
    ? `${window.location.origin}/share?lat=${currentMarker.lat}&lng=${currentMarker.lng}`
    : ''

  const handleShare = useCallback(async () => {
    if (!currentMarker) return
    if (navigator.share) {
      await navigator.share({
        title: '어디가? - 운명의 장소',
        text: `운명이 나를 ${currentMarker.address}(으)로 보냈다!`,
        url: shareUrl,
      })
    } else {
      await navigator.clipboard.writeText(shareUrl)
      alert('공유 링크가 복사되었습니다!')
    }
  }, [currentMarker, shareUrl])

  const retryText = !bounds
    ? '범위를 먼저 설정해주세요'
    : loading
      ? '운명의 좌표를 찾는 중...'
      : ''

  return (
    <div className="relative w-full h-dvh overflow-hidden">
      <MapView
        center={userLocation ?? undefined}
        bounds={currentBounds ?? (bounds ?? undefined)}
        marker={
          currentMarker
            ? { lat: currentMarker.lat, lng: currentMarker.lng }
            : null
        }
      />

      <div className="absolute top-0 left-0 right-0 z-10 flex items-center p-4 bg-gradient-to-b from-black/30 to-transparent">
        <button
          onClick={handleBack}
          className="flex items-center gap-1 text-white drop-shadow"
        >
          <ArrowLeft size={20} />
          <span className="text-sm">돌아가기</span>
        </button>
      </div>

      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-white text-sm font-medium drop-shadow">
              운명의 좌표를 찾는 중...
            </p>
          </div>
        </div>
      )}

      {!loading && currentMarker && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-15 pointer-events-none">
          <ResultPin
            address={currentMarker.address}
            onVisible={() => setPinVisible(true)}
          />
        </div>
      )}

      {pinVisible && currentMarker && (
        <div className="absolute bottom-0 left-0 right-0 z-20 p-4 pb-8 flex flex-col gap-3 transition-all duration-500">
          <NavLinks lat={currentMarker.lat} lng={currentMarker.lng} />

          <div className="flex gap-2">
            <button
              onClick={handleReroll}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold bg-white/90 backdrop-blur-sm text-text shadow transition-all active:scale-[0.98] disabled:opacity-40"
            >
              <RefreshCw size={16} />
              다시 뽑기
            </button>
            <button
              onClick={() => setShowVisit(true)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold bg-white/90 backdrop-blur-sm text-text shadow transition-all active:scale-[0.98]"
            >
              <Flag size={16} />
              도착 인증
            </button>
          </div>

          <button
            onClick={handleShare}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-white/80 backdrop-blur-sm text-text-light shadow transition-all active:scale-[0.98]"
          >
            <Share2 size={16} />
            친구에게 공유하기
          </button>

          {!currentBounds && (
            <button
              onClick={handleSetNewBounds}
              className="text-xs text-text-light underline"
            >
              새 범위 설정하기
            </button>
          )}
        </div>
      )}

      {!loading && !currentMarker && retryText && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20">
          <p className="text-white text-sm drop-shadow font-medium">
            {retryText}
          </p>
        </div>
      )}

      {showVisit && currentMarker && (
        <VisitForm
          address={currentMarker.address}
          onSubmit={handleVisitSubmit}
          onClose={() => setShowVisit(false)}
        />
      )}
    </div>
  )
}
