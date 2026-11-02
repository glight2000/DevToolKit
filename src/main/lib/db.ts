import Database from 'better-sqlite3'
import { mkdirSync, existsSync, readdirSync, renameSync } from 'fs'
import { join } from 'path'

// Chromium owns userData/databases (legacy WebSQL) and may delete it when a
// BrowserWindow is created. Migrate with SQLite's backup API before any window
// exists, including committed WAL content, and never replace a migrated DB.
export async function prepareDatabaseDirectory(userData: string): Promise<string> {
  const destination = join(userData, 'devtoolkit-data', 'databases')
  const legacy = join(userData, 'databases')
  mkdirSync(destination, { recursive: true })
  if (!existsSync(legacy)) return destination
  for (const entry of readdirSync(legacy, { withFileTypes: true })) {
    if (!entry.isFile() || !/^[a-z0-9-]+\.db$/.test(entry.name)) continue
    const target = join(destination, entry.name)
    if (existsSync(target)) continue
    const previous = new Database(join(legacy, entry.name), { readonly: true, fileMustExist: true })
    const staging = target + '.migrating'
    try {
      await previous.backup(staging)
      const check = new Database(staging, { readonly: true })
      try { if (check.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('Database migration verification failed') } finally { check.close() }
      renameSync(staging, target)
    } finally { previous.close() }
  }
  return destination
}

export class DatabaseManager {
  private databases: Map<string, Database.Database> = new Map()
  private basePath: string

  constructor(basePath: string) {
    this.basePath = basePath
    if (!existsSync(basePath)) {
      mkdirSync(basePath, { recursive: true })
    }
  }

  getDatabase(pluginId: string): Database.Database {
    let db = this.databases.get(pluginId)
    if (!db) {
      const dbPath = join(this.basePath, `${pluginId}.db`)
      db = new Database(dbPath)
      db.pragma('journal_mode = WAL')
      db.pragma('foreign_keys = ON')
      this.databases.set(pluginId, db)
    }
    return db
  }

  closeAll(): void {
    for (const db of this.databases.values()) {
      db.close()
    }
    this.databases.clear()
  }
}
