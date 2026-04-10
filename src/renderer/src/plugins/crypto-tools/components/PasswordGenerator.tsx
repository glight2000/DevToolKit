import { useState, useCallback, useMemo } from 'react'
import CopyButton from '../../../components/common/CopyButton'
import { RefreshCw, Clipboard } from 'lucide-react'

const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz'
const DIGITS = '0123456789'
const SPECIAL = '!@#$%^&*()_+-=[]{}|;:,.<>?'
const AMBIGUOUS = '0O1lI'

interface CharSetOption {
  key: string
  label: string
  chars: string
  default: boolean
}

const CHARSETS: CharSetOption[] = [
  { key: 'upper', label: 'Uppercase (A-Z)', chars: UPPERCASE, default: true },
  { key: 'lower', label: 'Lowercase (a-z)', chars: LOWERCASE, default: true },
  { key: 'digits', label: 'Digits (0-9)', chars: DIGITS, default: true },
  { key: 'special', label: 'Special (!@#$%...)', chars: SPECIAL, default: false }
]

function getStrengthInfo(password: string): { label: string; color: string; percent: number } {
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (password.length >= 20) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password)) score++
  if (password.length >= 32) score++

  if (score <= 1) return { label: 'Very Weak', color: 'bg-red-500', percent: 20 }
  if (score <= 2) return { label: 'Weak', color: 'bg-orange-500', percent: 40 }
  if (score <= 3) return { label: 'Fair', color: 'bg-yellow-500', percent: 60 }
  if (score <= 5) return { label: 'Strong', color: 'bg-green-500', percent: 80 }
  return { label: 'Very Strong', color: 'bg-emerald-400', percent: 100 }
}

function generateSecureRandom(max: number): number {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return array[0] % max
}

const inputClass =
  'rounded-lg border border-surface-600 bg-surface-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'text-xs text-slate-400 mb-1 block'

export default function PasswordGenerator() {
  const [length, setLength] = useState(16)
  const [count, setCount] = useState(5)
  const [enabledSets, setEnabledSets] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CHARSETS.map((c) => [c.key, c.default]))
  )
  const [customChars, setCustomChars] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(false)
  const [passwords, setPasswords] = useState<string[]>([])

  const charset = useMemo(() => {
    let chars = ''
    for (const cs of CHARSETS) {
      if (enabledSets[cs.key]) chars += cs.chars
    }
    if (useCustom && customChars) chars += customChars
    if (excludeAmbiguous) {
      chars = chars
        .split('')
        .filter((c) => !AMBIGUOUS.includes(c))
        .join('')
    }
    // deduplicate
    return [...new Set(chars.split(''))].join('')
  }, [enabledSets, useCustom, customChars, excludeAmbiguous])

  const generate = useCallback(() => {
    if (!charset) return
    const results: string[] = []
    for (let i = 0; i < count; i++) {
      let pw = ''
      for (let j = 0; j < length; j++) {
        pw += charset[generateSecureRandom(charset.length)]
      }
      results.push(pw)
    }
    setPasswords(results)
  }, [charset, count, length])

  const toggleCharset = (key: string) => {
    setEnabledSets((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const allPasswordsText = passwords.join('\n')
  const firstPassword = passwords[0] ?? ''
  const strength = firstPassword ? getStrengthInfo(firstPassword) : null

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Length */}
      <div>
        <label className={labelClass}>
          Password Length: <span className="text-slate-200 font-medium">{length}</span>
        </label>
        <input
          type="range"
          min={8}
          max={128}
          value={length}
          onChange={(e) => setLength(Number(e.target.value))}
          className="w-full accent-blue-500"
        />
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>8</span>
          <span>128</span>
        </div>
      </div>

      {/* Character sets */}
      <div>
        <label className={labelClass}>Character Sets</label>
        <div className="space-y-2">
          {CHARSETS.map((cs) => (
            <label key={cs.key} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={enabledSets[cs.key]}
                onChange={() => toggleCharset(cs.key)}
                className="rounded border-surface-600 bg-surface-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
              />
              {cs.label}
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={useCustom}
              onChange={() => setUseCustom(!useCustom)}
              className="rounded border-surface-600 bg-surface-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
            />
            Custom Characters
          </label>
          {useCustom && (
            <input
              type="text"
              value={customChars}
              onChange={(e) => setCustomChars(e.target.value)}
              placeholder="Enter custom characters..."
              className={`${inputClass} ml-6 w-64`}
            />
          )}
        </div>
      </div>

      {/* Exclude ambiguous */}
      <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
        <input
          type="checkbox"
          checked={excludeAmbiguous}
          onChange={() => setExcludeAmbiguous(!excludeAmbiguous)}
          className="rounded border-surface-600 bg-surface-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
        />
        Exclude ambiguous characters (0, O, 1, l, I)
      </label>

      {/* Generate count + button */}
      <div className="flex items-end gap-4">
        <div>
          <label className={labelClass}>Generate Count</label>
          <input
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value))))}
            className={`${inputClass} w-24`}
          />
        </div>
        <button
          onClick={generate}
          disabled={!charset}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className="h-4 w-4" />
          Generate
        </button>
      </div>

      {!charset && (
        <p className="text-xs text-red-400">Select at least one character set.</p>
      )}

      {/* Strength indicator */}
      {strength && (
        <div className="rounded-lg bg-surface-800 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-slate-400">Password Strength</span>
            <span className="text-xs font-medium text-slate-200">{strength.label}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-surface-700">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${strength.color}`}
              style={{ width: `${strength.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Results */}
      {passwords.length > 0 && (
        <div className="rounded-lg bg-surface-800 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-200">Generated Passwords</span>
            <button
              onClick={() => navigator.clipboard.writeText(allPasswordsText)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-surface-600"
            >
              <Clipboard className="h-3.5 w-3.5" />
              Copy All
            </button>
          </div>
          <div className="space-y-2">
            {passwords.map((pw, i) => (
              <div key={i} className="flex items-center gap-2">
                <code className="flex-1 rounded-lg border border-surface-600 bg-surface-700 px-3 py-2 font-mono text-xs text-slate-100 select-all overflow-x-auto">
                  {pw}
                </code>
                <CopyButton text={pw} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
