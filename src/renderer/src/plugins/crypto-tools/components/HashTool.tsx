import { useState, useEffect, useRef } from 'react'
import CopyButton from '../../../components/common/CopyButton'
import { Hash } from 'lucide-react'

type HashResults = {
  md5: string
  'sha-1': string
  'sha-256': string
  'sha-512': string
}

const EMPTY_HASHES: HashResults = {
  md5: '',
  'sha-1': '',
  'sha-256': '',
  'sha-512': ''
}

const HASH_LABELS: { key: keyof HashResults; label: string }[] = [
  { key: 'md5', label: 'MD5' },
  { key: 'sha-1', label: 'SHA-1' },
  { key: 'sha-256', label: 'SHA-256' },
  { key: 'sha-512', label: 'SHA-512' }
]

async function computeWebCryptoHash(algorithm: string, text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const hashBuffer = await crypto.subtle.digest(algorithm, data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

const inputClass =
  'w-full rounded-lg border border-surface-600 bg-surface-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'text-xs text-slate-400 mb-1 block'

export default function HashTool() {
  const [input, setInput] = useState('')
  const [hashes, setHashes] = useState<HashResults>(EMPTY_HASHES)
  const [uppercase, setUppercase] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!input) {
      setHashes(EMPTY_HASHES)
      return
    }

    debounceRef.current = setTimeout(async () => {
      const results: HashResults = { ...EMPTY_HASHES }

      const [md5, sha1, sha256, sha512] = await Promise.all([
        window.api.invoke('crypto:md5', input).catch(() => '[error]'),
        computeWebCryptoHash('SHA-1', input).catch(() => '[error]'),
        computeWebCryptoHash('SHA-256', input).catch(() => '[error]'),
        computeWebCryptoHash('SHA-512', input).catch(() => '[error]')
      ])

      results.md5 = md5
      results['sha-1'] = sha1
      results['sha-256'] = sha256
      results['sha-512'] = sha512

      setHashes(results)
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [input])

  const formatHash = (h: string) => (uppercase ? h.toUpperCase() : h)

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Input */}
      <div>
        <label className={labelClass}>Input Text</label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter text to hash..."
          rows={5}
          className={`${inputClass} resize-y font-mono`}
        />
      </div>

      {/* Uppercase toggle */}
      <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
        <input
          type="checkbox"
          checked={uppercase}
          onChange={() => setUppercase(!uppercase)}
          className="rounded border-surface-600 bg-surface-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
        />
        Uppercase hex output
      </label>

      {/* Hash results */}
      <div className="rounded-lg bg-surface-800 p-4 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Hash className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium text-slate-200">Hash Results</span>
        </div>
        {HASH_LABELS.map(({ key, label }) => (
          <div key={key}>
            <label className={labelClass}>{label}</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={hashes[key] ? formatHash(hashes[key]) : ''}
                placeholder="—"
                className={`${inputClass} flex-1 font-mono text-xs cursor-default`}
              />
              <CopyButton text={hashes[key] ? formatHash(hashes[key]) : ''} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
