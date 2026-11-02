import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron } from 'playwright'

const userData = mkdtempSync(join(tmpdir(), 'devtoolkit-subscriptions-'))
writeFileSync(join(userData, 'config.json'), JSON.stringify({ activePluginId: 'subscriptions', theme: 'dark' }))
mkdirSync('out/test-artifacts', { recursive: true })
const env = { ...process.env, DEVTOOLKIT_TEST_DATA: userData }; delete env.ELECTRON_RUN_AS_NODE
const launch = () => _electron.launch({ args: [resolve('tests/fixtures/subscriptions-bootstrap.mjs')], env, timeout: 30000 })
let app = await launch()
const errors = []
try {
  let page = await app.firstWindow(); page.setDefaultTimeout(15000)
  page.on('pageerror', error => errors.push(error.message))
  await page.getByRole('heading', { name: 'AI 订阅', exact: true }).waitFor()
  await page.getByRole('heading', { name: '本地环境', exact: true }).waitFor()
  await page.getByText('local@example.test', { exact: true }).waitFor()
  const local = (await page.evaluate(() => window.api.invoke('subscriptions:list')))[0]
  assert.equal(local.id, 'builtin-local')
  assert.equal(local.accounts[0].windows[0].usedPercent, 70)
  assert.equal(local.accounts[0].sessions[0].id, 'local-session')
  assert.equal(local.providerRefresh.claude.paused, true)
  assert.ok(!JSON.stringify(local).includes('NEVER_FORWARD_LOCAL'))
  assert.equal(await page.getByRole('button', { name: '编辑 本地环境', exact: true }).count(), 0)
  assert.equal(await page.getByRole('button', { name: '移除 本地环境', exact: true }).count(), 0)
  const protections = await page.evaluate(async local => {
    const results = []
    for (const [action, ...args] of [['remove', local.id], ['save', { ...local, name: 'changed' }, local.id], ['save', local]]) {
      try { await window.api.invoke(`subscriptions:${action}`, ...args); results.push(false) } catch { results.push(true) }
    }
    return results
  }, local)
  assert.deepEqual(protections, [true, true, true])
  assert.equal(await page.getByLabel('收起时显示', { exact: true }).isDisabled(), true)
  await page.screenshot({ path: 'out/test-artifacts/subscriptions-local.png', animations: 'disabled' })
  const profile = await page.evaluate(async () => {
    await window.api.invoke('ssh:catalog')
    return window.api.invoke('ssh:save-profile', { name: '研发工作站', host: 'devtoolkit-fixture.invalid', port: 22, username: 'developer', environment: 'local', auth: 'auto', keyPath: '', group: '', tags: [], notes: '', favorite: false })
  })
  await page.getByRole('button', { name: '添加环境', exact: true }).click()
  await page.getByLabel('环境名称', { exact: true }).fill('研发工作站 · 主账号')
  await page.getByLabel('已有 SSH 连接', { exact: true }).selectOption(`profile:${profile.id}`)
  await page.getByLabel('Codex 配置目录（远端）', { exact: true }).fill("/home/developer's codex/$(literal)")
  await page.getByRole('button', { name: '保存并读取', exact: true }).click()
  await page.locator('.subscription-select').filter({ hasText: '研发工作站 · 主账号' }).click()
  await page.getByText('developer@example.test', { exact: true }).waitFor()
  await page.getByText('studio@example.test', { exact: true }).waitFor()
  const records = (await page.evaluate(() => window.api.invoke('subscriptions:list'))).filter(r => r.connectionKind !== 'local')
  assert.equal(records.length, 1)
  const id = records[0].id
  assert.equal(records[0].accounts[0].coupons.available, 2)
  assert.ok(!JSON.stringify(records).includes('DO_NOT_FORWARD'))
  assert.ok(!JSON.stringify(records).includes('NEVER_SERIALIZE'))
  const command = (await app.evaluate(() => globalThis.subscriptionCommands))[0]
  assert.ok(command.args.includes('StrictHostKeyChecking=yes'))
  assert.ok(command.args.includes('BatchMode=yes'))
  assert.equal(command.args.at(-1), 'python3 -')
  assert.ok(!command.args.join(' ').includes('$(literal)'))
  await page.screenshot({ path: 'out/test-artifacts/subscriptions-dark.png', animations: 'disabled' })
  await page.getByRole('tab', { name: '对话列表 (4)', exact: true }).click()
  await page.getByLabel('搜索远端会话').fill('codex 窗口')
  // Search uses a simple phrase; a single keyword filters both providers.
  await page.getByLabel('搜索远端会话').fill('窗口交互')
  assert.equal(await page.locator('.quota-sessions li').count(), 2)
  await page.screenshot({ path: 'out/test-artifacts/subscriptions-sessions.png', animations: 'disabled' })
  await page.getByRole('tab', { name: '本机采样', exact: true }).click()
  assert.equal(await page.locator('.quota-history tbody tr').count(), 4)
  await page.getByRole('tab', { name: '订阅与额度', exact: true }).click()
  await page.locator('.subscription-card').filter({ hasText: '研发工作站 · 主账号' }).getByLabel('收起时显示', { exact: true }).check()
  await page.evaluate(() => window.api.invoke('desktop:widget-setting', 'quota', { enabled: true }))
  let widget
  for (let attempt = 0; attempt < 60; attempt++) {
    widget = app.windows().find(w => w.url().includes('widget-quota'))
    if (widget) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(widget)
  await widget.evaluate(() => window.api.invoke('desktop:widget-enter'))
  await widget.getByTitle('固定展开', { exact: true }).click()
  await widget.getByText('developer@example.test', { exact: true }).waitFor()
  assert.equal(await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('widget-quota')).isAlwaysOnTop(), id), true)
  await widget.screenshot({ path: 'out/test-artifacts/subscriptions-floating.png', animations: 'disabled' })
  await widget.getByTitle('取消固定', { exact: true }).click()
  await widget.evaluate(() => window.api.invoke('desktop:widget-collapse'))
  await widget.locator('.quota-dock-tiles').waitFor()
  assert.equal(await widget.getByRole('progressbar').count(), 4)
  assert.deepEqual(await widget.evaluate(() => ({ width: innerWidth, height: innerHeight })), { width: 62, height: 112 })
  await widget.screenshot({ path: 'out/test-artifacts/subscriptions-handle.png', animations: 'disabled' })
  await page.getByRole('button', { name: 'Compact', exact: true }).click()
  await page.getByRole('button', { name: 'Light Mode', exact: true }).click()
  await page.setViewportSize({ width: 900, height: 600 })
  await page.screenshot({ path: 'out/test-artifacts/subscriptions-light-compact.png', animations: 'disabled' })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.getByRole('button', { name: '刷新设置', exact: true }).click()
  await page.getByLabel('Claude 正常刷新（分钟）', { exact: true }).fill('7')
  assert.equal(await page.getByLabel('连续失败的重试间隔（分钟）', { exact: true }).inputValue(), '5, 20, 60, 1440')
  await page.screenshot({ path: 'out/test-artifacts/subscriptions-refresh-settings.png', animations: 'disabled' })
  await page.getByRole('button', { name: '保存刷新设置', exact: true }).click()
  // Persist snapshots and floating settings across a real app restart.
  await app.close()
  app = await launch(); page = await app.firstWindow()
  await page.getByRole('heading', { name: 'AI 订阅', exact: true }).waitFor()
  const allRestored = await page.evaluate(() => window.api.invoke('subscriptions:list'))
  assert.equal(allRestored.filter(r => r.connectionKind === 'local').length, 1, 'Exactly one fixed local environment survives restart')
  assert.equal(allRestored[0].id, 'builtin-local')
  assert.equal(allRestored[0].widget.enabled, false)
  assert.equal(allRestored[0].providerRefresh.claude.paused, true)
  assert.equal((await page.evaluate(() => window.api.invoke('subscriptions:refresh-settings'))).claudeRefreshMinutes, 7)
  const restored = allRestored.filter(r => r.connectionKind !== 'local')
  assert.equal(restored.length, 1, 'Registered environments survive app restart')
  assert.equal(restored[0].accounts[0]?.account, 'developer@example.test', 'Account snapshots survive app restart')
  await page.locator('.subscription-select').filter({ hasText: '研发工作站 · 主账号' }).click()
  await page.getByText('developer@example.test', { exact: true }).waitFor()
  assert.equal(restored[0].widget.enabled, true)
  assert.equal(restored[0].history.length, 4)
  await page.evaluate(async () => {
    await window.api.invoke('ssh:catalog')
    const profile = await window.api.invoke('ssh:save-profile', { name: 'Offline fixture', host: 'devtoolkit-fixture-offline.invalid', port: 22, username: 'developer', environment: 'local', auth: 'auto', keyPath: '', group: '', tags: [], notes: '', favorite: false })
    await window.api.invoke('subscriptions:save', { name: 'Offline fixture', connectionKind: 'profile', connectionId: profile.id, codexHome: '', claudeHome: '', providers: ['codex'], refreshMinutes: 5 })
  })
  let offline
  for (let attempt = 0; attempt < 100; attempt++) {
    offline = (await page.evaluate(() => window.api.invoke('subscriptions:list'))).find(r => r.name === 'Offline fixture')
    if (offline?.error && !offline.refreshing) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.match(offline.error, /SSH/)
  assert.equal(offline.accounts.length, 0)
  assert.ok(offline.nextRefreshAt > Date.now() + 240000)
  await page.evaluate(id => window.api.invoke('subscriptions:remove', id), offline.id)
  // Removing an environment must leave its reused SSH configuration intact.
  await page.evaluate(id => window.api.invoke('subscriptions:remove', id), id)
  const catalog = await page.evaluate(() => window.api.invoke('ssh:catalog'))
  assert.ok(catalog.profiles.some(p => p.id === profile.id))
  assert.deepEqual((await page.evaluate(() => window.api.invoke('subscriptions:list'))).map(r => r.id), ['builtin-local'])
  const waitRecord = async (id, predicate) => {
    for (let attempt = 0; attempt < 150; attempt++) {
      const value = (await page.evaluate(() => window.api.invoke('subscriptions:list'))).find(r => r.id === id)
      if (value && !value.refreshing && predicate(value)) return value
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error(`Scheduled refresh did not complete: ${id}`)
  }
  const beforePoll = (await page.evaluate(() => window.api.invoke('subscriptions:list')))[0]
  await app.evaluate(() => { globalThis.subscriptionNowOffset += 6 * 60000; globalThis.subscriptionPoll() })
  const polled = await waitRecord('builtin-local', value => value.providerRefresh.codex.lastAttemptAt > beforePoll.providerRefresh.codex.lastAttemptAt)
  assert.equal(polled.providerRefresh.claude.lastAttemptAt, beforePoll.providerRefresh.claude.lastAttemptAt, 'Paused Claude must not run when Codex is due')
  const manual = (await page.evaluate(() => window.api.invoke('subscriptions:refresh', 'builtin-local')))[0]
  assert.ok(manual.providerRefresh.claude.lastAttemptAt > polled.providerRefresh.claude.lastAttemptAt)
  assert.equal(manual.providerRefresh.codex.lastAttemptAt, polled.providerRefresh.codex.lastAttemptAt)
  await page.evaluate(() => window.api.invoke('subscriptions:save-refresh-settings', { claudeRefreshMinutes: 5, claudeFailureMinutes: [5, 20, 60, 1440], claudePauseWhenSignedOut: false }))
  await app.evaluate(() => globalThis.subscriptionPoll())
  const resumed = await waitRecord('builtin-local', value => value.providerRefresh.claude.lastAttemptAt > manual.providerRefresh.claude.lastAttemptAt)
  assert.equal(resumed.providerRefresh.claude.paused, undefined)
  await page.evaluate(() => window.api.invoke('subscriptions:save-refresh-settings', { claudeRefreshMinutes: 5, claudeFailureMinutes: [5, 20, 60, 1440], claudePauseWhenSignedOut: true }))
  const failureRecords = await page.evaluate(profileId => window.api.invoke('subscriptions:save', { name: 'Claude retry fixture', connectionKind: 'profile', connectionId: profileId, codexHome: '', claudeHome: 'fixture:claude-error', providers: ['codex', 'claude'], refreshMinutes: 5 }), profile.id)
  const failureId = failureRecords.find(r => r.name === 'Claude retry fixture').id
  let failed
  const stages = [5, 20, 60, 1440, 1440]
  for (let index = 0; index < stages.length; index++) {
    failed = await waitRecord(failureId, value => value.providerRefresh.claude.failures === index + 1)
    assert.equal(failed.providerRefresh.claude.nextRefreshAt - failed.providerRefresh.claude.lastAttemptAt, stages[index] * 60000)
    assert.equal(failed.providerRefresh.codex.failures, 0)
    if (index) assert.ok(failed.providerRefresh.codex.nextRefreshAt < failed.providerRefresh.claude.nextRefreshAt)
    if (index !== stages.length - 1) await app.evaluate((_, target) => { globalThis.subscriptionNowOffset += Math.max(0, target - Date.now()) + 100; globalThis.subscriptionPoll() }, failed.providerRefresh.claude.nextRefreshAt)
  }
  await app.close(); app = await launch()
  for (let attempt = 0; attempt < 100; attempt++) { page = app.windows().find(w => w.url().endsWith('/index.html')); if (page) break; await new Promise(resolve => setTimeout(resolve, 100)) }
  await page.getByRole('heading', { name: 'AI 订阅', exact: true }).waitFor()
  const persistedFailure = (await page.evaluate(() => window.api.invoke('subscriptions:list'))).find(r => r.id === failureId)
  assert.equal(persistedFailure.providerRefresh.claude.failures, 5)
  assert.equal(persistedFailure.providerRefresh.claude.nextRefreshAt, failed.providerRefresh.claude.nextRefreshAt)
  await page.evaluate(id => window.api.invoke('subscriptions:remove', id), failureId)
  assert.deepEqual(errors, [])
  console.log('PASS: local/SSH collection, subscription widgets, independent Claude retry stages, paused/manual/resumed polling, settings and failure schedule persistence, light/compact and non-destructive removal')
} catch (error) {
  const window = app.windows().find(w => !w.url().includes('surface='))
  if (window) { console.error((await window.locator('body').innerText()).slice(0, 3000)); await window.screenshot({ path: 'out/test-artifacts/subscriptions-failure.png' }) }
  throw error
} finally { await app.close() }
