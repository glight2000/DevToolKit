import { useState, useEffect, useCallback } from 'react'
import CopyButton from '../../../components/common/CopyButton'
import { ArrowRightLeft, Trash2 } from 'lucide-react'

type EncodingType = 'html' | 'url' | 'base64' | 'base64url' | 'unicode'

const ENCODING_OPTIONS: { key: EncodingType; label: string }[] = [
  { key: 'html', label: 'HTML Entity' },
  { key: 'url', label: 'URL Encode' },
  { key: 'base64', label: 'Base64' },
  { key: 'base64url', label: 'Base64 URL-safe' },
  { key: 'unicode', label: 'Unicode Escape' }
]

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}
const HTML_ENTITIES_REV: Record<string, string> = Object.fromEntries(
  Object.entries(HTML_ENTITIES).map(([k, v]) => [v, k])
)

function encode(type: EncodingType, input: string): string {
  try {
    switch (type) {
      case 'html':
        return input.replace(/[&<>"']/g, (ch) => HTML_ENTITIES[ch] ?? ch)
      case 'url':
        return encodeURIComponent(input)
      case 'base64':
        return btoa(unescape(encodeURIComponent(input)))
      case 'base64url': {
        const b64 = btoa(unescape(encodeURIComponent(input)))
        return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      }
      case 'unicode':
        return input
          .split('')
          .map((ch) => {
            const code = ch.charCodeAt(0)
            return code > 127 ? `\\u${code.toString(16).padStart(4, '0')}` : ch
          })
          .join('')
      default:
        return input
    }
  } catch {
    return '[Encoding error]'
  }
}

function decode(type: EncodingType, input: string): string {
  try {
    switch (type) {
      case 'html':
        return input.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, (ent) => HTML_ENTITIES_REV[ent] ?? ent)
      case 'url':
        return decodeURIComponent(input)
      case 'base64':
        return decodeURIComponent(escape(atob(input)))
      case 'base64url': {
        let b64 = input.replace(/-/g, '+').replace(/_/g, '/')
        while (b64.length % 4 !== 0) b64 += '='
        return decodeURIComponent(escape(atob(b64)))
      }
      case 'unicode':
        return input.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
          String.fromCharCode(parseInt(hex, 16))
        )
      default:
        return input
    }
  } catch {
    return '[Decoding error]'
  }
}

const inputClass =
  'w-full rounded-lg border border-surface-600 bg-surface-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono'
const labelClass = 'text-xs text-slate-400 mb-1 block'

export default function EncodingTool() {
  const [encodingType, setEncodingType] = useState<EncodingType>('html')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [autoEncode, setAutoEncode] = useState(true)
  const [direction, setDirection] = useState<'encode' | 'decode'>('encode')

  const doTransform = useCallback(
    (text: string, dir: 'encode' | 'decode') => {
      if (!text) {
        setOutput('')
        return
      }
      setOutput(dir === 'encode' ? encode(encodingType, text) : decode(encodingType, text))
    },
    [encodingType]
  )

  useEffect(() => {
    if (autoEncode) {
      doTransform(input, direction)
    }
  }, [input, encodingType, direction, autoEncode, doTransform])

  const handleManualTransform = (dir: 'encode' | 'decode') => {
    setDirection(dir)
    doTransform(input, dir)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Encoding type selector */}
      <div>
        <label className={labelClass}>Encoding Type</label>
        <div className="flex flex-wrap gap-2">
          {ENCODING_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setEncodingType(opt.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                encodingType === opt.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-surface-700 text-slate-300 hover:bg-surface-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Options row */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={autoEncode}
            onChange={() => setAutoEncode(!autoEncode)}
            className="rounded border-surface-600 bg-surface-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
          />
          Auto-transform on input change
        </label>
      </div>

      {/* Input / Output */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label className={labelClass}>Input</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter text to encode or decode..."
            rows={10}
            className={`${inputClass} resize-y`}
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className={labelClass}>Output</label>
            <CopyButton text={output} className="mb-1" />
          </div>
          <textarea
            value={output}
            readOnly
            rows={10}
            className={`${inputClass} resize-y cursor-default`}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => handleManualTransform('encode')}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        >
          <ArrowRightLeft className="h-4 w-4" />
          Encode
        </button>
        <button
          onClick={() => handleManualTransform('decode')}
          className="inline-flex items-center gap-2 rounded-lg bg-surface-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-surface-600"
        >
          <ArrowRightLeft className="h-4 w-4 rotate-180" />
          Decode
        </button>
        <button
          onClick={() => {
            setInput('')
            setOutput('')
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-surface-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-surface-600"
        >
          <Trash2 className="h-4 w-4" />
          Clear
        </button>
      </div>
    </div>
  )
}
