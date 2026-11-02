import type { SshAliasDiscovery } from './ssh-config'

export type LaunchMode = 'embedded' | 'external'
export interface ConnectionDraft {
  name: string
  host: string
  port: number
  username: string
  environment: string
  auth: 'auto' | 'key' | 'password'
  keyPath: string
  group: string
  tags: string[]
  notes: string
  favorite: boolean
}
export interface ConnectionProfile extends ConnectionDraft {
  id: string
  createdAt: number
  updatedAt: number
  lastUsed: number | null
}
export interface ConnectionMeta { favorite: boolean; lastUsed: number | null }
export interface ConnectionCatalog extends SshAliasDiscovery {
  profiles: ConnectionProfile[]
  metadata: Record<string, ConnectionMeta>
  preferences: { launchMode: LaunchMode }
}
export interface TerminalSession {
  id: string
  title: string
  environment: string
  state: 'running' | 'exited'
  exitCode?: number
  createdAt: number
}
export interface ConfigDocument { sourceId: string; path: string; text: string; revision: string; exists: boolean }
