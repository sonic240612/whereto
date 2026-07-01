import { useState } from 'react'
import { Navigation, ChevronDown } from 'lucide-react'
import { navigationApps } from '../lib/deeplink'

interface NavLinksProps {
  lat: number
  lng: number
}

export default function NavLinks({ lat, lng }: NavLinksProps) {
  const [open, setOpen] = useState(false)

  const available = navigationApps.filter((app) => {
    if (app.id === 'apple') {
      return /iPad|iPhone|iPod|Mac/.test(navigator.userAgent)
    }
    return true
  })

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-base font-semibold transition-all"
        style={{ backgroundColor: '#4ECDC4', color: 'white' }}
      >
        <Navigation size={20} />
        길찾기
        <ChevronDown
          size={16}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 right-0 bg-white rounded-xl shadow-lg border border-border overflow-hidden">
          {available.map((app) => (
            <button
              key={app.id}
              onClick={() => {
                app.action(lat, lng)
                setOpen(false)
              }}
              className="w-full px-4 py-3 text-sm text-text hover:bg-bg-secondary transition-colors text-left"
            >
              {app.name}으로 열기
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
