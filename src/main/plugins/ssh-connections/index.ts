import { app, ipcMain } from 'electron'
import path from 'node:path'
import type { PluginMainModule } from '../../../shared/plugin-types'
import type { ConnectionDraft, LaunchMode } from '../../../shared/ssh-connections'
import type { SshAliasDiscovery } from '../../../shared/ssh-config'
import { discoverSshAliases } from '../ssh-tunnel/ssh-config-discovery'
import { openCommandTerminal } from '../ssh-tunnel/terminal'
import { ConnectionStore } from './profiles'
import { aliasLaunch, profileLaunch, type SshLaunch } from './launch'
import { ConfigFiles } from './config-files'
import { SessionManager } from './sessions'

const channels: string[] = []
let sessions: SessionManager | null = null
let resolveConnection: ((kind: string, id: string) => Promise<SshLaunch>) | undefined
export function resolveSavedSshConnection(kind: string, id: string): Promise<SshLaunch> {
  if (!resolveConnection) throw new Error('SSH 连接服务尚未就绪')
  return resolveConnection(kind, id)
}
const closeSessions = () => sessions?.dispose()
export const sshConnectionsPlugin: PluginMainModule = {
  id: 'ssh-connections', name: 'SSH Connections',
  initialize(ctx) {
    const store = new ConnectionStore(ctx)
    const files = new ConfigFiles(path.join(app.getPath('userData'), 'ssh-config-backups'))
    sessions = new SessionManager(ctx.sendToRenderer)
    app.on('before-quit', closeSessions)
    let discovery: SshAliasDiscovery = { aliases: [], sources: [] }
    let scan: Promise<SshAliasDiscovery> | undefined
    const refresh = async (startDistribution?: string) => {
      if (startDistribution !== undefined && (typeof startDistribution !== 'string' || startDistribution.length > 128 || /[\\/\x00-\x1f]/.test(startDistribution))) throw new Error('Invalid WSL distribution')
      if (scan) await scan
      const operation = discoverSshAliases(startDistribution)
      scan = operation
      try {
        discovery = await operation
        for (const source of discovery.sources) if (source.configPath) files.register(source.id, source.configPath)
        return discovery
      } finally { if (scan === operation) scan = undefined }
    }
    const catalog = () => ({ ...discovery, profiles: store.list(), metadata: store.metadata(), preferences: { launchMode: store.launchMode() } })
    const handle = (name: string, fn: (...args: any[]) => unknown) => {
      const channel = `ssh:${name}`; channels.push(channel)
      ipcMain.handle(channel, (_event, ...args) => fn(...args))
    }
    const checkEnvironment = (environment: string) => {
      if (!discovery.sources.some(source => source.id === environment)) throw new Error('Connection environment is unavailable. Refresh sources.')
    }
    resolveConnection = async (kind, id) => {
      if (!discovery.sources.length) await refresh()
      if (kind === 'profile') { const profile = store.get(id); checkEnvironment(profile.environment); return profileLaunch(profile) }
      let alias = kind === 'system' ? discovery.aliases.find(item => item.id === id) : undefined
      if (!alias && kind === 'system') { await refresh(); alias = discovery.aliases.find(item => item.id === id) }
      if (!alias) throw new Error('SSH 配置已移除或来源尚未启动，请在 SSH Connections 中检查')
      return aliasLaunch(alias.alias, alias.sourceId)
    }
    const launch = async (command: SshLaunch, mode: LaunchMode) => {
      if (mode !== 'embedded' && mode !== 'external') throw new Error('Choose a terminal mode')
      if (mode === 'embedded') return { session: sessions!.start(command) }
      if (!await openCommandTerminal(command.executable, command.args)) throw new Error('Could not open an external terminal')
      return { external: true }
    }
    handle('catalog', async (rescan = false, distribution?: string) => {
      if (rescan || !discovery.sources.length) await refresh(distribution)
      return catalog()
    })
    handle('save-profile', (draft: ConnectionDraft, id?: string) => { checkEnvironment(draft.environment); return store.save(draft, id) })
    handle('delete-profile', (id: string) => store.remove(id))
    handle('favorite', (kind: string, id: string, favorite: boolean) => {
      if (typeof favorite !== 'boolean') throw new Error('Invalid favorite')
      if (kind === 'profile') store.save({ ...store.get(id), favorite }, id)
      else if (kind === 'system' && discovery.aliases.some(alias => alias.id === id)) store.annotate(id, favorite)
      else throw new Error('Connection no longer exists')
    })
    handle('launch-mode', (mode: LaunchMode) => store.setLaunchMode(mode))
    handle('connect', async (kind: string, id: string, mode: LaunchMode) => {
      if (!discovery.sources.length) await refresh()
      if (kind === 'profile') {
        const profile = store.get(id); checkEnvironment(profile.environment)
        const result = await launch(profileLaunch(profile), mode); store.markUsed(id); return result
      }
      const alias = kind === 'system' ? discovery.aliases.find(alias => alias.id === id) : undefined
      if (!alias) throw new Error('Alias no longer exists. Refresh the sources.')
      const result = await launch(aliasLaunch(alias.alias, alias.sourceId), mode)
      store.annotate(id, undefined, true)
      return result
    })
    handle('quick-connect', (draft: ConnectionDraft, mode: LaunchMode) => { checkEnvironment(draft.environment); return launch(profileLaunch(draft), mode) })
    handle('read-config', (sourceId: string) => files.read(sourceId))
    handle('save-config', async (sourceId: string, revision: string, text: string) => {
      const result = await files.save(sourceId, revision, text)
      await refresh()
      return result
    })
    handle('sessions', () => sessions!.list())
    handle('terminal-attach', (id: string) => sessions!.attach(id))
    handle('terminal-input', (id: string, data: string) => sessions!.input(id, data))
    handle('terminal-resize', (id: string, cols: number, rows: number) => sessions!.resize(id, cols, rows))
    handle('terminal-close', (id: string) => sessions!.close(id))
  },
  async dispose() {
    resolveConnection = undefined
    app.removeListener('before-quit', closeSessions)
    sessions?.dispose(); sessions = null
    for (const channel of channels.splice(0)) ipcMain.removeHandler(channel)
  }
}
