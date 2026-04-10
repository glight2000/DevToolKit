import { Client } from 'ssh2'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { TunnelConfig } from '../../tunnel/types'

const PUB_KEY_NAMES = [
  'id_ed25519.pub',
  'id_rsa.pub',
  'id_ecdsa.pub',
  'id_dsa.pub'
]

/**
 * Find the first available local public key.
 * If customPath is provided and valid, use that; otherwise scan ~/.ssh/.
 */
export function findLocalPubKey(customPath?: string): { path: string; content: string } | null {
  // Try custom path first
  if (customPath && existsSync(customPath)) {
    try {
      const content = readFileSync(customPath, 'utf-8').trim()
      if (content) return { path: customPath, content }
    } catch {
      // fall through
    }
  }

  // Scan ~/.ssh/
  const sshDir = join(homedir(), '.ssh')
  if (!existsSync(sshDir)) return null

  for (const name of PUB_KEY_NAMES) {
    const fullPath = join(sshDir, name)
    if (existsSync(fullPath)) {
      try {
        const content = readFileSync(fullPath, 'utf-8').trim()
        if (content) return { path: fullPath, content }
      } catch {
        continue
      }
    }
  }

  return null
}

/**
 * List all available local public keys.
 */
export function listLocalPubKeys(): { path: string; name: string }[] {
  const sshDir = join(homedir(), '.ssh')
  if (!existsSync(sshDir)) return []

  const results: { path: string; name: string }[] = []
  try {
    const files = readdirSync(sshDir)
    for (const file of files) {
      if (file.endsWith('.pub')) {
        results.push({ path: join(sshDir, file), name: file })
      }
    }
  } catch {
    // ignore
  }
  return results
}

/**
 * Connect to a remote host via ssh2 and execute a command.
 * Returns stdout as a string.
 */
function execRemote(config: TunnelConfig, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = new Client()
    let stdout = ''

    const connectOpts: Record<string, unknown> = {
      host: config.sshHost,
      port: config.sshPort,
      username: config.username,
      readyTimeout: 15_000
    }

    if (config.authType === 'password') {
      connectOpts.password = config.password
    } else if (config.authType === 'privateKey' && config.privateKeyPath) {
      try {
        connectOpts.privateKey = readFileSync(config.privateKeyPath, 'utf-8')
        if (config.passphrase) connectOpts.passphrase = config.passphrase
      } catch (err) {
        reject(new Error(`Cannot read private key: ${err}`))
        return
      }
    }

    client.on('ready', () => {
      client.exec(command, (err, stream) => {
        if (err) {
          client.end()
          reject(err)
          return
        }
        stream.on('data', (data: Buffer) => {
          stdout += data.toString()
        })
        stream.stderr.on('data', () => {
          // ignore stderr
        })
        stream.on('close', () => {
          client.end()
          resolve(stdout)
        })
      })
    })

    client.on('error', (err) => {
      reject(err)
    })

    client.connect(connectOpts as Parameters<Client['connect']>[0])
  })
}

/**
 * Check if any of the local public keys are present in the remote
 * host's ~/.ssh/authorized_keys.
 */
export async function checkPubKeyInstalled(
  config: TunnelConfig,
  customPubKeyPath?: string
): Promise<{ installed: boolean; localKeyPath: string | null; localKeyContent: string | null }> {
  const localKey = findLocalPubKey(customPubKeyPath)
  if (!localKey) {
    return { installed: false, localKeyPath: null, localKeyContent: null }
  }

  // The key "signature" is the type + base64 part (ignoring the comment at the end).
  // e.g. "ssh-ed25519 AAAAC3Nza..." — we match on the first two tokens.
  const keyParts = localKey.content.split(/\s+/)
  const keySignature = keyParts.length >= 2 ? `${keyParts[0]} ${keyParts[1]}` : localKey.content

  try {
    const remoteKeys = await execRemote(config, 'cat ~/.ssh/authorized_keys 2>/dev/null || echo ""')
    const installed = remoteKeys.includes(keySignature)
    return { installed, localKeyPath: localKey.path, localKeyContent: localKey.content }
  } catch {
    // Connection failed — can't determine
    return { installed: false, localKeyPath: localKey.path, localKeyContent: localKey.content }
  }
}

/**
 * Deploy a local public key to the remote host's authorized_keys.
 */
export async function deployPubKey(
  config: TunnelConfig,
  pubKeyContent: string
): Promise<{ success: boolean; error?: string }> {
  // Sanitize: ensure single line, no shell injection
  const sanitized = pubKeyContent.replace(/[\r\n]+/g, '').trim()
  if (!sanitized || !sanitized.startsWith('ssh-')) {
    return { success: false, error: 'Invalid public key format' }
  }

  // Escape single quotes for shell safety
  const escaped = sanitized.replace(/'/g, "'\\''")

  const command = [
    'mkdir -p ~/.ssh',
    'chmod 700 ~/.ssh',
    `echo '${escaped}' >> ~/.ssh/authorized_keys`,
    'chmod 600 ~/.ssh/authorized_keys',
    'echo "OK"'
  ].join(' && ')

  try {
    const result = await execRemote(config, command)
    if (result.trim().includes('OK')) {
      return { success: true }
    }
    return { success: false, error: 'Unexpected remote output' }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Remove a local public key from the remote host's authorized_keys.
 * Uses grep -v to filter out lines containing the key signature.
 */
export async function removePubKey(
  config: TunnelConfig,
  pubKeyContent: string
): Promise<{ success: boolean; error?: string }> {
  const sanitized = pubKeyContent.replace(/[\r\n]+/g, '').trim()
  if (!sanitized || !sanitized.startsWith('ssh-')) {
    return { success: false, error: 'Invalid public key format' }
  }

  // Extract the base64 portion (second token) — unique enough for matching
  const parts = sanitized.split(/\s+/)
  if (parts.length < 2) {
    return { success: false, error: 'Invalid public key format' }
  }
  const keyBase64 = parts[1].replace(/[/+]/g, '\\$&') // escape regex-special chars for grep

  // grep -v removes matching lines, write back atomically via temp file
  const command = [
    `grep -v '${keyBase64}' ~/.ssh/authorized_keys > ~/.ssh/authorized_keys.tmp 2>/dev/null || true`,
    'mv ~/.ssh/authorized_keys.tmp ~/.ssh/authorized_keys',
    'chmod 600 ~/.ssh/authorized_keys',
    'echo "OK"'
  ].join(' && ')

  try {
    const result = await execRemote(config, command)
    if (result.trim().includes('OK')) {
      return { success: true }
    }
    return { success: false, error: 'Unexpected remote output' }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
