import { useEffect, useRef, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Loader2, RefreshCw } from 'lucide-react'
import MapView from '../components/MapView'
import ResultPin from '../components/ResultPin'
import NavLinks from '../components/NavLinks'
import VisitForm from '../components/VisitForm'
import { reverseGeocode } from '../lib/geocode'
import { generateRandomCoord } from '../lib/random'
import { createVisit } from '../lib/api'
import type { LatLng, RectBounds } from '../types'

interface ResultState {
  bounds: RectBounds
}

export default function Result() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as ResultState | null

  const [latlng, setLatlng] = useState<LatLng | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)
  const [redoLoading, setRedoLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const redoPromiseRef = useRef<Promise<void> | null>(null)

  const doFetch = useCallback(async (bounds: RectBounds) => {
    setLatlng(null)
    setAddress(null)
    setVisible(false)
    setLoading(true)
    setShowForm(false)

    const result = await generateRandomCoord(bounds, reverseGeocode)
    setLatlng({ lat: result.lat, lng: result.lng })
    setAddress(result.address)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!state?.bounds) {
      navigate('/', { replace: true })
      return
    }

    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    if (nav?.type === 'reload') {
      navigate('/', { replace: true })
      return
    }

    doFetch(state.bounds)
  }, [state?.bounds, doFetch, navigate])

  const handleRedo = useCallback(() => {
    if (!state?.bounds || redoPromiseRef.current) return

    if (!redoLoading) {
      setRedoLoading(true)
      const p = generateRandomCoord(state.bounds, reverseGeocode).then((result) => {
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
  }, [state?.bounds, redoLoading])

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
