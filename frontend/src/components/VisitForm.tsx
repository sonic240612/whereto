import { useState, useCallback } from 'react'
import { X, Send, Star, Loader2 } from 'lucide-react'

interface VisitFormProps {
  placeName: string
  defaultAddress: string
  onSubmit: (data: { name: string; address: string; rating: number; note: string }) => Promise<void>
  onCancel: () => void
}

const ratings = [1, 2, 3, 4, 5]

export default function VisitForm({
  placeName,
  defaultAddress,
  onSubmit,
  onCancel,
}: VisitFormProps) {
  const [name, setName] = useState(placeName)
  const [address, setAddress] = useState(defaultAddress)
  const [rating, setRating] = useState(3)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit({ name: name.trim(), address: address.trim(), rating, note: note.trim() })
    } catch {
      setError('저장에 실패했습니다. 서버가 실행 중인지 확인해주세요.')
    } finally {
      setSaving(false)
    }
  }, [name, address, rating, note, onSubmit, saving])

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full glass-strong rounded-t-3xl shadow-2xl p-6 pb-8 max-h-[85vh] overflow-y-auto animate-[slideUp_0.3s_ease-out]">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-text">방문 기록</h3>
          <button
            onClick={onCancel}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-border/50 hover:bg-border transition-colors text-text-light"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-text-light mb-1.5 uppercase tracking-wider">
              장소 이름
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white border border-border text-sm font-medium text-text placeholder:text-text-light/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              placeholder="장소 이름을 입력하세요"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-light mb-1.5 uppercase tracking-wider">
              주소
            </label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white border border-border text-sm font-medium text-text placeholder:text-text-light/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              placeholder="주소를 입력하세요"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-light mb-1.5 uppercase tracking-wider">
              평점
            </label>
            <div className="flex gap-1.5">
              {ratings.map((r) => (
                <button
                  key={r}
                  onClick={() => setRating(r)}
                  className={`p-1.5 rounded-lg transition-all duration-200 ${
                    r <= rating
                      ? 'text-primary scale-100'
                      : 'text-border hover:text-border/70 scale-90'
                  }`}
                >
                  <Star size={24} fill={r <= rating ? '#FF6B6B' : 'none'} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-light mb-1.5 uppercase tracking-wider">
              메모
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-white border border-border text-sm font-medium text-text placeholder:text-text-light/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none"
              placeholder="메모를 입력하세요"
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600 font-medium">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!name.trim() || saving}
          className="w-full flex items-center justify-center gap-2 mt-4 py-3.5 rounded-xl text-base font-bold text-white transition-all duration-200 disabled:opacity-35 disabled:cursor-not-allowed active:scale-[0.98]"
          style={{
            background: !name.trim() || saving
              ? '#d1d5db'
              : 'linear-gradient(135deg, #FF6B6B 0%, #ee5a24 100%)',
          }}
        >
          {saving ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Send size={18} />
          )}
          {saving ? '저장 중...' : '저장하기'}
        </button>
      </div>
    </div>
  )
}
