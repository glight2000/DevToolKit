import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { access, open, readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, dirname, isAbsolute, join } from 'node:path'
import type { AccountSnapshot, Conversation, Provider } from '../../../shared/subscriptions'

const limit = 2 * 1024 * 1024
const base = (provider: Provider): AccountSnapshot => ({ provider, status: 'unavailable', observedAt: Date.now(), windows: [], sessions: [] })
const timestamp = (v: unknown) => typeof v === 'number' ? v * 1000 : typeof v === 'string' ? Date.parse(v) || undefined : undefined
const validNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
async function jsonFile(path: string): Promise<any> {
  try { if ((await stat(path)).size > limit) return {}; return JSON.parse(await readFile(path, 'utf8')) } catch { return {} }
}

// Execute native binaries or known npm entry points directly; never run shell shims.
export async function localCommand(name: 'codex' | 'claude'): Promise<{ executable: string; prefix: string[] }> {
  const home = homedir()
  const folders = (process.env.PATH ?? '').split(delimiter).filter(isAbsolute)
  folders.push(join(home, '.local', 'bin'), join(home, '.cargo', 'bin'), join(home, '.npm-global', 'bin'))
  if (process.platform === 'win32') {
    folders.push(join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Programs', 'OpenAI', 'Codex', 'bin'))
    folders.push(join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'npm'))
  }
  for (const folder of [...new Set(folders)]) {
    const binary = join(folder, process.platform === 'win32' ? `${name}.exe` : name)
    try { await access(binary); return { executable: binary, prefix: [] } } catch { /* next installation */ }
    const packageName = name === 'codex' ? '@openai/codex' : '@anthropic-ai/claude-code'
    for (const root of [join(folder, 'node_modules', packageName), join(dirname(folder), 'lib', 'node_modules', packageName)]) {
      const entry = join(root, name === 'codex' ? 'bin/codex.js' : 'cli.js')
      try { await access(entry); return { executable: process.execPath, prefix: [entry] } } catch { /* next installation */ }
    }
  }
  throw new Error('CLI unavailable')
}

function start(command: { executable: string; prefix: string[] }, args: string[], signal: AbortSignal) {
  signal.throwIfAborted()
  return spawn(command.executable, [...command.prefix, ...args], { windowsHide: true, stdio: 'pipe', signal, env: { ...process.env, ...(command.prefix.length ? { ELECTRON_RUN_AS_NODE: '1' } : {}) } })
}

class LocalRpc {
  private sequence = 0
  private buffer = ''
  private ended = false
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>()
  constructor(private child: ChildProcessWithoutNullStreams) {
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      this.buffer += chunk
      if (this.buffer.length > limit * 2) { this.close(); return }
      let end: number
      while ((end = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1)
        try {
          const response = JSON.parse(line), pending = this.pending.get(response.id)
          if (pending) { clearTimeout(pending.timer); this.pending.delete(response.id); if (response.error) pending.reject(new Error('Provider request unavailable')); else pending.resolve(response.result ?? {}) }
        } catch { /* CLI diagnostics never leave this process */ }
      }
    })
    child.stderr.resume(); child.stdin.on('error', () => this.close())
    child.on('error', () => this.close()); child.on('close', () => this.close())
  }
  send(value: unknown) { if (this.ended) throw new Error('CLI stopped'); this.child.stdin.write(JSON.stringify(value) + '\n') }
  call(method: string, params = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      if (this.ended) { reject(new Error('CLI stopped')); return }
      const id = ++this.sequence
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('CLI timeout')) }, 12000)
      this.pending.set(id, { resolve, reject, timer }); this.send({ id, method, params })
    })
  }
  close() { if (this.ended) return; this.ended = true; this.child.stdin.destroy(); this.child.kill(); for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error('CLI stopped')) } this.pending.clear() }
}

async function codex(signal: AbortSignal): Promise<AccountSnapshot> {
  const result = base('codex'); let rpc: LocalRpc | undefined
  try {
    rpc = new LocalRpc(start(await localCommand('codex'), ['app-server'], signal))
    await rpc.call('initialize', { clientInfo: { name: 'devtoolkit_local_observer', version: '1.0.0' }, capabilities: { experimentalApi: true } })
    rpc.send({ method: 'initialized', params: {} })
    try {
      const { account } = await rpc.call('account/read', { refreshToken: false })
      if (!account) { result.status = 'signed-out'; result.message = '本地 Codex 未登录' }
      else {
        result.account = account.email; result.plan = account.planType
        if (account.type === 'apiKey') { result.plan = 'API key'; result.message = 'API key 登录不提供订阅额度' }
        else {
          const limits = await rpc.call('account/rateLimits/read')
          const buckets = limits.rateLimitsByLimitId ?? { codex: limits.rateLimits ?? {} }
          for (const [key, bucket] of Object.entries<any>(buckets).slice(0, 20)) {
            result.plan ??= bucket.planType
            for (const slot of ['primary', 'secondary']) {
              const w = bucket[slot]; if (!w || !validNumber(w.usedPercent)) continue
              const mins = w.windowDurationMins
              result.windows.push({ id: `${key}:${slot}`, label: `${bucket.limitName ?? key} · ${mins ? mins % 60 === 0 ? `${mins / 60} 小时` : `${mins} 分钟` : slot}`, usedPercent: w.usedPercent, resetsAt: timestamp(w.resetsAt), durationSeconds: validNumber(mins) ? mins * 60 : undefined })
            }
            if (bucket.credits && !result.credits) result.credits = { balance: bucket.credits.balance, unlimited: bucket.credits.unlimited === true, unit: 'credits' }
          }
          const coupons = limits.rateLimitResetCredits
          if (coupons && validNumber(coupons.availableCount)) result.coupons = { available: coupons.availableCount, detailsAvailable: Array.isArray(coupons.credits), items: (coupons.credits ?? []).slice(0, 200).filter((c: any) => c.status === 'available').map((c: any) => ({ title: c.title ?? '额度重置券', expiresAt: timestamp(c.expiresAt) })) }
          result.status = 'live'
          try {
            const usage = await rpc.call('account/usage/read'), summary = usage.summary ?? {}
            result.usage = { lifetimeTokens: summary.lifetimeTokens, peakDailyTokens: summary.peakDailyTokens, currentStreakDays: summary.currentStreakDays, daily: (usage.dailyUsageBuckets ?? []).slice(-90).map((d: any) => ({ date: d.startDate, tokens: d.tokens })) }
          } catch { /* optional API */ }
        }
      }
    } catch { result.status = 'error'; result.message = '本地 Codex 账号或额度查询失败，请检查登录、网络和 CLI 版本' }
    try {
      const threads = await rpc.call('thread/list', { limit: 100, sortKey: 'updated_at', sortDirection: 'desc' })
      result.sessions = (threads.data ?? []).slice(0, 100).map((t: any) => ({ id: t.id, title: t.name || t.preview || t.id, cwd: t.cwd ?? '', updatedAt: timestamp(t.updatedAt) }))
      result.sessionsMessage = '最近 100 条本地会话（不含归档）；历史不一定属于当前账号'
    } catch { result.sessionsMessage = '本地会话列表不可用，请检查 Codex CLI 版本' }
  } catch { result.message = '未找到可用的本地 Codex CLI，请安装或检查 PATH' }
  finally { rpc?.close() }
  return result
}

async function claudeSessions(directory: string): Promise<Conversation[]> {
  const sessions = new Map<string, Conversation>()
  try {
    const file = await open(join(directory, 'history.jsonl'), 'r')
    try {
      const size = (await file.stat()).size, start = Math.max(0, size - limit), buffer = Buffer.alloc(Math.min(size, limit))
      await file.read(buffer, 0, buffer.length, start)
      const lines = buffer.toString('utf8').split('\n'); if (start) lines.shift()
      for (const line of lines) { try { const row = JSON.parse(line); if (typeof row.sessionId === 'string') sessions.set(row.sessionId, { id: row.sessionId, title: row.display || row.sessionId, cwd: row.project || '', updatedAt: row.timestamp }) } catch { /* incomplete line */ } }
    } finally { await file.close() }
  } catch { /* no history */ }
  try {
    for (const project of (await readdir(join(directory, 'projects'), { withFileTypes: true })).filter(p => p.isDirectory()).slice(0, 300)) {
      const index = await jsonFile(join(directory, 'projects', project.name, 'sessions-index.json'))
      for (const row of (Array.isArray(index.entries) ? index.entries : []).slice(0, 500)) if (typeof row.sessionId === 'string') sessions.set(row.sessionId, { id: row.sessionId, title: row.summary || row.firstPrompt || row.sessionId, cwd: row.projectPath || '', updatedAt: timestamp(row.modified) })
    }
  } catch { /* no project indices */ }
  return [...sessions.values()].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)).slice(0, 100)
}

async function claudeAuth(signal: AbortSignal): Promise<any> {
  const command = await localCommand('claude')
  return new Promise((resolve, reject) => {
    const child = start(command, ['auth', 'status'], signal); let output = '', done = false
    const finish = (ok: boolean) => { if (done) return; done = true; clearTimeout(timer); child.kill(); if (!ok) { reject(new Error('Auth unavailable')); return } try { resolve(JSON.parse(output)) } catch { reject(new Error('Invalid auth')) } }
    const timer = setTimeout(() => finish(false), 10000)
    child.stdin.end(); child.stdin.on('error', () => {}); child.stderr.resume(); child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => { output += chunk; if (output.length > limit) finish(false) })
    child.on('error', () => finish(false)); child.on('close', () => finish(true))
  })
}

async function claude(signal: AbortSignal): Promise<AccountSnapshot> {
  const result = base('claude'), directory = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
  result.sessions = await claudeSessions(directory); result.sessionsMessage = '最近 100 条本地索引／历史会话；历史不一定属于当前账号'
  const auth = await claudeAuth(signal).catch(() => ({}))
  result.account = auth.email; result.plan = auth.subscriptionType
  if (['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY'].some(k => process.env[k]) || ['api_key', 'apiKey'].includes(auth.authMethod)) {
    result.plan = 'API / 自定义服务'; result.message = '此环境使用 API key 或自定义服务，不按订阅额度查询'; return result
  }
  const credential = (await jsonFile(join(directory, '.credentials.json'))).claudeAiOauth ?? {}
  const token = process.env.CLAUDE_CODE_OAUTH_TOKEN || credential.accessToken
  result.plan ||= credential.subscriptionType
  if (!token) { result.status = auth.loggedIn ? 'unavailable' : 'signed-out'; result.message = auth.loggedIn ? 'CLI 已登录，但此凭据后端暂不提供额度读取' : '本地 Claude 未登录或凭据不可读'; return result }
  try {
    const response = await fetch('https://api.anthropic.com/api/oauth/usage', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'anthropic-beta': 'oauth-2025-04-20' }, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]) })
    if (!response.ok) { await response.body?.cancel(); result.status = 'error'; result.message = `Claude 额度查询失败（HTTP ${response.status}）`; return result }
    const reader = response.body!.getReader(); let output = '', bytes = 0; const decoder = new TextDecoder()
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > limit) throw new Error('Too large'); output += decoder.decode(chunk.value, { stream: true }) } output += decoder.decode() } finally { await reader.cancel() }
    const usage = JSON.parse(output)
    for (const [key, label, seconds] of [['five_hour', '5 小时', 18000], ['seven_day', '7 天', 604800], ['seven_day_sonnet', 'Sonnet · 7 天', 604800], ['seven_day_opus', 'Opus · 7 天', 604800]] as const) {
      const w = usage[key]; if (w && validNumber(w.utilization)) result.windows.push({ id: key, label, usedPercent: w.utilization, resetsAt: timestamp(w.resets_at), durationSeconds: seconds })
    }
    const extra = usage.extra_usage
    if (extra?.is_enabled) result.credits = { unit: 'USD', used: validNumber(extra.used_credits) ? extra.used_credits / 100 : undefined, limit: validNumber(extra.monthly_limit) ? extra.monthly_limit / 100 : undefined }
    result.status = 'live'; result.message = '额度来自 Claude CLI 兼容接口；重置券未提供'
  } catch { result.status = 'error'; result.message = 'Claude 额度查询失败，请检查本地网络和登录状态' }
  return result
}

export async function collectLocal(providers: Provider[], signal: AbortSignal): Promise<AccountSnapshot[]> {
  const results: AccountSnapshot[] = []
  for (const provider of providers) { signal.throwIfAborted(); try { results.push(await (provider === 'codex' ? codex(signal) : claude(signal))) } catch { results.push({ ...base(provider), status: 'error', message: '本地数据格式或运行环境不兼容' }) } }
  return results
}
