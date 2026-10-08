import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigation, ArrowUpRight, Map, Globe, Apple, X } from 'lucide-react'
import { navigationApps } from '../lib/deeplink'
import useDialog from '../hooks/useDialog'

interface NavLinksProps {
  lat: number
  lng: number
  compact?: boolean
}

const appIcons: Record<string, typeof Map> = { google: Globe, apple: Apple }

function NavigationDialog({ lat, lng, id, onClose }: NavLinksProps & { id: string; onClose: () => void }) {
  const dialogRef = useDialog(onClose)
  const available = navigationApps.filter(app => app.id !== 'apple' || /iPad|iPhone|iPod|Mac/.test(navigator.userAgent))

  // A portal keeps the popup outside the measured result dock and its glass layer.
  return createPortal(
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/15 p-4" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="navigation-popup w-full max-w-sm">
        <div ref={dialogRef} id={id} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} tabIndex={-1} data-glass="panel" data-navigation-popup className="relative max-h-[calc(100dvh-48px)] overflow-y-auto rounded-3xl border border-white/80 bg-white/95 p-5 text-text shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <h2 id={`${id}-title`} className="text-lg font-bold">길찾기</h2>
            <button type="button" data-glass="action" onClick={onClose} aria-label="길찾기 창 닫기" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bg-secondary text-text-light hover:bg-border">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <p id={`${id}-description`} className="mb-5 mt-1 text-sm text-text-light">목적지로 안내할 지도 앱을 선택하세요.</p>
          <nav aria-label="길찾기 앱 선택" className="space-y-3">
            {available.map(app => {
              const Icon = appIcons[app.id] || Map
              return <a key={app.id} data-glass="action" data-glass-tone={app.id === 'kakao' ? 'accent' : undefined} href={app.getUrl(lat, lng)} target="_blank" rel="noopener noreferrer" onClick={onClose} className="relative flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-bg-secondary px-4 py-3 text-sm font-semibold hover:bg-border/60">
                <Icon size={20} className="shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 break-words">{app.name}</span>
                <ArrowUpRight size={18} className="shrink-0" aria-hidden="true" />
                <span className="sr-only">으로 길찾기 (새 창)</span>
              </a>
            })}
          </nav>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function NavLinks({ lat, lng, compact = false }: NavLinksProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return <>
    <button data-glass="action" data-glass-tone="accent" type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(true)} className={`flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-xl bg-teal-700 py-2.5 font-bold text-white transition-colors hover:bg-teal-800 ${compact ? 'gap-1 px-1.5 text-xs sm:text-sm' : 'gap-2 px-3 text-sm'}`}>
      <Navigation size={17} className={compact ? 'hidden shrink-0 sm:block' : 'shrink-0'} aria-hidden="true" />
      길찾기
    </button>
    {open && <NavigationDialog lat={lat} lng={lng} id={id} onClose={() => setOpen(false)} />}
  </>
}
