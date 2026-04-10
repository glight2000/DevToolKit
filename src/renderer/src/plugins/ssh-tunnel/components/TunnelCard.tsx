import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Play,
  Square,
  Edit3,
  Trash2,
  Upload,
  Download,
  Wifi,
  WifiOff,
  ArrowRight,
  Globe,
  Server,
  Activity,
  RefreshCw,
  Copy,
  Check,
  TerminalSquare,
  KeyRound,
  ShieldCheck,
  Loader2
} from 'lucide-react'
import type { TunnelInfo, TunnelType } from '../../../types'
import StatusBadge from './StatusBadge'
import DeleteConfirm from './DeleteConfirm'
import { generateSSHCommand } from '../utils/sshCommand'

interface TunnelCardProps {
  tunnel: TunnelInfo
  onStart: (id: string) => void
  onStop: (id: string) => void
  onEdit: (tunnel: TunnelInfo) => void
  onDelete: (id: string) => void
}

const typeBadge: Record<TunnelType, { label: string; cls: string }> = {
  local: { label: 'LOCAL', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  remote: { label: 'REMOTE', cls: 'bg-purple-500/15 text-purple-400 border-purple-500/20' },
  dynamic: { label: 'DYNAMIC', cls: 'bg-teal-500/15 text-teal-400 border-teal-500/20' }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const val = bytes / Math.pow(1024, i)
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`
}

function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`
}

function formatDuration(connectedAt?: number): string {
  if (!connectedAt) return ''
  const diff = Math.floor((Date.now() - connectedAt) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  return `${h}h ${m}m`
}

function getConnectionInfo(tunnel: TunnelInfo): React.ReactNode {
  const { config } = tunnel
  if (config.type === 'dynamic') {
    return (
      <span className="flex items-center gap-1.5 text-sm text-slate-300">
        <Globe className="h-3.5 w-3.5 text-teal-400" />
        SOCKS5 {config.localHost}:{config.localPort}
      </span>
    )
  }
  if (config.type === 'local') {
    return (
      <span className="flex items-center gap-1.5 text-sm text-slate-300">
        {config.localHost}:{config.localPort}
        <ArrowRight className="h-3 w-3 text-slate-500" />
        {config.remoteHost}:{config.remotePort}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-sm text-slate-300">
      {config.remoteHost}:{config.remotePort}
      <ArrowRight className="h-3 w-3 text-slate-500" />
      {config.localHost}:{config.localPort}
    </span>
  )
}

export default function TunnelCard({ tunnel, onStart, onStop, onEdit, onDelete }: TunnelCardProps) {
  const [showDelete, setShowDelete] = useState(false)
  const [copied, setCopied] = useState(false)
  const [terminalHint, setTerminalHint] = useState<string | null>(null)
  const [pubKeyStatus, setPubKeyStatus] = useState<'unchecked' | 'checking' | 'installed' | 'not-installed' | 'error'>('unchecked')
  const [pubKeyContent, setPubKeyContent] = useState<string | null>(null)
  const [deploying, setDeploying] = useState(false)
  const { config, state } = tunnel

  const prevStatusRef = useRef(state.status)

  const checkPubKey = useCallback(async () => {
    if (pubKeyStatus === 'checking') return
    setPubKeyStatus('checking')
    try {
      const result = await window.api.invoke('tunnel:check-pubkey', config.id)
      if (result.localKeyContent) setPubKeyContent(result.localKeyContent)
      setPubKeyStatus(result.installed ? 'installed' : result.localKeyPath ? 'not-installed' : 'error')
    } catch {
      // IPC not registered or other error — stay silent
      setPubKeyStatus('unchecked')
    }
  }, [config.id, pubKeyStatus])

  // Auto-check only on the transition to 'connected' (not on every render)
  useEffect(() => {
    const prev = prevStatusRef.current
    prevStatusRef.current = state.status
    if (state.status === 'connected' && prev !== 'connected') {
      checkPubKey()
    }
  }, [state.status, checkPubKey])

  // Reset when tunnel disconnects
  useEffect(() => {
    if (state.status === 'stopped' || state.status === 'error') {
      setPubKeyStatus('unchecked')
    }
  }, [state.status])

  const handleDeployPubKey = async () => {
    if (!pubKeyContent) return
    setDeploying(true)
    try {
      const result = await window.api.invoke('tunnel:deploy-pubkey', config.id, pubKeyContent)
      if (result.success) {
        setPubKeyStatus('installed')
        setTerminalHint('Public key deployed successfully')
        setTimeout(() => setTerminalHint(null), 3000)
      } else {
        setTerminalHint(result.error || 'Deploy failed')
        setTimeout(() => setTerminalHint(null), 4000)
      }
    } catch {
      setTerminalHint('Deploy failed')
      setTimeout(() => setTerminalHint(null), 3000)
    } finally {
      setDeploying(false)
    }
  }

  const handleRemovePubKey = async () => {
    if (!pubKeyContent) return
    setDeploying(true)
    try {
      const result = await window.api.invoke('tunnel:remove-pubkey', config.id, pubKeyContent)
      if (result.success) {
        setPubKeyStatus('not-installed')
        setTerminalHint('Public key removed')
        setTimeout(() => setTerminalHint(null), 3000)
      } else {
        setTerminalHint(result.error || 'Remove failed')
        setTimeout(() => setTerminalHint(null), 4000)
      }
    } catch {
      setTerminalHint('Remove failed')
      setTimeout(() => setTerminalHint(null), 3000)
    } finally {
      setDeploying(false)
    }
  }

  const handleCopyCommand = async () => {
    const cmd = generateSSHCommand(config)
    await navigator.clipboard.writeText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleOpenTerminal = async () => {
    const result = await window.api.invoke('tunnel:open-terminal', config.id)
    if (result?.passwordCopied) {
      setTerminalHint('Password copied — paste with Ctrl+V')
      setTimeout(() => setTerminalHint(null), 5000)
    } else if (result?.success) {
      setTerminalHint('Terminal opened')
      setTimeout(() => setTerminalHint(null), 2000)
    }
  }
  const badge = typeBadge[config.type]
  const isActive = state.status === 'connected'
  const isBusy = state.status === 'connecting' || state.status === 'reconnecting'

  return (
    <>
      <div
        className={`group relative rounded-xl border bg-surface-800 p-5 transition-all duration-200 hover:scale-[1.01] hover:shadow-lg ${
          isActive
            ? 'border-emerald-500/20 hover:border-emerald-500/40'
            : state.status === 'error'
              ? 'border-red-500/20 hover:border-red-500/40'
              : 'border-surface-700 hover:border-surface-600'
        }`}
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <StatusBadge status={state.status} />
            <h3 className="truncate text-base font-semibold text-slate-100">{config.name}</h3>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {state.status === 'stopped' && (
              <WifiOff
                className="h-3.5 w-3.5 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                aria-label="Disconnected"
              />
            )}
            <span
              className={`rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wider ${badge.cls}`}
            >
              {badge.label}
            </span>
          </div>
        </div>

        {/* Connection info */}
        <div className="mb-3">{getConnectionInfo(tunnel)}</div>

        {/* SSH server */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
          <Server className="h-3 w-3" />
          <span>
            {config.username}@{config.sshHost}:{config.sshPort}
          </span>
        </div>

        {/* PubKey status */}
        {pubKeyStatus !== 'unchecked' && (
          <div className="flex items-center gap-1.5 text-xs mb-3">
            {pubKeyStatus === 'checking' && (
              <span className="flex items-center gap-1.5 text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                Checking key...
              </span>
            )}
            {pubKeyStatus === 'installed' && (
              <span className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <ShieldCheck className="h-3 w-3" />
                  PubKey installed
                </span>
                <button
                  onClick={handleRemovePubKey}
                  disabled={deploying}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-red-600/15 hover:text-red-400 transition-colors disabled:opacity-50"
                  title="Remove public key from remote"
                >
                  {deploying ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Trash2 className="h-2.5 w-2.5" />}
                  Remove
                </button>
              </span>
            )}
            {pubKeyStatus === 'not-installed' && (
              <span className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-amber-400">
                  <KeyRound className="h-3 w-3" />
                  No PubKey
                </span>
                <button
                  onClick={handleDeployPubKey}
                  disabled={deploying}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-600/15 text-blue-400 hover:bg-blue-600/30 transition-colors disabled:opacity-50"
                >
                  {deploying ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <KeyRound className="h-2.5 w-2.5" />}
                  Deploy Key
                </button>
                <button
                  onClick={checkPubKey}
                  className="rounded p-0.5 text-slate-500 hover:text-slate-300 transition-colors"
                  title="Re-check"
                >
                  <RefreshCw className="h-2.5 w-2.5" />
                </button>
              </span>
            )}
            {pubKeyStatus === 'error' && (
              <span className="flex items-center gap-1.5 text-slate-500">
                <KeyRound className="h-3 w-3" />
                No local key found
              </span>
            )}
          </div>
        )}

        {/* Remarks */}
        {config.remarks && (
          <p className="text-xs text-slate-500 mb-3 line-clamp-2">{config.remarks}</p>
        )}

        {/* Stats row */}
        {(isActive || isBusy || state.bytesIn > 0 || state.bytesOut > 0) && (
          <div className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-x-4 gap-y-1 rounded-lg bg-surface-850 px-3 py-2 mb-3 min-h-[36px]">
            <span className="flex items-center gap-1 text-xs text-slate-400 min-w-[72px]">
              <Upload className="h-3 w-3 text-blue-400 shrink-0" />
              {formatBytes(state.bytesOut)}
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-400 min-w-[72px]">
              <Download className="h-3 w-3 text-emerald-400 shrink-0" />
              {formatBytes(state.bytesIn)}
            </span>
            {isActive ? (
              <>
                <span className="text-[10px] text-slate-500 min-w-[120px]">
                  ↑ {formatRate(state.rateOut)} ↓ {formatRate(state.rateIn)}
                </span>
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Activity className="h-3 w-3 text-amber-400 shrink-0" />
                  {state.connections}
                </span>
              </>
            ) : (
              <span className="col-span-2" />
            )}
          </div>
        )}

        {/* Connected duration */}
        {isActive && state.connectedAt && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400/80 mb-3">
            <Wifi className="h-3 w-3" />
            Connected for {formatDuration(state.connectedAt)}
          </div>
        )}

        {/* Error message */}
        {state.status === 'error' && state.error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-400 mb-3 line-clamp-2">
            {state.error}
          </p>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 border-t border-surface-700 pt-3">
          {isActive || isBusy ? (
            <button
              onClick={() => onStop(config.id)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-all duration-200 hover:bg-red-600/20 hover:text-red-400"
              title="Stop tunnel"
            >
              <Square className="h-3 w-3" />
              Stop
            </button>
          ) : (
            <button
              onClick={() => onStart(config.id)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600/15 px-3 py-1.5 text-xs font-medium text-blue-400 transition-all duration-200 hover:bg-blue-600/30"
              title="Start tunnel"
            >
              <Play className="h-3 w-3" />
              Start
            </button>
          )}

          {isBusy && <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-400" />}

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={handleOpenTerminal}
              className="rounded-lg p-1.5 text-slate-400 transition-all duration-200 hover:bg-blue-600/15 hover:text-blue-400"
              title="Open SSH in terminal"
            >
              <TerminalSquare className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleCopyCommand}
              className={`rounded-lg p-1.5 transition-all duration-200 ${
                copied
                  ? 'text-emerald-400 bg-emerald-500/10'
                  : 'text-slate-400 hover:bg-surface-700 hover:text-slate-200'
              }`}
              title={copied ? 'Copied!' : 'Copy SSH command'}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => onEdit(tunnel)}
              className="rounded-lg p-1.5 text-slate-400 transition-all duration-200 hover:bg-surface-700 hover:text-slate-200"
              title="Edit tunnel"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setShowDelete(true)}
              className="rounded-lg p-1.5 text-slate-400 transition-all duration-200 hover:bg-red-600/15 hover:text-red-400"
              title="Delete tunnel"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Terminal hint toast */}
        {terminalHint && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-lg animate-fade-in whitespace-nowrap">
            {terminalHint}
          </div>
        )}
      </div>

      {showDelete && (
        <DeleteConfirm
          tunnelName={config.name}
          onConfirm={() => {
            setShowDelete(false)
            onDelete(config.id)
          }}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </>
  )
}
