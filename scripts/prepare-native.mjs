import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

// node-pty bundles N-API binaries on Windows/macOS. Linux builds its local
// native module explicitly; project-wide lifecycle scripts remain disabled.
const require = createRequire(import.meta.url)
try { require('node-pty') }
catch (error) {
  if (process.platform !== 'linux') throw error
  const result = spawnSync('npm', ['rebuild', 'node-pty', '--ignore-scripts=false'], { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
  require('node-pty')
}
