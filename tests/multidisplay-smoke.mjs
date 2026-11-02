import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron } from 'playwright'
const profile = mkdtempSync(join(tmpdir(), 'devtoolkit-multidisplay-'))
writeFileSync(join(profile, 'config.json'), JSON.stringify({ activePluginId: 'floating-settings', theme: 'light' }))
const env = { ...process.env, DEVTOOLKIT_TEST_DATA: profile }; delete env.ELECTRON_RUN_AS_NODE
const launch = () => _electron.launch({ args: [resolve('tests/fixtures/multidisplay-bootstrap.mjs')], env })
let app = await launch()
try {
  let page = await app.firstWindow(); page.setDefaultTimeout(15000)
  await page.getByRole('heading', { name: '悬浮组件', exact: true }).waitFor()
  const [a, b] = await app.evaluate(() => globalThis.dockTestDisplays)
  await app.evaluate((_, b) => globalThis.setDesktopTestCursor({ x: b.workArea.x + 100, y: b.workArea.y + 150 }), b)
  for (const kind of ['note', 'clock', 'clipboard', 'quota']) await page.evaluate(kind => window.api.invoke('desktop:widget-setting', kind, { enabled: true }), kind)
  const assertWithin = async (id, count) => {
    // loadFile() and mode changes finish asynchronously after the settings IPC.
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
      const ready = await app.evaluate(({ BrowserWindow }, count) => BrowserWindow.getAllWindows().filter(w => w.webContents.getURL().includes('surface=widget-')).length === count, count)
      if (ready) break
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    const value = await app.evaluate(({ BrowserWindow, screen }, id) => ({ area: screen.getAllDisplays().find(d => String(d.id) === id).workArea, windows: BrowserWindow.getAllWindows().filter(w => w.webContents.getURL().includes('surface=widget-')).map(w => ({ url: w.webContents.getURL(), bounds: w.getBounds() })) }), id)
    assert.equal(value.windows.length, count)
    assert.equal(new Set(value.windows.map(w => w.url)).size, count, 'Each component has exactly one window')
    for (const { bounds } of value.windows) {
      const area = value.area
      assert.ok(bounds.x >= area.x && bounds.y >= area.y && bounds.x + bounds.width <= area.x + area.width + 1 && bounds.y + bounds.height <= area.y + area.height + 1, JSON.stringify({ bounds, area }))
    }
  }
  // Mouse on B must not create widgets on B when the selected display is primary A.
  await assertWithin('101', 4)
  for (const w of app.windows().filter(w => w.url().includes('surface=widget-'))) await w.evaluate(() => window.api.invoke('desktop:widget-pin'))
  await assertWithin('101', 4)
  await page.getByLabel('停靠显示器', { exact: true }).selectOption('202')
  await page.waitForFunction(async () => (await window.api.invoke('desktop:get')).activeWidgetDisplayId === '202')
  await assertWithin('202', 4)
  const note = app.windows().find(w => w.url().includes('surface=widget-note'))
  await app.evaluate((_, b) => globalThis.setDesktopTestCursor({ x: b.workArea.x + 200, y: b.workArea.y + 200 }), b)
  await note.evaluate(() => window.api.invoke('desktop:widget-drag-start', false))
  await app.evaluate(() => globalThis.setDesktopTestCursor({ x: -10000, y: -10000 }))
  await note.evaluate(() => window.api.invoke('desktop:widget-drag'))
  await assertWithin('202', 4)
  await note.evaluate(() => window.api.invoke('desktop:widget-drag-end'))
  await note.evaluate(() => window.api.invoke('desktop:widget-drag-start', true))
  await app.evaluate(() => globalThis.setDesktopTestCursor({ x: 10000, y: 10000 }))
  await note.evaluate(() => window.api.invoke('desktop:widget-drag'))
  await assertWithin('202', 4)
  await note.evaluate(() => window.api.invoke('desktop:widget-drag-end'))
  await app.evaluate(() => globalThis.setDockTestDisplays('remove'))
  await assertWithin('101', 4)
  assert.equal((await page.evaluate(() => window.api.invoke('desktop:get'))).settings.widgetDisplayId, '202')
  await app.evaluate(() => globalThis.setDockTestDisplays('add'))
  await assertWithin('202', 4)
  await page.getByRole('button', { name: '联动停靠', exact: true }).click()
  await assertWithin('202', 1)
  const group = app.windows().find(w => w.url().includes('surface=widget-group'))
  await group.evaluate(() => window.api.invoke('desktop:widget-pin'))
  await assertWithin('202', 1)
  await app.evaluate(() => globalThis.setDockTestDisplays('shrink'))
  await assertWithin('202', 1)
  await page.getByLabel('停靠显示器', { exact: true }).selectOption('primary')
  await page.waitForFunction(async () => (await window.api.invoke('desktop:get')).settings.widgetDisplayId === 'primary')
  await assertWithin('101', 1)
  await app.evaluate(() => globalThis.setDockTestDisplays('primary-b'))
  await assertWithin('202', 1)
  await page.getByLabel('停靠显示器', { exact: true }).selectOption('202')
  await page.waitForFunction(async () => (await window.api.invoke('desktop:get')).settings.widgetDisplayId === '202')
  await page.screenshot({ path: 'out/test-artifacts/dock-display-settings.png', animations: 'disabled' })
  await app.close(); app = await launch(); page = await app.firstWindow()
  await page.getByRole('heading', { name: '悬浮组件', exact: true }).waitFor()
  assert.equal((await page.evaluate(() => window.api.invoke('desktop:get'))).settings.widgetDisplayId, '202')
  await assertWithin('202', 1)
  await page.getByRole('button', { name: '独立停靠', exact: true }).click()
  await assertWithin('202', 4)
  console.log('PASS: one selected monitor for all widgets, collapsed/expanded/grouped states, drag/resize containment, disconnect/reconnect, metrics/primary change and restart persistence')
} finally { await app.close() }
