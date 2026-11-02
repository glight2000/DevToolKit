import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { SessionManager } from '../../src/main/plugins/ssh-connections/sessions'

if (!process.env.DEVTOOLKIT_TEST_DATA) throw new Error('Isolated userData is required')
app.setPath('userData', process.env.DEVTOOLKIT_TEST_DATA)
app.setName('DevToolkit SSH Test')
BrowserWindow.prototype.show = function () {}
await import(pathToFileURL(path.join(process.cwd(), 'out/main/index.js')).href)

// Only in this test bootstrap: real PTYs run a harmless local shell, never an
// SSH connection. Production command composition is tested separately.
;(globalThis as any).installSshWorkspaceTestHandlers = () => {
  const sessions = new SessionManager((channel, ...args) => BrowserWindow.getAllWindows()[0]?.webContents.send(channel, ...args))
  app.on('before-quit', () => sessions.dispose())
  const handle = (channel: string, fn: (...args: any[]) => unknown) => { ipcMain.removeHandler(channel); ipcMain.handle(channel, (_event, ...args) => fn(...args)) }
  handle('ssh:connect', (_kind: string, _id: string, mode: string) => {
    if (mode === 'external') { (globalThis as any).externalLaunched = true; return { external: true } }
    return { session: sessions.start({ executable: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh', args: process.platform === 'win32' ? ['/d', '/q', '/k', 'echo PTY_READY'] : ['-i'], title: 'Fixture terminal', environment: 'local' }) }
  })
  handle('ssh:sessions', () => sessions.list())
  handle('ssh:terminal-attach', (id: string) => sessions.attach(id))
  handle('ssh:terminal-input', (id: string, data: string) => sessions.input(id, data))
  handle('ssh:terminal-resize', (id: string, cols: number, rows: number) => sessions.resize(id, cols, rows))
  handle('ssh:terminal-close', (id: string) => sessions.close(id))
  let text = '# fixture config\nHost fixture\n HostName old.example\n'
  let revision = '1'
  handle('ssh:read-config', (sourceId: string) => ({ sourceId, path: 'fixture/.ssh/config', text, revision, exists: true }))
  handle('ssh:save-config', (sourceId: string, expected: string, next: string) => {
    if (expected !== revision) throw new Error('Config changed outside DevToolkit')
    text = next; revision = String(Number(revision) + 1)
    return { document: { sourceId, path: 'fixture/.ssh/config', text, revision, exists: true }, backup: 'fixture/backup.conf' }
  })
}
