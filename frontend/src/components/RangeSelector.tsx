import { useState, useCallback } from 'react'
import { MapIcon } from 'lucide-react'
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
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 p-4 bg-white/95 backdrop-blur-sm shadow-sm">
        <button
          onClick={onCancel}
          className="text-sm text-text-light hover:text-text transition-colors"
        >
          ← 취소
        </button>
        <h2 className="text-base font-semibold text-text flex-1 text-center mr-8">
          탐색 범위 지정하기
        </h2>
      </div>

      <MapView
        center={userLocation ?? undefined}
        selecting={true}
        onBoundsChange={handleBoundsChange}
        className="flex-1"
      />

      <div className="absolute bottom-0 left-0 right-0 z-10 p-4 bg-white/95 backdrop-blur-sm">
        <div className="flex items-center gap-3 mb-3 text-sm text-text-light">
          <MapIcon size={18} />
          <span>지도를 드래그하여 탐색할 범위를 지정하세요</span>
        </div>
        <button
          onClick={handleConfirm}
          disabled={!bounds}
          className="w-full py-3.5 rounded-xl text-base font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor: bounds ? '#FF6B6B' : '#ccc',
          }}
        >
          {bounds ? '이 범위에서 뽑기' : '범위를 먼저 지정해주세요'}
        </button>
      </div>
    </div>
  )
}
