import { spawn, spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { resolve, join } from 'node:path'
import { mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'
if (process.platform !== 'win32') process.exit(0)
mkdirSync('out/test-artifacts', { recursive: true })
const fixturePath = resolve('out/test-artifacts/DesktopFixture.exe')
const compile = spawnSync(join(process.env.SystemRoot, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'), ['/nologo', '/target:exe', '/platform:x64', `/out:${fixturePath}`, '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll', resolve('tests/fixtures/DesktopFixture.cs')], { windowsHide: true, encoding: 'utf8' })
assert.equal(compile.status, 0, compile.stdout + compile.stderr)
function client(path, args) {
  const process = spawn(path, args, { windowsHide: true, stdio: 'pipe' })
  const pending = [], buffered = []
  const lines = createInterface({ input: process.stdout })
  lines.on('line', line => { const value = JSON.parse(line.replace(/^\uFEFF/, '')); if(pending.length) pending.shift()(value); else buffered.push(value) })
  return { process, next: () => buffered.length ? Promise.resolve(buffered.shift()) : new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('Native fixture timeout')), 10000); pending.push(value => { clearTimeout(timeout); resolve(value) }) }), write: line => process.stdin.write(line + '\n') }
}
const native = client(resolve('build/desktop/DesktopHost.exe'), [String(process.pid)])
let fixture
let owned
try {
  const ready = await native.next(); assert.equal(ready.eventName, 'ready')
  assert.equal(ready.virtualDesktop, true, 'This integration test requires a compatible Windows 11 desktop')
  fixture = client(fixturePath, [resolve('build/desktop')])
  const identity = await fixture.next()
  fixture.write('other'); const other = await fixture.next()
  native.write(JSON.stringify({ id: 1, command: 'list' }))
  const list = await native.next()
  assert.equal(list.error, undefined, list.error)
  assert.ok(list.result.some(window => window.id === identity.id), 'Native enumeration must include the offscreen test window, including another desktop')
  native.write(JSON.stringify({ id: 2, command: 'activate', windowId: identity.id, bring: true }))
  const activated = await native.next()
  assert.equal(activated.error, undefined, activated.error)
  fixture.write('status'); const after = await fixture.next()
  assert.equal(after.desktop, after.current, 'Shift activation moves the fixture to the current desktop')
  native.write(JSON.stringify({ id: 3, command: 'activate', windowId: '999999999999', bring: false }))
  assert.match((await native.next()).error, /Refresh/)
  owned = client(resolve('build/desktop/DesktopHost.exe'), [String(fixture.process.pid)])
  await owned.next()
  owned.write(JSON.stringify({ id: 1, command: 'surface', windowId: identity.id, focus: true }))
  const pinned = await owned.next()
  assert.equal(pinned.error, undefined, pinned.error)
  assert.equal(pinned.result.pinned, true)
  fixture.write('status'); assert.equal((await fixture.next()).topmost, true, 'Pinning/focusing must preserve native WS_EX_TOPMOST')
  console.log(`PASS: real Windows enumeration, foreign-process activation, invalid HWND rejection; cross-desktop move ${other.count > 1 ? 'verified using existing desktops' : 'not exercised (one desktop)'}`)
} finally {
  native.process.kill()
  owned?.process.kill()
  if (fixture) { fixture.write('quit'); setTimeout(() => fixture.process.kill(), 1500).unref() }
}
