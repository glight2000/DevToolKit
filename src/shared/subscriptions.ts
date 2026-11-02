import type { WidgetSettings } from './desktop'
import type { ProviderRefreshState } from './subscription-refresh'
export type Provider = 'codex' | 'claude'
export interface QuotaWindow { id: string; label: string; usedPercent: number; resetsAt?: number; durationSeconds?: number }
export interface Conversation { id: string; title: string; cwd: string; updatedAt?: number }
export interface AccountSnapshot {
  provider: Provider; status: 'live' | 'signed-out' | 'unavailable' | 'error'; account?: string; plan?: string; message?: string
  windows: QuotaWindow[]; observedAt: number; sessions: Conversation[]; sessionsMessage?: string
  credits?: { balance?: string; unlimited?: boolean; expiresAt?: number; used?: number; limit?: number; unit: string }
  coupons?: { available: number; items: { title: string; expiresAt?: number }[]; detailsAvailable: boolean }
  usage?: { lifetimeTokens?: number; peakDailyTokens?: number; currentStreakDays?: number; daily: { date: string; tokens: number }[] }
}
export const LOCAL_SUBSCRIPTION_ID = 'builtin-local'
export function quotaDockRecords(records: SubscriptionRecord[]): SubscriptionRecord[] {
  return [...records].sort((a, b) => Number(b.connectionKind === 'local') - Number(a.connectionKind === 'local')).filter(record => record.connectionKind === 'local' || record.widget.enabled).slice(0, 9)
}
export function quotaDockGrid(count: number) {
  const size = Math.min(9, Math.max(1, count))
  const columns = Math.min(3, size), rows = Math.ceil(size / 3)
  // Match the ordinary 32 × 112 handle for one environment; leave room for
  // the same inset border and small gaps when several handles share the dock.
  return { columns, rows, width: columns * 28 + (columns - 1) * 2 + 4, height: rows * 108 + (rows - 1) * 2 + 4 }
}
export interface SubscriptionDraft { name: string; connectionKind: 'profile' | 'system' | 'local'; connectionId: string; codexHome: string; claudeHome: string; providers: Provider[]; refreshMinutes: number }
export interface SubscriptionRecord extends SubscriptionDraft {
  id: string; connectionName: string; widget: WidgetSettings; accounts: AccountSnapshot[]; checkedAt?: number
  providerRefresh?: Partial<Record<Provider, ProviderRefreshState>>
  error?: string; refreshing?: boolean; nextRefreshAt?: number; history: { at: number; provider: Provider; windowId: string; usedPercent: number; resetsAt?: number }[]
}
export function validateSubscription(value: SubscriptionDraft): SubscriptionDraft & { connectionKind: 'profile' | 'system' } {
  if (!value || typeof value !== 'object') throw new Error('请填写环境信息')
  const text = (input: unknown, max: number) => { if (typeof input !== 'string' || input.length > max || /[\x00-\x1f]/.test(input)) throw new Error('环境信息格式无效'); return input.trim() }
  const name = text(value.name, 100), connectionId = text(value.connectionId, 500)
  if (!name || !connectionId || (value.connectionKind !== 'profile' && value.connectionKind !== 'system')) throw new Error('请选择已有 SSH 连接并填写名称')
  if (!Array.isArray(value.providers) || !value.providers.length || value.providers.some(p => p !== 'codex' && p !== 'claude')) throw new Error('请选择 Codex 或 Claude')
  if (!Number.isInteger(value.refreshMinutes) || value.refreshMinutes < 2 || value.refreshMinutes > 1440) throw new Error('刷新间隔应为 2–1440 分钟')
  return { name, connectionId, connectionKind: value.connectionKind, codexHome: text(value.codexHome, 1000), claudeHome: text(value.claudeHome, 1000), providers: [...new Set(value.providers)], refreshMinutes: value.refreshMinutes }
}
export function pressure(window: QuotaWindow, now = Date.now()): { label: string; level: 'unknown' | 'low' | 'medium' | 'high'; explanation: string } {
  if (window.resetsAt && window.resetsAt <= now) return { label: '等待刷新', level: 'unknown', explanation: '额度窗口已到期，需重新查询' }
  const remaining = 100 - window.usedPercent
  if (remaining <= 10) return { label: '高压力', level: 'high', explanation: '剩余额度不超过 10%' }
  if (window.resetsAt && window.durationSeconds) {
    const elapsed = Math.max(0, Math.min(1, 1 - (window.resetsAt - now) / (window.durationSeconds * 1000)))
    if (elapsed >= .05 && window.usedPercent / elapsed > 100) return { label: '偏快', level: 'medium', explanation: '按本窗口平均消耗速度估算，可能在重置前耗尽；不是精确预测' }
  }
  return { label: remaining <= 30 ? '留意额度' : '充足', level: remaining <= 30 ? 'medium' : 'low', explanation: `剩余 ${Math.round(remaining)}% · 按当前额度比例评估` }
}
export function quotaSummary(record: SubscriptionRecord, now = Date.now()) {
  const valid = record.accounts.flatMap(a => a.status === 'live' ? a.windows.filter(w => !w.resetsAt || w.resetsAt > now) : [])
  const window = valid.sort((a, b) => b.usedPercent - a.usedPercent)[0]
  return { remaining: window ? Math.max(0, 100 - window.usedPercent) : undefined, stale: !!record.error || !record.checkedAt || now - record.checkedAt > record.refreshMinutes * 120000, window }
}
