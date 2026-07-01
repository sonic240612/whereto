import { useState } from 'react'
import { Camera, Send, X } from 'lucide-react'

interface VisitFormProps {
  address: string
  onSubmit: (data: { photoUrl?: string; comment?: string }) => void
  onClose: () => void
}

export default function VisitForm({
  address,
  onSubmit,
  onClose,
}: VisitFormProps) {
  const [comment, setComment] = useState('')
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      onSubmit({
        photoUrl: photoPreview ?? undefined,
        comment: comment || undefined,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 animate-in fade-in">
      <div className="w-full bg-white rounded-t-2xl p-5 animate-in slide-in-from-bottom">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text">도착 인증</h3>
          <button onClick={onClose} className="p-1 text-text-light hover:text-text">
            <X size={20} />
          </button>
        </div>

        <p className="text-sm text-text-light mb-4">{address}</p>

        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 p-3 rounded-xl border border-border cursor-pointer hover:bg-bg-secondary transition-colors">
            <Camera size={20} className="text-primary" />
            <span className="text-sm text-text-light">
              {photoPreview ? '사진 변경' : '사진 추가하기'}
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhoto}
              className="hidden"
            />
          </label>

          {photoPreview && (
            <div className="relative w-full h-48 rounded-xl overflow-hidden">
              <img
                src={photoPreview}
                alt="preview"
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => setPhotoPreview(null)}
                className="absolute top-2 right-2 p-1 bg-black/50 rounded-full"
              >
                <X size={16} className="text-white" />
              </button>
            </div>
          )}

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="운명의 장소에서의 소감을 남겨보세요..."
            maxLength={500}
            rows={3}
            className="w-full resize-none rounded-xl border border-border p-3 text-sm text-text placeholder:text-text-light outline-none focus:border-primary transition-colors"
          />

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center justify-center gap-2 py-3.5 rounded-xl text-base font-semibold text-white transition-all disabled:opacity-40"
            style={{ backgroundColor: '#FF6B6B' }}
          >
            <Send size={18} />
            {submitting ? '저장 중...' : '도착 완료!'}
          </button>
        </div>
      </div>
    </div>
  )
}
