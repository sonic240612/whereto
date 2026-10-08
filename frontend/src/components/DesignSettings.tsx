import { useEffect, useId, useRef, useState } from 'react'
import { Droplets, PanelsTopLeft, RotateCcw, Settings2, Sparkles, X } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import useDesignTheme from '../hooks/useDesignTheme'
import { DEFAULT_GLASS_TINT } from '../lib/design'
import { drawModeLabels, type DrawMode } from '../lib/draw-mode'

export default function DesignSettings({ className = 'fixed right-3 top-[calc(env(safe-area-inset-top)+8px)] z-30' }: { className?: string }) {
  const { design, toggleDesign, glassTint, setGlassTint, glassMotion, setGlassMotion, drawMode, setDrawMode } = useDesignTheme()
  const { key: routeKey } = useLocation()
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === routeKey
  const liquid = design === 'liquid'
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    panel?.querySelector<HTMLElement>('input:not(:disabled), button')?.focus()
    const outside = (event: Event) => {
      if (event.target instanceof Node && !panel?.contains(event.target) && !triggerRef.current?.contains(event.target)) setOpenOn(null)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Close only this popover when it is inside the polygon/visit dialog.
      event.preventDefault()
      event.stopPropagation()
      setOpenOn(null)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('focusin', outside)
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('focusin', outside)
      document.removeEventListener('keydown', escape, true)
    }
  }, [open])

  const close = () => { setOpenOn(null); triggerRef.current?.focus() }
  return <>
    <button ref={triggerRef} type="button" data-glass="toggle" aria-label={open ? '설정 닫기' : '설정 열기'} aria-expanded={open} aria-controls={open ? `${id}-panel` : undefined} aria-haspopup="dialog" onClick={() => setOpenOn(open ? null : routeKey)} title="설정" className={`pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/80 bg-white/95 text-text shadow-md backdrop-blur transition-colors hover:bg-bg-secondary ${className}`}>
      <Settings2 size={20} aria-hidden="true" />
    </button>
    {open && <div ref={panelRef} id={`${id}-panel`} role="dialog" aria-labelledby={`${id}-title`} data-glass="panel" data-design-settings-panel className="pointer-events-auto fixed right-3 top-[calc(env(safe-area-inset-top)+60px)] z-50 max-h-[calc(100dvh-env(safe-area-inset-top)-84px)] w-[min(320px,calc(100vw-24px))] overflow-y-auto rounded-2xl border border-white/80 bg-white/95 p-4 text-text shadow-xl backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="text-base font-bold">설정</h2>
        <button type="button" data-glass="action" aria-label="설정 창 닫기" onClick={close} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-bg-secondary"><X size={18} aria-hidden="true" /></button>
      </div>
      <fieldset className="mb-5 border-b border-border/60 pb-4" aria-describedby={`${id}-draw-hint`}>
        <legend className="mb-2 text-sm font-semibold">추첨 방식</legend>
        <div className="grid grid-cols-2 gap-2">
          {(['popular', 'complete'] as DrawMode[]).map(mode => <label key={mode} data-glass="action" data-glass-tone={drawMode === mode ? 'accent' : undefined} className={`relative flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-2 py-2 text-center text-sm font-semibold focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary-dark ${drawMode === mode ? 'border-teal-600 bg-teal-100/70' : 'border-border bg-bg-secondary'}`}>
            <input type="radio" name={`${id}-draw-mode`} value={mode} checked={drawMode === mode} onChange={() => setDrawMode(mode)} className="sr-only" />
            {drawModeLabels[mode]}
          </label>)}
        </div>
        <p id={`${id}-draw-hint`} className="mt-2 text-xs leading-relaxed text-text-light">{drawMode === 'complete'
          ? '영역 안에서 위치를 무작위로 고른 뒤 주변 장소 중 하나를 뽑아요. 장소가 없으면 다른 위치에서 다시 찾아요. 모든 장소의 당첨 확률이 같지는 않아요.'
          : '카카오 검색 상위 후보에서 빠르게 뽑아요. 실제 인기 순위를 뜻하지는 않아요.'}</p>
      </fieldset>
      <button type="button" data-glass="action" data-glass-tone="accent" aria-label={liquid ? '클래식 디자인으로 전환' : 'Liquid Glass 디자인으로 전환'} aria-pressed={liquid} onClick={toggleDesign} className="mb-5 flex min-h-11 w-full items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold">
        {liquid ? <Droplets size={18} aria-hidden="true" /> : <PanelsTopLeft size={18} aria-hidden="true" />}
        <span>{liquid ? 'Liquid Glass' : '클래식'}</span>
        <span className="ml-auto text-xs font-medium">{liquid ? '클래식으로 전환' : '유리 디자인으로 전환'}</span>
      </button>
      <div className="mb-5 border-b border-border/60 pb-4">
        <button type="button" role="switch" aria-label="모션 효과" aria-checked={glassMotion === 'full'} disabled={!liquid} onClick={() => setGlassMotion(glassMotion === 'full' ? 'reduced' : 'full')} className="flex min-h-11 w-full items-center gap-2 rounded-xl text-left text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">
          <Sparkles size={17} aria-hidden="true" /><span>모션 효과</span>
          <span className="ml-auto text-xs font-medium">{glassMotion === 'full' ? '켜짐' : '꺼짐'}</span>
          <span aria-hidden="true" className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${glassMotion === 'full' ? 'bg-[#0f7185]' : 'bg-slate-300'}`}><span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${glassMotion === 'full' ? 'translate-x-4' : ''}`} /></span>
        </button>
        <p className="mt-1 text-xs leading-relaxed text-text-light">호버·누름·선택 렌즈의 부드러운 움직임을 켜고 끌 수 있어요.</p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`${id}-tint`} className="text-sm font-semibold">유리 틴트 농도</label>
        <output htmlFor={`${id}-tint`} className="text-sm font-semibold tabular-nums">{glassTint}%</output>
      </div>
      <input id={`${id}-tint`} type="range" min={0} max={100} step={1} value={glassTint} disabled={!liquid} data-glass-motion="off" aria-describedby={`${id}-hint`} aria-valuetext={`${glassTint}%`} onChange={event => setGlassTint(Number(event.currentTarget.value))} className="my-1 h-11 w-full cursor-pointer accent-[#0f7185] disabled:cursor-not-allowed disabled:opacity-40" />
      <div className="flex justify-between text-xs text-text-light"><span>맑게</span><span>진하게</span></div>
      <p id={`${id}-hint`} className="mt-3 text-xs leading-relaxed text-text-light">{liquid ? '지도 위 유리의 색 농도에 바로 반영돼요.' : 'Liquid Glass로 전환하면 틴트를 조절할 수 있어요.'}</p>
      <button type="button" data-glass="action" disabled={!liquid || glassTint === DEFAULT_GLASS_TINT} onClick={() => setGlassTint(DEFAULT_GLASS_TINT)} className="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw size={14} aria-hidden="true" />기본값으로 · {DEFAULT_GLASS_TINT}%</button>
    </div>}
  </>
}
