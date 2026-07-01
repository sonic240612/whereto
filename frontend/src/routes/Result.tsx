import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Loader2, RefreshCw, MapPin } from 'lucide-react'
import MapView from '../components/MapView'
import ResultPin from '../components/ResultPin'
import NavLinks from '../components/NavLinks'
import VisitForm from '../components/VisitForm'
import { reverseGeocode } from '../lib/geocode'
import { generateRandomCoord } from '../lib/random'
import { createVisit } from '../lib/api'
import type { LatLng, RectBounds } from '../types'

function parseBounds(): RectBounds | null {
  const sp = new URLSearchParams(window.location.search)
  const minLat = parseFloat(sp.get('minLat') ?? '')
  const maxLat = parseFloat(sp.get('maxLat') ?? '')
  const minLng = parseFloat(sp.get('minLng') ?? '')
  const maxLng = parseFloat(sp.get('maxLng') ?? '')
  if (isNaN(minLat) || isNaN(maxLat) || isNaN(minLng) || isNaN(maxLng)) return null
  return { minLat, maxLat, minLng, maxLng }
}

export default function Result() {
  const bounds = useMemo(() => parseBounds(), [])

  const [latlng, setLatlng] = useState<LatLng | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)
  const [redoLoading, setRedoLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const redoPromiseRef = useRef<Promise<void> | null>(null)

  const doFetch = useCallback(async (b: RectBounds) => {
    setLatlng(null)
    setAddress(null)
    setVisible(false)
    setLoading(true)
    setShowForm(false)

    const result = await generateRandomCoord(b, reverseGeocode)
    setLatlng({ lat: result.lat, lng: result.lng })
    setAddress(result.address)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!bounds) {
      window.location.href = '/'
      return
    }

    const entries = performance.getEntriesByType('navigation')
    const nav = entries[0] as PerformanceNavigationTiming | undefined
    if (nav?.type === 'reload') {
      window.location.href = '/'
      return
    }

    doFetch(bounds)
  }, [bounds, doFetch])

  const handleRedo = useCallback(() => {
    if (!bounds || redoPromiseRef.current) return

    if (!redoLoading) {
      setRedoLoading(true)
      const p = generateRandomCoord(bounds, reverseGeocode).then((result) => {
        setLatlng({ lat: result.lat, lng: result.lng })
        setAddress(result.address)
        setLoading(false)
        setRedoLoading(false)
        redoPromiseRef.current = null
      })
      redoPromiseRef.current = p
    }

    setLatlng(null)
    setAddress(null)
    setVisible(false)
    setLoading(true)
    setShowForm(false)
  }, [bounds, redoLoading])

  const handleSave = useCallback(
    async (data: { name: string; address: string; rating: number; note: string }) => {
      if (!latlng) return
      await createVisit({
        ...data,
        lat: latlng.lat,
        lng: latlng.lng,
      })
      setShowForm(false)
    },
    [latlng],
  )

  if (!bounds) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh p-8 text-center bg-bg">
        <MapPin size={48} className="text-border mb-6" />
        <h2 className="text-xl font-bold text-text mb-2">잘못된 접근</h2>
        <p className="text-sm text-text-light mb-6 max-w-xs">
          탐색 범위 정보가 없습니다.
        </p>
        <a
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all"
          style={{
            background: 'linear-gradient(135deg, #FF6B6B 0%, #ee5a24 100%)',
          }}
        >
          처음으로 돌아가기
        </a>
      </div>
    )
  }

  return (
    <div className="relative min-h-dvh flex flex-col">
      <div className="relative flex-1 min-h-[50dvh]">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg gap-4 z-20">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
              <Loader2 size={44} className="text-primary animate-spin relative" />
            </div>
            <p className="text-sm font-semibold text-text-light animate-pulse">
              운명의 장소를 찾는 중...
            </p>
          </div>
        )}

        <MapView
          center={loading || !latlng ? undefined : latlng}
          marker={latlng}
          className="absolute inset-0"
        />

        {!loading && latlng && address && (
          <div className="absolute top-0 left-0 right-0 z-10 p-5">
            <div className="flex items-center justify-center">
              <ResultPin
                address={address}
                onVisible={() => setVisible(true)}
              />
            </div>
          </div>
        )}
      </div>

      <div
        className={`transition-all duration-500 ease-out ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        <div className="glass-strong rounded-t-3xl p-5 pb-8 space-y-3 shadow-2xl">
          {latlng && address && (
            <NavLinks lat={latlng.lat} lng={latlng.lng} />
          )}

          <div className="flex gap-2.5">
            <button
              onClick={handleRedo}
              disabled={redoLoading}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-text bg-white border border-border transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
            >
              <RefreshCw
                size={16}
                className={redoLoading ? 'animate-spin' : ''}
              />
              다시 뽑기
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
              style={{
                background: 'linear-gradient(135deg, #4ECDC4 0%, #44bdac 100%)',
              }}
            >
              방문 기록하기
            </button>
          </div>
        </div>
      </div>

      {showForm && latlng && address && (
        <VisitForm
          placeName=""
          defaultAddress={address}
          onSubmit={handleSave}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  )
}
