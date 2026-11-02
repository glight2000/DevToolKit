import { useEffect, useMemo, useRef, useState } from 'react'
import { AppWindow, Calculator, Check, Clipboard, Clock, Copy, CornerDownLeft, FileText, FolderOpen, Gauge, Globe, Languages, Search, Settings, Shield, Terminal } from 'lucide-react'
import { calculate, defaultLauncherSettings, searchLauncher, type LauncherCommand, type LauncherState } from '../../../../shared/launcher'

const icons = { window: AppWindow, clipboard: Clipboard, clock: Clock, copy: Copy, note: FileText, folder: FolderOpen, gauge: Gauge, language: Languages, shield: Shield, terminal: Terminal, settings: Settings, calculator: Calculator, web: Globe }
export default function QuickLauncher() {
  const [state, setState] = useState<LauncherState>({ settings: defaultLauncherSettings(), active: false, error: null })
  const [query, setQuery] = useState(''), [selected, setSelected] = useState(0), [error, setError] = useState(''), [copied, setCopied] = useState(''), [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let alive = true
    void window.api.invoke('launcher:get').then(value => { if (alive) setState(value) }).catch(error => { if (alive) setError(String(error)) })
    const off = window.api.on('launcher:changed', value => { setState(value); setSelected(0) })
    const opened = window.api.on('launcher:opened', value => { setState(value); setQuery(''); setSelected(0); setError(''); setCopied(''); input.current?.focus() })
    return () => { alive = false; off(); opened() }
  }, [])
  const rows = useMemo(() => {
    const commands = searchLauncher(query, state.settings.groups), result = state.settings.groups.includes('calculator') ? calculate(query) : undefined
    if (result !== undefined) commands.unshift({ id: 'calculate', group: 'calculator', title: result, detail: `${query.trim()} · 回车复制结果`, keywords: '', icon: 'calculator' })
    if (query.trim() && state.settings.groups.includes('web')) commands.push({ id: 'web:search', group: 'web', title: `搜索网页：${query.trim()}`, detail: '使用默认浏览器打开 Bing', keywords: '', icon: 'web' })
    return commands
  }, [query, state.settings.groups])
  useEffect(() => { document.getElementById(`shortcut-${selected}`)?.scrollIntoView({ block: 'nearest' }) }, [selected])
  const run = async (command?: LauncherCommand) => {
    if (!command || busy) return
    setBusy(true); setError(''); setCopied('')
    try { const result = await window.api.invoke('launcher:run', command.id, query); if (result?.copied !== undefined) setCopied(result.copied) }
    catch (error) { setError(String(error)) } finally { setBusy(false) }
  }
  return <div className="desktop-surface switcher quick-launcher" onKeyDown={event => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape') { event.preventDefault(); void window.api.invoke('launcher:hide') }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && (event.target === input.current || (event.target as HTMLElement).getAttribute('role') === 'option')) { event.preventDefault(); input.current?.focus(); setSelected(index => rows.length ? (index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length : 0) }
    if (event.key === 'Enter' && event.target === input.current) { event.preventDefault(); void run(rows[selected]) }
  }}>
    <header className="switcher-search"><Search size={23} /><input ref={input} autoFocus maxLength={256} role="combobox" aria-label="搜索快捷功能" aria-expanded="true" aria-controls="shortcut-results" aria-activedescendant={rows[selected] ? `shortcut-${selected}` : undefined} value={query} onChange={event => { setQuery(event.target.value); setSelected(0); setError(''); setCopied('') }} placeholder="搜索功能，或输入算式…" /><button aria-label="关闭快捷启动" onClick={() => void window.api.invoke('launcher:hide')}><kbd>Esc</kbd></button></header>
    <div className="switcher-caption"><span>快捷启动 <span className="surface-dot" /> {rows.length} 项</span><span>Alt + Space</span></div>
    {error && <p className="surface-error" role="alert">{error}</p>}
    <div className="window-results" id="shortcut-results" role="listbox" aria-label="快捷功能">
      {!rows.length && <div className="surface-empty"><Search size={26} /><p>没有匹配的功能</p><small>可在快捷启动设置中开启更多功能</small></div>}
      {rows.map((command, index) => { const Icon = icons[command.icon as keyof typeof icons] ?? AppWindow; return <button id={`shortcut-${index}`} key={command.id} role="option" aria-selected={selected === index} disabled={busy} className={`window-result launcher-result ${selected === index ? 'selected' : ''}`} onMouseMove={() => setSelected(index)} onClick={() => void run(command)}><span className="launcher-result-icon"><Icon size={19} /></span><span className="window-text"><strong>{command.title}</strong><small>{command.detail}</small></span>{selected === index && <CornerDownLeft size={16} />}</button> })}
    </div>
    <footer className="switcher-footer launcher-footer">{copied ? <span role="status"><Check size={14} />已复制：{copied}</span> : <span><kbd>↑</kbd> <kbd>↓</kbd> 选择 <kbd>↵</kbd> 执行</span>}<button onClick={() => void window.api.invoke('launcher:open-settings').catch(error => setError(String(error)))} aria-label="快捷启动设置"><Settings size={14} /></button></footer>
  </div>
}
