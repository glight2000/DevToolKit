import test from 'node:test'
import assert from 'node:assert/strict'
import { dockBounds, fitBounds, containBounds, transferBounds, handleBounds, resizeBounds } from '../src/main/plugins/desktop/geometry'
import { defaultDesktopSettings, searchWindows, validateDesktopPatch } from '../src/shared/desktop'

test('floating panels snap on every edge and respect negative-coordinate displays', () => {
  const area = { x: -1920, y: -200, width: 1920, height: 1080 }
  const b = { x: -350, y: 0, width: 340, height: 360 }
  const right = dockBounds(b, area)
  assert.equal(right.edge, 'right')
  assert.equal(right.bounds.x, -340)
  assert.deepEqual(handleBounds(right.bounds, 'right'), { x: -32, y: 0, width: 32, height: 112 })
  for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
    const result = dockBounds(b, area, edge)
    const handle = handleBounds(result.bounds, edge)
    assert.ok(handle.x >= area.x && handle.y >= area.y)
    assert.ok(handle.x + handle.width <= area.x + area.width)
    assert.ok(handle.y + handle.height <= area.y + area.height)
  }
  assert.equal(dockBounds({ ...b, x: -1000 }, area).edge, 'none')
  assert.deepEqual(fitBounds({ x: 5000, y: 5000, width: 2000, height: 2000 }, area), area)
})
test('desktop settings start disabled and accept only supported toggles', () => {
  const defaults = defaultDesktopSettings()
  assert.equal(defaults.dragEnabled, false)
  assert.equal(defaults.switcherEnabled, false)
  assert.ok(Object.values(defaults.widgets).every(widget => !widget.enabled))
  assert.deepEqual(validateDesktopPatch({ modifier: 'alt-shift', dragEnabled: true }), { modifier: 'alt-shift', dragEnabled: true })
  assert.throws(() => validateDesktopPatch({ modifier: 'win' }))
  assert.throws(() => validateDesktopPatch({ dragEnabled: 'true' }))
  assert.throws(() => validateDesktopPatch({ command: 'arbitrary' }))
})
test('edge resizing grows docked panels inward, keeps the opposite edge fixed and clamps to the display', () => {
  const area = { x: -1000, y: -200, width: 1000, height: 800 }
  const b = { x: -400, y: 200, width: 400, height: 400 }
  assert.deepEqual(resizeBounds(b, area, 'nw', -300, -200), { x: -700, y: 0, width: 700, height: 600 })
  assert.deepEqual(resizeBounds(b, area, 'nw', -2000, -2000), area)
  assert.deepEqual(resizeBounds(b, area, 'nw', 2000, 2000), { x: -260, y: 420, width: 260, height: 180 })
  assert.deepEqual(resizeBounds(b, area, 'se', 100, 100), b)
})
test('window search matches all terms across titles and app names without reordering windows', () => {
  const base = { pid: 1, desktop: 0, current: true, minimized: false }
  const windows = [{ ...base, id: '1', title: 'Release notes', app: 'Notepad' }, { ...base, id: '2', title: 'Release dashboard', app: 'Chrome' }]
  assert.deepEqual(searchWindows(windows, ' RELEASE notePAD '), [windows[0]])
  assert.deepEqual(searchWindows(windows, ''), windows)
  assert.deepEqual(searchWindows(windows, 'unknown'), [])
})
test('widgets transfer between different-size and negative-coordinate displays without crossing edges', () => {
  const from = { x: 0, y: 0, width: 1920, height: 1080 }, to = { x: -1280, y: -300, width: 1280, height: 720 }
  for (const edge of ['left', 'right', 'top', 'bottom', 'none'] as const) {
    const result = transferBounds({ x: 1300, y: 500, width: 400, height: 420 }, from, to, edge)
    assert.deepEqual(containBounds(result, to), result)
    assert.deepEqual(containBounds(handleBounds(result, edge), to), handleBounds(result, edge))
    if (edge === 'right') assert.equal(result.x + result.width, 0)
    if (edge === 'bottom') assert.equal(result.y + result.height, 420)
  }
  const tiny = { x: -80, y: -50, width: 80, height: 50 }
  assert.deepEqual(fitBounds({ x: 2000, y: 1000, width: 800, height: 600 }, tiny), tiny)
  assert.deepEqual(validateDesktopPatch({ widgetDisplayId: '202' }), { widgetDisplayId: '202' })
  assert.throws(() => validateDesktopPatch({ widgetDisplayId: {} }))
})
