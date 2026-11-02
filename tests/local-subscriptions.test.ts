import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { collectLocal } from '../src/main/plugins/subscriptions/local'

test('local Claude reads bounded session indices and subscription data without exposing credentials', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'devtoolkit-local-'))
  const keys = ['CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY']
  const previous = keys.map(k => process.env[k])
  for (const k of keys) delete process.env[k]
  process.env.CLAUDE_CONFIG_DIR = directory
  writeFileSync(join(directory, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'fixture-secret', subscriptionType: 'max' } }))
  writeFileSync(join(directory, 'history.jsonl'), JSON.stringify({ sessionId: 'history', display: 'From history', project: '/project', timestamp: 1000 }) + '\n')
  mkdirSync(join(directory, 'projects', 'fixture'), { recursive: true })
  writeFileSync(join(directory, 'projects', 'fixture', 'sessions-index.json'), JSON.stringify({ entries: [{ sessionId: 'index', summary: 'From index', modified: '2026-10-10T00:00:00Z' }] }))
  const spawn = childProcess.spawn
  const mockedSpawn = t.mock.method(childProcess, 'spawn', (_command: any, _args: any, options: any) => spawn(process.execPath, [resolve('tests/fixtures/subscription-local-cli.mjs'), 'auth'], options))
  syncBuiltinESMExports()
  let requests = 0
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    requests++
    assert.equal(url, 'https://api.anthropic.com/api/oauth/usage')
    assert.equal(options.redirect, 'error')
    assert.equal((options.headers as any).Authorization, 'Bearer fixture-secret')
    return new Response(JSON.stringify({ five_hour: { utilization: 42, resets_at: '2026-10-11T00:00:00Z' }, extra_usage: { is_enabled: true, used_credits: 1200, monthly_limit: 5000 }, secret: 'never-pass-this' }))
  })
  try {
    const [account] = await collectLocal(['claude'], new AbortController().signal)
    assert.equal(account.status, 'live'); assert.equal(account.plan, 'max')
    assert.equal(account.windows[0].usedPercent, 42)
    assert.equal(account.credits?.used, 12); assert.equal(account.credits?.limit, 50)
    assert.deepEqual(account.sessions.map(s => s.id), ['index', 'history'])
    assert.ok(!JSON.stringify(account).includes('fixture-secret'))
    assert.ok(!JSON.stringify(account).includes('never-pass-this'))
    process.env.ANTHROPIC_API_KEY = 'fixture-api'
    const [apiAccount] = await collectLocal(['claude'], new AbortController().signal)
    assert.equal(apiAccount.status, 'unavailable'); assert.equal(requests, 1)
    const controller = new AbortController(); controller.abort()
    await assert.rejects(collectLocal(['codex'], controller.signal))
  } finally {
    keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i] })
    mockedSpawn.mock.restore(); syncBuiltinESMExports()
  }
})
