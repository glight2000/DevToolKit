import { useState, useEffect } from 'react'
import CopyButton from '../../../components/common/CopyButton'

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0')
}

function formatLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

function getDayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0)
  const diff = d.getTime() - start.getTime()
  return Math.floor(diff / 86_400_000)
}

function getWeekOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1)
  const dayOfYear = getDayOfYear(d)
  const startDay = start.getDay()
  return Math.ceil((dayOfYear + startDay) / 7)
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface InfoRow {
  label: string
  getValue: (d: Date) => string
}

const INFO_ROWS: InfoRow[] = [
  { label: 'Local Time', getValue: formatLocal },
  { label: 'UTC Time', getValue: formatUTC },
  { label: 'ISO 8601', getValue: (d) => d.toISOString() },
  { label: 'Unix Timestamp (s)', getValue: (d) => String(Math.floor(d.getTime() / 1000)) },
  { label: 'Unix Timestamp (ms)', getValue: (d) => String(d.getTime()) },
  { label: 'Day of Year', getValue: (d) => String(getDayOfYear(d)) },
  { label: 'Week of Year', getValue: (d) => String(getWeekOfYear(d)) },
  { label: 'Day of Week', getValue: (d) => DAY_NAMES[d.getDay()] }
]

export default function CurrentTime() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const hours = pad(now.getHours())
  const minutes = pad(now.getMinutes())
  const seconds = pad(now.getSeconds())
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const dayName = DAY_NAMES[now.getDay()]

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Big primary time display */}
      <div className="rounded-lg bg-surface-800 p-6 text-center">
        <div className="flex items-center justify-center gap-1 font-mono text-5xl font-bold text-slate-100">
          <span>{hours}</span>
          <span className="animate-pulse text-blue-400">:</span>
          <span>{minutes}</span>
          <span className="animate-pulse text-blue-400">:</span>
          <span>{seconds}</span>
        </div>
        <div className="mt-2 text-sm text-slate-400">
          {dayName}, {dateStr}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {Intl.DateTimeFormat().resolvedOptions().timeZone}
        </div>
      </div>

      {/* Format cards grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        {INFO_ROWS.map((row) => {
          const value = row.getValue(now)
          return (
            <div
              key={row.label}
              className="flex items-center justify-between gap-2 rounded-lg bg-surface-800 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="text-xs text-slate-400">{row.label}</div>
                <div className="mt-0.5 truncate font-mono text-sm text-slate-100">{value}</div>
              </div>
              <CopyButton text={value} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
