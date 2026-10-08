export type DrawMode = 'popular' | 'complete'
export const DRAW_MODE_STORAGE_KEY = 'whereto_draw_mode'
export const drawModeLabels: Record<DrawMode, string> = { popular: '인기 순 랜덤', complete: '완전 랜덤' }

export function parseDrawMode(value: string | null): DrawMode {
  return value === 'complete' ? 'complete' : 'popular'
}

export function readDrawMode(): DrawMode {
  try { return parseDrawMode(localStorage.getItem(DRAW_MODE_STORAGE_KEY)) }
  catch { return 'popular' }
}
