import { useState } from 'react'
import CopyButton from '../../../components/common/CopyButton'
import { Lock, Unlock, RefreshCw } from 'lucide-react'

type AesMode = 'AES-128-CBC' | 'AES-256-CBC' | 'AES-128-GCM' | 'AES-256-GCM'

interface ModeConfig {
  label: string
  keyBits: number
  algorithm: 'AES-CBC' | 'AES-GCM'
  ivBytes: number
}

const MODE_CONFIG: Record<AesMode, ModeConfig> = {
  'AES-128-CBC': { label: 'AES-128-CBC', keyBits: 128, algorithm: 'AES-CBC', ivBytes: 16 },
  'AES-256-CBC': { label: 'AES-256-CBC', keyBits: 256, algorithm: 'AES-CBC', ivBytes: 16 },
  'AES-128-GCM': { label: 'AES-128-GCM', keyBits: 128, algorithm: 'AES-GCM', ivBytes: 12 },
  'AES-256-GCM': { label: 'AES-256-GCM', keyBits: 256, algorithm: 'AES-GCM', ivBytes: 12 }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function deriveKey(password: string, keyBits: number): Promise<Uint8Array> {
  const data = new TextEncoder().encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return new Uint8Array(hash).slice(0, keyBits / 8)
}

function generateIV(length: number): Uint8Array {
  const iv = new Uint8Array(length)
  crypto.getRandomValues(iv)
  return iv
}

const inputClass =
  'w-full rounded-lg border border-surface-600 bg-surface-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'text-xs text-slate-400 mb-1 block'

export default function SymmetricTool() {
  const [mode, setMode] = useState<AesMode>('AES-256-GCM')
  const [keyInput, setKeyInput] = useState('')
  const [keyFormat, setKeyFormat] = useState<'text' | 'hex'>('text')
  const [ivHex, setIvHex] = useState('')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)

  const config = MODE_CONFIG[mode]

  const getKeyBytes = async (): Promise<Uint8Array> => {
    if (keyFormat === 'hex') {
      const cleaned = keyInput.replace(/\s/g, '')
      if (cleaned.length !== (config.keyBits / 4)) {
        throw new Error(`Hex key must be ${config.keyBits / 4} hex characters (${config.keyBits / 8} bytes) for ${mode}`)
      }
      return hexToBytes(cleaned)
    }
    return deriveKey(keyInput, config.keyBits)
  }

  const importKey = async (rawKey: Uint8Array): Promise<CryptoKey> => {
    return crypto.subtle.importKey('raw', rawKey, { name: config.algorithm }, false, [
      'encrypt',
      'decrypt'
    ])
  }

  const handleEncrypt = async () => {
    setError('')
    setProcessing(true)
    try {
      if (!keyInput) throw new Error('Key is required')
      if (!input) throw new Error('Plaintext is required')

      const rawKey = await getKeyBytes()
      const key = await importKey(rawKey)
      const iv = generateIV(config.ivBytes)
      setIvHex(bytesToHex(iv))

      const plainBytes = new TextEncoder().encode(input)
      const algoParams =
        config.algorithm === 'AES-GCM'
          ? { name: 'AES-GCM', iv }
          : { name: 'AES-CBC', iv }

      const cipherBuffer = await crypto.subtle.encrypt(algoParams, key, plainBytes)
      setOutput(bytesToHex(new Uint8Array(cipherBuffer)))
    } catch (e: any) {
      setError(e.message || 'Encryption failed')
      setOutput('')
    } finally {
      setProcessing(false)
    }
  }

  const handleDecrypt = async () => {
    setError('')
    setProcessing(true)
    try {
      if (!keyInput) throw new Error('Key is required')
      if (!input) throw new Error('Ciphertext is required')
      if (!ivHex) throw new Error('IV is required for decryption')

      const rawKey = await getKeyBytes()
      const key = await importKey(rawKey)
      const iv = hexToBytes(ivHex.replace(/\s/g, ''))
      const cipherBytes = hexToBytes(input.replace(/\s/g, ''))

      const algoParams =
        config.algorithm === 'AES-GCM'
          ? { name: 'AES-GCM', iv }
          : { name: 'AES-CBC', iv }

      const plainBuffer = await crypto.subtle.decrypt(algoParams, key, cipherBytes)
      setOutput(new TextDecoder().decode(plainBuffer))
    } catch (e: any) {
      setError(e.message || 'Decryption failed')
      setOutput('')
    } finally {
      setProcessing(false)
    }
  }

  const handleGenerateIV = () => {
    setIvHex(bytesToHex(generateIV(config.ivBytes)))
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Mode selector */}
      <div>
        <label className={labelClass}>AES Mode</label>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(MODE_CONFIG) as AesMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === m
                  ? 'bg-blue-600 text-white'
                  : 'bg-surface-700 text-slate-300 hover:bg-surface-600'
              }`}
            >
              {MODE_CONFIG[m].label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          Key: {config.keyBits / 8} bytes ({config.keyBits} bits) &middot; IV: {config.ivBytes} bytes
        </p>
      </div>

      {/* Key input */}
      <div>
        <div className="flex items-center justify-between">
          <label className={labelClass}>Key</label>
          <div className="flex gap-1 mb-1">
            <button
              onClick={() => setKeyFormat('text')}
              className={`rounded px-2 py-0.5 text-xs transition-colors ${
                keyFormat === 'text'
                  ? 'bg-blue-600 text-white'
                  : 'bg-surface-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              Text (SHA-256 derived)
            </button>
            <button
              onClick={() => setKeyFormat('hex')}
              className={`rounded px-2 py-0.5 text-xs transition-colors ${
                keyFormat === 'hex'
                  ? 'bg-blue-600 text-white'
                  : 'bg-surface-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              Hex
            </button>
          </div>
        </div>
        <input
          type="text"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder={
            keyFormat === 'text'
              ? 'Enter password (will be SHA-256 hashed to derive key)...'
              : `Enter ${config.keyBits / 4} hex characters...`
          }
          className={`${inputClass} font-mono text-xs`}
        />
      </div>

      {/* IV */}
      <div>
        <div className="flex items-center justify-between">
          <label className={labelClass}>IV (Initialization Vector)</label>
          <button
            onClick={handleGenerateIV}
            className="mb-1 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-slate-400 transition-colors hover:bg-surface-700 hover:text-slate-200"
          >
            <RefreshCw className="h-3 w-3" />
            Generate
          </button>
        </div>
        <input
          type="text"
          value={ivHex}
          onChange={(e) => setIvHex(e.target.value)}
          placeholder={`${config.ivBytes * 2} hex characters (auto-generated on encrypt)...`}
          className={`${inputClass} font-mono text-xs`}
        />
      </div>

      {/* Input text */}
      <div>
        <label className={labelClass}>Input (plaintext for encrypt, hex ciphertext for decrypt)</label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter text..."
          rows={5}
          className={`${inputClass} resize-y font-mono text-xs`}
        />
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleEncrypt}
          disabled={processing}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          <Lock className="h-4 w-4" />
          Encrypt
        </button>
        <button
          onClick={handleDecrypt}
          disabled={processing}
          className="inline-flex items-center gap-2 rounded-lg bg-surface-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-surface-600 disabled:opacity-50"
        >
          <Unlock className="h-4 w-4" />
          Decrypt
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-2 text-xs text-red-400">{error}</p>
      )}

      {/* Output */}
      {output && (
        <div className="rounded-lg bg-surface-800 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-200">Output</span>
            <CopyButton text={output} />
          </div>
          <pre className="whitespace-pre-wrap break-all font-mono text-xs text-slate-100">
            {output}
          </pre>
        </div>
      )}
    </div>
  )
}
