import { spawnSync } from 'node:child_process'
import { mkdirSync, copyFileSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
if (process.platform === 'win32') {
  const out = 'build/desktop'
  mkdirSync(out, { recursive: true })
  const dll = 'resources/desktop/VirtualDesktopAccessor.dll'
  const digest = createHash('sha256').update(readFileSync(dll)).digest('hex')
  if (digest !== '8740c572a1c000e3b87ffeb1e4c397eae9af3bd4a2abdc3bcffacab4493f8ff5') throw new Error('Unexpected VirtualDesktopAccessor binary')
  copyFileSync(dll, `${out}/VirtualDesktopAccessor.dll`)
  copyFileSync('resources/desktop/VirtualDesktopAccessor.LICENSE.txt', `${out}/VirtualDesktopAccessor.LICENSE.txt`)
  copyFileSync('resources/desktop/NOTICE.txt', `${out}/NOTICE.txt`)
  const compiler = path.join(process.env.SystemRoot || 'C:/Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe')
  const result = spawnSync(compiler, ['/nologo', '/target:exe', '/platform:x64', '/optimize+', `/out:${path.resolve(out, 'DesktopHost.exe')}`, '/r:System.Windows.Forms.dll', '/r:System.Web.Extensions.dll', path.resolve('native/desktop/DesktopHost.cs')], { stdio: 'inherit', windowsHide: true })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
