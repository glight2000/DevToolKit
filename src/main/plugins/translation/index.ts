import { ipcMain } from 'electron'
import type { PluginMainModule, PluginContext } from '../../../shared/plugin-types'

export const translationPlugin: PluginMainModule = {
  id: 'translation',
  name: 'Translation',
  initialize(_ctx: PluginContext) {
    ipcMain.handle('translation:translate', async (_e, text: string, from: string, to: string) => {
      try {
        const query = new URLSearchParams({ q: text, langpair: `${from}|${to}` })
        const response = await fetch(`https://api.mymemory.translated.net/get?${query}`, {
          signal: AbortSignal.timeout(15_000)
        })
        if (!response.ok) throw new Error(`Translation service returned HTTP ${response.status}`)
        const data = await response.json() as {
          responseStatus?: number
          responseData?: { translatedText?: string }
        }

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
