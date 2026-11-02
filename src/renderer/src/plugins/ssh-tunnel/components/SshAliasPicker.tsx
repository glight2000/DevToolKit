import { useEffect, useRef, useState } from 'react'
import { RefreshCw, Download } from 'lucide-react'
import type { SshAlias, SshAliasDiscovery } from '../../../../../shared/ssh-config'

interface Props { onApply: (alias: SshAlias, identityFile: string) => void }

export default function SshAliasPicker({ onApply }: Props) {
  const [data, setData] = useState<SshAliasDiscovery>({ sources: [], aliases: [] })
  const [selectedId, setSelectedId] = useState('')
  const [identity, setIdentity] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [applied, setApplied] = useState('')
  const request = useRef(0)
  const load = async (distribution?: string) => {
    const current = ++request.current
    setLoading(true); setError(''); setApplied('')
    try {
      const result: SshAliasDiscovery = await window.api.invoke('tunnel:discover-ssh-aliases', distribution)
      if (current !== request.current) return
      setData(result)
      setSelectedId(''); setIdentity('')
    } catch (error) {
      if (current === request.current) setError(error instanceof Error ? error.message : 'Could not read SSH aliases')
    } finally { if (current === request.current) setLoading(false) }
  }
  useEffect(() => { void load(); return () => { request.current++ } }, [])
  const selected = data.aliases.find(alias => alias.id === selectedId)
  return (
    <section aria-label="SSH config aliases" className="rounded-lg border border-surface-600 bg-surface-900 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-200">From SSH config</h3>
        <button type="button" disabled={loading} onClick={() => void load()} aria-label="Refresh SSH aliases" className="rounded-md p-1.5 text-slate-400 hover:bg-surface-700 disabled:opacity-40">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <p className="text-xs leading-relaxed text-slate-400">Read Windows and running WSL aliases. Choose one to fill connection fields, then configure your tunnel below.</p>
      {loading ? <p role="status" className="text-xs text-blue-400">Reading SSH configurations...</p> : (
        <>
          <select aria-label="SSH config alias" value={selectedId} onChange={event => {
            setSelectedId(event.target.value); setApplied('')
            const alias = data.aliases.find(item => item.id === event.target.value)
            setIdentity(alias?.identityFiles.length === 1 ? alias.identityFiles[0] : '')
          }} className="w-full rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-sm text-slate-100">
            <option value="">{data.aliases.length ? `Choose an alias (${data.aliases.length})` : 'No explicit Host aliases found'}</option>
            {data.sources.map(source => <optgroup key={source.id} label={source.label}>
              {data.aliases.filter(alias => alias.sourceId === source.id).map(alias => <option key={alias.id} value={alias.id}>{alias.alias}{alias.problems.length ? ' · requires OpenSSH' : ''}</option>)}
            </optgroup>)}
          </select>
          {selected && <div className="space-y-3 text-xs">
            <p className="break-all font-mono text-slate-200">{selected.username}@{selected.hostname}:{selected.port}</p>
            <p className="break-all text-slate-500">{selected.sourceLabel} · {selected.configPath}</p>
            {selected.identityFiles.length > 0 && <label className="block text-slate-400">Private key path
              <select aria-label="Alias private key" value={identity} onChange={event => setIdentity(event.target.value)} className="mt-1 w-full rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-slate-100">
                <option value="">Choose a key</option>
                {selected.identityFiles.map((file, index) => <option key={`${index}:${file}`} value={file}>{file}</option>)}
              </select>
            </label>}
            {selected.problems.length > 0 && <div role="alert" className="rounded-lg bg-red-500/10 p-3 text-red-400">
              <p className="font-medium">This alias cannot be imported safely.</p>
              <ul className="mt-1 list-disc pl-4 space-y-1">{selected.problems.map(problem => <li key={problem}>{problem}</li>)}</ul>
            </div>}
            <ul className="list-disc pl-4 space-y-1 leading-relaxed text-slate-400">{selected.notes.map(note => <li key={note}>{note}</li>)}</ul>
            {selected.sourceId.startsWith('wsl:') && <p className="text-slate-400">The WSL distribution must remain accessible when connecting with its key. Network connections are made from Windows.</p>}
            <button type="button" disabled={selected.problems.length > 0 || (selected.identityFiles.length > 0 && !identity)}
              onClick={() => { onApply(selected, identity); setApplied(`Applied ${selected.sourceLabel} · ${selected.alias}. Review authentication and forwarding below.`) }}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed">
              <Download className="h-3.5 w-3.5" />Use alias
            </button>
          </div>}
          {data.sources.some(source => source.state !== 'ready') && <div className="space-y-2 border-t border-surface-700 pt-2">
            {data.sources.filter(source => source.state !== 'ready').map(source => <div key={source.id} className="text-xs text-slate-400">
              {source.state === 'stopped' ? <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{source.label} · stopped</span>
                <button type="button" onClick={() => void load(source.id.slice(4))} className="rounded-md px-2 py-1 text-blue-400 hover:bg-surface-800">Start and read</button>
              </div> : <p className="break-words">{source.label}: {source.error}</p>}
            </div>)}
          </div>}
        </>
      )}
      {error && <p role="alert" className="text-xs text-red-400 break-words">{error}</p>}
      {applied && <p role="status" className="text-xs text-emerald-400">{applied}</p>}
    </section>
  )
}
