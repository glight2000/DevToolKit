import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { app } from 'electron'
import path from 'node:path'

export class DesktopNative {
  private child?: ChildProcessWithoutNullStreams
  private next = 0
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>()
  constructor(private event: (name: string) => void, private failed: (error: string) => void) {}
  start(): void {
    if (this.child) return
    if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Desktop window controls require Windows x64')
    const root = app.isPackaged ? path.join(process.resourcesPath, 'desktop') : path.join(__dirname, '../../build/desktop')
    const child = spawn(path.join(root, 'DesktopHost.exe'), [String(process.pid)], { windowsHide: true, stdio: 'pipe', cwd: root })
    this.child = child
    child.stdin.on('error', () => {})
    const lines = createInterface({ input: child.stdout })
    lines.on('line', line => {
      try {
        const response = JSON.parse(line.replace(/^\uFEFF/, ''))
        if (response.eventName) { this.event(response.eventName); return }
        const pending = this.pending.get(response.id)
        if (!pending) return
        this.pending.delete(response.id); clearTimeout(pending.timer)
        if (response.error) pending.reject(new Error(response.error)); else pending.resolve(response.result)
      } catch { /* Non-protocol output is never executed. */ }
    })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000) })
    const lost = (error: string) => {
      if (this.child !== child) return
      this.child = undefined; lines.close()
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(error)) }
      this.pending.clear(); this.failed(error)
    }
    child.on('error', error => lost(error.message))
    child.on('exit', code => lost(`Desktop helper stopped (${code}). ${stderr}`))
  }
  request<T = any>(command: string, args: Record<string, unknown> = {}): Promise<T> {
    this.start()
    const id = ++this.next
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id); reject(new Error('Desktop helper did not respond. Retry from settings.'))
        this.stop(); this.failed('Desktop helper did not respond and was stopped. Retry from settings.')
      }, 8000)
      this.pending.set(id, { resolve, reject, timer })
      this.child!.stdin.write(JSON.stringify({ ...args, command, id }) + '\n')
    })
  }
  stop(): void {
    const child = this.child; this.child = undefined
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Desktop helper stopped')) }
    this.pending.clear()
    if (child) { child.stdin.end(); child.kill() }
  }
}
