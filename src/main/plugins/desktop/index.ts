import { app, BrowserWindow, clipboard, ipcMain, screen, type IpcMainInvokeEvent } from 'electron'
import Store from 'electron-store'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { PluginContext, PluginMainModule } from '../../../shared/plugin-types'
import { defaultDesktopSettings, validateDesktopPatch, widgetKinds, widgetMotionDuration, type FloatingKind, type FloatingWidgetState, type WidgetMotion, type ClipboardItem, type DesktopSettings, type DesktopStatus, type OpenWindow, type WidgetKind, type WidgetSettings } from '../../../shared/desktop'
import { quotaDockGrid, quotaDockRecords, type SubscriptionRecord } from '../../../shared/subscriptions'
import { DesktopNative } from './native'
import { dockBounds, fitBounds, containBounds, transferBounds, handleBounds, resizeBounds, type Bounds } from './geometry'
import { resizeDirections, type ResizeDirection } from '../../../shared/desktop'
import { QuickLauncher } from './launcher'

interface Floating { window: BrowserWindow; expanded: boolean; modalOpen?: boolean; timer?: NodeJS.Timeout; motion?: WidgetMotion; motionTimer?: NodeJS.Timeout; drag?: { point: Electron.Point; bounds: Bounds; resize: boolean | ResizeDirection } }
let service: DesktopService | undefined
export function updateSubscriptionWidget(record: SubscriptionRecord, changed: (setting: WidgetSettings) => void) { service?.setExtra(`quota-${record.id}`, record.widget, record, changed) }
export function removeSubscriptionWidget(id: string) { service?.removeExtra(`quota-${id}`) }
class DesktopService {
  private store = new Store<{ settings: DesktopSettings }>({ name: 'desktop', defaults: { settings: defaultDesktopSettings() } })
  private settings = this.store.get('settings')
  private migrateQuota = !this.settings.widgets.quota
  private status: DesktopStatus = { supported: process.platform === 'win32' && process.arch === 'x64', running: false, virtualDesktop: false, dragActive: false, switcherActive: false, error: null }
  private native = new DesktopNative(name => { if (name === 'toggle-switcher' && this.settings.switcherEnabled) void this.toggleSwitcher().catch(error => this.fail(String(error))) }, error => this.fail(error))
  private floating = new Map<FloatingKind, Floating>()
  private extras = new Map<FloatingKind, { setting: WidgetSettings; data: SubscriptionRecord; changed: (setting: WidgetSettings) => void }>()
  private topTimer?: NodeJS.Timeout
  private switcher?: BrowserWindow
  private launcher: QuickLauncher
  private clipboardTimer?: NodeJS.Timeout
  private clipboardGeneration = 0
  private clips: ClipboardItem[] = []
  private lastClipboard = ''
  private note = ''
  private channels: string[] = []
  private stopping = false
  private changes = Promise.resolve()
  private motionSequence = 0
  constructor(private ctx: PluginContext) {
    const defaults = defaultDesktopSettings()
    this.settings = { ...defaults, ...this.settings, widgetGroup: { ...defaults.widgetGroup, ...this.settings.widgetGroup }, widgets: Object.fromEntries(widgetKinds.map(kind => [kind, { ...defaults.widgets[kind], ...this.settings.widgets?.[kind] }])) as DesktopSettings['widgets'] }
    this.relocateWidgets()
    this.launcher = new QuickLauncher(ctx, (name, bounds) => this.surface(name, bounds), (window, focus) => this.placeSurface(window, focus), kind => {
      this.settings.widgets[kind].enabled = true; this.syncWidget(kind); this.persist()
      const target = this.settings.widgetMode === 'grouped' ? 'group' : kind
      this.expand(target, true); this.floating.get(target)?.window.focus()
    }, () => this.toggleSwitcher())
    ctx.db.exec('CREATE TABLE IF NOT EXISTS desktop_note (id INTEGER PRIMARY KEY CHECK (id = 1), content TEXT NOT NULL)')
    const row = ctx.db.prepare('SELECT content FROM desktop_note WHERE id = 1').get() as { content: string } | undefined
    if (row) this.note = ctx.decrypt(row.content)
    this.handle('get', () => this.snapshot())
    this.handle('update', (_e, patch) => this.serial(async () => {
      const next = { ...this.settings, ...validateDesktopPatch(patch) }
      if ((next.dragEnabled || next.switcherEnabled) && !this.status.supported) throw new Error('此功能需要 Windows x64')
      try {
        if (this.status.supported) { const result = await this.native.request('configure', next as unknown as Record<string, unknown>); this.status = { ...this.status, ...result, running: true, error: null } }
        const modeChanged = next.widgetMode !== this.settings.widgetMode
        const displayChanged = next.widgetDisplayId !== this.settings.widgetDisplayId
        this.settings = next
        if (displayChanged) this.reposition()
        if (modeChanged) { for (const kind of [...this.floating.keys()]) this.destroyWidget(kind); for (const kind of this.componentKinds()) this.syncWidget(kind) }
        if (!next.switcherEnabled) this.switcher?.hide()
        this.persist(); return this.snapshot()
      } catch (error) { this.native.stop(); this.fail(String(error)); throw error }
    }))
    this.handle('retry', () => this.serial(async () => { this.native.stop(); try { await this.configure(); return this.snapshot() } catch (error) { this.native.stop(); this.fail(String(error)); throw error } }))
    this.handle('preview-switcher', () => this.toggleSwitcher())
    this.handle('windows', () => this.native.request<OpenWindow[]>('list'))
    this.handle('activate', async (_e, id, bring) => {
      if (typeof id !== 'string' || typeof bring !== 'boolean') throw new Error('Invalid window selection')
      this.switcher?.hide()
      try { return await this.native.request('activate', { windowId: id, bring }) }
      catch (error) { this.switcher?.show(); throw error }
    })
    this.handle('hide-switcher', () => this.switcher?.hide())
    this.handle('widget-setting', (_e, kind, patch) => {
      this.kind(kind)
      if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(key => !['enabled', 'pinned', 'edge'].includes(key))) throw new Error('Invalid widget setting')
      for (const key of ['enabled', 'pinned']) if (key in patch && typeof patch[key] !== 'boolean') throw new Error('Invalid widget switch')
      if ('edge' in patch && !['left', 'right', 'top', 'bottom', 'none'].includes(patch.edge)) throw new Error('Invalid dock edge')
      Object.assign(this.widgetSettings(kind), patch)
      this.syncWidget(kind)
      if ('edge' in patch && this.floating.has(kind)) {
        const setting = this.widgetSettings(kind), item = this.floating.get(kind)!
        const area = this.widgetDisplay().workArea
        const bounds = patch.edge === 'none' ? { ...setting.bounds!, x: area.x + Math.round((area.width - setting.bounds!.width) / 2), y: area.y + Math.round((area.height - setting.bounds!.height) / 2) } : setting.bounds!
        setting.bounds = dockBounds(bounds, area, patch.edge).bounds
        this.clearMotion(item)
        if (patch.edge === 'none' || setting.pinned) item.expanded = true
        item.window.setBounds(item.expanded ? setting.bounds : this.collapsedBounds(kind)); this.pushWidget(kind)
      }
      this.persist(); return this.snapshot()
    })
    this.handle('widget-state', e => this.widgetState(this.senderKind(e)))
    this.handle('widget-modal', (e, open) => {
      if (typeof open !== 'boolean') throw new Error('Invalid dialog state')
      const kind = this.senderKind(e), item = this.floating.get(kind)!
      item.modalOpen = open; clearTimeout(item.timer)
      if (open) this.expand(kind)
      else this.scheduleCollapse(kind)
    })
    this.handle('widget-enter', e => { const kind = this.senderKind(e); const widget = this.floating.get(kind)!; clearTimeout(widget.timer); this.expand(kind, true) })
    this.handle('widget-leave', e => this.scheduleCollapse(this.senderKind(e)))
    this.handle('widget-motion-done', (e, id) => this.finishMotion(this.senderKind(e), id))
    this.handle('widget-pin', e => {
      const kind = this.senderKind(e); this.widgetSettings(kind).pinned = !this.widgetSettings(kind).pinned
      this.expand(kind, true); this.persist(); this.pushWidget(kind)
    })
    this.handle('widget-close', e => this.closeWidget(this.senderKind(e)))
    this.handle('widget-close-item', (e, kind) => { if (this.senderKind(e) !== 'group' || kind === 'group') throw new Error('Invalid grouped widget'); this.kind(kind); this.closeWidget(kind) })
    this.handle('widget-collapse', e => this.collapse(this.senderKind(e), true))
    this.handle('widget-drag-start', (e, resize) => {
      if (typeof resize !== 'boolean' && !resizeDirections.includes(resize)) throw new Error('Invalid resize direction')
      const kind = this.senderKind(e), widget = this.floating.get(kind)!
      this.expand(kind, true); this.clearMotion(widget); this.pushWidget(kind); clearTimeout(widget.timer)
      widget.drag = { point: screen.getCursorScreenPoint(), bounds: widget.window.getBounds(), resize }
    })
    this.handle('widget-drag', e => this.dragWidget(this.senderKind(e), false))
    this.handle('widget-drag-end', e => this.dragWidget(this.senderKind(e), true))
    this.handle('note-save', (e, text) => {
      if (!this.componentSender(e, 'note') || typeof text !== 'string' || text.length > 100000) throw new Error('记事内容过长（最多 10 万字）')
      this.ctx.db.prepare('INSERT INTO desktop_note VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET content = excluded.content').run(this.ctx.encrypt(text)); this.note = text
    })
    this.handle('clipboard-copy', async (e, id) => {
      if (!this.componentSender(e, 'clipboard')) throw new Error('Invalid clipboard surface')
      const item = this.clips.find(item => item.id === id)
      if (!item) throw new Error('这条剪贴板记录已被清除')
      await clipboard.writeText(item.text); this.lastClipboard = item.text
    })
    this.handle('clipboard-clear', e => { if (!this.componentSender(e, 'clipboard')) throw new Error('Invalid clipboard surface'); this.clips = []; this.pushWidget('clipboard') })
    app.on('before-quit', this.stop)
    screen.on('display-removed', this.reposition)
    screen.on('display-added', this.reposition)
    screen.on('display-metrics-changed', this.reposition)
    for (const kind of widgetKinds) this.syncWidget(kind)
    queueMicrotask(() => { if (!this.stopping) { this.migrateQuota = false; this.store.set('settings', this.settings) } })
    this.topTimer = setInterval(() => {
      for (const item of this.floating.values()) if (!item.window.isDestroyed()) this.keepTop(item.window)
      if (this.switcher?.isVisible()) this.keepTop(this.switcher)
      this.launcher.keepTop()
    }, 2000)
    if (this.settings.dragEnabled || this.settings.switcherEnabled) void this.configure().catch(error => this.fail(String(error)))
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> { const result = this.changes.then(fn); this.changes = result.then(() => {}, () => {}); return result }
  private handle(name: string, fn: (event: IpcMainInvokeEvent, ...args: any[]) => unknown) {
    const channel = `desktop:${name}`; this.channels.push(channel)
    ipcMain.handle(channel, (e, ...args) => {
      if (this.stopping || !BrowserWindow.fromWebContents(e.sender)) throw new Error('Desktop service unavailable')
      return fn(e, ...args)
    })
  }
  private kind(kind: string): asserts kind is FloatingKind { if (kind !== 'group' && !widgetKinds.includes(kind as WidgetKind) && !this.extras.has(kind as FloatingKind)) throw new Error('Unknown widget') }
  private componentKinds(): FloatingKind[] { return [...widgetKinds] }
  private enabledComponents() { return this.componentKinds().filter(kind => this.widgetSettings(kind).enabled) }
  private componentSender(e: IpcMainInvokeEvent, kind: WidgetKind) { const sender = this.senderKind(e); return sender === kind || (sender === 'group' && this.widgetSettings(kind).enabled) }
  private senderKind(e: IpcMainInvokeEvent): FloatingKind {
    for (const [kind, item] of this.floating) if (item.window.webContents.id === e.sender.id) return kind
    throw new Error('Unknown floating window')
  }
  private widgetDisplay() { return screen.getAllDisplays().find(display => String(display.id) === this.settings.widgetDisplayId) ?? screen.getPrimaryDisplay() }
  private snapshot() {
    const primary = screen.getPrimaryDisplay().id
    return { settings: this.settings, status: this.status, activeWidgetDisplayId: String(this.widgetDisplay().id), displays: screen.getAllDisplays().map((display, index) => ({ id: String(display.id), label: display.label || `显示器 ${index + 1}`, width: display.size.width, height: display.size.height, primary: display.id === primary })) }
  }
  private persist() { this.store.set('settings', this.settings); for (const extra of this.extras.values()) extra.changed(extra.setting); this.ctx.sendToRenderer('desktop:changed', this.snapshot()) }
  private widgetSettings(kind: FloatingKind): WidgetSettings { return kind === 'group' ? this.settings.widgetGroup : this.extras.get(kind)?.setting ?? this.settings.widgets[kind as WidgetKind] }
  private destroyWidget(kind: FloatingKind) { const item = this.floating.get(kind); if (item) { clearTimeout(item.timer); this.clearMotion(item); item.window.destroy(); this.floating.delete(kind) } }
  private closeWidget(kind: FloatingKind) {
    if (kind === 'group') for (const child of this.enabledComponents()) this.widgetSettings(child).enabled = false
    else this.widgetSettings(kind).enabled = false
    this.syncWidget(kind); if (kind === 'group') this.syncClipboard(); this.persist()
  }
  setExtra(kind: FloatingKind, setting: WidgetSettings, data: SubscriptionRecord, changed: (setting: WidgetSettings) => void) {
    if (this.stopping) return
    this.extras.set(kind, { setting, data, changed })
    if (this.migrateQuota && setting.enabled) this.settings.widgets.quota.enabled = true
    this.syncWidget('quota')
  }
  removeExtra(kind: FloatingKind) {
    this.destroyWidget(kind)
    this.extras.delete(kind)
    this.syncWidget('quota')
  }
  private keepTop(window: BrowserWindow) { window.setAlwaysOnTop(true, 'screen-saver'); window.moveTop() }
  private fail(error: string) { if (!this.stopping) { this.status = { ...this.status, running: false, dragActive: false, switcherActive: false, error }; this.ctx.sendToRenderer('desktop:changed', this.snapshot()) } }
  private async configure() {
    const result = await this.native.request('configure', { dragEnabled: this.settings.dragEnabled, modifier: this.settings.modifier, switcherEnabled: this.settings.switcherEnabled })
    this.status = { ...this.status, ...result, running: true, error: null }; this.ctx.sendToRenderer('desktop:changed', this.snapshot())
  }
  private surface(name: string, bounds: Bounds): BrowserWindow {
    const window = new BrowserWindow({ ...bounds, minWidth: 1, minHeight: 1, frame: false, thickFrame: false, roundedCorners: false, show: false, transparent: true, backgroundColor: '#00000000', skipTaskbar: true, alwaysOnTop: true, resizable: false, minimizable: false, maximizable: false, hasShadow: false,
      webPreferences: { preload: join(__dirname, '../preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } })
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    this.keepTop(window)
    window.on('show', () => this.keepTop(window))
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', e => e.preventDefault())
    const url = process.env.ELECTRON_RENDERER_URL
    if (!app.isPackaged && url) { const target = new URL(url); target.searchParams.set('surface', name); void window.loadURL(target.toString()) }
    else void window.loadFile(join(__dirname, '../renderer/index.html'), { query: { surface: name } })
    return window
  }
  private async toggleSwitcher() {
    if (!this.status.supported) throw new Error('窗口速切目前支持 Windows x64')
    if (!this.status.running) await this.configure()
    if (this.switcher?.isVisible()) { this.switcher.hide(); return }
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    const width = Math.min(680, area.width), height = Math.min(480, area.height)
    const bounds = { x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2), width, height }
    if (!this.switcher || this.switcher.isDestroyed()) {
      this.switcher = this.surface('switcher', bounds)
      this.switcher.on('blur', () => this.switcher?.hide())
      this.switcher.on('close', e => { if (!this.stopping) { e.preventDefault(); this.switcher?.hide() } })
      await new Promise<void>(resolve => this.switcher!.webContents.once('did-finish-load', () => resolve()))
    }
    if (this.stopping) return
    this.switcher.setBounds(bounds); this.switcher.showInactive()
    await this.placeSurface(this.switcher, true)
    if (this.stopping || this.switcher.isDestroyed()) return
    this.switcher.show(); this.switcher.focus(); this.switcher.webContents.send('desktop:search-open')
  }
  private async placeSurface(window: BrowserWindow, focus = false) {
    if (!this.status.supported || window.isDestroyed()) return
    try {
      const handle = window.getNativeWindowHandle().readBigUInt64LE().toString()
      await this.native.request('surface', { windowId: handle, focus })
    } catch (error) { if (!this.stopping) this.ctx.sendToRenderer('desktop:changed', { ...this.snapshot(), status: { ...this.status, error: `组件跨桌面定位失败：${String(error)}` } }) }
  }
  private widgetState(kind: FloatingKind): FloatingWidgetState {
    return { kind, ...this.widgetSettings(kind), expanded: this.floating.get(kind)?.expanded ?? true, motion: this.floating.get(kind)?.motion, note: kind === 'note' ? this.note : undefined, clips: kind === 'clipboard' ? this.clips : undefined, subscriptions: kind === 'quota' ? [...this.extras.values()].map(extra => extra.data) : undefined, items: kind === 'group' ? this.enabledComponents().map(child => ({ ...this.widgetState(child), expanded: true, motion: undefined })) : undefined }
  }
  private pushWidget(kind: FloatingKind) { const target = this.settings.widgetMode === 'grouped' ? 'group' : kind; const item = this.floating.get(target); if (item && !item.window.isDestroyed()) item.window.webContents.send('desktop:widget-changed', this.widgetState(target)) }
  private syncWidget(kind: FloatingKind) {
    if (kind.startsWith('quota-')) { this.syncWidget('quota'); return }
    if (this.settings.widgetMode === 'grouped' && kind !== 'group') {
      this.destroyWidget(kind); this.syncWidget('group')
      if (kind === 'clipboard' && (!this.widgetSettings(kind).enabled || !this.clipboardTimer)) this.syncClipboard()
      return
    }
    if (kind === 'group') { this.settings.widgetGroup.enabled = this.settings.widgetMode === 'grouped' && this.enabledComponents().length > 0 }
    const setting = this.widgetSettings(kind)
    let item = this.floating.get(kind)
    if (!setting.enabled) {
      if (item) { clearTimeout(item.timer); this.clearMotion(item); item.window.destroy(); this.floating.delete(kind) }
    } else {
      if (!item) {
        const area = this.widgetDisplay().workArea
        const quotaWidth = Math.min(area.width, Math.max(340, [...this.extras.values()].reduce((sum, extra) => sum + extra.data.providers.length * 150 + 10, 18)))
        const initial = kind === 'quota' ? { x: setting.bounds?.x ?? area.x + area.width - quotaWidth, y: setting.bounds?.y ?? area.y + 60, width: setting.bounds?.width ?? quotaWidth, height: Math.min(360, area.height) } : setting.bounds ?? { x: area.x + area.width - 360, y: area.y + 60 + Math.max(0, this.componentKinds().indexOf(kind)) * 36, width: 360, height: kind === 'clock' ? 240 : kind === 'group' ? 640 : 420 }
        const location = dockBounds(initial, area, setting.edge)
        setting.bounds = location.bounds
        const expanded = setting.pinned || setting.edge === 'none'
        const window = this.surface(`widget-${kind}`, expanded ? location.bounds : this.collapsedBounds(kind))
        item = { window, expanded }; this.floating.set(kind, item)
        window.once('ready-to-show', () => { if (!window.isDestroyed()) { window.showInactive(); void this.placeSurface(window); this.scheduleCollapse(kind) } })
        window.on('close', e => { if (!this.stopping) { e.preventDefault(); this.closeWidget(kind) } })
      }
      if (setting.pinned) this.expand(kind)
      else this.scheduleCollapse(kind)
      if (kind === 'group' && !item.expanded) item.window.setBounds(this.collapsedBounds(kind))
      if (kind === 'quota' && !item.expanded) item.window.setBounds(this.collapsedBounds(kind))
      this.pushWidget(kind)
    }
    if (kind === 'clipboard' && (!setting.enabled || !this.clipboardTimer)) this.syncClipboard()
  }
  private expand(kind: FloatingKind, claimHover = false) {
    if (claimHover) for (const [otherKind, other] of this.floating) {
      if (otherKind !== kind && other.expanded && !other.drag && !this.widgetSettings(otherKind).pinned && this.widgetSettings(otherKind).edge !== 'none') {
        clearTimeout(other.timer); this.collapse(otherKind, true)
      }
    }
    const item = this.floating.get(kind); if (!item || (item.expanded && item.motion?.phase !== 'closing')) return
    item.expanded = true; item.window.setBounds(this.widgetSettings(kind).bounds!); this.keepTop(item.window); this.beginMotion(kind, 'opening')
  }
  private collapse(kind: FloatingKind, manual = false) {
    const item = this.floating.get(kind), setting = this.widgetSettings(kind)
    if (!item || item.drag || item.modalOpen || !item.expanded || item.motion?.phase === 'closing' || setting.pinned || setting.edge === 'none') return
    if (!manual) { const p = screen.getCursorScreenPoint(), b = item.window.getBounds(); if (p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height) return }
    this.beginMotion(kind, 'closing')
  }
  private clearMotion(item: Floating) { clearTimeout(item.motionTimer); item.motionTimer = undefined; item.motion = undefined }
  private beginMotion(kind: FloatingKind, phase: WidgetMotion['phase']) {
    const item = this.floating.get(kind); if (!item) return
    this.clearMotion(item)
    const id = ++this.motionSequence; item.motion = { id, phase }
    // The renderer animates on the compositor. Shrink the native hit area only
    // after the closing animation; a bounded fallback also covers hidden renderers.
    item.motionTimer = setTimeout(() => this.finishMotion(kind, id), widgetMotionDuration[phase] + 100)
    this.pushWidget(kind)
  }
  private finishMotion(kind: FloatingKind, id: number) {
    const item = this.floating.get(kind); if (!item?.motion || item.motion.id !== id) return
    const closing = item.motion.phase === 'closing'; this.clearMotion(item)
    if (closing && !item.drag && !this.widgetSettings(kind).pinned && this.widgetSettings(kind).edge !== 'none') {
      item.expanded = false; item.window.setBounds(this.collapsedBounds(kind)); this.keepTop(item.window)
    }
    this.pushWidget(kind)
  }
  private collapsedBounds(kind: FloatingKind) {
    const setting = this.widgetSettings(kind), b = handleBounds(setting.bounds!, setting.edge)
    if (kind === 'quota') {
      const area = this.widgetDisplay().workArea
      const grid = quotaDockGrid(quotaDockRecords([...this.extras.values()].map(extra => extra.data)).length)
      const width = Math.min(area.width, grid.width), height = Math.min(area.height, grid.height)
      return { x: setting.edge === 'right' ? area.x + area.width - width : Math.max(area.x, Math.min(b.x, area.x + area.width - width)), y: setting.edge === 'bottom' ? area.y + area.height - height : Math.max(area.y, Math.min(b.y, area.y + area.height - height)), width, height }
    }
    if (kind === 'group') {
      const area = this.widgetDisplay().workArea, horizontal = setting.edge === 'top' || setting.edge === 'bottom'
      const components = this.enabledComponents(), hasQuota = components.includes('quota')
      const grid = quotaDockGrid(quotaDockRecords([...this.extras.values()].map(extra => extra.data)).length)
      const length = Math.max(48, components.filter(child => child !== 'quota').length * 48 + (hasQuota ? horizontal ? grid.width : grid.height : 0) + 4)
      const width = Math.min(area.width, horizontal ? length : hasQuota ? grid.width + 4 : 40), height = Math.min(area.height, horizontal ? hasQuota ? grid.height + 4 : 40 : length)
      return { x: setting.edge === 'right' ? area.x + area.width - width : Math.max(area.x, Math.min(b.x, area.x + area.width - width)), y: setting.edge === 'bottom' ? area.y + area.height - height : Math.max(area.y, Math.min(b.y, area.y + area.height - height)), width, height }
    }
    if (!kind.startsWith('quota-')) return containBounds(b, this.widgetDisplay().workArea)
    const area = this.widgetDisplay().workArea
    return { x: setting.edge === 'right' ? area.x + area.width - 32 : b.x, y: Math.max(area.y, Math.min(b.y, area.y + area.height - 140)), width: 32, height: 140 }
  }
  private scheduleCollapse(kind: FloatingKind) {
    const item = this.floating.get(kind); if (!item) return
    clearTimeout(item.timer); item.timer = setTimeout(() => this.collapse(kind), widgetMotionDuration.leave)
  }
  private dragWidget(kind: FloatingKind, end: boolean) {
    const item = this.floating.get(kind); if (!item?.drag) return
    const { bounds: b, point: p, resize } = item.drag, now = screen.getCursorScreenPoint()
    const dx = now.x - p.x, dy = now.y - p.y
    const area = this.widgetDisplay().workArea
    const next = fitBounds(typeof resize === 'string' ? resizeBounds(b, area, kind === 'quota' ? resize.includes('w') ? 'w' : 'e' : resize, dx, dy) : resize ? { ...b, width: Math.max(260, b.width + dx), height: kind === 'quota' ? b.height : Math.max(180, b.height + dy) } : { ...b, x: b.x + dx, y: b.y + dy }, area)
    if (end) {
      item.drag = undefined
      const location = dockBounds(next, area, resize ? this.widgetSettings(kind).edge : undefined)
      Object.assign(this.widgetSettings(kind), location)
      item.window.setBounds(location.bounds); this.persist(); this.pushWidget(kind); this.scheduleCollapse(kind)
    } else item.window.setBounds(next)
  }
  private relocateWidgets() {
    const area = this.widgetDisplay().workArea, previousArea = this.settings.widgetDisplayArea
    for (const setting of [this.settings.widgetGroup, ...Object.values(this.settings.widgets)]) {
      if (setting.bounds) setting.bounds = transferBounds(setting.bounds, previousArea ?? screen.getDisplayMatching(setting.bounds).workArea, area, setting.edge)
    }
    this.settings.widgetDisplayArea = { ...area }
  }
  private reposition = () => {
    this.relocateWidgets()
    for (const [kind, item] of this.floating) {
      this.clearMotion(item); clearTimeout(item.timer); item.drag = undefined
      const setting = this.widgetSettings(kind)
      item.window.setBounds(item.expanded ? setting.bounds! : this.collapsedBounds(kind)); this.pushWidget(kind)
    }
    this.persist()
  }
  private syncClipboard() {
    const generation = ++this.clipboardGeneration
    clearInterval(this.clipboardTimer); this.clipboardTimer = undefined
    if (!this.settings.widgets.clipboard.enabled) { this.clips = []; this.lastClipboard = ''; return }
    let initialized = false, reading = false
    const poll = async () => {
      if (reading) return
      reading = true
      try {
        const items = await clipboard.read()
        if (items.some(item => item.types.some(format => /ExcludeClipboardContentFromMonitorProcessing|Clipboard Viewer Ignore|concealed|password|onepassword/i.test(format)))) return
        const item = items.find(item => item.types.includes('text/plain'))
        const blob = item ? await item.getType('text/plain') : undefined
        const text = blob && blob.size <= 80000 ? await blob.text() : ''
        if (generation !== this.clipboardGeneration || this.stopping) return
        if (!initialized) { initialized = true; this.lastClipboard = text; return }
        if (text === this.lastClipboard) return
        this.lastClipboard = text
        if (!text.trim() || text.length > 20000) return
        this.clips = [{ id: randomUUID(), text, time: Date.now() }, ...this.clips.filter(item => item.text !== text)].slice(0, 30)
        this.pushWidget('clipboard')
      } catch { /* Clipboard may briefly be held by another application. */ }
      finally { reading = false }
    }
    void poll()
    this.clipboardTimer = setInterval(poll, 800)
  }
  stop = () => {
    if (this.stopping) return
    this.stopping = true; this.launcher.dispose(); this.native.stop(); clearInterval(this.clipboardTimer); clearInterval(this.topTimer)
    for (const item of this.floating.values()) { clearTimeout(item.timer); this.clearMotion(item); item.window.destroy() }
    this.floating.clear(); this.switcher?.destroy(); this.clips = []
    screen.removeListener('display-removed', this.reposition); screen.removeListener('display-added', this.reposition); screen.removeListener('display-metrics-changed', this.reposition)
    app.removeListener('before-quit', this.stop)
    for (const channel of this.channels) ipcMain.removeHandler(channel)
  }
}
export const desktopPlugin: PluginMainModule = {
  id: 'desktop', name: 'Desktop settings',
  initialize(ctx) { service = new DesktopService(ctx) },
  async dispose() { service?.stop(); service = undefined }
}
