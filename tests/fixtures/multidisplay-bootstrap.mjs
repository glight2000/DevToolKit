import { app, screen } from 'electron'
// Split the real work area into two virtual displays, so hidden native windows
// remain valid on a single-monitor test machine. Negative origins are unit-tested.
app.once('ready', () => {
  const real = screen.getPrimaryDisplay(), area = real.workArea, width = Math.floor(area.width / 2)
  const display = (id, label, x, w) => ({ ...real, id, label, bounds: { x, y: area.y, width: w, height: area.height }, workArea: { x, y: area.y, width: w, height: area.height }, size: { width: w, height: area.height } })
  const first = display(101, 'Fixture A', area.x, width), second = display(202, 'Fixture B', area.x + width, area.width - width)
  let displays = [first, second], primary = first
  screen.getAllDisplays = () => displays
  screen.getPrimaryDisplay = () => primary
  screen.getDisplayNearestPoint = point => displays.find(d => point.x >= d.workArea.x && point.x < d.workArea.x + d.workArea.width) ?? primary
  screen.getDisplayMatching = bounds => [...displays].sort((a, b) => {
    const overlap = d => Math.max(0, Math.min(bounds.x + bounds.width, d.workArea.x + d.workArea.width) - Math.max(bounds.x, d.workArea.x)) * Math.max(0, Math.min(bounds.y + bounds.height, d.workArea.y + d.workArea.height) - Math.max(bounds.y, d.workArea.y))
    return overlap(b) - overlap(a)
  })[0]
  globalThis.dockTestDisplays = [first, second]
  globalThis.setDockTestDisplays = mode => {
    if (mode === 'remove') { displays = [first]; primary = first; screen.emit('display-removed', {}, second) }
    if (mode === 'add') { displays = [first, second]; screen.emit('display-added', {}, second) }
    if (mode === 'primary-b') { primary = second; screen.emit('display-metrics-changed', {}, second, ['workArea']) }
    if (mode === 'shrink') { second.workArea = { ...second.workArea, width: second.workArea.width - 100, height: second.workArea.height - 100 }; screen.emit('display-metrics-changed', {}, second, ['workArea', 'scaleFactor']) }
  }
})
await import('./desktop-bootstrap.mjs')
