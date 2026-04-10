import { useState, useMemo } from 'react'
import CopyButton from '../../../components/common/CopyButton'
import { ArrowRightLeft, Clock, Calendar } from 'lucide-react'

const inputClass =
  'w-full rounded-lg border border-surface-600 bg-surface-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'text-xs text-slate-400 mb-1 block'
const primaryBtn =
  'bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-4 py-2 text-sm transition-colors'
const secondaryBtn =
  'bg-surface-700 hover:bg-surface-600 text-slate-300 rounded-lg px-3 py-2 text-sm transition-colors'
const sectionHeader = 'text-sm font-medium text-slate-300 mb-3'

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0')
}

function toDatetimeLocalValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function countBusinessDays(start: Date, end: Date): number {
  // Ensure start <= end
  let a = start.getTime() < end.getTime() ? new Date(start) : new Date(end)
  const b = start.getTime() < end.getTime() ? new Date(end) : new Date(start)

  // Normalize to midnight
  a = new Date(a.getFullYear(), a.getMonth(), a.getDate())
  const bNorm = new Date(b.getFullYear(), b.getMonth(), b.getDate())

  let count = 0
  const cursor = new Date(a)

  // For very large ranges, use a smarter approach
  const totalDays = Math.round((bNorm.getTime() - a.getTime()) / 86_400_000)

  if (totalDays > 1000) {
    // Approximate: for large ranges, calculate based on full weeks + remainder
    const fullWeeks = Math.floor(totalDays / 7)
    count = fullWeeks * 5
    cursor.setDate(cursor.getDate() + fullWeeks * 7)
  }

  while (cursor < bNorm) {
    const day = cursor.getDay()
    if (day !== 0 && day !== 6) count++
    cursor.setDate(cursor.getDate() + 1)
  }

  return count
}

interface HumanReadable {
  years: number
  months: number
  days: number
  hours: number
  minutes: number
  seconds: number
}

function getHumanReadableDiff(start: Date, end: Date): HumanReadable {
  // Ensure start <= end for consistent calculation
  const [a, b] = start <= end ? [start, end] : [end, start]

  let years = b.getFullYear() - a.getFullYear()
  let months = b.getMonth() - a.getMonth()
  let days = b.getDate() - a.getDate()
  let hours = b.getHours() - a.getHours()
  let minutes = b.getMinutes() - a.getMinutes()
  let seconds = b.getSeconds() - a.getSeconds()

  if (seconds < 0) {
    seconds += 60
    minutes--
  }
  if (minutes < 0) {
    minutes += 60
    hours--
  }
  if (hours < 0) {
    hours += 24
    days--
  }
  if (days < 0) {
    // Get days in the previous month of b
    const prevMonth = new Date(b.getFullYear(), b.getMonth(), 0)
    days += prevMonth.getDate()
    months--
  }
  if (months < 0) {
    months += 12
    years--
  }

  return { years, months, days, hours, minutes, seconds }
}

function formatHumanReadable(h: HumanReadable): string {
  const parts: string[] = []
  if (h.years) parts.push(`${h.years} year${h.years !== 1 ? 's' : ''}`)
  if (h.months) parts.push(`${h.months} month${h.months !== 1 ? 's' : ''}`)
  if (h.days) parts.push(`${h.days} day${h.days !== 1 ? 's' : ''}`)
  if (h.hours) parts.push(`${h.hours} hour${h.hours !== 1 ? 's' : ''}`)
  if (h.minutes) parts.push(`${h.minutes} minute${h.minutes !== 1 ? 's' : ''}`)
  if (h.seconds || parts.length === 0)
    parts.push(`${h.seconds} second${h.seconds !== 1 ? 's' : ''}`)
  return parts.join(', ')
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

export default function DateDiffCalculator() {
  const [startInput, setStartInput] = useState('')
  const [endInput, setEndInput] = useState('')

  const handleNowStart = () => setStartInput(toDatetimeLocalValue(new Date()))
  const handleNowEnd = () => setEndInput(toDatetimeLocalValue(new Date()))

  const handleSwap = () => {
    setStartInput(endInput)
    setEndInput(startInput)
  }

  const result = useMemo(() => {
    if (!startInput || !endInput) return null

    const start = new Date(startInput)
    const end = new Date(endInput)

    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null

    const diffMs = Math.abs(end.getTime() - start.getTime())
    const totalSeconds = Math.floor(diffMs / 1000)
    const totalMinutes = Math.floor(diffMs / 60_000)
    const totalHours = Math.floor(diffMs / 3_600_000)
    const totalDays = Math.floor(diffMs / 86_400_000)
    const businessDays = countBusinessDays(start, end)
    const human = getHumanReadableDiff(start, end)
    const humanStr = formatHumanReadable(human)

    return {
      totalDays,
      totalHours,
      totalMinutes,
      totalSeconds,
      businessDays,
      humanStr
    }
  }, [startInput, endInput])

  const resultRows = result
    ? [
        { label: 'Human Readable', value: result.humanStr },
        { label: 'Total Days', value: formatNumber(result.totalDays) },
        { label: 'Total Hours', value: formatNumber(result.totalHours) },
        { label: 'Total Minutes', value: formatNumber(result.totalMinutes) },
        { label: 'Total Seconds', value: formatNumber(result.totalSeconds) },
        { label: 'Business Days (excl. weekends)', value: formatNumber(result.businessDays) }
      ]
    : []

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Start date */}
      <div className="rounded-lg bg-surface-800 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-blue-400" />
          <h3 className={sectionHeader + ' mb-0'}>Start Date</h3>
        </div>
        <div>
          <label className={labelClass}>Date & Time</label>
          <div className="flex gap-2">
            <input
              type="datetime-local"
              step="1"
              value={startInput}
              onChange={(e) => setStartInput(e.target.value)}
              className={`${inputClass} flex-1 [color-scheme:dark]`}
            />
            <button onClick={handleNowStart} className={primaryBtn}>
              <Clock className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
              Now
            </button>
          </div>
        </div>
      </div>

      {/* Swap button */}
      <div className="flex justify-center">
        <button
          onClick={handleSwap}
          className={`${secondaryBtn} flex items-center gap-2`}
          title="Swap start and end dates"
        >
          <ArrowRightLeft className="h-4 w-4" />
          Swap
        </button>
      </div>

      {/* End date */}
      <div className="rounded-lg bg-surface-800 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-blue-400" />
          <h3 className={sectionHeader + ' mb-0'}>End Date</h3>
        </div>
        <div>
          <label className={labelClass}>Date & Time</label>
          <div className="flex gap-2">
            <input
              type="datetime-local"
              step="1"
              value={endInput}
              onChange={(e) => setEndInput(e.target.value)}
              className={`${inputClass} flex-1 [color-scheme:dark]`}
            />
            <button onClick={handleNowEnd} className={primaryBtn}>
              <Clock className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
              Now
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="rounded-lg bg-surface-800 p-5 space-y-3">
          <h3 className={sectionHeader}>Results</h3>
          <div className="space-y-2">
            {resultRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-xs text-slate-400">{row.label}: </span>
                  <span className="font-mono text-sm text-slate-100">{row.value}</span>
                </div>
                <CopyButton text={row.value} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
