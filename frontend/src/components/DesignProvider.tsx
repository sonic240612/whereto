import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { DesignContext } from '../hooks/useDesignTheme'
import { DESIGN_STORAGE_KEY, GLASS_TINT_STORAGE_KEY, GLASS_MOTION_STORAGE_KEY, normalizeGlassTint, parseDesignTheme, parseGlassTint, parseGlassMotion, readDesignTheme, readGlassTint, readGlassMotion, type GlassMotion } from '../lib/design'
import LiquidGlassFilters from './LiquidGlassFilters'
import LiquidGlassMotion from './LiquidGlassMotion'

export default function DesignProvider({ children }: { children: ReactNode }) {
  const [design, setDesign] = useState(readDesignTheme)
  const [glassTint, setTint] = useState(readGlassTint)
  const [glassMotion, setMotion] = useState(readGlassMotion)
  useLayoutEffect(() => { document.documentElement.dataset.design = design }, [design])
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--glass-tint-strength', String(glassTint / 50))
  }, [glassTint])
  useLayoutEffect(() => { document.documentElement.dataset.glassMotion = glassMotion }, [glassMotion])
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === DESIGN_STORAGE_KEY || event.key === null) setDesign(parseDesignTheme(event.newValue))
      if (event.key === GLASS_TINT_STORAGE_KEY || event.key === null) setTint(parseGlassTint(event.newValue))
      if (event.key === GLASS_MOTION_STORAGE_KEY || event.key === null) setMotion(parseGlassMotion(event.newValue))
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  const toggleDesign = useCallback(() => {
    setDesign(current => {
      const next = current === 'liquid' ? 'classic' : 'liquid'
      try { localStorage.setItem(DESIGN_STORAGE_KEY, next) } catch { /* Switching still works when browser storage is unavailable. */ }
      return next
    })
  }, [])
  const setGlassTint = useCallback((value: number) => {
    const next = normalizeGlassTint(value)
    setTint(next)
    try { localStorage.setItem(GLASS_TINT_STORAGE_KEY, String(next)) } catch { /* The slider still works when storage is unavailable. */ }
  }, [])
  const setGlassMotion = useCallback((value: GlassMotion) => {
    const next = parseGlassMotion(value)
    setMotion(next)
    try { localStorage.setItem(GLASS_MOTION_STORAGE_KEY, next) } catch { /* Interaction works even when storage is unavailable. */ }
  }, [])
  const value = useMemo(() => ({ design, toggleDesign, glassTint, setGlassTint, glassMotion, setGlassMotion }), [design, toggleDesign, glassTint, setGlassTint, glassMotion, setGlassMotion])
  return <DesignContext.Provider value={value}>
    {children}
    <LiquidGlassFilters enabled={design === 'liquid'} />
    <LiquidGlassMotion enabled={design === 'liquid' && glassMotion === 'full'} />
  </DesignContext.Provider>
}
