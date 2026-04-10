export type TunnelType = 'local' | 'remote' | 'dynamic'
export type TunnelStatus = 'stopped' | 'connecting' | 'connected' | 'error' | 'reconnecting'

export interface TunnelConfig {
  id: string
  name: string
  remarks: string
  type: TunnelType
  sshHost: string
  sshPort: number
  username: string
  authType: 'password' | 'privateKey'
  password?: string
  privateKeyPath?: string
  passphrase?: string
  localHost: string
  localPort: number
  remoteHost: string
  remotePort: number
  autoStart: boolean
  autoReconnect: boolean
  keepAliveInterval: number
  createdAt: number
  updatedAt: number
}

export interface TunnelState {
  status: TunnelStatus
  error?: string
  bytesIn: number
  bytesOut: number
  rateIn: number
  rateOut: number
  connections: number
  connectedAt?: number
  lastActive?: number
}

export interface TunnelInfo {
  config: TunnelConfig
  state: TunnelState
}
