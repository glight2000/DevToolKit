import { execFile } from 'node:child_process'
import { win32 } from 'node:path'
import { decodeWslList } from '../ssh-tunnel/ssh-config-discovery'
import type { SubscriptionDraft } from '../../../shared/subscriptions'
import { collectEnvironment } from './remote'

const executable = () => win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wsl.exe')
export async function localWslDistributions(): Promise<string[]> {
  if (process.platform !== 'win32') return []
  try {
    const stdout = await new Promise<Buffer>((resolve, reject) => execFile(executable(), ['--list', '--quiet'], { windowsHide: true, timeout: 8000, maxBuffer: 512 * 1024, encoding: 'buffer' }, (error, stdout) => error ? reject(error) : resolve(stdout)))
    return decodeWslList(stdout).filter(name => !/[\\/\x00-\x1f]/.test(name) && !name.startsWith('docker-desktop')).slice(0, 32)
  } catch { return [] }
}
export function collectWsl(draft: SubscriptionDraft, signal: AbortSignal) {
  const distribution = draft.connectionId
  if (!distribution || /[\\/\x00-\x1f]/.test(distribution)) throw new Error('Invalid WSL distribution')
  return collectEnvironment({ executable: executable(), args: ['--distribution', distribution, '--exec', 'python3', '-'], environment: `wsl:${distribution}`, title: `WSL · ${distribution}` }, draft, signal, true)
}
