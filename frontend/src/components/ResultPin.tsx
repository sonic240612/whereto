import { MapPin } from 'lucide-react'

interface ResultPinProps {
  address: string
  label?: string
  expanded?: boolean
}

export default function ResultPin({ address, label = '이번 목적지', expanded = false }: ResultPinProps) {
  return (
    <div className="flex min-w-0 flex-1 items-start gap-2.5">
      <MapPin size={20} className="mt-1 shrink-0 text-primary-dark" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 text-[11px] font-medium text-text-light">{label}</p>
        <p className={`whitespace-normal text-sm font-semibold leading-5 text-text [overflow-wrap:anywhere] ${expanded ? '' : 'line-clamp-2'}`}>{address}</p>
      </div>
    </div>
  )
}
