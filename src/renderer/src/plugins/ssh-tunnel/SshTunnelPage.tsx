import { useState, useMemo } from 'react'
import {
  Play,
  Square,
  Plus,
  Search,
  Activity,
  Upload,
  Download,
  Server,
  Filter,
  RefreshCw,
  Terminal
} from 'lucide-react'
import { useTunnels } from './hooks/useTunnels'
import TunnelCard from './components/TunnelCard'
import TunnelForm from './components/TunnelForm'
import ImportCommand from './components/ImportCommand'
import EmptyState from './components/EmptyState'
import type { TunnelInfo, TunnelConfig, TunnelStatus } from '../../types'

type FilterTab = 'all' | 'running' | 'stopped' | 'error'

const filterTabs: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'running', label: 'Running' },
  { key: 'stopped', label: 'Stopped' },
  { key: 'error', label: 'Error' }
]

function matchesFilter(status: TunnelStatus, filter: FilterTab): boolean {
  if (filter === 'all') return true
  if (filter === 'running') return status === 'connected' || status === 'connecting' || status === 'reconnecting'
  if (filter === 'stopped') return status === 'stopped'
  if (filter === 'error') return status === 'error'
  return true
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const val = bytes / Math.pow(1024, i)
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`
}

export default function SshTunnelPage() {
  const {
    tunnels,
    loading,
    createTunnel,
    updateTunnel,
    deleteTunnel,
    startTunnel,
    stopTunnel,
    startAll,
    stopAll,
    refreshTunnels
  } = useTunnels()

  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingTunnel, setEditingTunnel] = useState<TunnelInfo | null>(null)

  const stats = useMemo(() => {
    const total = tunnels.length
    const connected = tunnels.filter((t) => t.state.status === 'connected').length
    const errored = tunnels.filter((t) => t.state.status === 'error').length
    const totalIn = tunnels.reduce((sum, t) => sum + t.state.bytesIn, 0)
    const totalOut = tunnels.reduce((sum, t) => sum + t.state.bytesOut, 0)
    return { total, connected, errored, totalIn, totalOut }
  }, [tunnels])

  const filteredTunnels = useMemo(() => {
    let result = tunnels
    if (activeFilter !== 'all') {
      result = result.filter((t) => matchesFilter(t.state.status, activeFilter))
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (t) =>
          t.config.name.toLowerCase().includes(q) ||
          t.config.sshHost.toLowerCase().includes(q) ||
          t.config.remarks.toLowerCase().includes(q) ||
          t.config.username.toLowerCase().includes(q)
      )
    }
    return result
  }, [tunnels, activeFilter, searchQuery])

  const handleSave = async (config: Partial<TunnelInfo['config']>) => {
    if (config.id) {
      await updateTunnel(config.id, config)
    } else {
      await createTunnel(config)
    }
    setShowForm(false)
    setEditingTunnel(null)
  }

  const handleEdit = (tunnel: TunnelInfo) => {
    setEditingTunnel(tunnel)
    setShowForm(true)
  }

  const handleCloseForm = () => {
    setShowForm(false)
    setEditingTunnel(null)
  }

  const handleNewTunnel = () => {
    setEditingTunnel(null)
    setShowForm(true)
  }

  const handleImportFromCommand = async (config: Partial<TunnelConfig>) => {
    await createTunnel(config)
    setShowImport(false)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-950">
        <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-surface-950">
      {/* Header */}
      <header className="glass-header shrink-0 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <Server className="h-5 w-5 text-blue-400" />
              <h1 className="text-lg font-bold text-slate-100 tracking-tight">SSH Tunnel Manager</h1>
            </div>

            {/* Aggregate stats */}
            <div className="ml-4 hidden items-center gap-4 sm:flex">
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <Activity className="h-3.5 w-3.5 text-emerald-400" />
                <span className="font-medium text-emerald-400">{stats.connected}</span>
                <span>active</span>
              </span>
              {stats.errored > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <span className="font-medium text-red-400">{stats.errored}</span>
                  <span>errors</span>
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={startAll}
              disabled={tunnels.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600/15 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-all duration-200 hover:bg-emerald-600/25 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play className="h-3 w-3" />
              Start All
            </button>
            <button
              onClick={stopAll}
              disabled={tunnels.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-all duration-200 hover:bg-red-600/20 hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Square className="h-3 w-3" />
              Stop All
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-all duration-200 hover:bg-surface-600 hover:text-slate-100"
            >
              <Terminal className="h-3 w-3" />
              Import
            </button>
            <button
              onClick={handleNewTunnel}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white transition-all duration-200 hover:bg-blue-500"
            >
              <Plus className="h-3.5 w-3.5" />
              New Tunnel
            </button>
          </div>
        </div>
      </header>

      {/* Filter bar */}
      <div className="shrink-0 border-b border-surface-800 bg-surface-900 px-6 py-3">
        <div className="flex items-center gap-4">
          {/* Tabs */}
          <div className="flex items-center gap-1">
            <Filter className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
            {filterTabs.map((tab) => {
              const count =
                tab.key === 'all'
                  ? tunnels.length
                  : tunnels.filter((t) => matchesFilter(t.state.status, tab.key)).length
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key)}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition-all duration-200 ${
                    activeFilter === tab.key
                      ? 'bg-surface-700 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                  <span
                    className={`ml-1.5 ${activeFilter === tab.key ? 'text-slate-300' : 'text-slate-500'}`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Search */}
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search tunnels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-56 rounded-lg border border-surface-700 bg-surface-800 py-1.5 pl-9 pr-3 text-xs text-slate-200 placeholder-slate-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto bg-surface-900 px-6 py-5">
        {tunnels.length === 0 ? (
          <EmptyState onCreateTunnel={handleNewTunnel} />
        ) : filteredTunnels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Search className="h-10 w-10 text-slate-600 mb-3" />
            <p className="text-sm text-slate-400">No tunnels match your filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredTunnels.map((tunnel) => (
              <TunnelCard
                key={tunnel.config.id}
                tunnel={tunnel}
                onStart={startTunnel}
                onStop={stopTunnel}
                onEdit={handleEdit}
                onDelete={deleteTunnel}
              />
            ))}
          </div>
        )}
      </main>

      {/* Status bar */}
      <footer className="glass-statusbar shrink-0 px-6 py-2">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>
            {stats.total} tunnel{stats.total !== 1 ? 's' : ''} &middot; {stats.connected} connected
          </span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Upload className="h-3 w-3 text-blue-400/60" />
              {formatBytes(stats.totalOut)}
            </span>
            <span className="flex items-center gap-1">
              <Download className="h-3 w-3 text-emerald-400/60" />
              {formatBytes(stats.totalIn)}
            </span>
          </div>
        </div>
      </footer>

      {/* Form modal */}
      {showForm && (
        <TunnelForm tunnel={editingTunnel} onSave={handleSave} onClose={handleCloseForm} />
      )}

      {/* Import modal */}
      {showImport && (
        <ImportCommand onImport={handleImportFromCommand} onClose={() => setShowImport(false)} />
      )}
    </div>
  )
}
