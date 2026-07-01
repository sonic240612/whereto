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

    const showTimer = setTimeout(() => setShow(true), 300)
    return () => clearTimeout(showTimer)
  }, [address])

  useEffect(() => {
    if (!show) return
    const bounceTimer = setTimeout(() => setBounce(true), 100)
    const visibleTimer = setTimeout(() => onVisible(), 800)
    return () => {
      clearTimeout(bounceTimer)
      clearTimeout(visibleTimer)
    }
  }, [show, onVisible])

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`transition-all duration-500 ease-out ${
          show ? 'opacity-100 scale-100' : 'opacity-0 scale-0'
        } ${bounce ? 'animate-bounce' : ''}`}
      >
        <div className="relative">
          <div className="absolute -inset-3 bg-primary/20 rounded-full blur-xl animate-pulse" />
          <MapPin
            size={52}
            className="text-primary relative"
            fill="#FF6B6B"
            strokeWidth={1.5}
          />
        </div>
      </div>

      <div
        className={`px-5 py-2.5 glass-strong rounded-2xl shadow-xl transition-all duration-500 delay-300 ${
          show && bounce ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
        }`}
      >
        <p className="text-sm font-semibold text-text whitespace-nowrap">
          {address}
        </p>
      </div>
    </div>
  )
}
