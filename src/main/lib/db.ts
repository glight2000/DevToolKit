import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'fs'
import { join } from 'path'

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
