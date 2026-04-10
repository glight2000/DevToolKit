import { useState, useMemo } from 'react'
import CopyButton from '../../../components/common/CopyButton'
import { ArrowRightLeft, Clock } from 'lucide-react'

const inputClass =
  'w-full rounded-lg border border-surface-600 bg-surface-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500'
const selectClass =
  'w-full rounded-lg border border-surface-600 bg-surface-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]'
const labelClass = 'text-xs text-slate-400 mb-1 block'
const primaryBtn =
  'bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-4 py-2 text-sm transition-colors'
const secondaryBtn =
  'bg-surface-700 hover:bg-surface-600 text-slate-300 rounded-lg px-3 py-2 text-sm transition-colors'
const sectionHeader = 'text-sm font-medium text-slate-300 mb-3'

const QUICK_ZONES = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Kolkata',
  'Australia/Sydney'
]

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0')
}

function getAllTimezones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    // Fallback for environments that don't support supportedValuesOf
    return QUICK_ZONES
  }
}

function toDatetimeLocalValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function getUTCOffset(tz: string, date: Date): string {
  // Get the offset by formatting a date in the target timezone and parsing the offset
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'longOffset'
  })
  const parts = formatter.formatToParts(date)
  const tzPart = parts.find((p) => p.type === 'timeZoneName')
  if (tzPart) {
    // Returns something like "GMT+08:00" or "GMT" for UTC
    const val = tzPart.value
    if (val === 'GMT') return 'UTC+00:00'
    return val.replace('GMT', 'UTC')
  }
  return ''
}

function formatInTimezone(date: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  // en-CA gives YYYY-MM-DD format; time parts come separately
  const parts = fmt.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00'

  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
}

function formatInTimezoneLong(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(date)
}

/**
 * Parse a datetime-local value as if it were in the given source timezone,
 * and return the corresponding UTC Date object.
 */
function parseDateInTimezone(datetimeLocal: string, tz: string): Date | null {
  if (!datetimeLocal) return null

  // datetime-local gives us "YYYY-MM-DDTHH:mm:ss" (or without seconds)
  // We need to interpret these components as being in the source timezone.
  const [datePart, timePart] = datetimeLocal.split('T')
  if (!datePart || !timePart) return null

  const [y, m, d] = datePart.split('-').map(Number)
  const timePieces = timePart.split(':').map(Number)
  const [hr, min] = timePieces
  const sec = timePieces[2] ?? 0

  // Strategy: create a Date in UTC with these components, then adjust by the
  // difference between UTC and the source timezone's offset.
  // First, create a reference date in UTC with these wall-clock values.
  const utcGuess = new Date(Date.UTC(y, m - 1, d, hr, min, sec))

  // Format that UTC instant in the source timezone to see what wall-clock time it maps to
  const formatted = formatInTimezone(utcGuess, tz)
  const refDate = new Date(formatted.replace(' ', 'T'))

  // The difference between our desired wall-clock values and what the source tz shows
  // for utcGuess tells us the timezone offset
  const desiredMs = utcGuess.getTime()
  const refMs = refDate.getTime()
  const offsetMs = desiredMs - refMs

  // The actual UTC time is our desired wall-clock minus that offset... but we need
  // to apply it the other way: if source tz is UTC+8, wall clock 10:00 = UTC 02:00
  return new Date(utcGuess.getTime() + offsetMs)
}

const ALL_TIMEZONES = getAllTimezones()

function shortZoneLabel(tz: string): string {
  const last = tz.split('/').pop() ?? tz
  return last.replace(/_/g, ' ')
}

export default function TimezoneConverter() {
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [sourceTz, setSourceTz] = useState(localTz)
  const [targetTz, setTargetTz] = useState('UTC')
  const [dtInput, setDtInput] = useState('')

  const handleNow = () => {
    setDtInput(toDatetimeLocalValue(new Date()))
    setSourceTz(localTz)
  }

  const handleSwap = () => {
    setSourceTz(targetTz)
    setTargetTz(sourceTz)
  }

  const result = useMemo(() => {
    const utcDate = parseDateInTimezone(dtInput, sourceTz)
    if (!utcDate || isNaN(utcDate.getTime())) return null

    const converted = formatInTimezone(utcDate, targetTz)
    const convertedLong = formatInTimezoneLong(utcDate, targetTz)
    const sourceOffset = getUTCOffset(sourceTz, utcDate)
    const targetOffset = getUTCOffset(targetTz, utcDate)
    const iso = utcDate.toISOString()

    return { converted, convertedLong, sourceOffset, targetOffset, iso }
  }, [dtInput, sourceTz, targetTz])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Source */}
      <div className="rounded-lg bg-surface-800 p-5 space-y-4">
        <h3 className={sectionHeader}>Source</h3>

        <div>
          <label className={labelClass}>Timezone</label>
          <select
            value={sourceTz}
            onChange={(e) => setSourceTz(e.target.value)}
            className={selectClass}
          >
            {ALL_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
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
            <button onClick={handleNow} className={primaryBtn}>
              <Clock className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
              Now
            </button>
          </div>
        </div>

        {result && (
          <div className="text-xs text-slate-400">
            Source offset: <span className="font-mono text-slate-300">{result.sourceOffset}</span>
          </div>
        )}
      </div>

      {/* Swap button */}
      <div className="flex justify-center">
        <button
          onClick={handleSwap}
          className={`${secondaryBtn} flex items-center gap-2`}
          title="Swap source and target"
        >
          <ArrowRightLeft className="h-4 w-4" />
          Swap
        </button>
      </div>

      {/* Target */}
      <div className="rounded-lg bg-surface-800 p-5 space-y-4">
        <h3 className={sectionHeader}>Target</h3>

        <div>
          <label className={labelClass}>Timezone</label>
          <select
            value={targetTz}
            onChange={(e) => setTargetTz(e.target.value)}
            className={selectClass}
          >
            {ALL_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        {/* Quick timezone buttons */}
        <div>
          <label className={labelClass}>Quick Select</label>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_ZONES.map((tz) => (
              <button
                key={tz}
                onClick={() => setTargetTz(tz)}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                  targetTz === tz
                    ? 'bg-blue-600 text-white'
                    : 'bg-surface-700 text-slate-400 hover:bg-surface-600 hover:text-slate-200'
                }`}
              >
                {shortZoneLabel(tz)}
              </button>
            ))}
          </div>
        </div>

        {result && (
          <div className="text-xs text-slate-400">
            Target offset: <span className="font-mono text-slate-300">{result.targetOffset}</span>
          </div>
        )}
      </div>

      {/* Result */}
      {result && (
        <div className="rounded-lg bg-surface-800 p-5 space-y-3">
          <h3 className={sectionHeader}>Converted Time</h3>
          {[
            { label: 'Short Format', value: result.converted },
            { label: 'Long Format', value: result.convertedLong },
            { label: 'ISO 8601 (UTC)', value: result.iso }
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
  )
}
