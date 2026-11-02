import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, screen, shell, type IpcMainInvokeEvent } from 'electron'
import Store from 'electron-store'
import { randomUUID } from 'node:crypto'
import { calculate, defaultLauncherSettings, launcherCommands, validateLauncherPatch, type LauncherSettings, type LauncherState } from '../../../shared/launcher'
import type { PluginContext } from '../../../shared/plugin-types'
import type { Bounds } from './geometry'
import type { WidgetKind } from '../../../shared/desktop'

export class QuickLauncher {
  private store = new Store<{ settings: LauncherSettings }>({ name: 'launcher', defaults: { settings: defaultLauncherSettings() } })
  private settings = { ...defaultLauncherSettings(), ...this.store.get('settings') }
  private window?: BrowserWindow
  private active = false
  private error: string | null = null
  private stopped = false
  private channels: string[] = []
  private pending = Promise.resolve()
  private visibilityRevision = 0
  private readonly shortcut = 'Alt+Space'
  constructor(private ctx: PluginContext, private createSurface: (name: string, bounds: Bounds) => BrowserWindow, private placeSurface: (window: BrowserWindow, focus: boolean) => Promise<void>, private openWidget: (kind: WidgetKind) => void, private openSwitcher: () => Promise<void>) {
    this.handle('get', () => this.snapshot())
    this.handle('update', (_event, value) => {
      const next = { ...this.settings, ...validateLauncherPatch(value) }
      this.configure(next.enabled)
      this.settings = next; this.store.set('settings', next)
      if (!next.enabled) this.hide()
      this.broadcast(); return this.snapshot()
    })
    this.handle('preview', () => this.toggle())
    this.handle('hide', () => this.hide())
    this.handle('open-settings', () => this.navigate('quick-launcher'))
    this.handle('run', (_event, id, input) => this.run(id, input))
    try { this.configure(this.settings.enabled) } catch { /* Report conflicts in the settings page; do not silently change the shortcut. */ }
  }
  private snapshot(): LauncherState { return { settings: this.settings, active: this.active, error: this.error } }
  private broadcast() { this.ctx.sendToRenderer('launcher:changed', this.snapshot()); this.window?.webContents.send('launcher:changed', this.snapshot()) }
  private handle(name: string, callback: (event: IpcMainInvokeEvent, ...args: any[]) => unknown) {
    const channel = `launcher:${name}`; this.channels.push(channel)
    ipcMain.handle(channel, (event, ...args) => { if (this.stopped || !BrowserWindow.fromWebContents(event.sender)) throw new Error('快捷启动不可用'); return callback(event, ...args) })
  }
  private configure(enabled: boolean) {
    if (!enabled) { if (this.active) globalShortcut.unregister(this.shortcut); this.active = false; this.error = null; return }
    if (this.active) return
    try {
      this.active = globalShortcut.register(this.shortcut, () => { void this.toggle().catch(error => { this.error = String(error); this.broadcast() }) })
      if (!this.active) throw new Error('Alt + Space 已被其他程序占用，请释放快捷键后重试。')
      this.error = null
    } catch (error) { this.error = String(error); this.broadcast(); throw error }
  }
  hide() { this.visibilityRevision++; this.window?.hide() }
  keepTop() { if (this.window?.isVisible()) { this.window.setAlwaysOnTop(true, 'screen-saver'); this.window.moveTop() } }
  toggle(): Promise<void> {
    const operation = this.pending.then(() => this.toggleWindow())
    this.pending = operation.catch(() => {})
    return operation
  }
  private async toggleWindow() {
    if (this.stopped) return
    if (this.window?.isVisible()) { this.hide(); return }
    const revision = this.visibilityRevision
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    const width = Math.min(660, area.width), height = Math.min(470, area.height)
    const bounds = { x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2), width, height }
    if (!this.window || this.window.isDestroyed()) {
      this.window = this.createSurface('launcher', bounds)
      this.window.on('blur', () => { if (this.settings.hideOnBlur) this.hide() })
      this.window.on('close', event => { if (!this.stopped) { event.preventDefault(); this.hide() } })
      await new Promise<void>((resolve, reject) => {
        this.window!.webContents.once('did-finish-load', () => resolve())
        this.window!.webContents.once('did-fail-load', (_event, _code, message) => reject(new Error(message)))
      })
    }
    if (this.stopped || revision !== this.visibilityRevision) return
    this.window.setBounds(bounds); this.window.webContents.send('launcher:opened', this.snapshot()); this.window.showInactive()
    await this.placeSurface(this.window, true)
    if (this.stopped || this.window.isDestroyed() || revision !== this.visibilityRevision) return
    this.window.show(); this.window.focus()
  }
  private async run(id: unknown, input: unknown) {
    if (typeof id !== 'string' || (input !== undefined && (typeof input !== 'string' || input.length > 2000))) throw new Error('无效的快捷操作')
    const command = launcherCommands.find(item => item.id === id)
    const group = command?.group ?? (id === 'calculate' ? 'calculator' : id === 'web:search' ? 'web' : undefined)
    if (!group || !this.settings.groups.includes(group)) throw new Error('此快捷功能已关闭')
    let text: string | undefined
    if (id === 'calculate') { text = calculate(String(input ?? '')); if (text === undefined) throw new Error('请输入有效的四则运算') }
    if (id.startsWith('copy:')) {
      const now = new Date(), pad = (n: number) => String(n).padStart(2, '0')
      if (id === 'copy:date') text = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
      if (id === 'copy:time') text = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
      if (id === 'copy:timestamp') text = String(Math.floor(now.getTime() / 1000))
      if (id === 'copy:uuid') text = randomUUID()
    }
    if (text !== undefined) { await clipboard.writeText(text); return { copied: text } }
    if (id.startsWith('page:')) {
      this.navigate(id.slice(5)); return
    }
    if (id.startsWith('widget:')) { this.hide(); this.openWidget(id.slice(7) as WidgetKind); return }
    if (id === 'switcher') { this.hide(); await this.openSwitcher(); return }
    if (id.startsWith('folder:')) { const error = await shell.openPath(app.getPath(id === 'folder:downloads' ? 'downloads' : 'home')); if (error) throw new Error(error); this.hide(); return }
    if (id === 'system:settings') { if (process.platform !== 'win32') throw new Error('此快捷功能需要 Windows'); await shell.openExternal('ms-settings:'); this.hide(); return }
    if (id === 'web:search') {
      const query = String(input ?? '').trim(); if (!query) throw new Error('请输入搜索内容')
      await shell.openExternal(`https://www.bing.com/search?q=${encodeURIComponent(query)}`); this.hide()
    }
  }
  private navigate(id: string) {
    const main = BrowserWindow.getAllWindows().find(window => { const url = window.webContents.getURL(); return url && !new URL(url).searchParams.has('surface') })
    if (!main) throw new Error('主窗口不可用')
    this.hide(); if (main.isMinimized()) main.restore(); main.show(); main.focus(); main.webContents.send('app:open-plugin', id)
  }
  dispose() {
    this.stopped = true; this.hide()
    if (this.active) globalShortcut.unregister(this.shortcut)
    this.active = false; this.window?.destroy()
    for (const channel of this.channels) ipcMain.removeHandler(channel)
  }
}
