import { useState, useMemo } from 'react'
import CopyButton from '../../../components/common/CopyButton'
import { ArrowDown, ArrowUp, Clock } from 'lucide-react'

const inputClass =
  'w-full rounded-lg border border-surface-600 bg-surface-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'text-xs text-slate-400 mb-1 block'
const primaryBtn =
  'bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-4 py-2 text-sm transition-colors'
const sectionHeader = 'text-sm font-medium text-slate-300 mb-3'

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0')
}

function formatLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

function getRelativeTime(d: Date): string {
  const now = Date.now()
  const diffMs = now - d.getTime()
  const absDiff = Math.abs(diffMs)
  const isFuture = diffMs < 0

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

  if (absDiff < 60_000) {
    const secs = Math.round(absDiff / 1000)
    return rtf.format(isFuture ? secs : -secs, 'second')
  }
  if (absDiff < 3_600_000) {
    const mins = Math.round(absDiff / 60_000)
    return rtf.format(isFuture ? mins : -mins, 'minute')
  }
  if (absDiff < 86_400_000) {
    const hrs = Math.round(absDiff / 3_600_000)
    return rtf.format(isFuture ? hrs : -hrs, 'hour')
  }
  if (absDiff < 2_592_000_000) {
    const days = Math.round(absDiff / 86_400_000)
    return rtf.format(isFuture ? days : -days, 'day')
  }
  if (absDiff < 31_536_000_000) {
    const months = Math.round(absDiff / 2_592_000_000)
    return rtf.format(isFuture ? months : -months, 'month')
  }
  const years = Math.round(absDiff / 31_536_000_000)
  return rtf.format(isFuture ? years : -years, 'year')
}

function toDatetimeLocalValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export default function TimestampConverter() {
  // Timestamp -> Date state
  const [tsInput, setTsInput] = useState('')

  // Date -> Timestamp state
  const [dtInput, setDtInput] = useState('')

  // --- Timestamp to Date ---
  const tsResult = useMemo(() => {
    const num = Number(tsInput)
    if (!tsInput.trim() || isNaN(num) || num < 0) return null

    const isSeconds = num < 1e12
    const ms = isSeconds ? num * 1000 : num
    const d = new Date(ms)

    if (isNaN(d.getTime())) return null

    return {
      unit: isSeconds ? 'seconds' : 'milliseconds',
      local: formatLocal(d),
      utc: formatUTC(d),
      iso: d.toISOString(),
      relative: getRelativeTime(d)
    }
  }, [tsInput])

  // --- Date to Timestamp ---
  const dtResult = useMemo(() => {
    if (!dtInput.trim()) return null

    // Try parsing datetime-local value (YYYY-MM-DDTHH:mm:ss or YYYY-MM-DDTHH:mm)
    // or manual format (YYYY-MM-DD HH:mm:ss)
    const normalized = dtInput.replace(' ', 'T')
    const d = new Date(normalized)

    if (isNaN(d.getTime())) return null

    return {
      seconds: String(Math.floor(d.getTime() / 1000)),
      milliseconds: String(d.getTime())
    }
  }, [dtInput])

  const handleNowTimestamp = () => {
    setTsInput(String(Math.floor(Date.now() / 1000)))
  }

  const handleNowDatetime = () => {
    setDtInput(toDatetimeLocalValue(new Date()))
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Timestamp -> Date */}
      <div className="rounded-lg bg-surface-800 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ArrowDown className="h-4 w-4 text-blue-400" />
          <h3 className={sectionHeader + ' mb-0'}>Timestamp to Date</h3>
        </div>

        <div>
          <label className={labelClass}>Unix Timestamp</label>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={tsInput}
              onChange={(e) => setTsInput(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="e.g. 1710489000"
              className={`${inputClass} flex-1 font-mono`}
            />
            <button onClick={handleNowTimestamp} className={primaryBtn}>
              <Clock className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
              Now
            </button>
          </div>
        </div>

        {tsResult && (
          <div className="space-y-2 rounded-lg bg-surface-700/50 p-4">
            <div className="text-xs text-blue-400 mb-2">
              Detected as <span className="font-medium">{tsResult.unit}</span>
            </div>
            {[
              { label: 'Local Time', value: tsResult.local },
              { label: 'UTC Time', value: tsResult.utc },
              { label: 'ISO 8601', value: tsResult.iso },
              { label: 'Relative', value: tsResult.relative }
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-xs text-slate-400">{row.label}: </span>
                  <span className="font-mono text-sm text-slate-100">{row.value}</span>
                </div>
                <CopyButton text={row.value} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Date -> Timestamp */}
      <div className="rounded-lg bg-surface-800 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ArrowUp className="h-4 w-4 text-blue-400" />
          <h3 className={sectionHeader + ' mb-0'}>Date to Timestamp</h3>
        </div>

        <div>
          <label className={labelClass}>Date & Time</label>
          <div className="flex gap-2">
            <input
              type="datetime-local"
              step="1"
              value={dtInput}
              onChange={(e) => setDtInput(e.target.value)}
              className={`${inputClass} flex-1 [color-scheme:dark]`}
            />
            <button onClick={handleNowDatetime} className={primaryBtn}>
              <Clock className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
              Now
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Or type manually: YYYY-MM-DD HH:mm:ss
          </p>
        </div>

        {dtResult && (
          <div className="space-y-2 rounded-lg bg-surface-700/50 p-4">
            {[
              { label: 'Seconds', value: dtResult.seconds },
              { label: 'Milliseconds', value: dtResult.milliseconds }
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-xs text-slate-400">{row.label}: </span>
                  <span className="font-mono text-sm text-slate-100">{row.value}</span>
                </div>
                <CopyButton text={row.value} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
