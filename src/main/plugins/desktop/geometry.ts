import type { DockEdge, ResizeDirection } from '../../../shared/desktop'
export interface Bounds { x: number; y: number; width: number; height: number }
export function resizeBounds(b: Bounds, area: Bounds, direction: ResizeDirection, dx: number, dy: number): Bounds {
  const right = b.x + b.width, bottom = b.y + b.height
  const minWidth = Math.min(260, b.width), minHeight = Math.min(180, b.height)
  const x = direction.includes('w') ? Math.max(area.x, Math.min(b.x + dx, right - minWidth)) : b.x
  const y = direction.includes('n') ? Math.max(area.y, Math.min(b.y + dy, bottom - minHeight)) : b.y
  const r = direction.includes('e') ? Math.min(area.x + area.width, Math.max(right + dx, x + minWidth)) : right
  const bottomEdge = direction.includes('s') ? Math.min(area.y + area.height, Math.max(bottom + dy, y + minHeight)) : bottom
  return { x, y, width: r - x, height: bottomEdge - y }
}
export function fitBounds(bounds: Bounds, area: Bounds): Bounds {
  return containBounds({ ...bounds, width: Math.max(160, bounds.width), height: Math.max(120, bounds.height) }, area)
}
export function containBounds(bounds: Bounds, area: Bounds): Bounds {
  const width = Math.min(bounds.width, area.width), height = Math.min(bounds.height, area.height)
  return { width, height, x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - width))), y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - height))) }
}
export function transferBounds(bounds: Bounds, from: Bounds, to: Bounds, edge: DockEdge): Bounds {
  const width = Math.min(bounds.width, to.width), height = Math.min(bounds.height, to.height)
  const fraction = (position: number, start: number, size: number, length: number) => size > length ? Math.max(0, Math.min(1, (position - start) / (size - length))) : 0
  const x = to.x + fraction(bounds.x, from.x, from.width, bounds.width) * (to.width - width)
  const y = to.y + fraction(bounds.y, from.y, from.height, bounds.height) * (to.height - height)
  return dockBounds({ x, y, width, height }, to, edge).bounds
}
export function dockBounds(bounds: Bounds, area: Bounds, force?: DockEdge): { bounds: Bounds; edge: DockEdge } {
  const b = fitBounds(bounds, area)
  const distances: [DockEdge, number][] = [['left', Math.abs(b.x - area.x)], ['right', Math.abs(b.x + b.width - area.x - area.width)], ['top', Math.abs(b.y - area.y)], ['bottom', Math.abs(b.y + b.height - area.y - area.height)]]
  const nearest = distances.sort((a, b) => a[1] - b[1])[0]
  const edge = force ?? (nearest[1] <= 24 ? nearest[0] : 'none')
  if (edge === 'left') b.x = area.x
  if (edge === 'right') b.x = area.x + area.width - b.width
  if (edge === 'top') b.y = area.y
  if (edge === 'bottom') b.y = area.y + area.height - b.height
  return { bounds: b, edge }
}
export function handleBounds(b: Bounds, edge: DockEdge): Bounds {
  if (edge === 'left' || edge === 'right') return { x: edge === 'left' ? b.x : b.x + b.width - 32, y: b.y, width: 32, height: 112 }
  // Windows can enforce a 39-DIP minimum height even on frameless windows.
  // Keep horizontal handles above that floor so the bottom border stays on screen.
  return { x: b.x, y: edge === 'top' ? b.y : b.y + b.height - 40, width: 112, height: 40 }
}
