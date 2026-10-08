import { ArrowUpRight } from 'lucide-react'
import type { CoordResult } from '../types'
import { getKakaoPlaceUrl } from '../lib/deeplink'

export default function KakaoPlaceLink({ place, compact = false }: { place: CoordResult; compact?: boolean }) {
  return <a data-glass="action" href={getKakaoPlaceUrl(place)} target="_blank" rel="noopener noreferrer" className={`flex min-h-11 min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-border bg-bg-secondary px-1.5 py-2.5 font-semibold hover:bg-border/60 ${compact ? 'text-xs sm:text-sm' : 'text-sm'}`}>
    카카오맵에서 확인<ArrowUpRight size={16} aria-hidden="true" className={compact ? 'hidden shrink-0 sm:block' : 'shrink-0'} /><span className="sr-only"> (새 창)</span>
  </a>
}
