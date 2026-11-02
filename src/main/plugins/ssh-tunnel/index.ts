import { ipcMain, dialog, BrowserWindow, clipboard } from 'electron'
import { openTerminal } from './terminal'
import { discoverSshAliases } from './ssh-config-discovery'
import type { PluginMainModule, PluginContext } from '../../../shared/plugin-types'
import { initSchema } from './db-schema'
import { TunnelManager } from './tunnel-manager'
import { checkPubKeyInstalled, deployPubKey, removePubKey, listLocalPubKeys } from './pubkey'

let tunnelManager: TunnelManager | null = null

const IPC_CHANNELS = [
  'tunnel:list',
  'tunnel:discover-ssh-aliases',
  'tunnel:create',
  'tunnel:update',
  'tunnel:delete',
  'tunnel:start',
  'tunnel:stop',
  'tunnel:start-all',
  'tunnel:stop-all',
  'tunnel:import-key',
  'tunnel:open-terminal',
  'tunnel:check-pubkey',
  'tunnel:deploy-pubkey',
  'tunnel:remove-pubkey',
  'tunnel:list-local-pubkeys'
]

export const sshTunnelPlugin: PluginMainModule = {
  id: 'ssh-tunnel',
  name: 'SSH Tunnel',

  initialize(ctx: PluginContext) {
    // Register ALL IPC handlers first, before any DB work that might fail.
    // Handlers that need tunnelManager will check for null and return gracefully.

    ipcMain.handle('tunnel:list', () => {
      return tunnelManager?.getAllTunnelInfos() ?? []
    })

    ipcMain.handle('tunnel:discover-ssh-aliases', (_e, startDistribution?: string) => {
      if (startDistribution !== undefined && (typeof startDistribution !== 'string' || startDistribution.length > 128 || /[\\/\x00-\x1f]/.test(startDistribution))) {
        throw new Error('Invalid WSL distribution')
      }
      return discoverSshAliases(startDistribution)
    })

    ipcMain.handle('tunnel:create', (_e, partial) => {
      if (!tunnelManager) throw new Error('SSH Tunnel plugin not initialized')
      return tunnelManager.createTunnel(partial)
    })

    ipcMain.handle('tunnel:update', async (_e, id, partial) => {
      if (!tunnelManager) throw new Error('SSH Tunnel plugin not initialized')
      return await tunnelManager.updateTunnel(id, partial)
    })

    ipcMain.handle('tunnel:delete', async (_e, id) => {
      if (!tunnelManager) throw new Error('SSH Tunnel plugin not initialized')
      await tunnelManager.deleteTunnel(id)
      return { success: true }
    })

    ipcMain.handle('tunnel:start', async (_e, id) => {
      if (!tunnelManager) throw new Error('SSH Tunnel plugin not initialized')
      await tunnelManager.startTunnel(id)
      return { success: true }
    })

    ipcMain.handle('tunnel:stop', async (_e, id) => {
      if (!tunnelManager) throw new Error('SSH Tunnel plugin not initialized')
      await tunnelManager.stopTunnel(id)
      return { success: true }
    })

    ipcMain.handle('tunnel:start-all', async () => {
      if (!tunnelManager) throw new Error('SSH Tunnel plugin not initialized')
      await tunnelManager.startAll()
      return { success: true }
    })

    ipcMain.handle('tunnel:stop-all', async () => {
      if (!tunnelManager) throw new Error('SSH Tunnel plugin not initialized')
      await tunnelManager.stopAll()
      return { success: true }
    })

    ipcMain.handle('tunnel:import-key', async () => {
      const window = BrowserWindow.getFocusedWindow()
      if (!window) return { canceled: true, filePath: null }
      const result = await dialog.showOpenDialog(window, {
        title: 'Select SSH Private Key',
        properties: ['openFile'],
        filters: [
          { name: 'All Files', extensions: ['*'] },
          { name: 'PEM Files', extensions: ['pem'] },
          { name: 'Key Files', extensions: ['key', 'ppk'] }
        ]
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, filePath: null }
      }
      return { canceled: false, filePath: result.filePaths[0] }
    })

    ipcMain.handle(
      'tunnel:open-terminal',
      async (_e, tunnelId: string): Promise<{ success: boolean; passwordCopied: boolean }> => {
        const info = tunnelManager?.getTunnelInfo(tunnelId)
        if (!info) return { success: false, passwordCopied: false }

        const { config } = info
        const sshArgs: string[] = []

        if (config.authType === 'privateKey' && config.privateKeyPath) {
          sshArgs.push('-i', config.privateKeyPath)
        }
        if (config.sshPort !== 22) {
          sshArgs.push('-p', String(config.sshPort))
        }
        sshArgs.push('-l', config.username, '--', config.sshHost)

        let passwordCopied = false

        if (config.authType === 'password' && config.password) {
          clipboard.writeText(config.password)
          passwordCopied = true
        }

        const launched = await openTerminal(sshArgs)
        return { success: launched, passwordCopied }
      }
    )

    ipcMain.handle('tunnel:check-pubkey', async (_e, tunnelId: string) => {
      const info = tunnelManager?.getTunnelInfo(tunnelId)
      if (!info) return { installed: false, localKeyPath: null, error: 'Tunnel not found' }
      try {
        return await checkPubKeyInstalled(info.config)
      } catch (err) {
        return { installed: false, localKeyPath: null, error: String(err) }
      }
    })

    ipcMain.handle('tunnel:deploy-pubkey', async (_e, tunnelId: string, pubKeyContent: string) => {
      const info = tunnelManager?.getTunnelInfo(tunnelId)
      if (!info) return { success: false, error: 'Tunnel not found' }
      return await deployPubKey(info.config, pubKeyContent)
    })

    ipcMain.handle('tunnel:remove-pubkey', async (_e, tunnelId: string, pubKeyContent: string) => {
      const info = tunnelManager?.getTunnelInfo(tunnelId)
      if (!info) return { success: false, error: 'Tunnel not found' }
      return await removePubKey(info.config, pubKeyContent)
    })

    ipcMain.handle('tunnel:list-local-pubkeys', () => {
      return listLocalPubKeys()
    })

    // Now try to initialize DB and TunnelManager — if this fails,
    // the IPC handlers above are still registered and will return
    // graceful errors instead of "No handler registered".
    try {
      initSchema(ctx.db)
      tunnelManager = new TunnelManager(ctx)

      tunnelManager.autoStartTunnels().catch((err) => {
        console.error('Failed to auto-start tunnels:', err)
      })
    } catch (err) {
      console.error('[ssh-tunnel] Failed to initialize database/manager:', err)
    }
  },

  async dispose() {
    if (tunnelManager) {
      await tunnelManager.dispose()
      tunnelManager = null
    }
    for (const ch of IPC_CHANNELS) {
      ipcMain.removeHandler(ch)
    }
  }
}
