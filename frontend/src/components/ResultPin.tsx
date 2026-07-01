import { useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'

interface ResultPinProps {
  address: string
  onVisible: () => void
}

export default function ResultPin({ address, onVisible }: ResultPinProps) {
  const [show, setShow] = useState(false)
  const [bounce, setBounce] = useState(false)

  useEffect(() => {
    setShow(false)
    setBounce(false)

    const showTimer = setTimeout(() => {
      setShow(true)
      const bounceTimer = setTimeout(() => setBounce(true), 100)
      return () => clearTimeout(bounceTimer)
    }, 300)

    return () => clearTimeout(showTimer)
  }, [address])

  useEffect(() => {
    if (bounce) {
      const timer = setTimeout(() => onVisible(), 600)
      return () => clearTimeout(timer)
    }
  }, [bounce, onVisible])

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`
          transition-all duration-500 ease-out
          ${show ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}
          ${bounce ? 'animate-bounce' : ''}
        `}
      >
        <div className="relative">
          <MapPin
            size={48}
            className="text-primary"
            fill="#FF6B6B"
            strokeWidth={1.5}
          />
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-primary rounded-full opacity-40 blur-sm" />
        </div>
      </div>

      <div
        className={`
          px-4 py-2 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-border
          transition-all duration-500 delay-300
          ${show && bounce ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
        `}
      >
        <p className="text-sm font-medium text-text whitespace-nowrap">
          {address}
        </p>
      </div>
    </div>
  )
}
