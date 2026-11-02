// Deterministic SSH process replacement: production transport still sends its
// complete collector over stdin; no real host or provider credential is used.
let source = ''
process.stdin.on('data', data => { source += data })
process.stdin.on('end', () => {
  if (process.argv.includes('--offline')) { process.stderr.write('Permission denied (publickey).'); process.exitCode = 255; return }
  if (!source.includes('class NoRedirect') || !source.includes('codex')) { process.exitCode = 2; return }
  const encoded = source.match(/base64\.b64decode\('([A-Za-z0-9+/=]+)'\)/)?.[1]
  const config = JSON.parse(Buffer.from(encoded, 'base64').toString())
  const now = Date.now()
  const accounts = config.providers.map(provider => ({
    provider, status: 'live', account: provider === 'codex' ? 'developer@example.test' : 'studio@example.test', plan: provider === 'codex' ? 'pro' : 'max', observedAt: now,
    windows: [{ id: 'primary', label: '5 小时额度', usedPercent: provider === 'codex' ? 28 : 64, durationSeconds: 18000, resetsAt: now + 7200000 }, { id: 'secondary', label: '7 天额度', usedPercent: 48, durationSeconds: 604800, resetsAt: now + 360000000 }],
    credits: { balance: '25.00', unit: 'credits' },
    ...(provider === 'codex' ? { coupons: { available: 2, detailsAvailable: true, items: [{ title: '完整额度重置券', expiresAt: now + 86400000 }, { title: '完整额度重置券', expiresAt: now + 604800000 }] }, usage: { lifetimeTokens: 1234567, peakDailyTokens: 123000, currentStreakDays: 8, daily: [{ date: '2026-10-09', tokens: 25000 }] } } : {}),
    sessions: [{ id: `${provider}-1`, title: '完善远端环境与额度监控', cwd: '/home/developer/workspace', updatedAt: now }, { id: `${provider}-2`, title: '窗口交互与悬浮面板', cwd: '/home/developer/DevToolkit', updatedAt: now - 3600000 }], sessionsMessage: '最近会话 · 只读索引',
    access_token: 'DO_NOT_FORWARD', couponsSecret: 'NEVER_SERIALIZE'
  }))
  if (config.claudeHome === 'fixture:claude-error') for (const account of accounts) if (account.provider === 'claude') { account.status = 'error'; account.message = 'Claude fixture network error'; account.windows = [] }
  process.stdout.write('DTK_SUBSCRIPTIONS:' + JSON.stringify(accounts) + '\n')
})
