import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
if (process.platform !== 'win32') process.exit(0)
mkdirSync('out/test-artifacts', { recursive: true })
for (const fixture of ['DesktopGestureFixture', 'DesktopMotionFixture']) {
  const filename = resolve(`out/test-artifacts/${fixture}.exe`)
  const result = spawnSync(join(process.env.SystemRoot, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'), ['/nologo', '/target:exe', '/platform:x64', `/main:${fixture}`, `/out:${filename}`, '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll', '/r:System.Web.Extensions.dll', resolve('native/desktop/DesktopHost.cs'), resolve(`tests/fixtures/${fixture}.cs`)], { windowsHide: true, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  const test = spawnSync(filename, [], { windowsHide: true, encoding: 'utf8', timeout: 10000 })
  process.stdout.write(test.stdout ?? '')
  process.stderr.write(test.stderr ?? '')
  if (test.error) console.error(test.error)
  if (test.status !== 0) process.exit(test.status ?? 1)
}
