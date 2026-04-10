import { ipcMain, dialog, BrowserWindow, clipboard, nativeImage } from 'electron'
import { writeFileSync } from 'fs'
import type { PluginMainModule, PluginContext } from '../../../shared/plugin-types'

const IPC_CHANNELS = [
  'image-editor:save-file',
  'image-editor:copy-to-clipboard',
  'image-editor:open-file'
]

export const imageEditorPlugin: PluginMainModule = {
  id: 'image-editor',
  name: 'Image Editor',

  initialize(_ctx: PluginContext) {
    // Save PNG/JPEG file to disk
    ipcMain.handle(
      'image-editor:save-file',
      async (_e, dataUrl: string, suggestedName: string) => {
        const window = BrowserWindow.getFocusedWindow()
        if (!window) return { canceled: true }

        const result = await dialog.showSaveDialog(window, {
          title: 'Export Canvas',
          defaultPath: suggestedName || 'canvas.png',
          filters: [
            { name: 'PNG Image', extensions: ['png'] },
            { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] }
          ]
        })

        if (result.canceled || !result.filePath) return { canceled: true }

        try {
          const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '')
          const buffer = Buffer.from(base64Data, 'base64')
          writeFileSync(result.filePath, buffer)
          return { canceled: false, filePath: result.filePath }
        } catch (err) {
          return { canceled: false, error: String(err) }
        }
      }
    )

    // Copy image data URL to clipboard as native image
    ipcMain.handle('image-editor:copy-to-clipboard', async (_e, dataUrl: string) => {
      try {
        const image = nativeImage.createFromDataURL(dataUrl)
        clipboard.writeImage(image)
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    })

    // Open image file from disk, return as data URL
    ipcMain.handle('image-editor:open-file', async () => {
      const window = BrowserWindow.getFocusedWindow()
      if (!window) return { canceled: true }

      const result = await dialog.showOpenDialog(window, {
        title: 'Open Image',
        properties: ['openFile'],
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }
        ]
      })

      if (result.canceled || result.filePaths.length === 0) return { canceled: true }

      try {
        const image = nativeImage.createFromPath(result.filePaths[0])
        return { canceled: false, dataUrl: image.toDataURL(), filePath: result.filePaths[0] }
      } catch (err) {
        return { canceled: false, error: String(err) }
      }
    })
  },

  async dispose() {
    for (const ch of IPC_CHANNELS) {
      ipcMain.removeHandler(ch)
    }
  }
}
