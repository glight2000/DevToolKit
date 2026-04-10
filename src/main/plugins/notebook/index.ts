import { ipcMain } from 'electron'
import type { PluginMainModule, PluginContext } from '../../../shared/plugin-types'
import { NotebookManager } from './notebook-manager'

let manager: NotebookManager | null = null

const IPC_CHANNELS = [
  'notebook:get-tree',
  'notebook:get-content',
  'notebook:create',
  'notebook:update',
  'notebook:update-content',
  'notebook:delete',
  'notebook:move',
  'notebook:set-locked',
  'notebook:set-encrypted',
  'notebook:save-encrypted-content'
] as const

function ensureManager(): NotebookManager {
  if (!manager) throw new Error('Notebook plugin not initialized')
  return manager
}

export const notebookPlugin: PluginMainModule = {
  id: 'notebook',
  name: 'Notebook',

  initialize(ctx: PluginContext) {
    // Register IPC handlers first so they're always reachable
    ipcMain.handle('notebook:get-tree', () => {
      return manager?.getTree() ?? []
    })

    ipcMain.handle('notebook:get-content', (_e, id: string) => {
      return ensureManager().getContent(id)
    })

    ipcMain.handle('notebook:create', (_e, parentId: string | null, title: string) => {
      return ensureManager().createDocument(parentId, title)
    })

    ipcMain.handle('notebook:update', (_e, id: string, updates) => {
      return ensureManager().updateDocument(id, updates)
    })

    ipcMain.handle('notebook:update-content', (_e, id: string, content: string) => {
      return ensureManager().updateContent(id, content)
    })

    ipcMain.handle('notebook:delete', (_e, id: string) => {
      ensureManager().deleteDocument(id)
      return { success: true }
    })

    ipcMain.handle('notebook:move', (_e, id: string, newParentId: string | null, newSortOrder: number) => {
      ensureManager().moveDocument(id, newParentId, newSortOrder)
      return { success: true }
    })

    ipcMain.handle('notebook:set-locked', (_e, id: string, locked: boolean) => {
      return ensureManager().setLocked(id, locked)
    })

    ipcMain.handle('notebook:set-encrypted', (_e, id: string, encrypted: boolean, passwordHash?: string) => {
      return ensureManager().setEncrypted(id, encrypted, passwordHash)
    })

    ipcMain.handle('notebook:save-encrypted-content', (_e, id: string, encryptedContent: string) => {
      ensureManager().saveEncryptedContent(id, encryptedContent)
      return { success: true }
    })

    // Now try DB initialization
    try {
      manager = new NotebookManager(ctx)
    } catch (err) {
      console.error('[notebook] Failed to initialize database/manager:', err)
    }
  },

  async dispose() {
    if (manager) {
      manager.dispose()
      manager = null
    }
    for (const ch of IPC_CHANNELS) {
      ipcMain.removeHandler(ch)
    }
  }
}
