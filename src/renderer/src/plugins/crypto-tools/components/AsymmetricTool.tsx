import { useState } from 'react'
import CopyButton from '../../../components/common/CopyButton'
import { Key, Lock, Unlock, FileSignature, CheckCircle, XCircle, RefreshCw } from 'lucide-react'

type SubTab = 'keygen' | 'encrypt' | 'sign'
type KeySize = 1024 | 2048 | 4096

const SUB_TABS: { key: SubTab; label: string; icon: React.ReactNode }[] = [
  { key: 'keygen', label: 'Key Generation', icon: <Key className="h-3.5 w-3.5" /> },
  { key: 'encrypt', label: 'Encrypt / Decrypt', icon: <Lock className="h-3.5 w-3.5" /> },
  { key: 'sign', label: 'Sign / Verify', icon: <FileSignature className="h-3.5 w-3.5" /> }
]

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function wrapPem(base64: string, type: 'PUBLIC KEY' | 'PRIVATE KEY'): string {
  const lines: string[] = []
  for (let i = 0; i < base64.length; i += 64) {
    lines.push(base64.substring(i, i + 64))
  }
  return `-----BEGIN ${type}-----\n${lines.join('\n')}\n-----END ${type}-----`
}

function unwrapPem(pem: string): string {
  return pem
    .replace(/-----BEGIN [A-Z ]+-----/, '')
    .replace(/-----END [A-Z ]+-----/, '')
    .replace(/\s/g, '')
}

const inputClass =
  'w-full rounded-lg border border-surface-600 bg-surface-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'text-xs text-slate-400 mb-1 block'

export default function AsymmetricTool() {
  const [subTab, setSubTab] = useState<SubTab>('keygen')

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Sub-tabs */}
      <div className="flex gap-2">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              subTab === t.key
                ? 'bg-blue-600 text-white'
                : 'bg-surface-700 text-slate-300 hover:bg-surface-600'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'keygen' && <KeyGenSection />}
      {subTab === 'encrypt' && <EncryptDecryptSection />}
      {subTab === 'sign' && <SignVerifySection />}
    </div>
  )
}

/* ============ Key Generation ============ */
function KeyGenSection() {
  const [keySize, setKeySize] = useState<KeySize>(2048)
  const [publicKeyPem, setPublicKeyPem] = useState('')
  const [privateKeyPem, setPrivateKeyPem] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const handleGenerate = async () => {
    setError('')
    setGenerating(true)
    try {
      // Generate RSA-OAEP key pair (can also be used for signing after re-import)
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'RSA-OAEP',
          modulusLength: keySize,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256'
        },
        true,
        ['encrypt', 'decrypt']
      )

      const pubRaw = await crypto.subtle.exportKey('spki', keyPair.publicKey)
      const privRaw = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)

      setPublicKeyPem(wrapPem(arrayBufferToBase64(pubRaw), 'PUBLIC KEY'))
      setPrivateKeyPem(wrapPem(arrayBufferToBase64(privRaw), 'PRIVATE KEY'))
    } catch (e: any) {
      setError(e.message || 'Key generation failed')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4">
        <div>
          <label className={labelClass}>Key Size</label>
          <div className="flex gap-2">
            {([1024, 2048, 4096] as KeySize[]).map((size) => (
              <button
                key={size}
                onClick={() => setKeySize(size)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  keySize === size
                    ? 'bg-blue-600 text-white'
                    : 'bg-surface-700 text-slate-300 hover:bg-surface-600'
                }`}
              >
                {size} bits
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
          {generating ? 'Generating...' : 'Generate Key Pair'}
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-2 text-xs text-red-400">{error}</p>
      )}

      {publicKeyPem && (
        <div className="rounded-lg bg-surface-800 p-4 space-y-4">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className={labelClass}>Public Key (SPKI PEM)</label>
              <CopyButton text={publicKeyPem} />
            </div>
            <textarea
              readOnly
              value={publicKeyPem}
              rows={6}
              className={`${inputClass} font-mono text-xs cursor-default resize-y`}
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className={labelClass}>Private Key (PKCS8 PEM)</label>
              <CopyButton text={privateKeyPem} />
            </div>
            <textarea
              readOnly
              value={privateKeyPem}
              rows={8}
              className={`${inputClass} font-mono text-xs cursor-default resize-y`}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/* ============ Encrypt / Decrypt ============ */
function EncryptDecryptSection() {
  const [publicKeyPem, setPublicKeyPem] = useState('')
  const [privateKeyPem, setPrivateKeyPem] = useState('')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)

  const handleEncrypt = async () => {
    setError('')
    setProcessing(true)
    try {
      if (!publicKeyPem) throw new Error('Public key is required for encryption')
      if (!input) throw new Error('Input text is required')

      const pubKeyData = base64ToArrayBuffer(unwrapPem(publicKeyPem))
      const pubKey = await crypto.subtle.importKey(
        'spki',
        pubKeyData,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['encrypt']
      )

      const plainBytes = new TextEncoder().encode(input)
      const cipherBuffer = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pubKey, plainBytes)
      setOutput(arrayBufferToBase64(cipherBuffer))
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
      if (!privateKeyPem) throw new Error('Private key is required for decryption')
      if (!input) throw new Error('Ciphertext is required')

      const privKeyData = base64ToArrayBuffer(unwrapPem(privateKeyPem))
      const privKey = await crypto.subtle.importKey(
        'pkcs8',
        privKeyData,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['decrypt']
      )

      const cipherBytes = base64ToArrayBuffer(input)
      const plainBuffer = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privKey, cipherBytes)
      setOutput(new TextDecoder().decode(plainBuffer))
    } catch (e: any) {
      setError(e.message || 'Decryption failed')
      setOutput('')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label className={labelClass}>Public Key (PEM) - for encryption</label>
          <textarea
            value={publicKeyPem}
            onChange={(e) => setPublicKeyPem(e.target.value)}
            placeholder="-----BEGIN PUBLIC KEY-----&#10;...&#10;-----END PUBLIC KEY-----"
            rows={5}
            className={`${inputClass} font-mono text-xs resize-y`}
          />
        </div>
        <div>
          <label className={labelClass}>Private Key (PEM) - for decryption</label>
          <textarea
            value={privateKeyPem}
            onChange={(e) => setPrivateKeyPem(e.target.value)}
            placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
            rows={5}
            className={`${inputClass} font-mono text-xs resize-y`}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Input (plaintext to encrypt, or base64 ciphertext to decrypt)</label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter text..."
          rows={4}
          className={`${inputClass} font-mono text-xs resize-y`}
        />
      </div>

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

      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-2 text-xs text-red-400">{error}</p>
      )}

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

/* ============ Sign / Verify ============ */
function SignVerifySection() {
  const [privateKeyPem, setPrivateKeyPem] = useState('')
  const [publicKeyPem, setPublicKeyPem] = useState('')
  const [message, setMessage] = useState('')
  const [signature, setSignature] = useState('')
  const [verifyResult, setVerifyResult] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)

  const handleSign = async () => {
    setError('')
    setVerifyResult(null)
    setProcessing(true)
    try {
      if (!privateKeyPem) throw new Error('Private key is required for signing')
      if (!message) throw new Error('Message is required')

      const privKeyData = base64ToArrayBuffer(unwrapPem(privateKeyPem))
      const privKey = await crypto.subtle.importKey(
        'pkcs8',
        privKeyData,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
      )

      const msgBytes = new TextEncoder().encode(message)
      const sigBuffer = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privKey, msgBytes)
      setSignature(arrayBufferToBase64(sigBuffer))
    } catch (e: any) {
      setError(e.message || 'Signing failed')
      setSignature('')
    } finally {
      setProcessing(false)
    }
  }

  const handleVerify = async () => {
    setError('')
    setVerifyResult(null)
    setProcessing(true)
    try {
      if (!publicKeyPem) throw new Error('Public key is required for verification')
      if (!message) throw new Error('Message is required')
      if (!signature) throw new Error('Signature is required')

      const pubKeyData = base64ToArrayBuffer(unwrapPem(publicKeyPem))
      const pubKey = await crypto.subtle.importKey(
        'spki',
        pubKeyData,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      )

      const msgBytes = new TextEncoder().encode(message)
      const sigBytes = base64ToArrayBuffer(signature)
      const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pubKey, sigBytes, msgBytes)
      setVerifyResult(valid)
    } catch (e: any) {
      setError(e.message || 'Verification failed')
      setVerifyResult(null)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label className={labelClass}>Private Key (PEM) - for signing</label>
          <textarea
            value={privateKeyPem}
            onChange={(e) => setPrivateKeyPem(e.target.value)}
            placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
            rows={5}
            className={`${inputClass} font-mono text-xs resize-y`}
          />
        </div>
        <div>
          <label className={labelClass}>Public Key (PEM) - for verification</label>
          <textarea
            value={publicKeyPem}
            onChange={(e) => setPublicKeyPem(e.target.value)}
            placeholder="-----BEGIN PUBLIC KEY-----&#10;...&#10;-----END PUBLIC KEY-----"
            rows={5}
            className={`${inputClass} font-mono text-xs resize-y`}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Enter message to sign or verify..."
          rows={4}
          className={`${inputClass} font-mono text-xs resize-y`}
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className={labelClass}>Signature (Base64)</label>
          {signature && <CopyButton text={signature} />}
        </div>
        <textarea
          value={signature}
          onChange={(e) => {
            setSignature(e.target.value)
            setVerifyResult(null)
          }}
          placeholder="Signature will appear here after signing, or paste one to verify..."
          rows={3}
          className={`${inputClass} font-mono text-xs resize-y`}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSign}
          disabled={processing}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          <FileSignature className="h-4 w-4" />
          Sign
        </button>
        <button
          onClick={handleVerify}
          disabled={processing}
          className="inline-flex items-center gap-2 rounded-lg bg-surface-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-surface-600 disabled:opacity-50"
        >
          <CheckCircle className="h-4 w-4" />
          Verify
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-2 text-xs text-red-400">{error}</p>
      )}

      {verifyResult !== null && (
        <div
          className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium ${
            verifyResult
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'bg-red-500/10 text-red-400'
          }`}
        >
          {verifyResult ? (
            <>
              <CheckCircle className="h-4 w-4" />
              Signature is valid
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4" />
              Signature is invalid
            </>
          )}
        </div>
      )}
    </div>
  )
}
