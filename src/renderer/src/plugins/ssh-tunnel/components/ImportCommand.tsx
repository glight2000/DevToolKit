import { useState } from 'react'
import { Terminal, X, AlertCircle, ArrowRight, Globe, ArrowUpDown, CheckCircle2 } from 'lucide-react'
import { parseSSHCommand, type ParsedSSHCommand } from '../utils/sshCommand'
import type { TunnelConfig, TunnelType } from '../../../types'

interface ImportCommandProps {
  onImport: (config: Partial<TunnelConfig>) => void
  onClose: () => void
}

const typeLabel: Record<TunnelType, { label: string; cls: string; icon: React.ReactNode }> = {
  local: {
    label: 'Local Forward',
    cls: 'text-blue-400 bg-blue-500/15 border-blue-500/20',
    icon: <ArrowRight className="h-3.5 w-3.5" />
  },
  remote: {
    label: 'Remote Forward',
    cls: 'text-purple-400 bg-purple-500/15 border-purple-500/20',
    icon: <ArrowUpDown className="h-3.5 w-3.5" />
  },
  dynamic: {
    label: 'Dynamic SOCKS5',
    cls: 'text-teal-400 bg-teal-500/15 border-teal-500/20',
    icon: <Globe className="h-3.5 w-3.5" />
  }
}

export default function ImportCommand({ onImport, onClose }: ImportCommandProps) {
  const [command, setCommand] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedSSHCommand | null>(null)

  const handleParse = () => {
    setError(null)
    setParsed(null)
    if (!command.trim()) {
      setError('Please paste an SSH command')
      return
    }
    try {
      const result = parseSSHCommand(command)
      setParsed(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse command')
    }
  }

  const handleImport = () => {
    if (!parsed) return
    onImport({
      name: name.trim() || `${parsed.username}@${parsed.sshHost}`,
      remarks: `Imported from: ${command.trim()}`,
      type: parsed.type,
      sshHost: parsed.sshHost,
      sshPort: parsed.sshPort,
      username: parsed.username,
      authType: parsed.authType,
      privateKeyPath: parsed.privateKeyPath,
      localHost: parsed.localHost,
      localPort: parsed.localPort,
      remoteHost: parsed.remoteHost,
      remotePort: parsed.remotePort,
      autoReconnect: true,
      autoStart: false,
      keepAliveInterval: 30
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (parsed) {
        handleImport()
      } else {
        handleParse()
      }
    }
  }

  const tl = parsed ? typeLabel[parsed.type] : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-8 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl rounded-xl border border-surface-700 bg-surface-800 shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-700 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Terminal className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-slate-100">Import from Command</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-surface-700 hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Command input */}
          <div>
            <label className="mb-1.5 block text-xs text-slate-400">
              Paste your SSH command
            </label>
            <textarea
              className="w-full rounded-lg border border-surface-600 bg-surface-900 px-4 py-3 font-mono text-sm text-emerald-400 placeholder-slate-600 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={3}
              placeholder="ssh -L 8080:localhost:3306 root@myserver.com -p 2222"
              value={command}
              onChange={(e) => {
                setCommand(e.target.value)
                setParsed(null)
                setError(null)
              }}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoFocus
            />
            <p className="mt-1.5 text-[11px] text-slate-500">
              Supports -L (local), -R (remote), -D (dynamic/SOCKS5), -i (key file), -p (port)
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
              <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Parse result preview */}
          {parsed && tl && (
            <div className="rounded-lg border border-surface-600 bg-surface-850 p-4 space-y-3 animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-medium text-slate-200">Parsed successfully</span>
                <span className={`ml-auto inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wider ${tl.cls}`}>
                  {tl.icon}
                  {tl.label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                <div>
                  <span className="text-slate-500">SSH Server</span>
                  <p className="text-slate-200 font-mono">{parsed.username}@{parsed.sshHost}:{parsed.sshPort}</p>
                </div>
                <div>
                  <span className="text-slate-500">Auth</span>
                  <p className="text-slate-200">{parsed.authType === 'privateKey' ? `Key: ${parsed.privateKeyPath}` : 'Password'}</p>
                </div>
                {parsed.type !== 'dynamic' ? (
                  <>
                    <div>
                      <span className="text-slate-500">Local</span>
                      <p className="text-slate-200 font-mono">{parsed.localHost}:{parsed.localPort}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Remote</span>
                      <p className="text-slate-200 font-mono">{parsed.remoteHost}:{parsed.remotePort}</p>
                    </div>
                  </>
                ) : (
                  <div>
                    <span className="text-slate-500">SOCKS5 Bind</span>
                    <p className="text-slate-200 font-mono">{parsed.localHost}:{parsed.localPort}</p>
                  </div>
                )}
              </div>

              {/* Name field */}
              <div className="pt-2 border-t border-surface-700">
                <label className="mb-1 block text-xs text-slate-400">Tunnel Name</label>
                <input
                  className="w-full rounded-lg border border-surface-600 bg-surface-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={`${parsed.username}@${parsed.sshHost}`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-surface-700 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg px-5 py-2 text-sm font-medium text-slate-300 transition-all duration-200 hover:bg-surface-700"
          >
            Cancel
          </button>
          {!parsed ? (
            <button
              onClick={handleParse}
              disabled={!command.trim()}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Parse Command
            </button>
          ) : (
            <button
              onClick={handleImport}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-emerald-500"
            >
              Import Tunnel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
