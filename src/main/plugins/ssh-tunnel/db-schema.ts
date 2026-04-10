import type Database from 'better-sqlite3'
import type { TunnelConfig, TunnelType } from '../../tunnel/types'

export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tunnels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      remarks TEXT DEFAULT '',
      type TEXT NOT NULL DEFAULT 'local',
      ssh_host TEXT NOT NULL,
      ssh_port INTEGER DEFAULT 22,
      username TEXT NOT NULL,
      auth_type TEXT NOT NULL DEFAULT 'password',
      password TEXT,
      private_key_path TEXT,
      passphrase TEXT,
      local_host TEXT DEFAULT '127.0.0.1',
      local_port INTEGER DEFAULT 0,
      remote_host TEXT DEFAULT '127.0.0.1',
      remote_port INTEGER DEFAULT 0,
      auto_start INTEGER DEFAULT 0,
      auto_reconnect INTEGER DEFAULT 1,
      keep_alive_interval INTEGER DEFAULT 10,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
}

interface TunnelRow {
  id: string
  name: string
  remarks: string
  type: string
  ssh_host: string
  ssh_port: number
  username: string
  auth_type: string
  password: string | null
  private_key_path: string | null
  passphrase: string | null
  local_host: string
  local_port: number
  remote_host: string
  remote_port: number
  auto_start: number
  auto_reconnect: number
  keep_alive_interval: number
  created_at: number
  updated_at: number
}

function decryptField(
  value: string | null | undefined,
  decrypt: (text: string) => string
): string | undefined {
  if (value == null || value === '') return undefined
  try {
    return decrypt(value)
  } catch {
    return value
  }
}

function encryptField(
  value: string | null | undefined,
  encrypt: (text: string) => string
): string | null {
  if (value == null || value === '') return null
  return encrypt(value)
}

function rowToConfig(row: TunnelRow, decrypt: (text: string) => string): TunnelConfig {
  return {
    id: row.id,
    name: row.name,
    remarks: row.remarks ?? '',
    type: row.type as TunnelType,
    sshHost: decryptField(row.ssh_host, decrypt) ?? '',
    sshPort: row.ssh_port,
    username: decryptField(row.username, decrypt) ?? '',
    authType: row.auth_type as 'password' | 'privateKey',
    password: decryptField(row.password, decrypt),
    privateKeyPath: decryptField(row.private_key_path, decrypt),
    passphrase: decryptField(row.passphrase, decrypt),
    localHost: row.local_host,
    localPort: row.local_port,
    remoteHost: row.remote_host,
    remotePort: row.remote_port,
    autoStart: row.auto_start === 1,
    autoReconnect: row.auto_reconnect === 1,
    keepAliveInterval: row.keep_alive_interval,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function getAllTunnels(
  db: Database.Database,
  decrypt: (text: string) => string
): TunnelConfig[] {
  const rows = db.prepare('SELECT * FROM tunnels').all() as TunnelRow[]
  return rows.map((row) => rowToConfig(row, decrypt))
}

export function saveTunnel(
  db: Database.Database,
  config: TunnelConfig,
  encrypt: (text: string) => string
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO tunnels (
      id, name, remarks, type,
      ssh_host, ssh_port, username, auth_type,
      password, private_key_path, passphrase,
      local_host, local_port, remote_host, remote_port,
      auto_start, auto_reconnect, keep_alive_interval,
      created_at, updated_at
    ) VALUES (
      @id, @name, @remarks, @type,
      @ssh_host, @ssh_port, @username, @auth_type,
      @password, @private_key_path, @passphrase,
      @local_host, @local_port, @remote_host, @remote_port,
      @auto_start, @auto_reconnect, @keep_alive_interval,
      @created_at, @updated_at
    )
  `)

  stmt.run({
    id: config.id,
    name: config.name,
    remarks: config.remarks ?? '',
    type: config.type,
    ssh_host: encrypt(config.sshHost),
    ssh_port: config.sshPort,
    username: encrypt(config.username),
    auth_type: config.authType,
    password: encryptField(config.password, encrypt),
    private_key_path: encryptField(config.privateKeyPath, encrypt),
    passphrase: encryptField(config.passphrase, encrypt),
    local_host: config.localHost,
    local_port: config.localPort,
    remote_host: config.remoteHost,
    remote_port: config.remotePort,
    auto_start: config.autoStart ? 1 : 0,
    auto_reconnect: config.autoReconnect ? 1 : 0,
    keep_alive_interval: config.keepAliveInterval,
    created_at: config.createdAt,
    updated_at: config.updatedAt
  })
}

export function deleteTunnel(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM tunnels WHERE id = ?').run(id)
}

export function tunnelExists(db: Database.Database, id: string): boolean {
  const row = db.prepare('SELECT 1 FROM tunnels WHERE id = ?').get(id)
  return row !== undefined
}
