import { app, BrowserWindow, clipboard, screen } from 'electron'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { resolve, join } from 'node:path'
if (!process.env.DEVTOOLKIT_TEST_DATA) throw new Error('Isolated profile required')
// Built-in local collection must never query the developer's real credentials.
process.env.CODEX_HOME = join(process.env.DEVTOOLKIT_TEST_DATA, 'codex')
process.env.CLAUDE_CONFIG_DIR = join(process.env.DEVTOOLKIT_TEST_DATA, 'claude')
delete process.env.CLAUDE_CODE_OAUTH_TOKEN
const originalSpawn = childProcess.spawn
const originalExecFile = childProcess.execFile
childProcess.execFile = function (executable, args, options, callback) {
  if (String(executable).endsWith('wsl.exe') && args?.[0] === '--list') {
    const installed = process.env.DEVTOOLKIT_TEST_WSL === '1' ? 'FixtureUbuntu\r\n' : ''
    queueMicrotask(() => callback(null, Buffer.from(installed, 'utf16le'), Buffer.alloc(0)))
    return { kill() {} }
  }
  return originalExecFile(executable, args, options, callback)
}
childProcess.spawn = function (executable, args, options) {
  if (args?.includes('FixtureUbuntu') && args?.includes('python3')) return originalSpawn(process.execPath, [resolve('tests/fixtures/subscription-ssh.mjs')], { ...options, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
  if (args?.includes('app-server') || (args?.includes('auth') && args?.includes('status'))) {
    return originalSpawn(process.execPath, [resolve('tests/fixtures/subscription-local-cli.mjs'), ...(args.includes('auth') ? ['auth'] : [])], { ...options, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
  }
  return originalSpawn(executable, args, options)
}
syncBuiltinESMExports()
app.setPath('userData', process.env.DEVTOOLKIT_TEST_DATA)
app.setName('DevToolkit Desktop Test')
// Prevent test surfaces from affecting the developer's desktop or clipboard.
BrowserWindow.prototype.show = function () {}
BrowserWindow.prototype.showInactive = function () {}
BrowserWindow.prototype.focus = function () {}
let fakeClipboard = ''
clipboard.read = async () => [{ types: ['text/plain'], getType: async () => new Blob([fakeClipboard]) }]
clipboard.readText = async () => fakeClipboard
clipboard.writeText = async text => { fakeClipboard = text }
let cursor = { x: 500, y: 400 }
app.once('ready', () => { screen.getCursorScreenPoint = () => cursor })
globalThis.setDesktopTestCursor = point => { cursor = point }
await import('../../out/main/index.js')
