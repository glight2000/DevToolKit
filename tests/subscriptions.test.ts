import test from 'node:test'
import assert from 'node:assert/strict'
import { pressure, quotaSummary, validateSubscription, type SubscriptionRecord } from '../src/shared/subscriptions'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { prepareDatabaseDirectory } from '../src/main/lib/db'
import { defaultSubscriptionRefreshSettings, nextProviderRefresh, providerDue, validateSubscriptionRefreshSettings } from '../src/shared/subscription-refresh'
const draft = { name: 'Lab', connectionKind: 'profile' as const, connectionId: 'saved', codexHome: '', claudeHome: '', providers: ['codex' as const], refreshMinutes: 5 }
test('subscription registration requires an existing connection reference and bounded polling', () => {
  assert.deepEqual(validateSubscription(draft), draft)
  assert.throws(() => validateSubscription({ ...draft, connectionId: '' }))
  assert.throws(() => validateSubscription({ ...draft, providers: [] }))
  assert.throws(() => validateSubscription({ ...draft, refreshMinutes: 0 }))
  assert.throws(() => validateSubscription({ ...draft, connectionKind: 'local' }))
  assert.throws(() => validateSubscription({ ...draft, codexHome: '/tmp/a\ncommand' }))
  assert.equal(validateSubscription({ ...draft, codexHome: "/home/one's profile/$(literal)" }).codexHome, "/home/one's profile/$(literal)")
})
test('pressure separates expired samples from remaining quota and explains estimates', () => {
  const window = { id: 'primary', label: '5h', usedPercent: 50, durationSeconds: 18000, resetsAt: 15000000 }
  assert.equal(pressure(window, 0).level, 'medium')
  assert.equal(pressure({ ...window, usedPercent: 95 }, 0).level, 'high')
  assert.equal(pressure(window, 16000000).level, 'unknown')
  assert.equal(pressure({ ...window, usedPercent: 10 }, 0).level, 'low')
})
test('Claude retries at 5, 20, 60, 1440 minutes independently and resets after success', () => {
  const settings = defaultSubscriptionRefreshSettings()
  let state
  for (const minutes of [5, 20, 60, 1440, 1440]) {
    state = nextProviderRefresh('claude', 'error', state, settings, 5, 0)
    assert.equal(state.nextRefreshAt, minutes * 60000)
  }
  const codex = nextProviderRefresh('codex', 'live', undefined, settings, 5, 0)
  assert.equal(providerDue(codex, false, 300000), true)
  assert.equal(providerDue(state, false, 300000), false)
  const recovered = nextProviderRefresh('claude', 'live', state, settings, 5, 0)
  assert.equal(recovered.failures, 0); assert.equal(recovered.nextRefreshAt, 300000)
})
test('Claude pauses without credentials, supports manual recheck, and can opt back into polling', () => {
  const settings = defaultSubscriptionRefreshSettings()
  for (const status of ['signed-out', 'unavailable'] as const) {
    const paused = nextProviderRefresh('claude', status, undefined, settings, 5, 0)
    assert.equal(paused.paused, true); assert.equal(paused.nextRefreshAt, undefined)
    assert.equal(providerDue(paused, false, 10 * 86400000), false)
    assert.equal(providerDue(paused, true, 60000), false)
    assert.equal(providerDue(paused, true, 120000), true)
    const polling = nextProviderRefresh('claude', status, paused, { ...settings, claudePauseWhenSignedOut: false }, 5, 0)
    assert.equal(polling.nextRefreshAt, 300000)
    assert.equal(nextProviderRefresh('codex', status, undefined, settings, 5, 0).paused, undefined)
  }
  assert.throws(() => validateSubscriptionRefreshSettings({ ...settings, claudeFailureMinutes: [] }))
  assert.throws(() => validateSubscriptionRefreshSettings({ ...settings, claudeFailureMinutes: [20, 5] }))
  assert.throws(() => validateSubscriptionRefreshSettings({ ...settings, claudeFailureMinutes: [Infinity] }))
  assert.equal(nextProviderRefresh('claude', 'error', undefined, { ...settings, claudeRefreshMinutes: 30 }, 5, 0).nextRefreshAt, 1800000)
})
test('collapsed quota uses the tightest valid window without inventing missing values', () => {
  const record: SubscriptionRecord = { ...draft, id: '1', connectionName: 'Lab', widget: { enabled: true, pinned: false, edge: 'right' }, history: [], checkedAt: 1000, accounts: [{ provider: 'codex', status: 'live', observedAt: 1000, sessions: [], windows: [{ id: 'a', label: '5h', usedPercent: 40, resetsAt: 9000 }, { id: 'b', label: '7d', usedPercent: 80, resetsAt: 9000 }] }] }
  assert.equal(quotaSummary(record, 2000).remaining, 20)
  assert.equal(quotaSummary(record, 10000).remaining, undefined)
  assert.equal(quotaSummary({ ...record, error: 'offline' }, 2000).stale, true)
})
test('database migration preserves WAL rows and never overwrites existing app data', async () => {
  const root = mkdtempSync(join(tmpdir(), 'devtoolkit-migration-'))
  mkdirSync(join(root, 'databases'))
  const legacy = new Database(join(root, 'databases', 'subscriptions.db'))
  legacy.pragma('journal_mode = WAL'); legacy.pragma('wal_autocheckpoint = 0')
  legacy.exec("CREATE TABLE environments (name TEXT); INSERT INTO environments VALUES ('keep me')")
  try {
    const directory = await prepareDatabaseDirectory(root)
    assert.equal(directory, join(root, 'devtoolkit-data', 'databases'))
    const migrated = new Database(join(directory, 'subscriptions.db'))
    try {
      assert.deepEqual(migrated.prepare('SELECT name FROM environments').all(), [{ name: 'keep me' }])
      migrated.exec("INSERT INTO environments VALUES ('new record')")
      await prepareDatabaseDirectory(root)
      assert.equal(migrated.prepare('SELECT count(*) AS n FROM environments').get().n, 2)
    } finally { migrated.close() }
  } finally { legacy.close() }
})
