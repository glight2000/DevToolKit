import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, readdir, stat } from 'node:fs/promises'
import { homedir, userInfo } from 'node:os'
import path from 'node:path'
import type { SshAliasDiscovery, SshConfigSource } from '../../../shared/ssh-config'
import { readAliases, type ConfigIO, type ConfigSource } from './ssh-config-parser'

const runFile = promisify(execFile)

async function bounded<T>(operation: Promise<T>, milliseconds = 12000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('SSH configuration read timed out')), milliseconds)
    })])
  } finally { clearTimeout(timer) }
}

export function decodeWslList(buffer: Buffer): string[] {
  const text = buffer.includes(0) ? buffer.toString('utf16le') : buffer.toString('utf8')
  return [...new Set(text.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim()).filter(Boolean))]
}

export function wslPath(distribution: string, linuxPath: string): string {
  if (!distribution || /[\\/\x00-\x1f]/.test(distribution)) throw new Error('Invalid WSL distribution')
  if (!linuxPath.startsWith('/') || /[\\\x00-\x1f]/.test(linuxPath)) throw new Error('WSL identity paths must be absolute Linux paths or start with ~/')
  return `\\\\wsl.localhost\\${distribution}${path.posix.normalize(linuxPath).replaceAll('/', '\\')}`
}

export function fileConfigIO(home: string, distribution?: string): ConfigIO {
  const syntax = distribution ? path.posix : path
  const expandHome = (value: string) => value === '~' ? home : /^~[/\\]/.test(value) ? syntax.join(home, value.slice(2)) : value
  const native = (value: string) => distribution ? wslPath(distribution, value) : value
  return {
    async read(file) {
      try {
        const filename = native(file)
        const info = await stat(filename)
        if (!info.isFile()) throw new Error(`Not a config file: ${file}`)
        if (info.size > 1024 * 1024) throw new Error(`Config exceeds 1 MB: ${file}`)
        return await readFile(filename, { encoding: 'utf8', signal: AbortSignal.timeout(5000) })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
    },
    async expand(pattern, base) {
      const expanded = expandHome(pattern)
      const absolute = syntax.isAbsolute(expanded) ? expanded : syntax.resolve(base, expanded)
      const root = syntax.parse(absolute).root
      const parts = absolute.slice(root.length).split(distribution ? '/' : /[/\\]/).filter(Boolean)
      let paths = [root]
      for (const part of parts) {
        const next: string[] = []
        for (const parent of paths) {
          if (!/[*?\[]/.test(part)) { next.push(syntax.join(parent, part)); continue }
          let entries: string[]
          try { entries = await readdir(native(parent)) }
          catch (error) {
            if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) continue
            throw error
          }
          for (const entry of entries.sort()) {
            if (entry.startsWith('.') && !part.startsWith('.')) continue
            if (path.matchesGlob(entry, part.replace(/\*+/g, '*'))) next.push(syntax.join(parent, entry))
          }
        }
        if (next.length > 128) throw new Error('Include glob matches too many paths (limit 128)')
        paths = next
      }
      return paths.sort()
    },
    identityPath(value) {
      const expanded = expandHome(value)
      if (!syntax.isAbsolute(expanded)) throw new Error('Relative IdentityFile requires a working directory; use an absolute path or ~/')
      return native(syntax.normalize(expanded))
    }
  }
}

export interface DiscoveryEnvironment {
  platform: string
  home: string
  username: string
  systemConfig: string
  runWsl(args: string[]): Promise<Buffer>
  io(home: string, distribution?: string): ConfigIO
}

const environment: DiscoveryEnvironment = {
  platform: process.platform,
  home: homedir(),
  username: userInfo().username,
  systemConfig: process.platform === 'win32' ? path.join(process.env.ProgramData || 'C:\\ProgramData', 'ssh', 'ssh_config') : '/etc/ssh/ssh_config',
  async runWsl(args) {
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wsl.exe')
    const { stdout } = await runFile(executable, args, { windowsHide: true, timeout: 8000, maxBuffer: 512 * 1024, encoding: 'buffer' })
    return stdout
  },
  io: fileConfigIO
}

export async function discoverSshAliases(startDistribution?: string, env: DiscoveryEnvironment = environment): Promise<SshAliasDiscovery> {
  const result: SshAliasDiscovery = { sources: [], aliases: [] }
  const readSource = async (source: ConfigSource, io: ConfigIO) => {
    const status: SshConfigSource = { id: source.id, label: source.label, state: 'ready', configPath: source.id.startsWith('wsl:') ? wslPath(source.id.slice(4), source.files[0].path) : source.files[0].path }
    result.sources.push(status)
    try { result.aliases.push(...await bounded(readAliases(source, { ...io, async read(file) {
      const content = await io.read(file)
      if (file === source.files[0].path) status.configExists = content !== null
      return content
    } }))) }
    catch (error) { status.state = 'error'; status.error = error instanceof Error ? error.message : 'Could not read SSH configuration' }
  }
  const localHome = env.home
  await readSource({ id: 'local', label: env.platform === 'win32' ? 'Windows' : 'Local', home: localHome, username: env.username,
    files: [
      { path: path.join(localHome, '.ssh', 'config'), includeBase: path.join(localHome, '.ssh') },
      { path: env.systemConfig, includeBase: path.dirname(env.systemConfig) }
    ] }, env.io(localHome))
  if (env.platform !== 'win32') return result
  try {
    const [installedOutput, runningOutput] = await Promise.all([
      env.runWsl(['--list', '--quiet']), env.runWsl(['--list', '--running', '--quiet'])
    ])
    const installed = decodeWslList(installedOutput)
    const running = new Set(decodeWslList(runningOutput))
    if (startDistribution && !installed.includes(startDistribution)) throw new Error('WSL distribution is no longer installed. Refresh the list.')
    if (installed.length > 32) throw new Error('Too many WSL distributions (limit 32)')
    await Promise.all(installed.map(async distribution => {
      const id = `wsl:${distribution}`, label = `WSL · ${distribution}`
      if (!running.has(distribution) && startDistribution !== distribution) {
        result.sources.push({ id, label, state: 'stopped' }); return
      }
      try {
        // Fixed executables and argv: do not invoke a login shell or any config commands.
        const [homeOutput, userOutput] = await Promise.all([
          env.runWsl(['--distribution', distribution, '--exec', 'printenv', 'HOME']),
          env.runWsl(['--distribution', distribution, '--exec', 'id', '-un'])
        ])
        const home = homeOutput.toString('utf8').trim(), username = userOutput.toString('utf8').trim()
        wslPath(distribution, home)
        if (!username || /[\r\n\x00]/.test(username)) throw new Error('Cannot determine the WSL default user')
        await readSource({ id, label, home, username, files: [
          { path: path.posix.join(home, '.ssh', 'config'), includeBase: path.posix.join(home, '.ssh') },
          { path: '/etc/ssh/ssh_config', includeBase: '/etc/ssh' }
        ] }, env.io(home, distribution))
      } catch (error) {
        result.sources.push({ id, label, state: 'error', error: error instanceof Error ? error.message : 'WSL configuration is unavailable' })
      }
    }))
  } catch (error) {
    result.sources.push({ id: 'wsl', label: 'WSL', state: 'error', error: `WSL discovery unavailable: ${error instanceof Error ? error.message : 'unknown error'}` })
  }
  result.sources.sort((a, b) => a.id.localeCompare(b.id))
  result.aliases.sort((a, b) => a.sourceLabel.localeCompare(b.sourceLabel) || a.alias.localeCompare(b.alias))
  return result
}
