import path from 'node:path'
import { homedir } from 'node:os'
import type { ConnectionDraft } from '../../../shared/ssh-connections'
import { validateDraft } from './profiles'

export interface SshLaunch { executable: string; args: string[]; title: string; environment: string }
export function executableFor(environment: string, sshArgs: string[], title: string, platform = process.platform): SshLaunch {
  if (environment.startsWith('wsl:')) {
    if (platform !== 'win32') throw new Error('WSL is available only on Windows')
    const distribution = environment.slice(4)
    if (!distribution || /[\\/\x00-\x1f]/.test(distribution)) throw new Error('Invalid WSL distribution')
    return { executable: path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wsl.exe'), args: ['--distribution', distribution, '--exec', 'ssh', ...sshArgs], title, environment }
  }
  if (environment !== 'local') throw new Error('Unknown SSH environment')
  return { executable: platform === 'win32' ? path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'OpenSSH', 'ssh.exe') : '/usr/bin/ssh', args: sshArgs, title, environment }
}
export function aliasLaunch(alias: string, environment: string): SshLaunch {
  if (!alias || alias.startsWith('-') || /[\s\x00-\x1f]/.test(alias)) throw new Error('Invalid SSH alias')
  // The native client resolves Include, Match, ProxyJump, agents and identities.
  // Discovery never executes config commands; they run only after Connect.
  return executableFor(environment, ['--', alias], alias)
}
export function profileLaunch(input: ConnectionDraft): SshLaunch {
  const profile = validateDraft(input)
  const args = ['-F', 'none', '-p', String(profile.port), '-l', profile.username]
  if (profile.auth === 'key') {
    const key = profile.environment === 'local' && /^~[/\\]/.test(profile.keyPath) ? path.join(homedir(), profile.keyPath.slice(2)) : profile.keyPath
    args.push('-i', key, '-o', 'IdentitiesOnly=yes')
  }
  if (profile.auth === 'password') args.push('-o', 'PreferredAuthentications=keyboard-interactive,password', '-o', 'PubkeyAuthentication=no')
  args.push('--', profile.host)
  return executableFor(profile.environment, args, profile.name)
}
