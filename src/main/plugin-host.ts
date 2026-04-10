import type { PluginMainModule, PluginContext } from '../shared/plugin-types'
import type { DatabaseManager } from './lib/db'
import { encrypt, decrypt } from './lib/crypto'

export class PluginHost {
  private plugins: PluginMainModule[] = []
  private sendToRenderer: (channel: string, ...args: unknown[]) => void
  private dbManager: DatabaseManager

  constructor(
    sendToRenderer: (channel: string, ...args: unknown[]) => void,
    dbManager: DatabaseManager
  ) {
    this.sendToRenderer = sendToRenderer
    this.dbManager = dbManager
  }

  register(plugin: PluginMainModule): void {
    this.plugins.push(plugin)
  }

  async initializeAll(): Promise<void> {
    for (const plugin of this.plugins) {
      try {
        const ctx: PluginContext = {
          db: this.dbManager.getDatabase(plugin.id),
          sendToRenderer: this.sendToRenderer,
          encrypt,
          decrypt
        }
        await plugin.initialize(ctx)
      } catch (err) {
        console.error(`[PluginHost] Failed to initialize plugin "${plugin.id}":`, err)
      }
    }
  }

  async disposeAll(): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.dispose()
    }
    this.dbManager.closeAll()
  }
}
