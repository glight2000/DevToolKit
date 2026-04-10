import { Server, Plus } from 'lucide-react'

interface EmptyStateProps {
  onCreateTunnel: () => void
}

export default function EmptyState({ onCreateTunnel }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-surface-800 mb-6">
        <Server className="h-10 w-10 text-slate-500" />
      </div>
      <h3 className="text-lg font-semibold text-slate-200 mb-2">No tunnels yet</h3>
      <p className="text-sm text-slate-400 mb-8 text-center max-w-sm">
        Create your first SSH tunnel to securely forward ports between your local machine and remote
        servers.
      </p>
      <button
        onClick={onCreateTunnel}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:bg-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Plus className="h-4 w-4" />
        Create your first tunnel
      </button>
    </div>
  )
}
