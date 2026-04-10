import type { TunnelConfig, TunnelType } from '../../../types'

export interface ParsedSSHCommand {
  type: TunnelType
  sshHost: string
  sshPort: number
  username: string
  authType: 'password' | 'privateKey'
  privateKeyPath?: string
  localHost: string
  localPort: number
  remoteHost: string
  remotePort: number
}

/**
 * Parse an SSH command line into tunnel config fields.
 *
 * Supported formats:
 *   ssh -L [bind:]port:host:port [user@]host [-p port] [-i key]
 *   ssh -R [bind:]port:host:port [user@]host [-p port] [-i key]
 *   ssh -D [bind:]port [user@]host [-p port] [-i key]
 *
 * Flags like -N, -f, -o, -C, -q, -v, -T are silently ignored.
 */
export function parseSSHCommand(raw: string): ParsedSSHCommand {
  const input = raw.trim()
  // Tokenize respecting basic quoting
  const tokens = tokenize(input)

  if (tokens.length === 0) {
    throw new Error('Empty command')
  }

  // Strip leading "ssh" if present
  let idx = 0
  if (tokens[idx].toLowerCase() === 'ssh') {
    idx++
  }

  let sshPort = 22
  let username = ''
  let sshHost = ''
  let identityFile = ''
  let tunnelType: TunnelType | null = null
  let localHost = '127.0.0.1'
  let localPort = 0
  let remoteHost = '127.0.0.1'
  let remotePort = 0

  // Flags that take a value argument (consume next token)
  const valuedFlags = new Set(['-p', '-i', '-o', '-l', '-L', '-R', '-D', '-J', '-W', '-b', '-c', '-e', '-m', '-S', '-w', '-E', '-F'])
  // Flags that are standalone (no value)
  const standaloneFlags = new Set(['-N', '-f', '-n', '-T', '-t', '-C', '-q', '-v', '-g', '-A', '-a', '-X', '-x', '-Y', '-K', '-k', '-4', '-6', '-s'])

  while (idx < tokens.length) {
    const token = tokens[idx]

    if (token === '-p' && idx + 1 < tokens.length) {
      idx++
      sshPort = parseInt(tokens[idx], 10)
      if (isNaN(sshPort) || sshPort < 1 || sshPort > 65535) {
        throw new Error(`Invalid SSH port: ${tokens[idx]}`)
      }
    } else if (token === '-i' && idx + 1 < tokens.length) {
      idx++
      identityFile = tokens[idx]
    } else if (token === '-l' && idx + 1 < tokens.length) {
      idx++
      username = tokens[idx]
    } else if (token === '-L' && idx + 1 < tokens.length) {
      idx++
      tunnelType = 'local'
      parseForwardSpec(tokens[idx], 'local')
    } else if (token === '-R' && idx + 1 < tokens.length) {
      idx++
      tunnelType = 'remote'
      parseForwardSpec(tokens[idx], 'remote')
    } else if (token === '-D' && idx + 1 < tokens.length) {
      idx++
      tunnelType = 'dynamic'
      parseDynamicSpec(tokens[idx])
    } else if (token.startsWith('-L')) {
      // Handles -Lport:host:port (no space)
      tunnelType = 'local'
      parseForwardSpec(token.slice(2), 'local')
    } else if (token.startsWith('-R')) {
      tunnelType = 'remote'
      parseForwardSpec(token.slice(2), 'remote')
    } else if (token.startsWith('-D')) {
      tunnelType = 'dynamic'
      parseDynamicSpec(token.slice(2))
    } else if (standaloneFlags.has(token) || /^-[NfnTtCqvgAaXxYKk46s]+$/.test(token)) {
      // Combined standalone flags like -NfC, skip
    } else if (token.startsWith('-') && valuedFlags.has(token.slice(0, 2))) {
      // Unknown valued flag like -o StrictHostKeyChecking=no, skip value
      idx++
    } else if (token.startsWith('-')) {
      // Unknown flag, skip
    } else {
      // Positional: [user@]host or remote command (ignore command)
      if (!sshHost) {
        const atIdx = token.lastIndexOf('@')
        if (atIdx !== -1) {
          username = token.slice(0, atIdx)
          sshHost = token.slice(atIdx + 1)
        } else {
          sshHost = token
        }
      }
      // Anything after host is remote command, stop parsing
      if (sshHost && idx > 0) {
        // Check if next tokens look like more flags
        const next = idx + 1 < tokens.length ? tokens[idx + 1] : null
        if (next && !next.startsWith('-')) {
          break // rest is remote command
        }
      }
    }

    idx++
  }

  if (!sshHost) {
    throw new Error('No SSH host found in command')
  }
  if (!tunnelType) {
    throw new Error('No tunnel specification found (-L, -R, or -D)')
  }

  function parseForwardSpec(spec: string, type: 'local' | 'remote'): void {
    // Format: [bind_address:]port:host:hostport
    const parts = spec.split(':')
    if (parts.length === 3) {
      // port:host:hostport
      if (type === 'local') {
        localHost = '127.0.0.1'
        localPort = parseInt(parts[0], 10)
        remoteHost = parts[1]
        remotePort = parseInt(parts[2], 10)
      } else {
        remoteHost = '0.0.0.0'
        remotePort = parseInt(parts[0], 10)
        localHost = parts[1]
        localPort = parseInt(parts[2], 10)
      }
    } else if (parts.length === 4) {
      // bind_address:port:host:hostport
      if (type === 'local') {
        localHost = parts[0] || '127.0.0.1'
        localPort = parseInt(parts[1], 10)
        remoteHost = parts[2]
        remotePort = parseInt(parts[3], 10)
      } else {
        remoteHost = parts[0] || '0.0.0.0'
        remotePort = parseInt(parts[1], 10)
        localHost = parts[2]
        localPort = parseInt(parts[3], 10)
      }
    } else {
      throw new Error(`Invalid forward specification: ${spec}`)
    }

    if (isNaN(localPort) || isNaN(remotePort)) {
      throw new Error(`Invalid port in forward specification: ${spec}`)
    }
  }

  function parseDynamicSpec(spec: string): void {
    // Format: [bind_address:]port
    const colonIdx = spec.lastIndexOf(':')
    if (colonIdx !== -1) {
      localHost = spec.slice(0, colonIdx) || '127.0.0.1'
      localPort = parseInt(spec.slice(colonIdx + 1), 10)
    } else {
      localHost = '127.0.0.1'
      localPort = parseInt(spec, 10)
    }
    if (isNaN(localPort)) {
      throw new Error(`Invalid dynamic port: ${spec}`)
    }
  }

  return {
    type: tunnelType,
    sshHost,
    sshPort,
    username: username || 'root',
    authType: identityFile ? 'privateKey' : 'password',
    privateKeyPath: identityFile || undefined,
    localHost,
    localPort,
    remoteHost,
    remotePort
  }
}

/**
 * Generate an SSH command line from a tunnel config.
 */
export function generateSSHCommand(config: TunnelConfig): string {
  const parts: string[] = ['ssh']

  // Identity file
  if (config.authType === 'privateKey' && config.privateKeyPath) {
    parts.push('-i', quoteIfNeeded(config.privateKeyPath))
  }

  // Port
  if (config.sshPort !== 22) {
    parts.push('-p', String(config.sshPort))
  }

  // Tunnel spec
  switch (config.type) {
    case 'local': {
      const bind = config.localHost === '127.0.0.1' || config.localHost === 'localhost'
        ? String(config.localPort)
        : `${config.localHost}:${config.localPort}`
      parts.push('-L', `${bind}:${config.remoteHost}:${config.remotePort}`)
      break
    }
    case 'remote': {
      const bind = config.remoteHost === '0.0.0.0'
        ? String(config.remotePort)
        : `${config.remoteHost}:${config.remotePort}`
      parts.push('-R', `${bind}:${config.localHost}:${config.localPort}`)
      break
    }
    case 'dynamic': {
      const bind = config.localHost === '127.0.0.1' || config.localHost === 'localhost'
        ? String(config.localPort)
        : `${config.localHost}:${config.localPort}`
      parts.push('-D', bind)
      break
    }
  }

  // -N flag (no remote command — typical for tunnels)
  parts.push('-N')

  // user@host
  parts.push(`${config.username}@${config.sshHost}`)

  return parts.join(' ')
}

// ── Helpers ──

function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let inSingle = false
  let inDouble = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle
      continue
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble
      continue
    }
    if ((ch === ' ' || ch === '\t') && !inSingle && !inDouble) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += ch
  }

  if (current) {
    tokens.push(current)
  }

  return tokens
}

function quoteIfNeeded(s: string): string {
  if (/\s/.test(s)) {
    return `"${s.replace(/"/g, '\\"')}"`
  }
  return s
}
