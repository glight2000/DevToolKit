import { v4 as uuidv4 } from 'uuid'
import { TunnelConfig, TunnelState, TunnelInfo } from './types'
import { SSHTunnel } from './SSHTunnel'
import { getTunnels, saveTunnels } from '../store'

export class TunnelManager {
  private tunnels: Map<string, SSHTunnel> = new Map()
  private sendToRenderer: (channel: string, ...args: unknown[]) => void

  constructor(sendToRenderer: (channel: string, ...args: unknown[]) => void) {
    this.sendToRenderer = sendToRenderer
    this.loadTunnels()
  }

  private loadTunnels(): void {
    const configs = getTunnels()
    for (const config of configs) {
      const tunnel = new SSHTunnel(config)
      this.attachListeners(tunnel)
      this.tunnels.set(config.id, tunnel)
    }
  }

  private attachListeners(tunnel: SSHTunnel): void {
    tunnel.on('state-change', (state: TunnelState) => {
      this.sendToRenderer('tunnel:state-update', tunnel.config.id, state)
    })

    tunnel.on('error', (err: Error) => {
      console.error(`[Tunnel ${tunnel.config.id}] Error: ${err.message}`)
    })
  }

  private persistConfigs(): void {
    const configs: TunnelConfig[] = []
    for (const tunnel of this.tunnels.values()) {
      configs.push(tunnel.config)
    }
    saveTunnels(configs)
  }

  createTunnel(partial: Partial<TunnelConfig>): TunnelInfo {
    const now = Date.now()
    const config: TunnelConfig = {
      id: uuidv4(),
      name: partial.name || 'New Tunnel',
      remarks: partial.remarks || '',
      type: partial.type || 'local',
      sshHost: partial.sshHost || '',
      sshPort: partial.sshPort ?? 22,
      username: partial.username || '',
      authType: partial.authType || 'password',
      password: partial.password,
      privateKeyPath: partial.privateKeyPath,
      passphrase: partial.passphrase,
      localHost: partial.localHost || '127.0.0.1',
      localPort: partial.localPort ?? 0,
      remoteHost: partial.remoteHost || '127.0.0.1',
      remotePort: partial.remotePort ?? 0,
      autoStart: partial.autoStart ?? false,
      autoReconnect: partial.autoReconnect ?? true,
      keepAliveInterval: partial.keepAliveInterval ?? 10,
      createdAt: now,
      updatedAt: now
    }

    const tunnel = new SSHTunnel(config)
    this.attachListeners(tunnel)
    this.tunnels.set(config.id, tunnel)
    this.persistConfigs()

    return {
      config: tunnel.config,
      state: { ...tunnel.state }
    }
  }

  async updateTunnel(id: string, partial: Partial<TunnelConfig>): Promise<TunnelInfo> {
    const tunnel = this.tunnels.get(id)
    if (!tunnel) {
      throw new Error(`Tunnel not found: ${id}`)
    }

    const wasRunning =
      tunnel.state.status === 'connected' || tunnel.state.status === 'connecting'

    if (wasRunning) {
      await tunnel.stop()
    }

    const updatedConfig: TunnelConfig = {
      ...tunnel.config,
      ...partial,
      id: tunnel.config.id,
      createdAt: tunnel.config.createdAt,
      updatedAt: Date.now()
    }

    tunnel.updateConfig(updatedConfig)
    this.persistConfigs()

    if (wasRunning) {
      await tunnel.start()
    }

    return {
      config: tunnel.config,
      state: { ...tunnel.state }
    }
  }

  async deleteTunnel(id: string): Promise<void> {
    const tunnel = this.tunnels.get(id)
    if (!tunnel) {
      throw new Error(`Tunnel not found: ${id}`)
    }

    await tunnel.stop()
    tunnel.removeAllListeners()
    this.tunnels.delete(id)
    this.persistConfigs()
  }

  async startTunnel(id: string): Promise<void> {
    const tunnel = this.tunnels.get(id)
    if (!tunnel) {
      throw new Error(`Tunnel not found: ${id}`)
    }

    await tunnel.start()
  }

  async stopTunnel(id: string): Promise<void> {
    const tunnel = this.tunnels.get(id)
    if (!tunnel) {
      throw new Error(`Tunnel not found: ${id}`)
    }

    await tunnel.stop()
  }

  async startAll(): Promise<void> {
    const promises: Promise<void>[] = []
    for (const tunnel of this.tunnels.values()) {
      if (tunnel.state.status === 'stopped' || tunnel.state.status === 'error') {
        promises.push(tunnel.start())
      }
    }
    await Promise.allSettled(promises)
  }

  async stopAll(): Promise<void> {
    const promises: Promise<void>[] = []
    for (const tunnel of this.tunnels.values()) {
      if (tunnel.state.status !== 'stopped') {
        promises.push(tunnel.stop())
      }
    }
    await Promise.allSettled(promises)
  }

  getTunnelInfo(id: string): TunnelInfo | null {
    const tunnel = this.tunnels.get(id)
    if (!tunnel) return null

    return {
      config: tunnel.config,
      state: { ...tunnel.state }
    }
  }

  getAllTunnelInfos(): TunnelInfo[] {
    const infos: TunnelInfo[] = []
    for (const tunnel of this.tunnels.values()) {
      infos.push({
        config: tunnel.config,
        state: { ...tunnel.state }
      })
    }
    return infos
  }

  async autoStartTunnels(): Promise<void> {
    const promises: Promise<void>[] = []
    for (const tunnel of this.tunnels.values()) {
      if (tunnel.config.autoStart) {
        promises.push(tunnel.start())
      }
    }
    await Promise.allSettled(promises)
  }

  async dispose(): Promise<void> {
    await this.stopAll()
    for (const tunnel of this.tunnels.values()) {
      tunnel.removeAllListeners()
    }
    this.tunnels.clear()
  }
}
