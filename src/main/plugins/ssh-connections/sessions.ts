import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import type * as Pty from 'node-pty'
import { createRequire } from 'node:module'
import type { TerminalSession } from '../../../shared/ssh-connections'
import type { SshLaunch } from './launch'

interface Session { info: TerminalSession; process: Pty.IPty; buffer: string; sequence: number }
export class SessionManager {
  private sessions = new Map<string, Session>()
  constructor(private send: (channel: string, ...args: unknown[]) => void) {}
  list(): TerminalSession[] { return [...this.sessions.values()].map(session => ({ ...session.info })) }
  start(launch: SshLaunch): TerminalSession {
    if (this.sessions.size >= 16) throw new Error('Close a terminal tab before opening more (limit 16)')
    const env = Object.fromEntries(Object.entries(process.env).filter((item): item is [string, string] => typeof item[1] === 'string'))
    delete env.ELECTRON_RUN_AS_NODE
    const pty = createRequire(import.meta.url)('node-pty') as typeof Pty
    const processHandle = pty.spawn(launch.executable, launch.args, { name: 'xterm-256color', cols: 100, rows: 30, cwd: homedir(), env })
    const info: TerminalSession = { id: randomUUID(), title: launch.title, environment: launch.environment, state: 'running', createdAt: Date.now() }
    const session: Session = { info, process: processHandle, buffer: '', sequence: 0 }
    this.sessions.set(info.id, session)
    processHandle.onData(data => {
      if (!this.sessions.has(info.id)) return
      session.buffer = (session.buffer + data).slice(-256 * 1024)
      this.send('ssh:terminal-data', { id: info.id, sequence: ++session.sequence, data })
    })
    processHandle.onExit(({ exitCode }) => {
      info.state = 'exited'; info.exitCode = exitCode
      this.send('ssh:terminal-exit', { ...info })
    })
    return { ...info }
  }
  private get(id: string): Session {
    const session = this.sessions.get(id)
    if (!session) throw new Error('Terminal session has closed')
    return session
  }
  attach(id: string) {
    const session = this.get(id)
    return { ...session.info, buffer: session.buffer, sequence: session.sequence }
  }
  input(id: string, data: string): void {
    if (typeof data !== 'string' || data.length > 64 * 1024) throw new Error('Terminal input is too large')
    const session = this.get(id)
    if (session.info.state === 'running') session.process.write(data)
  }
  resize(id: string, cols: number, rows: number): void {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 1 || cols > 500 || rows > 300) return
    const session = this.get(id)
    if (session.info.state === 'running') session.process.resize(cols, rows)
  }
  close(id: string): void {
    const session = this.get(id)
    this.sessions.delete(id)
    if (session.info.state === 'running') session.process.kill()
  }
  dispose(): void { for (const id of this.sessions.keys()) this.close(id) }
}
