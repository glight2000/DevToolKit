import { spawn } from 'node:child_process'
import type { SshLaunch } from '../ssh-connections/launch'
import type { AccountSnapshot, SubscriptionDraft } from '../../../shared/subscriptions'
import collector from './collector.py?raw'

export function observationCommand(launch: SshLaunch): SshLaunch {
  const args = [...launch.args], target = args.indexOf('--')
  if (target < 0 || target !== args.length - 2) throw new Error('SSH 目标格式无效')
  args.splice(target, 0, '-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=12', '-o', 'ConnectionAttempts=1', '-o', 'ClearAllForwardings=yes', '-o', 'PermitLocalCommand=no', '-o', 'RemoteCommand=none')
  args.push('python3 -')
  return { ...launch, args }
}
export function collectRemote(launch: SshLaunch, draft: SubscriptionDraft, signal: AbortSignal): Promise<AccountSnapshot[]> {
  return collectEnvironment(observationCommand(launch), draft, signal)
}
export function collectEnvironment(command: SshLaunch, draft: SubscriptionDraft, signal: AbortSignal, localWsl = false): Promise<AccountSnapshot[]> {
  const config = Buffer.from(JSON.stringify({ providers: draft.providers, codexHome: draft.codexHome, claudeHome: draft.claudeHome })).toString('base64')
  const script = `${collector}\nimport base64\nprint('DTK_SUBSCRIPTIONS:' + json.dumps(main(json.loads(base64.b64decode('${config}'))), ensure_ascii=True))\n`
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('查询已取消')); return }
    const child = spawn(command.executable, command.args, { windowsHide: true, stdio: 'pipe' })
    let output = '', diagnostics = '', done = false
    const finish = (error?: Error, result?: AccountSnapshot[]) => {
      if (done) return
      done = true; clearTimeout(timer); signal.removeEventListener('abort', abort)
      child.stdin.destroy(); child.kill()
      if (error) reject(error); else resolve(result!)
    }
    const abort = () => finish(new Error('查询已取消'))
    const timer = setTimeout(() => finish(new Error(localWsl ? 'WSL 查询超时，请检查发行版和 CLI 状态' : '远端查询超时，请检查 SSH、网络和 CLI 状态')), 90000)
    signal.addEventListener('abort', abort, { once: true })
    child.on('error', () => finish(new Error(localWsl ? '无法启动 WSL' : '无法启动 SSH 客户端')))
    child.stdin.on('error', () => {})
    child.stdout.on('data', data => { output += data.toString(); if (output.length > 2 * 1024 * 1024) finish(new Error('远端返回数据过大')) })
    child.stderr.on('data', data => { diagnostics = (diagnostics + data.toString()).slice(-4000) })
    child.on('close', code => {
      if (done) return
      const payload = output.split(/\r?\n/).find(line => line.startsWith('DTK_SUBSCRIPTIONS:'))
      if (code !== 0 || !payload) {
        if (localWsl) { finish(new Error('WSL 读取失败，请检查发行版中已安装 Python 3 和 Codex / Claude CLI')); return }
        const reason = /host key|REMOTE HOST IDENTIFICATION/i.test(diagnostics) ? '请先在 SSH Connections 中连接并确认主机指纹' : /permission denied|authentication/i.test(diagnostics) ? '后台读取需要 SSH 密钥或 agent 认证，请在 SSH Connections 中配置' : /python3.*(not found|not recognized|找不到)/i.test(diagnostics) ? '远端需要 Python 3，当前支持 Linux／WSL／macOS SSH 环境' : 'SSH 查询失败，请检查连接、远端 Python 3 和 CLI 安装'
        finish(new Error(reason)); return
      }
      try { finish(undefined, sanitizeSnapshots(JSON.parse(payload.slice(18)))) } catch { finish(new Error('远端返回的数据格式无效')) }
    })
    child.stdin.end(script)
  })
}

// Rebuild an allowlisted DTO before any remote data enters storage or IPC.
export function sanitizeSnapshots(value: unknown): AccountSnapshot[] {
  if (!Array.isArray(value) || value.length > 2) throw new Error('Invalid snapshots')
  const str = (v: unknown, max = 200): string | undefined => typeof v === 'string' ? v.slice(0, max).replace(/[\x00-\x08\x0b-\x1f]/g, '') : undefined
  const num = (v: unknown): number | undefined => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined
  const array = (v: unknown, max: number): any[] => Array.isArray(v) ? v.slice(0, max).filter(x => x && typeof x === 'object') : []
  return value.map(v => {
    if (!v || !['codex', 'claude'].includes(v.provider) || !['live', 'signed-out', 'unavailable', 'error'].includes(v.status)) throw new Error('Invalid provider')
    const result: AccountSnapshot = {
      provider: v.provider, status: v.status, account: str(v.account), plan: str(v.plan), message: str(v.message, 500), observedAt: num(v.observedAt) ?? Date.now(),
      windows: array(v.windows, 40).filter(w => num(w.usedPercent) !== undefined).map(w => ({ id: str(w.id) ?? '', label: str(w.label) ?? '额度', usedPercent: Math.min(100, w.usedPercent), resetsAt: num(w.resetsAt), durationSeconds: num(w.durationSeconds) })),
      sessions: array(v.sessions, 100).map(s => ({ id: str(s.id) ?? '', title: str(s.title) ?? '未命名会话', cwd: str(s.cwd, 1000) ?? '', updatedAt: num(s.updatedAt) })), sessionsMessage: str(v.sessionsMessage, 500)
    }
    if (v.credits && typeof v.credits === 'object') result.credits = { balance: str(v.credits.balance, 50), unit: str(v.credits.unit, 20) ?? 'credits', unlimited: v.credits.unlimited === true, used: num(v.credits.used), limit: num(v.credits.limit), expiresAt: num(v.credits.expiresAt) }
    if (v.coupons && num(v.coupons.available) !== undefined) result.coupons = { available: v.coupons.available, detailsAvailable: v.coupons.detailsAvailable === true, items: array(v.coupons.items, 200).map(c => ({ title: str(c.title) ?? '额度重置券', expiresAt: num(c.expiresAt) })) }
    if (v.usage && typeof v.usage === 'object') result.usage = { lifetimeTokens: num(v.usage.lifetimeTokens), peakDailyTokens: num(v.usage.peakDailyTokens), currentStreakDays: num(v.usage.currentStreakDays), daily: array(v.usage.daily, 90).filter(d => num(d.tokens) !== undefined).map(d => ({ date: str(d.date, 20) ?? '', tokens: d.tokens })) }
    return result
  })
}
