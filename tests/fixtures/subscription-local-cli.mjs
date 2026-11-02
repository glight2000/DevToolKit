import { createInterface } from 'node:readline'
if (process.argv.includes('auth')) {
  console.log(JSON.stringify({ loggedIn: false }))
} else {
  for await (const line of createInterface({ input: process.stdin })) {
    const request = JSON.parse(line)
    if (!request.id) continue
    const results = {
      initialize: {},
      'account/read': { account: { type: 'chatgpt', email: 'local@example.test', planType: 'plus' } },
      'account/rateLimits/read': { rateLimits: { primary: { usedPercent: 70, windowDurationMins: 300, resetsAt: Math.floor(Date.now() / 1000) + 10000 } }, rateLimitResetCredits: { availableCount: 2, credits: [] }, accessToken: 'NEVER_FORWARD_LOCAL' },
      'account/usage/read': { summary: { lifetimeTokens: 12345 }, dailyUsageBuckets: [{ startDate: '2026-10-10', tokens: 100 }] },
      'thread/list': { data: [{ id: 'local-session', name: 'Local fixture conversation', cwd: '/fixture', updatedAt: Math.floor(Date.now() / 1000) }] }
    }
    console.log(JSON.stringify({ id: request.id, result: results[request.method] ?? {} }))
  }
}
