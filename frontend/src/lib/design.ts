export type DesignTheme = 'liquid' | 'classic'
export type GlassMotion = 'full' | 'reduced'
export const DESIGN_STORAGE_KEY = 'whereto_design'
export const GLASS_TINT_STORAGE_KEY = 'whereto_glass_tint'
export const DEFAULT_GLASS_TINT = 80
export const GLASS_MOTION_STORAGE_KEY = 'whereto_glass_motion'

export function parseGlassMotion(value: string | null): GlassMotion {
  return value === 'reduced' ? 'reduced' : 'full'
}

export function readGlassMotion(): GlassMotion {
  try { return parseGlassMotion(localStorage.getItem(GLASS_MOTION_STORAGE_KEY)) }
  catch { return 'full' }
}

export function parseDesignTheme(value: string | null): DesignTheme {
  return value === 'classic' ? 'classic' : 'liquid'
}

export function readDesignTheme(): DesignTheme {
  try { return parseDesignTheme(localStorage.getItem(DESIGN_STORAGE_KEY)) }
  catch { return 'liquid' }
}

export function normalizeGlassTint(value: number): number {
  return Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value))) : DEFAULT_GLASS_TINT
}

export function parseGlassTint(value: string | null): number {
  return value === null || value.trim() === '' ? DEFAULT_GLASS_TINT : normalizeGlassTint(Number(value))
}

export function readGlassTint(): number {
  try { return parseGlassTint(localStorage.getItem(GLASS_TINT_STORAGE_KEY)) }
  catch { return DEFAULT_GLASS_TINT }
}
