import { ipcMain } from 'electron'
import { createHash } from 'crypto'
import type { PluginMainModule, PluginContext } from '../../../shared/plugin-types'

export const cryptoToolsPlugin: PluginMainModule = {
  id: 'crypto-tools',
  name: 'Crypto Tools',
  initialize(_ctx: PluginContext) {
    ipcMain.handle('crypto:md5', (_e, text: string) => {
      return createHash('md5').update(text).digest('hex')
    })
    ipcMain.handle('crypto:hash', (_e, algorithm: string, text: string) => {
      return createHash(algorithm).update(text).digest('hex')
    })
  },
  async dispose() {
    ipcMain.removeHandler('crypto:md5')
    ipcMain.removeHandler('crypto:hash')
  }
}
