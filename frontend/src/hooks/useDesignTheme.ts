import { createContext, useContext } from 'react'
import type { DesignTheme, GlassMotion } from '../lib/design'
import type { DrawMode } from '../lib/draw-mode'

export const DesignContext = createContext<{
  design: DesignTheme
  toggleDesign: () => void
  glassTint: number
  setGlassTint: (value: number) => void
  glassMotion: GlassMotion
  setGlassMotion: (value: GlassMotion) => void
  drawMode: DrawMode
  setDrawMode: (value: DrawMode) => void
} | null>(null)

export default function useDesignTheme() {
  const context = useContext(DesignContext)
  if (!context) throw new Error('DesignProvider is missing')
  return context
}
