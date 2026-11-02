import { app, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import type { PluginContext, PluginMainModule } from '../../../shared/plugin-types'
import { LOCAL_SUBSCRIPTION_ID, validateSubscription, type SubscriptionDraft, type SubscriptionRecord } from '../../../shared/subscriptions'
import { resolveSavedSshConnection } from '../ssh-connections'
import { updateSubscriptionWidget, removeSubscriptionWidget } from '../desktop'
import { collectRemote, sanitizeSnapshots } from './remote'
import { collectLocal } from './local'
import { collectWsl, localWslDistributions } from './wsl'
import { defaultSubscriptionRefreshSettings, nextProviderRefresh, providerDue, validateSubscriptionRefreshSettings, type SubscriptionRefreshSettings } from '../../../shared/subscription-refresh'

export class SubscriptionService {
  private records = new Map<string, SubscriptionRecord>()
  private channels: string[] = []
  private pending = new Map<string, { controller: AbortController; promise: Promise<SubscriptionRecord[]> }>()
  private refreshSettings = defaultSubscriptionRefreshSettings()
  private queue: Promise<unknown> = Promise.resolve()
  private timer?: NodeJS.Timeout
  private stopped = false
  private localReady: Promise<void>
  constructor(private ctx: PluginContext) {
    ctx.db.exec('CREATE TABLE IF NOT EXISTS environments (id TEXT PRIMARY KEY, payload TEXT NOT NULL)')
    ctx.db.exec('CREATE TABLE IF NOT EXISTS refresh_settings (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL)')
    const savedSettings = ctx.db.prepare('SELECT payload FROM refresh_settings WHERE id = 1').get() as { payload: string } | undefined
    if (savedSettings) this.refreshSettings = validateSubscriptionRefreshSettings(JSON.parse(ctx.decrypt(savedSettings.payload)))
    for (const row of ctx.db.prepare('SELECT payload FROM environments').all() as { payload: string }[]) {
      const record = JSON.parse(ctx.decrypt(row.payload)) as SubscriptionRecord
      record.refreshing = false; this.records.set(record.id, record)
    }
    const savedLocal = this.records.get(LOCAL_SUBSCRIPTION_ID)
    const local: SubscriptionRecord = { ...savedLocal, id: LOCAL_SUBSCRIPTION_ID, name: '本地环境', connectionKind: 'local', connectionId: '', connectionName: process.platform === 'win32' ? 'Windows · 当前用户' : process.platform === 'darwin' ? 'macOS · 当前用户' : 'Linux · 当前用户', codexHome: '', claudeHome: '', providers: ['codex', 'claude'], refreshMinutes: 5, widget: savedLocal?.widget ?? { enabled: false, pinned: false, edge: 'right' }, accounts: savedLocal?.accounts ?? [], history: savedLocal?.history ?? [] }
    this.records.set(local.id, local)
    for (const record of this.records.values()) {
      record.providerRefresh ??= {}
      for (const provider of record.providers) if (!record.providerRefresh[provider]) {
        const account = record.accounts.find(a => a.provider === provider)
        record.providerRefresh[provider] = account ? nextProviderRefresh(provider, account.status, undefined, this.refreshSettings, record.refreshMinutes, record.checkedAt ?? Date.now()) : { failures: 0, nextRefreshAt: Date.now() }
      }
      this.updateNextRefresh(record); this.save(record); this.syncWidget(record)
    }
    const handle = (name: string, fn: (...args: any[]) => unknown) => {
      const channel = `subscriptions:${name}`; this.channels.push(channel)
      ipcMain.handle(channel, (_event, ...args) => { if (this.stopped) throw new Error('订阅服务已停止'); return fn(...args) })
    }
    this.localReady = this.discoverLocalWsl()
    handle('list', async () => { await this.localReady; return this.list() })
    handle('refresh-settings', () => this.refreshSettings)
    handle('save-refresh-settings', (value: SubscriptionRefreshSettings) => {
      this.refreshSettings = validateSubscriptionRefreshSettings(value)
      ctx.db.prepare('INSERT OR REPLACE INTO refresh_settings VALUES (1, ?)').run(ctx.encrypt(JSON.stringify(this.refreshSettings)))
      for (const record of this.records.values()) {
        const previous = record.providerRefresh?.claude, account = record.accounts.find(a => a.provider === 'claude')
        if (record.providers.includes('claude')) {
          record.providerRefresh ??= {}
          const status = account?.status ?? (previous?.failures ? 'error' : undefined)
          record.providerRefresh.claude = status ? nextProviderRefresh('claude', status, { failures: Math.max(0, (previous?.failures ?? 0) - 1) }, this.refreshSettings, record.refreshMinutes, previous?.lastAttemptAt ?? Date.now()) : { failures: 0, nextRefreshAt: Date.now() }
          if (previous?.paused && !this.refreshSettings.claudePauseWhenSignedOut) record.providerRefresh.claude.nextRefreshAt = Date.now()
          this.updateNextRefresh(record); this.save(record); this.syncWidget(record)
        }
      }
      this.publish(); this.ctx.sendToRenderer('subscriptions:refresh-settings-changed', this.refreshSettings); return this.refreshSettings
    })
    handle('save', async (input: SubscriptionDraft, id?: string) => {
      if ((id && this.records.get(id)?.connectionKind === 'local') || input?.connectionKind === 'local') throw new Error('本地环境为内置固定项，不能修改或重复添加')
      const draft = validateSubscription(input)
      const existing = id ? this.get(id) : undefined
      if (existing && this.pending.has(existing.id)) throw new Error('正在读取此环境，请等查询结束后编辑')
      if (!existing && this.records.size >= 100) throw new Error('最多添加 100 个环境')
      const connection = await resolveSavedSshConnection(draft.connectionKind, draft.connectionId)
      const changed = existing && (existing.connectionId !== draft.connectionId || existing.connectionKind !== draft.connectionKind || existing.codexHome !== draft.codexHome || existing.claudeHome !== draft.claudeHome)
      const record: SubscriptionRecord = { ...draft, id: existing?.id ?? randomUUID(), connectionName: connection.title, widget: existing?.widget ?? { enabled: false, pinned: false, edge: 'right' }, accounts: changed ? [] : (existing?.accounts ?? []).filter(a => draft.providers.includes(a.provider)), history: changed ? [] : existing?.history ?? [], checkedAt: changed ? undefined : existing?.checkedAt, providerRefresh: changed ? {} : existing?.providerRefresh ?? {}, nextRefreshAt: Date.now() }
      this.updateNextRefresh(record)
      this.records.set(record.id, record); this.save(record); this.syncWidget(record); this.publish()
      void this.refresh(record.id, true).catch(() => {})
      return this.list()
    })
    handle('remove', (id: string) => { if (this.get(id).connectionKind === 'local') throw new Error('本地环境为内置固定项，不能移除'); this.pending.get(id)?.controller.abort(); this.records.delete(id); ctx.db.prepare('DELETE FROM environments WHERE id = ?').run(id); removeSubscriptionWidget(id); this.publish(); return this.list() })
    handle('refresh', (id: string) => this.refresh(id, true))
    handle('refresh-all', async () => { await Promise.all([...this.records.keys()].map(id => this.refresh(id, true).catch(() => {}))); return this.list() })
    handle('floating', (id: string, enabled: boolean) => {
      const record = this.get(id)
      if (typeof enabled !== 'boolean') throw new Error('无效开关')
      if (record.connectionKind === 'local' && !enabled) throw new Error('本机环境默认显示在额度缩略网格中')
      if (enabled && record.connectionKind !== 'local' && !record.widget.enabled && this.list().filter(item => item.connectionKind === 'local' || item.widget.enabled).length >= 9) throw new Error('缩略网格最多显示 9 个环境；展开后仍可查看全部环境')
      record.widget.enabled = enabled; this.save(record); this.syncWidget(record); this.publish(); return this.list()
    })
    this.timer = setInterval(() => { for (const record of this.records.values()) if (record.nextRefreshAt !== undefined && record.nextRefreshAt <= Date.now()) void this.refresh(record.id).catch(() => {}) }, 15000)
    app.on('before-quit', this.stop)
    if (local.nextRefreshAt !== undefined && local.nextRefreshAt <= Date.now()) queueMicrotask(() => { if (!this.stopped) void this.refresh(local.id).catch(() => {}) })
  }
  private get(id: string) { const record = this.records.get(id); if (!record) throw new Error('此环境已移除'); return record }
  private async discoverLocalWsl() {
    for (const distribution of await localWslDistributions()) {
      if (this.stopped) return
      const id = `builtin-wsl:${distribution}`
      if (this.records.has(id)) continue
      const record: SubscriptionRecord = { id, name: `WSL · ${distribution}`, connectionKind: 'local', connectionId: distribution, connectionName: `WSL · ${distribution} · 当前用户`, codexHome: '', claudeHome: '', providers: ['codex', 'claude'], refreshMinutes: 5, widget: { enabled: true, pinned: false, edge: 'right' }, accounts: [], history: [], providerRefresh: {}, nextRefreshAt: Date.now() }
      this.records.set(id, record); this.save(record); this.syncWidget(record); this.publish()
      void this.refresh(id).catch(() => {})
    }
  }
  private list() { return [...this.records.values()].sort((a, b) => Number(b.id === LOCAL_SUBSCRIPTION_ID) - Number(a.id === LOCAL_SUBSCRIPTION_ID)) }
  private save(record: SubscriptionRecord) { this.ctx.db.prepare('INSERT OR REPLACE INTO environments VALUES (?, ?)').run(record.id, this.ctx.encrypt(JSON.stringify({ ...record, refreshing: false }))) }
  private publish() { this.ctx.sendToRenderer('subscriptions:changed', this.list()) }
  private updateNextRefresh(record: SubscriptionRecord) {
    const times = record.providers.flatMap(provider => { const state = record.providerRefresh?.[provider]; return state?.paused ? [] : [state?.nextRefreshAt ?? Date.now()] })
    record.nextRefreshAt = times.length ? Math.min(...times) : undefined
  }
  private syncWidget(record: SubscriptionRecord) {
    updateSubscriptionWidget(record, setting => {
      if (!this.records.has(record.id) || this.stopped) return
      record.widget = setting; this.save(record); this.publish()
    })
  }
  refresh(id: string, manual = false): Promise<SubscriptionRecord[]> {
    const existing = this.pending.get(id); if (existing) return existing.promise
    const record = this.get(id)
    let providers = record.providers.filter(provider => providerDue(record.providerRefresh?.[provider], manual))
    if (!providers.length) return manual ? Promise.reject(new Error('查询冷却中，每个客户端的手动刷新至少间隔 2 分钟')) : Promise.resolve(this.list())
    const controller = new AbortController()
    record.refreshing = true; this.publish(); this.syncWidget(record)
    const operation = this.queue.then(async () => {
      if (this.stopped || controller.signal.aborted || !this.records.has(id)) { this.pending.delete(id); return this.list() }
      providers = record.providers.filter(provider => providerDue(record.providerRefresh?.[provider], manual))
      if (!providers.length) { this.pending.delete(id); record.refreshing = false; this.publish(); this.syncWidget(record); return this.list() }
      try {
        const launch = record.connectionKind === 'local' ? undefined : await resolveSavedSshConnection(record.connectionKind, record.connectionId)
        const accounts = launch ? await collectRemote(launch, { ...record, providers }, controller.signal) : record.connectionId ? await collectWsl({ ...record, providers }, controller.signal) : sanitizeSnapshots(await collectLocal(providers, controller.signal))
        if (providers.some(provider => accounts.filter(a => a.provider === provider).length !== 1) || accounts.some(a => !providers.includes(a.provider))) throw new Error('客户端返回的数据不完整')
        if (!this.records.has(id) || this.stopped || controller.signal.aborted) return this.list()
        const previous = record.accounts
        for (const next of accounts) {
          const old = previous.find(a => a.provider === next.provider)
          if (next.status === 'live' && next.account && old?.account && next.account !== old.account) record.history = record.history.filter(sample => sample.provider !== next.provider)
        }
        if (launch) record.connectionName = launch.title
        record.providerRefresh ??= {}
        for (const account of accounts) record.providerRefresh[account.provider] = nextProviderRefresh(account.provider, account.status, record.providerRefresh[account.provider], this.refreshSettings, record.refreshMinutes)
        const updated = accounts.map(next => {
          const old = previous.find(a => a.provider === next.provider)
          return next.status === 'error' && old && (!next.account || next.account === old.account) ? { ...old, status: 'error' as const, message: next.message, sessions: next.sessions, sessionsMessage: next.sessionsMessage } : next
        })
        record.accounts = record.providers.flatMap(provider => { const account = updated.find(a => a.provider === provider) ?? previous.find(a => a.provider === provider); return account ? [account] : [] })
        record.checkedAt = Date.now()
        record.error = record.providers.some(provider => record.providerRefresh?.[provider]?.failures) ? '部分数据未刷新成功，详情中保留并标记上次读数' : undefined
        for (const account of accounts) if (account.status === 'live') for (const w of account.windows) record.history.push({ at: Date.now(), provider: account.provider, windowId: w.id, usedPercent: w.usedPercent, resetsAt: w.resetsAt })
        record.history = record.history.filter(s => s.at >= Date.now() - 7 * 86400000).slice(-2000)
      } catch (error) {
        if (!controller.signal.aborted) {
          record.error = error instanceof Error ? error.message : '查询失败'
          record.providerRefresh ??= {}
          for (const provider of providers) {
            record.providerRefresh[provider] = nextProviderRefresh(provider, 'error', record.providerRefresh[provider], this.refreshSettings, record.refreshMinutes)
            const account = record.accounts.find(a => a.provider === provider)
            if (account) { account.status = 'error'; account.message = record.error }
          }
        }
      }
      finally {
        this.pending.delete(id)
        if (this.records.has(id) && !this.stopped && !controller.signal.aborted) {
          record.refreshing = false
          this.updateNextRefresh(record)
          this.save(record); this.syncWidget(record); this.publish()
        }
      }
      return this.list()
    })
    this.queue = operation.catch(() => {})
    this.pending.set(id, { controller, promise: operation })
    return operation
  }
  stop = () => {
    this.stopped = true; clearInterval(this.timer)
    for (const job of this.pending.values()) job.controller.abort()
    for (const channel of this.channels.splice(0)) ipcMain.removeHandler(channel)
    app.removeListener('before-quit', this.stop)
  }
}
let service: SubscriptionService | undefined
export const subscriptionsPlugin: PluginMainModule = { id: 'subscriptions', name: 'AI subscriptions', initialize(ctx) { service = new SubscriptionService(ctx) }, async dispose() { service?.stop(); service = undefined } }
