import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Star, Trash2, ArrowLeft, Calendar, MessageSquare } from 'lucide-react'
import { fetchVisits, deleteVisit } from '../lib/api'
import type { Visit } from '../types'

export default function Gallery() {
  const navigate = useNavigate()
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<number | null>(null)

  useEffect(() => {
    fetchVisits()
      .then(setVisits)
      .catch(() => setVisits([]))
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = useCallback(
    async (id: number) => {
      setDeleting(id)
      try {
        await deleteVisit(id)
        setVisits((prev) => prev.filter((v) => v.id !== id))
      } catch {
        // ignore
      } finally {
        setDeleting(null)
      }
    },
    [],
  )

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <div className="min-h-dvh bg-bg-secondary">
      <div className="sticky top-0 z-20 glass-strong border-b border-border/50">
        <div className="flex items-center gap-3 px-5 py-4">
          <button
            onClick={() => navigate('/')}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-border/50 transition-colors text-text"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-extrabold text-text">방문 기록</h1>
        </div>
      </div>

      <div className="p-5 space-y-4 pb-8">
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-2xl bg-white overflow-hidden border border-border"
              >
                <div className="p-5 space-y-3">
                  <div className="h-5 bg-border/70 rounded-lg w-2/3 shimmer" />
                  <div className="h-4 bg-border/50 rounded-lg w-full shimmer" />
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <div key={s} className="w-5 h-5 rounded bg-border/50 shimmer" />
                    ))}
                  </div>
                  <div className="h-4 bg-border/50 rounded-lg w-1/3 shimmer" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && visits.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
            <div className="w-16 h-16 rounded-full bg-border/50 flex items-center justify-center mb-5">
              <MapPin size={28} className="text-text-light" />
            </div>
            <p className="text-base font-bold text-text mb-1.5">
              아직 방문 기록이 없어요
            </p>
            <p className="text-sm text-text-light mb-6 max-w-[200px]">
              운명의 장소를 뽑고 방문 기록을 남겨보세요
            </p>
            <button
              onClick={() => navigate('/')}
              className="px-6 py-3 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.97]"
              style={{
                background: 'linear-gradient(135deg, #FF6B6B 0%, #ee5a24 100%)',
              }}
            >
              장소 뽑으러 가기
            </button>
          </div>
        )}

        {!loading &&
          visits.map((visit) => (
            <div
              key={visit.id}
              className="rounded-2xl bg-white overflow-hidden border border-border shadow-md hover:shadow-lg transition-all"
            >
              <div className="p-5 space-y-3.5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-bold text-text leading-snug">
                    {visit.name}
                  </h3>
                  <button
                    onClick={() => handleDelete(visit.id)}
                    disabled={deleting === visit.id}
                    className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50 transition-colors text-text-light hover:text-red-500 disabled:opacity-40"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="flex items-start gap-2 text-xs text-text-light">
                  <MapPin size={13} className="shrink-0 mt-0.5 text-primary" />
                  <span className="leading-relaxed">{visit.address}</span>
                </div>

                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((r) => (
                    <Star
                      key={r}
                      size={16}
                      fill={r <= visit.rating ? '#FF6B6B' : 'none'}
                      className={r <= visit.rating ? 'text-primary' : 'text-border'}
                    />
                  ))}
                </div>

                {visit.note && (
                  <div className="flex items-start gap-2 text-xs text-text-light bg-bg-secondary rounded-xl p-3">
                    <MessageSquare size={13} className="shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{visit.note}</span>
                  </div>
                )}

                <div className="flex items-center gap-1.5 text-[11px] font-medium text-text-light">
                  <Calendar size={12} />
                  {formatDate(visit.created_at)}
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}
