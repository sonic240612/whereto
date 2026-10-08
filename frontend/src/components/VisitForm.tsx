import { useState, useCallback, useEffect, useId, useRef } from 'react'
import type { FormEvent } from 'react'
import { X, Send, Star, Loader2 } from 'lucide-react'
import useDialog from '../hooks/useDialog'
import HomeLink from './HomeLink'
import DesignSettings from './DesignSettings'

interface VisitFormProps {
  placeName: string
  defaultAddress: string
  initialRating?: number
  initialNote?: string
  title?: string
  submitLabel?: string
  onSubmit: (data: { name: string; address: string; rating: number; note: string }) => Promise<void>
  onCancel: () => void
}

const ratings = [1, 2, 3, 4, 5]
const inputClass = 'w-full px-4 py-3 rounded-xl bg-white border border-border text-sm font-medium text-text placeholder:text-text-light/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all'

export default function VisitForm({
  placeName,
  defaultAddress,
  initialRating = 3,
  initialNote = '',
  title = '방문 기록',
  submitLabel = '저장하기',
  onSubmit,
  onCancel,
}: VisitFormProps) {
  const id = useId()
  const [name, setName] = useState(placeName)
  const [address, setAddress] = useState(defaultAddress)
  const [rating, setRating] = useState(initialRating)
  const [note, setNote] = useState(initialNote)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const close = useCallback(() => {
    if (!savingRef.current) onCancel()
  }, [onCancel])
  const dialogRef = useDialog(close)

  useEffect(() => {
    if (!saving) return
    const protectSave = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', protectSave)
    return () => window.removeEventListener('beforeunload', protectSave)
  }, [saving])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (savingRef.current) return
    if (!address.trim()) {
      setError('주소를 입력해주세요.')
      return
    }
    savingRef.current = true
    setSaving(true)
    setError(null)
    try {
      await onSubmit({ name: name.trim(), address: address.trim(), rating, note: note.trim() })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '방문 기록을 저장하지 못했습니다. 다시 시도해주세요.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-storage`} tabIndex={-1} className="fixed inset-0 z-[1000] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={close} aria-hidden="true" />
      <div data-glass="panel" className="relative w-full max-w-2xl glass-strong rounded-t-3xl shadow-2xl p-6 pb-8 max-h-[calc(100dvh-env(safe-area-inset-top)-68px)] overflow-y-auto animate-[slideUp_0.3s_ease-out]">
        <div className="flex items-center justify-between mb-2">
          <h2 id={`${id}-title`} className="text-lg font-bold text-text">{title}</h2>
          <button data-glass="action" type="button" onClick={close} disabled={saving} aria-label="방문 기록 창 닫기" className="w-10 h-10 flex items-center justify-center rounded-full bg-border/50 hover:bg-border transition-colors text-text-light disabled:opacity-40">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p id={`${id}-storage`} className="text-xs text-text-light mb-5">기록은 이 브라우저에 저장됩니다. 방문 기록 화면에서 파일로 백업할 수 있어요.</p>
        <form onSubmit={handleSubmit} aria-busy={saving}>
          <fieldset disabled={saving} className="space-y-5 min-w-0">
            <div>
              <label htmlFor={`${id}-name`} className="block text-xs font-semibold text-text-light mb-1.5">장소 이름 (선택)</label>
              <input id={`${id}-name`} name="name" value={name} maxLength={200} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="장소 이름을 입력하세요" />
            </div>
            <div>
              <label htmlFor={`${id}-address`} className="block text-xs font-semibold text-text-light mb-1.5">주소</label>
              <input id={`${id}-address`} name="address" value={address} required maxLength={2000} onChange={(event) => setAddress(event.target.value)} className={inputClass} placeholder="주소를 입력하세요" />
            </div>
            <fieldset>
              <legend className="block text-xs font-semibold text-text-light mb-1.5">평점 · {rating}점</legend>
              <div className="flex gap-1.5">
                {ratings.map((value) => (
                  <label key={value} className="cursor-pointer">
                    <input type="radio" name={`${id}-rating`} value={value} checked={rating === value} onChange={() => setRating(value)} aria-label={`${value}점`} className="peer sr-only" />
                    <span className={`flex p-2 rounded-lg transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-primary ${value <= rating ? 'text-primary' : 'text-text-light'}`}>
                      <Star size={24} fill={value <= rating ? '#FF6B6B' : 'none'} aria-hidden="true" />
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor={`${id}-note`} className="block text-xs font-semibold text-text-light mb-1.5">메모 (선택)</label>
              <textarea id={`${id}-note`} name="note" value={note} maxLength={10000} onChange={(event) => setNote(event.target.value)} rows={3} className={`${inputClass} resize-y`} placeholder="메모를 입력하세요" />
            </div>
          </fieldset>
          {error && <div role="alert" className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600 font-medium break-words">{error}</div>}
          <button data-glass="action" data-glass-tone="accent" type="submit" disabled={!address.trim() || saving} className="w-full flex items-center justify-center gap-2 mt-4 py-3.5 rounded-xl text-base font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]" style={{ background: 'linear-gradient(135deg, #FF6B6B 0%, #ee5a24 100%)' }}>
            {saving ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
            {saving ? '저장 중...' : submitLabel}
          </button>
        </form>
      </div>
      <DesignSettings />
      <HomeLink disabled={saving} onClick={(event) => { if (savingRef.current) event.preventDefault() }} />
    </div>
  )
}
