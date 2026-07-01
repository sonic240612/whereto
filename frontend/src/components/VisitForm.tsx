import { useState, useCallback } from 'react'
import { X, Send, Star } from 'lucide-react'

interface VisitFormProps {
  placeName: string
  defaultAddress: string
  onSubmit: (data: { name: string; address: string; rating: number; note: string }) => void
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

  const handleSubmit = useCallback(() => {
    if (!name.trim()) return
    onSubmit({ name: name.trim(), address: address.trim(), rating, note: note.trim() })
  }, [name, address, rating, note, onSubmit])

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

        <button
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="w-full flex items-center justify-center gap-2 mt-7 py-3.5 rounded-xl text-base font-bold text-white transition-all duration-200 disabled:opacity-35 disabled:cursor-not-allowed active:scale-[0.98]"
          style={{
            background: name.trim()
              ? 'linear-gradient(135deg, #FF6B6B 0%, #ee5a24 100%)'
              : '#d1d5db',
          }}
        >
          <Send size={18} />
          저장하기
        </button>
      </div>
    </div>
  )
}
