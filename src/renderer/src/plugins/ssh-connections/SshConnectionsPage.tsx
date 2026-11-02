import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Terminal, Plus, Search, Star, Clock, Folder, RefreshCw, Monitor, Layers, ArrowUpRight, Copy, Pencil, Trash2, X, LayoutGrid, List, FileCode2, Zap, Server, ChevronRight } from 'lucide-react'
import type { ConnectionCatalog, ConnectionDraft, ConnectionProfile, ConfigDocument, LaunchMode, TerminalSession } from '../../../../shared/ssh-connections'
import type { SshAlias } from '../../../../shared/ssh-config'
import ConnectionForm, { emptyConnection } from './ConnectionForm'
import ConfigEditor from './ConfigEditor'
import TerminalPane from './TerminalPane'
import Modal from '../../components/common/Modal'

type Entry = { key: string; kind: 'profile' | 'system'; id: string; name: string; host: string; username: string; port: number; environment: string; group: string; tags: string[]; favorite: boolean; lastUsed: number | null; profile?: ConnectionProfile; alias?: SshAlias }
const emptyCatalog: ConnectionCatalog = { sources: [], aliases: [], profiles: [], metadata: {}, preferences: { launchMode: 'embedded' } }

export default function SshConnectionsPage() {
  const [catalog, setCatalog] = useState(emptyCatalog), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [scope, setScope] = useState('all'), [query, setQuery] = useState(''), [view, setView] = useState<'grid' | 'list'>('grid')
  const [sort, setSort] = useState('name'), [mode, setMode] = useState<LaunchMode>('embedded')
  const [form, setForm] = useState<{ initial: ConnectionDraft; id?: string; quick?: boolean } | null>(null)
  const [detail, setDetail] = useState<Entry | null>(null), [removing, setRemoving] = useState<Entry | null>(null), [config, setConfig] = useState<ConfigDocument | null>(null)
  const [sessions, setSessions] = useState<TerminalSession[]>([]), [activeSession, setActiveSession] = useState<string | null>(null)
  const [closing, setClosing] = useState<TerminalSession | null>(null), [launching, setLaunching] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const request = useRef(0), firstLoad = useRef(true), lastScan = useRef(0)
  const refresh = useCallback(async (rescan = false, distribution?: string) => {
    const current = ++request.current
    setLoading(true); setError('')
    if (rescan) lastScan.current = Date.now()
    try {
      const result: ConnectionCatalog = await window.api.invoke('ssh:catalog', rescan, distribution)
      if (current !== request.current) return
      setCatalog(result)
      if (firstLoad.current) { setMode(result.preferences.launchMode); firstLoad.current = false }
    } catch (error) { if (current === request.current) setError(String(error)) }
    finally { if (current === request.current) setLoading(false) }
  }, [])
  useEffect(() => {
    void refresh(true)
    window.api.invoke('ssh:sessions').then(setSessions).catch(error => setError(String(error)))
    const off = window.api.on('ssh:terminal-exit', (session: TerminalSession) => setSessions(old => old.map(item => item.id === session.id ? session : item)))
    const onFocus = () => { if (Date.now() - lastScan.current > 15000) void refresh(true) }
    window.addEventListener('focus', onFocus)
    return () => { request.current++; off(); window.removeEventListener('focus', onFocus) }
  }, [refresh])
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'k' && searchRef.current?.getClientRects().length && !document.querySelector('[role="dialog"]')) { event.preventDefault(); searchRef.current.focus(); searchRef.current.select() }
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])
  const entries = useMemo<Entry[]>(() => [
    ...catalog.profiles.map(profile => ({ key: `profile:${profile.id}`, kind: 'profile' as const, id: profile.id, name: profile.name, host: profile.host, username: profile.username, port: profile.port, environment: profile.environment, group: profile.group, tags: profile.tags, favorite: profile.favorite, lastUsed: profile.lastUsed, profile })),
    ...catalog.aliases.map(alias => ({ key: `system:${alias.id}`, kind: 'system' as const, id: alias.id, name: alias.alias, host: alias.hostname, username: alias.username, port: alias.port, environment: alias.sourceId, group: '', tags: [], favorite: catalog.metadata[alias.id]?.favorite ?? false, lastUsed: catalog.metadata[alias.id]?.lastUsed ?? null, alias }))
  ], [catalog])
  const groups = useMemo(() => [...new Set(catalog.profiles.map(profile => profile.group).filter(Boolean))].sort(), [catalog.profiles])
  const defaultEnvironment = catalog.sources.find(source => source.id.startsWith('wsl:') && source.state === 'ready')?.id ?? catalog.sources.find(source => source.id.startsWith('wsl:'))?.id ?? 'local'
  const sourceName = (id: string) => catalog.sources.find(source => source.id === id)?.label ?? id
  const filtered = entries.filter(entry => {
    const inScope = scope === 'all' || scope === 'favorites' && entry.favorite || scope === 'recent' && !!entry.lastUsed || scope === 'app' && entry.kind === 'profile' || scope.startsWith('source:') && entry.kind === 'system' && entry.environment === scope.slice(7) || scope.startsWith('group:') && entry.kind === 'profile' && entry.group === scope.slice(6)
    return inScope && `${entry.name} ${entry.host} ${entry.username} ${entry.group} ${entry.tags.join(' ')} ${sourceName(entry.environment)}`.toLowerCase().includes(query.toLowerCase().trim())
  }).sort((a, b) => (scope === 'recent' || sort === 'recent') ? (b.lastUsed ?? 0) - (a.lastUsed ?? 0) || a.name.localeCompare(b.name) : Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name))
  const currentSource = scope.startsWith('source:') ? catalog.sources.find(source => source.id === scope.slice(7)) : undefined
  const title = scope === 'all' ? 'All connections' : scope === 'app' ? 'DevToolkit library' : scope === 'favorites' ? 'Favorites' : scope === 'recent' ? 'Recently opened' : scope.startsWith('group:') ? scope.slice(6) : currentSource?.label ?? 'Connections'
  const acceptLaunch = async (result: { session?: TerminalSession; external?: boolean }) => {
    if (result.session) { setSessions(old => [...old, result.session!]); setActiveSession(result.session.id) }
    else setNotice('Opened in an external terminal. Authentication and connection status appear there.')
    await refresh()
  }
  const connect = async (entry: Entry) => {
    setLaunching(entry.key); setError(''); setNotice('')
    try { await acceptLaunch(await window.api.invoke('ssh:connect', entry.kind, entry.id, mode)) }
    catch (error) { setError(String(error)) }
    finally { setLaunching(null) }
  }
  const favorite = async (entry: Entry) => {
    try { await window.api.invoke('ssh:favorite', entry.kind, entry.id, !entry.favorite); await refresh() }
    catch (error) { setError(String(error)) }
  }
  const editConfig = async (sourceId: string) => {
    setError('')
    try { setConfig(await window.api.invoke('ssh:read-config', sourceId)) } catch (error) { setError(String(error)) }
  }
  const copyToLibrary = (entry: Entry) => {
    if (entry.profile) { setForm({ initial: { ...entry.profile, name: `${entry.name} copy` } }); return }
    const alias = entry.alias!
    if (alias.problems.length) { setError('This alias contains advanced rules. Connect using its source config; a basic copy would lose those rules.'); return }
    let keyPath = alias.identityFiles[0] ?? ''
    if (alias.sourceId.startsWith('wsl:')) {
      const prefix = `\\\\wsl.localhost\\${alias.sourceId.slice(4)}\\`
      if (keyPath.startsWith(prefix)) keyPath = '/' + keyPath.slice(prefix.length).replaceAll('\\', '/')
    }
    setForm({ initial: { ...emptyConnection(alias.sourceId), name: alias.alias, host: alias.hostname, port: alias.port, username: alias.username, keyPath, auth: keyPath ? 'key' : 'auto', notes: `Copied from ${alias.sourceLabel} · ${alias.alias}. Independent of the original config.\n${alias.notes.join('\n')}` } })
  }
  const closeSession = async (session: TerminalSession) => {
    try { await window.api.invoke('ssh:terminal-close', session.id); setSessions(old => old.filter(item => item.id !== session.id)); if (activeSession === session.id) setActiveSession(null); setClosing(null) }
    catch (error) { setError(String(error)) }
  }
  const nav = (id: string, label: string, icon: React.ReactNode, count?: number) => <button key={id} onClick={() => { setScope(id); setActiveSession(null) }} aria-pressed={scope === id} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors ${scope === id ? 'bg-blue-500/10 text-blue-400' : 'text-slate-400 hover:bg-surface-800 hover:text-slate-100'}`}>
    {icon}<span className="flex-1 truncate">{label}</span>{count !== undefined && <span className="text-[10px] opacity-70">{count}</span>}
  </button>
  const iconButton = 'rounded-md p-1.5 text-slate-400 hover:bg-surface-700 hover:text-slate-100 disabled:opacity-40'
  return <div className="flex h-full min-h-0 flex-col bg-surface-950">
    <header className="shrink-0 border-b border-surface-800 bg-surface-900 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2.5 text-lg font-bold text-slate-100"><Terminal className="h-5 w-5 text-blue-400" />SSH Connections</h1><p className="mt-1 text-xs text-slate-400">Your servers. Every environment. One workspace.</p></div>
        <div className="flex gap-2"><button disabled={loading && !catalog.sources.length} onClick={() => setForm({ initial: emptyConnection(defaultEnvironment), quick: true })} className="flex items-center gap-1.5 rounded-lg border border-surface-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-40"><Zap className="h-3.5 w-3.5" />Quick connect</button><button disabled={loading && !catalog.sources.length} onClick={() => setForm({ initial: emptyConnection(defaultEnvironment) })} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"><Plus className="h-3.5 w-3.5" />New connection</button></div>
      </div>
    </header>
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-surface-800 bg-surface-900 px-3 pt-2" role="tablist" aria-label="SSH workspace">
      <button role="tab" aria-selected={!activeSession} onClick={() => setActiveSession(null)} className={`shrink-0 border-b-2 px-3 py-2.5 text-xs font-medium ${!activeSession ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400'}`}><span className="flex items-center gap-2"><Layers className="h-3.5 w-3.5" />Connections</span></button>
      {sessions.map(session => <div key={session.id} className={`flex shrink-0 items-center border-b-2 ${activeSession === session.id ? 'border-blue-500 bg-surface-800' : 'border-transparent'}`}><button role="tab" aria-selected={activeSession === session.id} onClick={() => setActiveSession(session.id)} className="flex max-w-48 items-center gap-2 px-3 py-2.5 text-xs text-slate-200"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${session.state === 'running' ? 'bg-emerald-400' : 'bg-slate-500'}`} /><span className="truncate">{session.title}</span></button><button aria-label={`Close terminal ${session.title}`} className={`${iconButton} mr-1`} onClick={() => session.state === 'running' ? setClosing(session) : void closeSession(session)}><X className="h-3 w-3" /></button></div>)}
    </div>
    {error && <div role="alert" className="flex shrink-0 items-start justify-between gap-3 border-b border-red-500/20 bg-red-500/10 px-5 py-2 text-xs text-red-400"><span className="break-words">{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X className="h-4 w-4" /></button></div>}
    {notice && <div role="status" className="flex shrink-0 justify-between gap-3 bg-blue-500/10 px-5 py-2 text-xs text-blue-400"><span>{notice}</span><button aria-label="Dismiss notice" onClick={() => setNotice('')}><X className="h-4 w-4" /></button></div>}
    <div hidden={!!activeSession} className="min-h-0 flex-1">
      <div className="flex h-full min-h-0">
        <aside aria-label="Connection collections" className="w-44 shrink-0 overflow-y-auto border-r border-surface-800 bg-surface-900/50 p-2">
          <p className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Library</p>
          {nav('all', 'All connections', <Layers className="h-3.5 w-3.5" />, entries.length)}
          {nav('favorites', 'Favorites', <Star className="h-3.5 w-3.5" />, entries.filter(entry => entry.favorite).length)}
          {nav('recent', 'Recently opened', <Clock className="h-3.5 w-3.5" />)}
          <p className="px-3 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Storage sources</p>
          {nav('app', 'DevToolkit', <Folder className="h-3.5 w-3.5" />, catalog.profiles.length)}
          {catalog.sources.map(source => nav(`source:${source.id}`, source.label, source.id === 'local' ? <Monitor className="h-3.5 w-3.5" /> : <Terminal className="h-3.5 w-3.5" />, catalog.aliases.filter(alias => alias.sourceId === source.id).length))}
          {groups.length > 0 && <><p className="px-3 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Groups</p>{groups.map(group => nav(`group:${group}`, group, <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />, catalog.profiles.filter(profile => profile.group === group).length))}</>}
        </aside>
        <section aria-label="Connection library" className="flex min-w-0 flex-1 flex-col">
          <div className="shrink-0 space-y-3 border-b border-surface-800 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold text-slate-100">{title} <span className="ml-1.5 text-xs font-normal text-slate-500">{filtered.length}</span></h2><div className="flex items-center gap-1">
              {currentSource?.configPath && <button onClick={() => void editConfig(currentSource.id)} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-blue-400 hover:bg-surface-800"><FileCode2 className="h-3.5 w-3.5" />Edit config</button>}
              <button disabled={loading} onClick={() => void refresh(true)} aria-label="Refresh connection sources" className={iconButton}><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /></button>
            </div></div>
            <div className="flex flex-wrap items-center gap-2"><div className="relative min-w-36 flex-1"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" /><input ref={searchRef} aria-label="Search connections" placeholder="Search hosts, groups, tags..." value={query} onChange={event => setQuery(event.target.value)} className="w-full rounded-lg border border-surface-700 bg-surface-900 py-2 pl-9 pr-3 text-xs text-slate-200" /></div>
              <select aria-label="Sort connections" value={sort} onChange={event => setSort(event.target.value)} className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-2 text-xs text-slate-400"><option value="name">Name</option><option value="recent">Recently opened</option></select>
              <div className="flex rounded-lg border border-surface-700 p-0.5"><button aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => setView('grid')} className={`${iconButton} ${view === 'grid' ? 'bg-surface-800 text-blue-400' : ''}`}><LayoutGrid className="h-3.5 w-3.5" /></button><button aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')} className={`${iconButton} ${view === 'list' ? 'bg-surface-800 text-blue-400' : ''}`}><List className="h-3.5 w-3.5" /></button></div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500"><span>{currentSource ? 'Aliases stay in their source config' : 'App profiles and source aliases stay separate'}</span><label className="flex items-center gap-2">Open in<select aria-label="Terminal mode" value={mode} onChange={async event => { const next = event.target.value as LaunchMode; setMode(next); try { await window.api.invoke('ssh:launch-mode', next) } catch (error) { setError(String(error)) } }} className="rounded-md border border-surface-700 bg-surface-900 px-2 py-1 text-xs text-slate-300"><option value="embedded">In-app terminal</option><option value="external">External terminal</option></select></label></div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {catalog.sources.filter(source => source.state === 'stopped' && (!currentSource || currentSource.id === source.id)).map(source => <div key={source.id} className="mb-4 rounded-xl border border-surface-700 bg-surface-900 p-4 text-sm text-slate-400"><p>{source.label} 未启动，尚未读取其中的 SSH 别名。</p><button disabled={loading} onClick={() => void refresh(true, source.id.slice(4))} className="mt-3 rounded-lg bg-blue-600 px-3 py-2 text-xs text-white">启动并读取 {source.label}</button></div>)}
            {catalog.sources.filter(source => source.configExists === false && (!currentSource || currentSource.id === source.id)).map(source => <div key={source.id} className="mb-3 rounded-lg border border-surface-700 p-3 text-xs leading-6 text-slate-400"><p>{source.label} 用户配置不存在：<span className="break-all">{source.configPath}</span></p><p>Windows 与 WSL 的 SSH 配置分别读取；WSL 别名请查看对应发行版。</p></div>)}
            {currentSource?.configExists && <p className="mb-3 break-all text-xs text-slate-500">读取位置：{currentSource.configPath}</p>}
            {catalog.sources.filter(source => source.state === 'error' && (!currentSource || currentSource.id === source.id)).map(source => <div key={source.id} className="mb-3 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-500 break-words">{source.label}: {source.error}</div>)}
            {loading && !entries.length ? <div role="status" className="py-16 text-center text-sm text-slate-400">Reading your connection sources...</div> : !filtered.length ? <div className="flex min-h-60 flex-col items-center justify-center text-center"><div className="mb-4 rounded-2xl bg-blue-500/10 p-4"><Server className="h-8 w-8 text-blue-400" /></div><h3 className="text-base font-semibold text-slate-200">{query ? 'No matching connections' : 'A place for your servers'}</h3><p className="mt-2 max-w-sm text-xs leading-6 text-slate-400">{query ? 'Try a hostname, tag or another collection.' : 'Save a connection in DevToolkit or browse aliases from Windows and WSL.'}</p><button onClick={() => query || scope === 'favorites' || scope === 'recent' ? (setQuery(''), setScope('all')) : setForm({ initial: emptyConnection(defaultEnvironment) })} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-xs text-white">{query || scope === 'favorites' || scope === 'recent' ? 'Show all connections' : 'Add connection'}</button></div> :
              <div className={view === 'grid' ? 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,245px),1fr))] gap-3' : 'space-y-2'}>{filtered.map(entry => <article key={entry.key} aria-label={`Connection ${entry.name}`} className={`group rounded-xl border border-surface-700/70 bg-surface-900 p-4 transition-colors hover:border-blue-500/40 ${view === 'list' ? 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2' : ''}`}>
                <div className={`flex min-w-0 items-start gap-3 ${view === 'list' ? 'col-start-1 row-start-1' : ''}`}><div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">{entry.kind === 'system' ? <FileCode2 className="h-4 w-4" /> : <Server className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><button onClick={() => setDetail(entry)} className="block max-w-full truncate text-left text-sm font-semibold text-slate-100 hover:text-blue-400">{entry.name}</button><p className="mt-1 truncate font-mono text-[11px] text-slate-400" title={`${entry.username}@${entry.host}:${entry.port}`}>{entry.username}@{entry.host}:{entry.port}</p></div><button onClick={() => void favorite(entry)} aria-label={`${entry.favorite ? 'Unfavorite' : 'Favorite'} ${entry.name}`} className={`${iconButton} ${entry.favorite ? 'text-amber-500' : ''}`}><Star className={`h-3.5 w-3.5 ${entry.favorite ? 'fill-amber-500 text-amber-500' : ''}`} /></button></div>
                <div className={`flex flex-wrap items-center gap-1.5 ${view === 'grid' ? 'mt-4' : 'col-start-1 row-start-2'}`}><span className="rounded-md border border-surface-700 px-1.5 py-0.5 text-[10px] text-slate-400">{entry.kind === 'profile' ? 'DevToolkit' : sourceName(entry.environment)}</span>{entry.kind === 'profile' && <span className="text-[10px] text-slate-500">{sourceName(entry.environment)}</span>}{entry.tags.slice(0, 3).map(tag => <button key={tag} onClick={() => setQuery(tag)} className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400">{tag}</button>)}</div>
                <div className={`flex items-center justify-between gap-2 ${view === 'grid' ? 'mt-4 border-t border-surface-800 pt-3' : 'col-start-2 row-start-1 row-span-2 justify-self-end'}`}><button disabled={!!launching} onClick={() => void connect(entry)} className="flex items-center gap-1.5 rounded-lg bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/20 disabled:opacity-40"><Terminal className="h-3.5 w-3.5" />{launching === entry.key ? 'Opening...' : 'Connect'}{mode === 'external' && <ArrowUpRight className="h-3 w-3" />}</button><div className="flex items-center"><button aria-label={`Details for ${entry.name}`} onClick={() => setDetail(entry)} className={iconButton}><ChevronRight className="h-4 w-4" /></button>{entry.profile && <button aria-label={`Edit ${entry.name}`} onClick={() => setForm({ initial: entry.profile!, id: entry.id })} className={iconButton}><Pencil className="h-3.5 w-3.5" /></button>}</div></div>
              </article>)}</div>}
          </div>
        </section>
      </div>
    </div>
    {sessions.map(session => <div key={session.id} hidden={activeSession !== session.id} className="min-h-0 flex-1"><div className="flex h-full min-h-0 flex-col"><div className="flex shrink-0 items-center justify-between border-b border-surface-800 bg-surface-900 px-4 py-2 text-[11px] text-slate-400"><span>{sourceName(session.environment)} · {session.state === 'running' ? 'SSH process running' : `Process exited (${session.exitCode ?? '?'})`}</span><span>Passwords stay in the terminal</span></div><div className="min-h-0 flex-1"><TerminalPane id={session.id} active={activeSession === session.id} /></div></div></div>)}
    {form && <ConnectionForm initial={form.initial} sources={catalog.sources} groups={groups} quick={form.quick} onClose={() => setForm(null)} onSave={async draft => { if (form.quick) await acceptLaunch(await window.api.invoke('ssh:quick-connect', draft, mode)); else { await window.api.invoke('ssh:save-profile', draft, form.id); setScope('app'); setNotice('Connection saved in DevToolkit. Source configs were not changed.'); await refresh() } }} />}
    {config && <ConfigEditor document={config} onClose={() => setConfig(null)} onSaved={() => refresh()} />}
    {detail && <Modal open title={detail.name} onClose={() => setDetail(null)}><div className="space-y-4"><div className="rounded-xl bg-surface-900 p-4"><p className="break-all font-mono text-sm text-slate-100">{detail.username}@{detail.host}:{detail.port}</p><p className="mt-2 text-xs text-slate-400">{detail.kind === 'profile' ? 'DevToolkit library' : 'System config alias'} · {sourceName(detail.environment)}</p></div>
      {detail.profile && <p className="whitespace-pre-wrap break-words text-sm text-slate-400">{detail.profile.notes || 'No notes yet.'}</p>}
      {detail.alias && <><p className="break-all text-xs text-slate-500">{detail.alias.configPath}</p><p className="text-xs leading-6 text-slate-400">Connect uses the original alias in its own environment. Native OpenSSH applies its full configuration, including jump hosts and agents.</p>{detail.alias.problems.length > 0 && <p className="rounded-lg bg-amber-500/10 p-3 text-xs leading-6 text-amber-500">Advanced profile: connect from its source. Copying it into the basic DevToolkit editor is disabled to avoid losing settings.</p>}</>}
      <div className="flex flex-wrap gap-2"><button onClick={() => { void connect(detail); setDetail(null) }} className="rounded-lg bg-blue-600 px-4 py-2 text-xs text-white">Connect</button><button disabled={!!detail.alias?.problems.length} onClick={() => { copyToLibrary(detail); setDetail(null) }} className="flex items-center gap-1.5 rounded-lg border border-surface-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-40"><Copy className="h-3.5 w-3.5" />{detail.profile ? 'Duplicate' : 'Copy to DevToolkit'}</button>{detail.profile ? <><button onClick={() => { setForm({ initial: detail.profile!, id: detail.id }); setDetail(null) }} className="rounded-lg border border-surface-700 px-3 py-2 text-xs text-slate-300">Edit</button><button onClick={() => { setRemoving(detail); setDetail(null) }} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-red-400"><Trash2 className="h-3.5 w-3.5" />Delete</button></> : <button onClick={() => { void editConfig(detail.environment); setDetail(null) }} className="rounded-lg border border-surface-700 px-3 py-2 text-xs text-slate-300">Edit source config</button>}</div>
    </div></Modal>}
    {removing && <Modal open title="Delete saved connection" onClose={() => setRemoving(null)}><p className="text-sm text-slate-300">Delete “{removing.name}” from DevToolkit? Windows and WSL configs will remain unchanged.</p><div className="mt-5 flex justify-end gap-2"><button onClick={() => setRemoving(null)} className="rounded-lg px-3 py-2 text-sm text-slate-300">Cancel</button><button onClick={async () => { try { await window.api.invoke('ssh:delete-profile', removing.id); setRemoving(null); await refresh() } catch (error) { setError(String(error)) } }} className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white">Delete connection</button></div></Modal>}
    {closing && <Modal open title="Close SSH session" onClose={() => setClosing(null)}><p className="text-sm text-slate-300">Close “{closing.title}”? This will stop its SSH process and disconnect the session.</p><div className="mt-5 flex justify-end gap-2"><button onClick={() => setClosing(null)} className="rounded-lg px-3 py-2 text-sm text-slate-300">Keep open</button><button onClick={() => void closeSession(closing)} className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white">Disconnect and close</button></div></Modal>}
  </div>
}
