// App navigation envelope for Kakao's finite base map, including Korea and its
// offshore islands. This only limits the viewport, never the selected draw area.
export const KAKAO_NAVIGATION_BOUNDS = { minLat: 30, maxLat: 42, minLng: 119, maxLng: 139 }

interface PixelExtent { left: number; right: number; top: number; bottom: number }

// Work in projected pixels: geographic degrees do not correspond to constant
// screen distances, and clamping only the center still exposes blank edges.
export function constrainMapViewport(extent: PixelExtent, width: number, height: number, level: number) {
  const availableWidth = extent.right - extent.left, availableHeight = extent.bottom - extent.top
  if (![...Object.values(extent), width, height, level].every(Number.isFinite)
    || width <= 0 || height <= 0 || availableWidth <= 0 || availableHeight <= 0) return null
  const maxLevel = Math.max(1, Math.min(14, level + Math.floor(Math.log2(Math.min(availableWidth / (width + 4), availableHeight / (height + 4))))))
  return {
    maxLevel,
    dx: Math.max(extent.left, Math.min(0, extent.right - width)),
    dy: Math.max(extent.top, Math.min(0, extent.bottom - height)),
  }
}
