import type Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'

export interface DocumentMeta {
  id: string
  parentId: string | null
  title: string
  sortOrder: number
  isLocked: boolean
  isEncrypted: boolean
  createdAt: number
  updatedAt: number
}

export interface DocumentContent {
  content: string
  isEncrypted: boolean
  passwordHash: string | null
}

interface DocumentRow {
  id: string
  parent_id: string | null
  title: string
  content: string
  sort_order: number
  is_locked: number
  is_encrypted: number
  password_hash: string | null
  created_at: number
  updated_at: number
}

function decryptField(value: string | null, decrypt: (text: string) => string): string {
  if (value == null || value === '') return ''
  try {
    return decrypt(value)
  } catch {
    return value
  }
}

function rowToMeta(row: DocumentRow, decrypt: (text: string) => string): DocumentMeta {
  return {
    id: row.id,
    parentId: row.parent_id,
    title: decryptField(row.title, decrypt),
    sortOrder: row.sort_order,
    isLocked: row.is_locked === 1,
    isEncrypted: row.is_encrypted === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      is_locked INTEGER DEFAULT 0,
      is_encrypted INTEGER DEFAULT 0,
      password_hash TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (parent_id) REFERENCES documents(id) ON DELETE CASCADE
    )
  `)
  // Enable foreign key enforcement (required per-connection in SQLite)
  db.pragma('foreign_keys = ON')
}

export function getAllDocuments(
  db: Database.Database,
  decrypt: (text: string) => string
): DocumentMeta[] {
  const rows = db.prepare('SELECT * FROM documents ORDER BY sort_order').all() as DocumentRow[]
  return rows.map((row) => rowToMeta(row, decrypt))
}

export function getDocumentContent(
  db: Database.Database,
  id: string,
  decrypt: (text: string) => string
): DocumentContent | null {
  const row = db
    .prepare('SELECT content, is_encrypted, password_hash FROM documents WHERE id = ?')
    .get(id) as Pick<DocumentRow, 'content' | 'is_encrypted' | 'password_hash'> | undefined

  if (!row) return null

  // Always decrypt app-level encryption. If is_encrypted, the resulting
  // content is still encrypted with the user's password — the renderer
  // handles that second layer.
  const content = decryptField(row.content, decrypt)

  return {
    content,
    isEncrypted: row.is_encrypted === 1,
    passwordHash: row.password_hash
  }
}

export function createDocument(
  db: Database.Database,
  doc: { parentId?: string | null; title: string; content?: string },
  encrypt: (text: string) => string
): DocumentMeta {
  const id = uuidv4()
  const now = Date.now()

  // Determine sort_order: place after the last sibling
  const parentId = doc.parentId ?? null
  const lastSibling = (
    parentId === null
      ? db.prepare('SELECT MAX(sort_order) as max_sort FROM documents WHERE parent_id IS NULL').get()
      : db.prepare('SELECT MAX(sort_order) as max_sort FROM documents WHERE parent_id = ?').get(parentId)
  ) as { max_sort: number | null } | undefined

  const sortOrder = (lastSibling?.max_sort ?? -1) + 1

  db.prepare(
    `INSERT INTO documents (id, parent_id, title, content, sort_order, is_locked, is_encrypted, password_hash, created_at, updated_at)
     VALUES (@id, @parent_id, @title, @content, @sort_order, 0, 0, NULL, @created_at, @updated_at)`
  ).run({
    id,
    parent_id: parentId,
    title: encrypt(doc.title),
    content: encrypt(doc.content ?? ''),
    sort_order: sortOrder,
    created_at: now,
    updated_at: now
  })

  return {
    id,
    parentId,
    title: doc.title,
    sortOrder,
    isLocked: false,
    isEncrypted: false,
    createdAt: now,
    updatedAt: now
  }
}

export function updateDocument(
  db: Database.Database,
  id: string,
  updates: {
    title?: string
    content?: string
    sortOrder?: number
    isLocked?: boolean
    isEncrypted?: boolean
    passwordHash?: string | null
  },
  encrypt: (text: string) => string,
  decrypt: (text: string) => string
): DocumentMeta | null {
  const existing = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as
    | DocumentRow
    | undefined
  if (!existing) return null

  const now = Date.now()
  const fields: string[] = ['updated_at = @updated_at']
  const params: Record<string, unknown> = { id, updated_at: now }

  if (updates.title !== undefined) {
    fields.push('title = @title')
    params.title = encrypt(updates.title)
  }

  if (updates.content !== undefined) {
    fields.push('content = @content')
    params.content = encrypt(updates.content)
  }

  if (updates.sortOrder !== undefined) {
    fields.push('sort_order = @sort_order')
    params.sort_order = updates.sortOrder
  }

  if (updates.isLocked !== undefined) {
    fields.push('is_locked = @is_locked')
    params.is_locked = updates.isLocked ? 1 : 0
  }

  if (updates.isEncrypted !== undefined) {
    fields.push('is_encrypted = @is_encrypted')
    params.is_encrypted = updates.isEncrypted ? 1 : 0
  }

  if (updates.passwordHash !== undefined) {
    fields.push('password_hash = @password_hash')
    params.password_hash = updates.passwordHash
  }

  db.prepare(`UPDATE documents SET ${fields.join(', ')} WHERE id = @id`).run(params)

  const updated = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as DocumentRow
  return rowToMeta(updated, decrypt)
}

export function deleteDocument(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM documents WHERE id = ?').run(id)
}

export function moveDocument(
  db: Database.Database,
  id: string,
  newParentId: string | null,
  newSortOrder: number
): void {
  db.prepare('UPDATE documents SET parent_id = @parent_id, sort_order = @sort_order, updated_at = @updated_at WHERE id = @id').run({
    id,
    parent_id: newParentId,
    sort_order: newSortOrder,
    updated_at: Date.now()
  })
}

export function getChildren(
  db: Database.Database,
  parentId: string | null,
  decrypt: (text: string) => string
): DocumentMeta[] {
  const rows =
    parentId === null
      ? (db
          .prepare('SELECT * FROM documents WHERE parent_id IS NULL ORDER BY sort_order')
          .all() as DocumentRow[])
      : (db
          .prepare('SELECT * FROM documents WHERE parent_id = ? ORDER BY sort_order')
          .all(parentId) as DocumentRow[])

  return rows.map((row) => rowToMeta(row, decrypt))
}
