import { useState } from 'react'
import { Navigation, ChevronDown, Map, Globe, Apple } from 'lucide-react'
import { navigationApps } from '../lib/deeplink'

interface NavLinksProps {
  lat: number
  lng: number
}

const appIcons: Record<string, typeof Map> = {
  google: Globe,
  apple: Apple,
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
        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-base font-bold text-white shadow-lg shadow-secondary/30 transition-all duration-200 active:scale-[0.97]"
        style={{
          background: 'linear-gradient(135deg, #4ECDC4 0%, #44bdac 100%)',
        }}
      >
        <Navigation size={20} />
        길찾기
        <ChevronDown
          size={18}
          className={`transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 right-0 glass-strong rounded-2xl shadow-xl overflow-hidden divide-y divide-border">
           {available.map((app) => {
             const Icon = appIcons[app.id] || Map
             return (
               <a
                 key={app.id}
                 href={app.getUrl(lat, lng)}
                 target="_blank"
                 rel="noopener noreferrer"
                 onClick={() => setOpen(false)}
                 className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-text hover:bg-bg-secondary transition-colors duration-150 active:bg-border"
               >
                 <Icon size={18} className="text-text-light shrink-0" />
                 {app.name}으로 열기
               </a>
             )
           })}
        </div>
      )}
    </div>
  )
}
