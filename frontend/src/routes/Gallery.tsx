import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ImageOff } from 'lucide-react'
import { fetchVisits } from '../lib/api'
import type { Visit } from '../types'

export default function Gallery() {
  const navigate = useNavigate()
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchVisits()
      setVisits(data)
    } catch {
      setVisits([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="min-h-dvh bg-bg-secondary">
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3 p-4">
          <button
            onClick={() => navigate('/')}
            className="text-text-light hover:text-text transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-base font-semibold text-text">운명의 갤러리</h2>
        </div>
      </div>

      <div className="p-4">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && visits.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <ImageOff size={48} className="text-text-light" />
            <p className="text-text-light text-sm">
              아직 방문 인증이 없습니다
            </p>
            <p className="text-text-light text-xs">
              먼저 운명의 장소를 찾아 떠나볼까요?
            </p>
          </div>
        )}

        {!loading && visits.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {visits.map((visit) => (
              <div
                key={visit.id}
                className="bg-white rounded-xl overflow-hidden shadow-sm"
              >
                {visit.photoUrl ? (
                  <img
                    src={visit.photoUrl}
                    alt={visit.address}
                    className="w-full aspect-square object-cover"
                  />
                ) : (
                  <div className="w-full aspect-square bg-bg-secondary flex items-center justify-center">
                    <ImageOff size={32} className="text-text-light" />
                  </div>
                )}
                <div className="p-2.5">
                  <p className="text-xs text-text truncate">{visit.address}</p>
                  {visit.comment && (
                    <p className="text-[11px] text-text-light mt-1 line-clamp-2">
                      {visit.comment}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
