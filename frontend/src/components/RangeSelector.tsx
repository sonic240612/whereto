import { useState, useCallback } from 'react'
import { MapIcon, X } from 'lucide-react'
import MapView from './MapView'
import type { LatLng, RectBounds } from '../types'

interface RangeSelectorProps {
  userLocation: LatLng | null
  onConfirm: (bounds: RectBounds) => void
  onCancel: () => void
}

export default function RangeSelector({
  userLocation,
  onConfirm,
  onCancel,
}: RangeSelectorProps) {
  const [bounds, setBounds] = useState<RectBounds | null>(null)

  const handleBoundsChange = useCallback((b: RectBounds) => {
    setBounds(b)
  }, [])

  const handleConfirm = useCallback(() => {
    if (bounds) onConfirm(bounds)
  }, [bounds, onConfirm])

  return (
    <div className="fixed inset-0 flex flex-col z-40">
      <div className="absolute top-0 left-0 right-0 z-10">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={onCancel}
            className="w-9 h-9 flex items-center justify-center rounded-full glass-strong shadow-lg text-text hover:text-text-light transition-colors"
          >
            <X size={18} />
          </button>
          <h2 className="text-sm font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
            탐색 범위 지정하기
          </h2>
          <div className="w-9" />
        </div>
      </div>

      <MapView
        center={userLocation ?? undefined}
        selecting={true}
        onBoundsChange={handleBoundsChange}
        className="flex-1"
      />

      <div className="absolute bottom-0 left-0 right-0 z-10 p-5">
        <div className="glass-strong rounded-2xl p-4 shadow-2xl">
          <div className="flex items-center gap-2.5 mb-3.5 text-sm text-text-light">
            <MapIcon size={16} className="shrink-0" />
            <span>지도를 드래그하여 탐색할 범위를 지정하세요</span>
          </div>
          <button
            onClick={handleConfirm}
            disabled={!bounds}
            className="w-full py-3.5 rounded-xl text-base font-bold text-white transition-all duration-200 disabled:opacity-35 disabled:cursor-not-allowed active:scale-[0.98]"
            style={{
              background: bounds
                ? 'linear-gradient(135deg, #FF6B6B 0%, #ee5a24 100%)'
                : '#d1d5db',
            }}
          >
            {bounds ? '이 범위에서 뽑기' : '범위를 먼저 지정해주세요'}
          </button>
        </div>
      </div>
    </div>
  )
}
