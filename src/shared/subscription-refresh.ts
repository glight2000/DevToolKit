import type { AccountSnapshot, Provider } from './subscriptions'

export interface SubscriptionRefreshSettings {
  claudeRefreshMinutes: number
  claudeFailureMinutes: number[]
  claudePauseWhenSignedOut: boolean
}
export interface ProviderRefreshState {
  failures: number
  lastAttemptAt?: number
  nextRefreshAt?: number
  paused?: boolean
}
export const defaultSubscriptionRefreshSettings = (): SubscriptionRefreshSettings => ({ claudeRefreshMinutes: 5, claudeFailureMinutes: [5, 20, 60, 1440], claudePauseWhenSignedOut: true })
export function validateSubscriptionRefreshSettings(value: SubscriptionRefreshSettings): SubscriptionRefreshSettings {
  const minutes = (n: unknown): n is number => Number.isInteger(n) && Number(n) >= 2 && Number(n) <= 10080
  if (!value || !minutes(value.claudeRefreshMinutes) || typeof value.claudePauseWhenSignedOut !== 'boolean' || !Array.isArray(value.claudeFailureMinutes) || value.claudeFailureMinutes.length < 1 || value.claudeFailureMinutes.length > 10 || value.claudeFailureMinutes.some((n, i, a) => !minutes(n) || (i > 0 && n < a[i - 1]))) throw new Error('刷新间隔须为 2–10080 分钟；重试间隔须递增，填写 1–10 个阶段')
  return { claudeRefreshMinutes: value.claudeRefreshMinutes, claudeFailureMinutes: [...value.claudeFailureMinutes], claudePauseWhenSignedOut: value.claudePauseWhenSignedOut }
}
export function nextProviderRefresh(provider: Provider, status: AccountSnapshot['status'], previous: ProviderRefreshState | undefined, settings: SubscriptionRefreshSettings, environmentMinutes: number, now = Date.now()): ProviderRefreshState {
  const failures = status === 'error' ? (previous?.failures ?? 0) + 1 : 0
  if (provider === 'claude' && settings.claudePauseWhenSignedOut && (status === 'signed-out' || status === 'unavailable')) return { failures: 0, lastAttemptAt: now, paused: true }
  const normal = provider === 'claude' ? settings.claudeRefreshMinutes : environmentMinutes
  const retry = !failures ? 0 : provider === 'claude' ? settings.claudeFailureMinutes[Math.min(failures - 1, settings.claudeFailureMinutes.length - 1)] : Math.min(60, 5 * 2 ** Math.min(4, failures - 1))
  return { failures, lastAttemptAt: now, nextRefreshAt: now + Math.max(normal, retry) * 60000 }
}
export function providerDue(state: ProviderRefreshState | undefined, manual = false, now = Date.now()) {
  // Explicit refresh can recheck login or recover after a long backoff. Keep a
  // two-minute limit, independently for each provider, to avoid request storms.
  if (manual) return state?.lastAttemptAt === undefined || state.lastAttemptAt + 120000 <= now
  return !state?.paused && (state?.nextRefreshAt ?? 0) <= now
}
