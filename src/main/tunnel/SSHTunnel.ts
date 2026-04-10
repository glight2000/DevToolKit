import { EventEmitter } from 'events'
import { Client, Channel, ClientChannel } from 'ssh2'
import * as net from 'net'
import * as fs from 'fs'
import { TunnelConfig, TunnelState, TunnelStatus } from './types'

const MAX_RECONNECT_DELAY = 30_000
const RATE_CALC_INTERVAL = 1_000

export class SSHTunnel extends EventEmitter {
  private client: Client | null = null
  private server: net.Server | null = null
  private activeSockets: Set<net.Socket> = new Set()
  private activeChannels: Set<Channel> = new Set()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private rateTimer: ReturnType<typeof setInterval> | null = null
  private reconnectAttempts = 0
  private stopping = false

  private prevBytesIn = 0
  private prevBytesOut = 0

  public config: TunnelConfig
  public state: TunnelState

  constructor(config: TunnelConfig) {
    super()
    this.config = config
    this.state = this.createDefaultState()
  }

  private createDefaultState(): TunnelState {
    return {
      status: 'stopped',
      error: undefined,
      bytesIn: 0,
      bytesOut: 0,
      rateIn: 0,
      rateOut: 0,
      connections: 0,
      connectedAt: undefined,
      lastActive: undefined
    }
  }

  private updateState(partial: Partial<TunnelState>): void {
    Object.assign(this.state, partial)
    this.emit('state-change', { ...this.state })
  }

  async start(): Promise<void> {
    if (this.state.status === 'connected' || this.state.status === 'connecting') {
      return
    }

    this.stopping = false
    this.reconnectAttempts = 0
    this.state = this.createDefaultState()
    await this.connect()
  }

  private async connect(): Promise<void> {
    this.updateState({ status: 'connecting' })

    const client = new Client()
    this.client = client

    const connectConfig: Record<string, unknown> = {
      host: this.config.sshHost,
      port: this.config.sshPort,
      username: this.config.username,
      keepaliveInterval: this.config.keepAliveInterval * 1000,
      keepaliveCountMax: 3,
      readyTimeout: 20_000
    }

    if (this.config.authType === 'password') {
      connectConfig.password = this.config.password
    } else if (this.config.authType === 'privateKey') {
      try {
        connectConfig.privateKey = fs.readFileSync(this.config.privateKeyPath!, 'utf-8')
        if (this.config.passphrase) {
          connectConfig.passphrase = this.config.passphrase
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        this.updateState({ status: 'error', error: `Failed to read private key: ${message}` })
        this.emit('error', new Error(`Failed to read private key: ${message}`))
        return
      }
    }

    return new Promise<void>((resolve) => {
      client.on('ready', () => {
        this.updateState({
          status: 'connected',
          connectedAt: Date.now(),
          error: undefined
        })
        this.reconnectAttempts = 0
        this.startRateCalculation()
        this.setupForwarding()
        resolve()
      })

      client.on('error', (err: Error) => {
        if (this.stopping) return
        this.emit('error', err)
        this.updateState({
          status: 'error',
          error: err.message
        })
        this.handleDisconnect()
        resolve()
      })

      client.on('close', () => {
        if (this.stopping) return
        this.handleDisconnect()
      })

      client.on('end', () => {
        if (this.stopping) return
        this.handleDisconnect()
      })

      client.connect(connectConfig as Parameters<Client['connect']>[0])
    })
  }

  private setupForwarding(): void {
    switch (this.config.type) {
      case 'local':
        this.setupLocalForwarding()
        break
      case 'dynamic':
        this.setupDynamicForwarding()
        break
      case 'remote':
        this.setupRemoteForwarding()
        break
    }
  }

  private setupLocalForwarding(): void {
    const server = net.createServer((socket) => {
      this.activeSockets.add(socket)
      this.updateState({ connections: this.state.connections + 1 })

      if (!this.client) {
        socket.destroy()
        this.activeSockets.delete(socket)
        return
      }

      this.client.forwardOut(
        this.config.localHost,
        this.config.localPort,
        this.config.remoteHost,
        this.config.remotePort,
        (err, channel) => {
          if (err) {
            socket.destroy()
            this.activeSockets.delete(socket)
            this.updateState({ connections: this.state.connections - 1 })
            return
          }

          this.activeChannels.add(channel)
          this.pipeWithTracking(socket, channel)

          const cleanup = (): void => {
            socket.destroy()
            channel.close()
            this.activeSockets.delete(socket)
            this.activeChannels.delete(channel)
            this.updateState({ connections: Math.max(0, this.state.connections - 1) })
          }

          socket.on('error', cleanup)
          socket.on('close', cleanup)
          channel.on('error', cleanup)
          channel.on('close', cleanup)
        }
      )
    })

    server.on('error', (err) => {
      this.emit('error', err)
      this.updateState({ status: 'error', error: `Local server error: ${err.message}` })
    })

    server.listen(this.config.localPort, this.config.localHost, () => {
      this.server = server
    })
  }

  private setupDynamicForwarding(): void {
    const server = net.createServer((socket) => {
      this.activeSockets.add(socket)
      this.handleSocks5Connection(socket)
    })

    server.on('error', (err) => {
      this.emit('error', err)
      this.updateState({ status: 'error', error: `SOCKS5 server error: ${err.message}` })
    })

    server.listen(this.config.localPort, this.config.localHost, () => {
      this.server = server
    })
  }

  private handleSocks5Connection(socket: net.Socket): void {
    let phase: 'greeting' | 'request' = 'greeting'

    const onData = (data: Buffer): void => {
      if (phase === 'greeting') {
        // SOCKS5 greeting: VER (1) | NMETHODS (1) | METHODS (1-255)
        if (data[0] !== 0x05) {
          socket.destroy()
          this.activeSockets.delete(socket)
          return
        }

        // Reply: VER (5) | METHOD (0 = no auth)
        socket.write(Buffer.from([0x05, 0x00]))
        phase = 'request'
      } else if (phase === 'request') {
        socket.removeListener('data', onData)
        this.handleSocks5Request(socket, data)
      }
    }

    socket.on('data', onData)

    socket.on('error', () => {
      this.activeSockets.delete(socket)
    })

    socket.on('close', () => {
      this.activeSockets.delete(socket)
    })
  }

  private handleSocks5Request(socket: net.Socket, data: Buffer): void {
    // SOCKS5 request: VER (1) | CMD (1) | RSV (1) | ATYP (1) | DST.ADDR (variable) | DST.PORT (2)
    if (data[0] !== 0x05 || data[1] !== 0x01) {
      // Only support CONNECT (0x01)
      // Reply with command not supported
      const reply = Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
      socket.write(reply)
      socket.destroy()
      this.activeSockets.delete(socket)
      return
    }

    let targetHost: string
    let targetPort: number
    let addrEnd: number

    const addrType = data[3]

    if (addrType === 0x01) {
      // IPv4
      targetHost = `${data[4]}.${data[5]}.${data[6]}.${data[7]}`
      addrEnd = 8
    } else if (addrType === 0x03) {
      // Domain name
      const domainLen = data[4]
      targetHost = data.subarray(5, 5 + domainLen).toString('ascii')
      addrEnd = 5 + domainLen
    } else if (addrType === 0x04) {
      // IPv6
      const ipv6Parts: string[] = []
      for (let i = 0; i < 16; i += 2) {
        ipv6Parts.push(data.readUInt16BE(4 + i).toString(16))
      }
      targetHost = ipv6Parts.join(':')
      addrEnd = 20
    } else {
      const reply = Buffer.from([0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
      socket.write(reply)
      socket.destroy()
      this.activeSockets.delete(socket)
      return
    }

    targetPort = data.readUInt16BE(addrEnd)

    if (!this.client) {
      socket.destroy()
      this.activeSockets.delete(socket)
      return
    }

    this.updateState({ connections: this.state.connections + 1 })

    this.client.forwardOut(
      this.config.localHost,
      this.config.localPort,
      targetHost,
      targetPort,
      (err, channel) => {
        if (err) {
          // Reply with general failure
          const reply = Buffer.from([0x05, 0x01, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
          socket.write(reply)
          socket.destroy()
          this.activeSockets.delete(socket)
          this.updateState({ connections: Math.max(0, this.state.connections - 1) })
          return
        }

        // Reply with success
        const reply = Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
        socket.write(reply)

        this.activeChannels.add(channel)
        this.pipeWithTracking(socket, channel)

        const cleanup = (): void => {
          socket.destroy()
          channel.close()
          this.activeSockets.delete(socket)
          this.activeChannels.delete(channel)
          this.updateState({ connections: Math.max(0, this.state.connections - 1) })
        }

        socket.on('error', cleanup)
        socket.on('close', cleanup)
        channel.on('error', cleanup)
        channel.on('close', cleanup)
      }
    )
  }

  private setupRemoteForwarding(): void {
    if (!this.client) return

    this.client.forwardIn(this.config.remoteHost, this.config.remotePort, (err) => {
      if (err) {
        this.emit('error', err)
        this.updateState({
          status: 'error',
          error: `Remote forwarding failed: ${err.message}`
        })
        return
      }
    })

    this.client.on('tcp connection', (info, accept, reject) => {
      const channel = accept()
      this.activeChannels.add(channel)
      this.updateState({ connections: this.state.connections + 1 })

      const localSocket = net.createConnection(
        {
          host: this.config.localHost,
          port: this.config.localPort
        },
        () => {
          this.activeSockets.add(localSocket)
          this.pipeWithTracking(localSocket, channel)
        }
      )

      const cleanup = (): void => {
        localSocket.destroy()
        channel.close()
        this.activeSockets.delete(localSocket)
        this.activeChannels.delete(channel)
        this.updateState({ connections: Math.max(0, this.state.connections - 1) })
      }

      localSocket.on('error', cleanup)
      localSocket.on('close', cleanup)
      channel.on('error', cleanup)
      channel.on('close', cleanup)
    })
  }

  private pipeWithTracking(socket: net.Socket, channel: ClientChannel | Channel): void {
    socket.on('data', (data: Buffer) => {
      this.state.bytesOut += data.length
      this.state.lastActive = Date.now()
    })

    channel.on('data', (data: Buffer) => {
      this.state.bytesIn += data.length
      this.state.lastActive = Date.now()
    })

    socket.pipe(channel)
    channel.pipe(socket)
  }

  private startRateCalculation(): void {
    this.stopRateCalculation()
    this.prevBytesIn = this.state.bytesIn
    this.prevBytesOut = this.state.bytesOut

    this.rateTimer = setInterval(() => {
      const rateIn = this.state.bytesIn - this.prevBytesIn
      const rateOut = this.state.bytesOut - this.prevBytesOut
      this.prevBytesIn = this.state.bytesIn
      this.prevBytesOut = this.state.bytesOut
      this.updateState({ rateIn, rateOut })
    }, RATE_CALC_INTERVAL)
  }

  private stopRateCalculation(): void {
    if (this.rateTimer) {
      clearInterval(this.rateTimer)
      this.rateTimer = null
    }
  }

  private handleDisconnect(): void {
    this.closeLocalResources()
    this.stopRateCalculation()

    if (
      !this.stopping &&
      this.config.autoReconnect &&
      this.state.status !== 'reconnecting'
    ) {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.stopping) return

    this.updateState({ status: 'reconnecting' })
    this.reconnectAttempts++

    const delay = Math.min(
      Math.pow(2, this.reconnectAttempts - 1) * 1000,
      MAX_RECONNECT_DELAY
    )

    this.reconnectTimer = setTimeout(async () => {
      if (this.stopping) return
      try {
        await this.connect()
      } catch {
        // connect() handles its own errors and will trigger handleDisconnect
      }
    }, delay)
  }

  async stop(): Promise<void> {
    this.stopping = true

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    this.stopRateCalculation()
    this.closeLocalResources()

    if (this.client) {
      this.client.removeAllListeners()
      this.client.end()
      this.client.destroy()
      this.client = null
    }

    this.updateState({
      status: 'stopped',
      error: undefined,
      rateIn: 0,
      rateOut: 0,
      connections: 0,
      connectedAt: undefined
    })
  }

  private closeLocalResources(): void {
    for (const channel of this.activeChannels) {
      try {
        channel.close()
      } catch {
        // ignore
      }
    }
    this.activeChannels.clear()

    for (const socket of this.activeSockets) {
      try {
        socket.destroy()
      } catch {
        // ignore
      }
    }
    this.activeSockets.clear()

    if (this.server) {
      this.server.close()
      this.server = null
    }
  }

  updateConfig(config: TunnelConfig): void {
    this.config = config
  }
}
