import { useEffect, useId, useRef, useState } from 'react'
import { Navigation, ChevronDown, Map, Globe, Apple } from 'lucide-react'
import { navigationApps } from '../lib/deeplink'

interface NavLinksProps {
  lat: number
  lng: number
  compact?: boolean
}

const appIcons: Record<string, typeof Map> = {
  google: Globe,
  apple: Apple,
}

export default function NavLinks({ lat, lng, compact = false }: NavLinksProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const available = navigationApps.filter((app) => {
    if (app.id === 'apple') {
      return /iPad|iPhone|iPod|Mac/.test(navigator.userAgent)
    }
    return true
  })

  return (
    <div ref={containerRef} className="flex min-w-0 flex-col-reverse gap-2">
      <button
        data-glass="action" data-glass-tone="accent"
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className={`flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-xl bg-teal-700 py-2.5 font-bold text-white transition-colors hover:bg-teal-800 ${compact ? 'gap-1 px-1.5 text-xs sm:text-sm' : 'gap-2 px-3 text-sm'}`}
      >
        <Navigation size={17} className={compact ? 'hidden shrink-0 sm:block' : 'shrink-0'} aria-hidden="true" />
        길찾기
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`shrink-0 transition-transform duration-200 ${compact ? 'w-3 sm:w-4' : ''} ${open ? '' : 'rotate-180'}`}
        />
      </button>

      {open && (
        <nav data-glass-menu id={id} aria-label="길찾기 앱 선택" className="min-w-0 rounded-xl border border-border bg-bg-secondary p-1">
           {available.map((app) => {
             const Icon = appIcons[app.id] || Map
             return (
               <a
                 key={app.id}
                 href={app.getUrl(lat, lng)}
                 target="_blank"
                 rel="noopener noreferrer"
                 onClick={() => { setOpen(false); buttonRef.current?.focus() }}
                 className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-text transition-colors hover:bg-white [overflow-wrap:anywhere]"
               >
                 <Icon size={16} className="shrink-0 text-text-light" aria-hidden="true" />
                 {app.name}으로 열기
               </a>
             )
           })}
        </nav>
      )}
    </div>
  )
}
