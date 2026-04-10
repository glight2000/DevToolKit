import type { TunnelStatus } from '../../../types'

const statusConfig: Record<TunnelStatus, { color: string; pulse: boolean; label: string }> = {
  connected: { color: 'bg-emerald-500', pulse: true, label: 'Connected' },
  connecting: { color: 'bg-amber-500', pulse: true, label: 'Connecting' },
  reconnecting: { color: 'bg-amber-500', pulse: true, label: 'Reconnecting' },
  error: { color: 'bg-red-500', pulse: false, label: 'Error' },
  stopped: { color: 'bg-slate-500', pulse: false, label: 'Stopped' }
}

interface StatusBadgeProps {
  status: TunnelStatus
  className?: string
}

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const cfg = statusConfig[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${className}`}>
      <span
        className={`h-2 w-2 rounded-full ${cfg.color} ${cfg.pulse ? 'status-dot-pulse' : ''}`}
      />
      <span className="text-slate-300">{cfg.label}</span>
    </span>
  )
}
