import type { PluginContext } from '../../../shared/plugin-types'
import {
  initSchema,
  getAllDocuments,
  getDocumentContent,
  createDocument,
  updateDocument,
  deleteDocument,
  moveDocument,
  type DocumentMeta,
  type DocumentContent
} from './db-schema'

export class NotebookManager {
  private ctx: PluginContext

  constructor(ctx: PluginContext) {
    this.ctx = ctx
    initSchema(ctx.db)
  }

  getTree(): DocumentMeta[] {
    return getAllDocuments(this.ctx.db, this.ctx.decrypt)
  }

  getContent(id: string): DocumentContent | null {
    return getDocumentContent(this.ctx.db, id, this.ctx.decrypt)
  }

  createDocument(parentId: string | null, title: string, content?: string): DocumentMeta {
    return createDocument(
      this.ctx.db,
      { parentId, title, content },
      this.ctx.encrypt
    )
  }

  updateDocument(
    id: string,
    updates: {
      title?: string
      content?: string
      sortOrder?: number
      isLocked?: boolean
      isEncrypted?: boolean
      passwordHash?: string | null
    }
  ): DocumentMeta | null {
    return updateDocument(this.ctx.db, id, updates, this.ctx.encrypt, this.ctx.decrypt)
  }

  updateContent(id: string, content: string): DocumentMeta | null {
    return updateDocument(this.ctx.db, id, { content }, this.ctx.encrypt, this.ctx.decrypt)
  }

  deleteDocument(id: string): void {
    deleteDocument(this.ctx.db, id)
  }

  moveDocument(id: string, newParentId: string | null, newSortOrder: number): void {
    moveDocument(this.ctx.db, id, newParentId, newSortOrder)
  }

  setLocked(id: string, locked: boolean): DocumentMeta | null {
    return updateDocument(this.ctx.db, id, { isLocked: locked }, this.ctx.encrypt, this.ctx.decrypt)
  }

  setEncrypted(id: string, encrypted: boolean, passwordHash?: string): DocumentMeta | null {
    return updateDocument(
      this.ctx.db,
      id,
      {
        isEncrypted: encrypted,
        passwordHash: encrypted ? (passwordHash ?? null) : null
      },
      this.ctx.encrypt,
      this.ctx.decrypt
    )
  }

  saveEncryptedContent(id: string, encryptedContent: string): void {
    // The content is already encrypted by the renderer with the user's password.
    // We still wrap it with app-level encryption via the normal update path.
    updateDocument(this.ctx.db, id, { content: encryptedContent }, this.ctx.encrypt, this.ctx.decrypt)
  }

  dispose(): void {
    // No resources to clean up — DB is managed by the host
  }
}
