export interface SshAlias {
  id: string
  alias: string
  sourceId: string
  sourceLabel: string
  configPath: string
  hostname: string
  username: string
  port: number
  identityFiles: string[]
  keepAliveInterval: number
  keepAliveCountMax: number
  problems: string[]
  notes: string[]
}

export interface SshConfigSource {
  id: string
  label: string
  state: 'ready' | 'stopped' | 'error'
  error?: string
  configPath?: string
  configExists?: boolean
}

export interface SshAliasDiscovery {
  sources: SshConfigSource[]
  aliases: SshAlias[]
}
