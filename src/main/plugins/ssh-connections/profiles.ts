import { randomUUID } from 'node:crypto'
import type { PluginContext } from '../../../shared/plugin-types'
import type { ConnectionDraft, ConnectionProfile, ConnectionMeta, LaunchMode } from '../../../shared/ssh-connections'

function string(value: unknown, name: string, max = 255): string {
  if (typeof value !== 'string' || value.length > max || /[\x00-\x1f]/.test(value)) throw new Error(`Invalid ${name}`)
  return value.trim()
}
export function validateDraft(value: ConnectionDraft): ConnectionDraft {
  if (!value || typeof value !== 'object') throw new Error('Connection fields are required')
  const name = string(value.name, 'name'), host = string(value.host, 'host'), username = string(value.username, 'username')
  if (!name || !host || !username || /^[\-]/.test(host) || /[\s/@\\]/.test(host) || /\s/.test(username)) throw new Error('Name, hostname and username are required; host/user cannot contain spaces')
  if (!Number.isInteger(value.port) || value.port < 1 || value.port > 65535) throw new Error('Port must be between 1 and 65535')
  const environment = string(value.environment, 'environment')
  if (environment !== 'local' && (!environment.startsWith('wsl:') || !environment.slice(4) || /[\\/]/.test(environment))) throw new Error('Invalid connection environment')
  if (!['auto', 'key', 'password'].includes(value.auth)) throw new Error('Invalid authentication method')
  const keyPath = string(value.keyPath, 'key path', 2048)
  if (value.auth === 'key' && !keyPath) throw new Error('Choose a private key path')
  if (!Array.isArray(value.tags) || value.tags.length > 20) throw new Error('Use at most 20 tags')
  if (typeof value.notes !== 'string' || value.notes.length > 8000 || value.notes.includes('\0')) throw new Error('Notes are too long')
  return { name, host, username, port: value.port, environment, auth: value.auth, keyPath,
    group: string(value.group, 'group', 100), tags: [...new Set(value.tags.map(tag => string(tag, 'tag', 40)).filter(Boolean))], notes: value.notes, favorite: value.favorite === true }
}

export class ConnectionStore {
  constructor(private ctx: PluginContext) {
    ctx.db.exec(`CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS connection_metadata (id TEXT PRIMARY KEY, favorite INTEGER NOT NULL DEFAULT 0, last_used INTEGER);
      CREATE TABLE IF NOT EXISTS connection_preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);`)
  }
  list(): ConnectionProfile[] {
    return (this.ctx.db.prepare('SELECT payload FROM connections').all() as { payload: string }[])
      .map(row => JSON.parse(this.ctx.decrypt(row.payload)) as ConnectionProfile)
      .sort((a, b) => a.name.localeCompare(b.name))
  }
  get(id: string): ConnectionProfile {
    const row = this.ctx.db.prepare('SELECT payload FROM connections WHERE id = ?').get(id) as { payload: string } | undefined
    if (!row) throw new Error('Connection no longer exists')
    return JSON.parse(this.ctx.decrypt(row.payload))
  }
  save(draft: ConnectionDraft, id?: string): ConnectionProfile {
    const fields = validateDraft(draft)
    const previous = id ? this.get(id) : null
    const record: ConnectionProfile = { ...fields, id: previous?.id ?? randomUUID(), createdAt: previous?.createdAt ?? Date.now(), updatedAt: Date.now(), lastUsed: previous?.lastUsed ?? null }
    this.ctx.db.prepare('INSERT OR REPLACE INTO connections (id, payload) VALUES (?, ?)').run(record.id, this.ctx.encrypt(JSON.stringify(record)))
    return record
  }
  remove(id: string): void { this.get(id); this.ctx.db.prepare('DELETE FROM connections WHERE id = ?').run(id) }
  markUsed(id: string): void {
    const record = this.get(id)
    record.lastUsed = Date.now()
    this.ctx.db.prepare('UPDATE connections SET payload = ? WHERE id = ?').run(this.ctx.encrypt(JSON.stringify(record)), id)
  }
  metadata(): Record<string, ConnectionMeta> {
    return Object.fromEntries((this.ctx.db.prepare('SELECT * FROM connection_metadata').all() as { id: string; favorite: number; last_used: number | null }[])
      .map(row => [row.id, { favorite: row.favorite === 1, lastUsed: row.last_used }]))
  }
  annotate(id: string, favorite?: boolean, used = false): void {
    const old = this.metadata()[id] ?? { favorite: false, lastUsed: null }
    this.ctx.db.prepare('INSERT OR REPLACE INTO connection_metadata (id, favorite, last_used) VALUES (?, ?, ?)')
      .run(id, (favorite ?? old.favorite) ? 1 : 0, used ? Date.now() : old.lastUsed)
  }
  launchMode(): LaunchMode {
    const row = this.ctx.db.prepare("SELECT value FROM connection_preferences WHERE key = 'launchMode'").get() as { value: string } | undefined
    return row?.value === 'external' ? 'external' : 'embedded'
  }
  setLaunchMode(mode: LaunchMode): void {
    if (mode !== 'embedded' && mode !== 'external') throw new Error('Invalid terminal mode')
    this.ctx.db.prepare("INSERT OR REPLACE INTO connection_preferences (key, value) VALUES ('launchMode', ?)").run(mode)
  }
}
