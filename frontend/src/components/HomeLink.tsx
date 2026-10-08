import type { MouseEventHandler } from 'react'
import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

interface HomeLinkProps {
  onClick?: MouseEventHandler<HTMLAnchorElement>
  disabled?: boolean
}

export default function HomeLink({ onClick, disabled = false }: HomeLinkProps) {
  const className = 'pointer-events-auto fixed left-3 top-[calc(env(safe-area-inset-top)+8px)] z-30 flex h-11 items-center gap-1.5 rounded-2xl border border-white/80 bg-white/95 px-3 text-text shadow-md backdrop-blur hover:bg-bg-secondary'
  const content = <><Compass size={21} className="shrink-0 text-primary" aria-hidden="true" /><span className="text-sm font-extrabold tracking-tight">WhereTo</span></>

  if (disabled) return <span data-glass="control" role="link" aria-label="WhereTo 홈으로" aria-disabled="true" className={`${className} opacity-60`}>{content}</span>
  return <Link data-glass="control" to="/" onClick={onClick} aria-label="WhereTo 홈으로" title="홈으로" className={className}>{content}</Link>
}
