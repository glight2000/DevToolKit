/**
 * Client-side crypto utilities for Notebook document encryption.
 * Uses Web Crypto API — PBKDF2 key derivation + AES-GCM encryption.
 */

const PBKDF2_ITERATIONS = 100000
const SALT_LENGTH = 16
const IV_LENGTH = 12

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}

/**
 * SHA-256 hash the password (hex string) — used for password verification.
 */
export async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder()
  const data = enc.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return bufferToHex(hash)
}

/**
 * Verify a plaintext password against a stored SHA-256 hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const computed = await hashPassword(password)
  return computed === hash
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypt plaintext with a password.
 * Returns a string formatted as "v1:salt:iv:ciphertext" (all hex).
 */
export async function encryptWithPassword(plaintext: string, password: string): Promise<string> {
  if (!plaintext) return ''
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const key = await deriveKey(password, salt)
  const enc = new TextEncoder()
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  )
  return `v1:${bufferToHex(salt.buffer)}:${bufferToHex(iv.buffer)}:${bufferToHex(ciphertext)}`
}

/**
 * Decrypt ciphertext with a password.
 * Returns the plaintext string, or throws on wrong password / corrupted data.
 */
export async function decryptWithPassword(ciphertext: string, password: string): Promise<string> {
  if (!ciphertext) return ''
  const parts = ciphertext.split(':')
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Invalid ciphertext format')
  }
  const salt = hexToBuffer(parts[1])
  const iv = hexToBuffer(parts[2])
  const data = hexToBuffer(parts[3])
  const key = await deriveKey(password, salt)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new TextDecoder().decode(decrypted)
}

/**
 * Check if content looks like an encrypted payload (v1 format).
 */
export function isEncryptedPayload(content: string): boolean {
  return typeof content === 'string' && content.startsWith('v1:') && content.split(':').length === 4
}
