import { createCipheriv, createDecipheriv, createHash, randomBytes, pbkdf2Sync } from 'crypto'
import { APP_ENCRYPTION_KEY } from './constants'

function deriveKeyFromString(key: string): Buffer {
  return createHash('sha256').update(key).digest()
}

export function encrypt(plaintext: string, key: string = APP_ENCRYPTION_KEY): string {
  if (!plaintext) return ''

  const derivedKey = deriveKeyFromString(key)
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', derivedKey, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  return `${iv.toString('hex')}:${encrypted}`
}

export function decrypt(ciphertext: string, key: string = APP_ENCRYPTION_KEY): string {
  if (!ciphertext) return ''

  const [ivHex, encryptedHex] = ciphertext.split(':')
  if (!ivHex || !encryptedHex) {
    throw new Error('Invalid ciphertext format. Expected "iv:ciphertext" in hex.')
  }

  const derivedKey = deriveKeyFromString(key)
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = createDecipheriv('aes-256-cbc', derivedKey, iv)

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

export function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

export function deriveKey(password: string, salt: string): Buffer {
  return pbkdf2Sync(password, salt, 100000, 32, 'sha256')
}

export function encryptWithPassword(plaintext: string, password: string): string {
  if (!plaintext) return ''

  const salt = randomBytes(16)
  const key = deriveKey(password, salt.toString('hex'))
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  return `${salt.toString('hex')}:${iv.toString('hex')}:${encrypted}`
}

export function decryptWithPassword(ciphertext: string, password: string): string {
  if (!ciphertext) return ''

  const parts = ciphertext.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format. Expected "salt:iv:ciphertext" in hex.')
  }

  const [saltHex, ivHex, encryptedHex] = parts
  const key = deriveKey(password, saltHex)
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = createDecipheriv('aes-256-cbc', key, iv)

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}
