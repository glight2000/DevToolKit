import { ipcMain } from 'electron'
import type { PluginMainModule, PluginContext } from '../../../shared/plugin-types'

export const translationPlugin: PluginMainModule = {
  id: 'translation',
  name: 'Translation',
  initialize(_ctx: PluginContext) {
    ipcMain.handle('translation:translate', async (_e, text: string, from: string, to: string) => {
      try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`
        const response = await fetch(url)
        const data = await response.json()

        if (data.responseStatus === 200 && data.responseData?.translatedText) {
          return {
            success: true,
            text: data.responseData.translatedText,
            source: 'MyMemory'
          }
        }

        return {
          success: false,
          error: data.responseData?.translatedText || 'Translation failed'
        }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Network error'
        }
      }
    })
  },
  async dispose() {
    ipcMain.removeHandler('translation:translate')
  }
}
