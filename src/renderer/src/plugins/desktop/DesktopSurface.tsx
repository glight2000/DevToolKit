import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { AppWindow, ArrowDownLeft, ArrowUpRight, Check, Clipboard, Clock, CornerDownLeft, Gauge, GripHorizontal, PanelsTopLeft, Pin, Search, StickyNote, Trash2, X } from 'lucide-react'
import { searchWindows, widgetMotionDuration, type FloatingKind, type FloatingWidgetState, type OpenWindow } from '../../../../shared/desktop'
import './desktop.css'
import { quotaSummary, quotaDockGrid, quotaDockRecords } from '../../../../shared/subscriptions'
import SubscriptionDetail from '../subscriptions/SubscriptionDetail'
import { QuotaTiles, QuotaDockDetails } from './QuotaDock'
import { useTheme } from '../../hooks/useTheme'
import ParagraphEditor from '../../components/common/ParagraphEditor'
import QuickLauncher from './QuickLauncher'
import { resizeDirections, type ResizeDirection } from '../../../../shared/desktop'

function WindowSwitcher() {
  const [windows, setWindows] = useState<OpenWindow[]>([]), [query, setQuery] = useState(''), [selected, setSelected] = useState(0)
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [canMove, setCanMove] = useState(false)
  const input = useRef<HTMLInputElement>(null), version = useRef(0)
  const results = useMemo(() => searchWindows(windows, query), [windows, query])
  const refresh = useCallback(async () => {
    const current = ++version.current
    setQuery(''); setSelected(0); setLoading(true); setError(''); input.current?.focus()
    try {
      const [items, state] = await Promise.all([window.api.invoke('desktop:windows'), window.api.invoke('desktop:get')])
      if (version.current === current) { setWindows(items); setCanMove(state.status.virtualDesktop) }
    } catch (error) { if (version.current === current) setError(String(error)) }
    finally { if (version.current === current) { setLoading(false); input.current?.focus() } }
  }, [])
  useEffect(() => { void refresh(); const off = window.api.on('desktop:search-open', refresh); return () => { version.current++; off() } }, [refresh])
  useEffect(() => { document.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }) }, [selected])
  const activate = async (item: OpenWindow | undefined, bring: boolean) => {
    if (!item || busy) return
    if (bring && !canMove) { setError('当前 Windows 版本不支持跨桌面移动。普通回车仍可切换窗口。'); return }
    setBusy(true); setError('')
    try { await window.api.invoke('desktop:activate', item.id, bring) } catch (error) { setError(String(error)) } finally { setBusy(false) }
  }
  return <div className="desktop-surface switcher" onKeyDown={event => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape') { event.preventDefault(); void window.api.invoke('desktop:hide-switcher') }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setSelected(index => results.length ? (index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length : 0) }
    if (event.key === 'Enter') { event.preventDefault(); void activate(results[selected], event.shiftKey) }
  }}>
    <header className="switcher-search"><Search size={23} /><input ref={input} role="combobox" aria-label="搜索已打开窗口" aria-expanded="true" aria-controls="window-results" aria-activedescendant={results[selected] ? `window-${results[selected].id}` : undefined} autoFocus value={query} onChange={e => { setQuery(e.target.value); setSelected(0) }} placeholder="搜索窗口标题或应用名…" /><button aria-label="关闭窗口速切" onClick={() => void window.api.invoke('desktop:hide-switcher')}><kbd>Esc</kbd></button></header>
    <div className="switcher-caption"><span>窗口速切 <span className="surface-dot" /> {loading ? '正在读取窗口' : `${results.length} 个已打开窗口`}</span><span>Win + Space</span></div>
    {error && <p role="alert" className="surface-error">{error}</p>}
    <div id="window-results" role="listbox" aria-label="已打开窗口" className="window-results">
      {!loading && !error && results.length === 0 && <div className="surface-empty"><AppWindow size={32} /><p>{query ? '没有匹配的窗口' : '当前没有可切换的窗口'}</p><small>试试窗口标题中的关键词或应用名</small></div>}
      {results.map((item, index) => <button id={`window-${item.id}`} role="option" aria-selected={selected === index} key={item.id} disabled={busy} className={`window-result ${index === selected ? 'selected' : ''}`} onMouseMove={() => setSelected(index)} onClick={event => void activate(item, event.shiftKey)}>
        <span className="window-app-icon" style={{ '--app-hue': [...item.app].reduce((sum, char) => sum + char.charCodeAt(0) * 7, 0) % 360 } as React.CSSProperties}>{item.app.slice(0, 2).toUpperCase()}</span><span className="window-text"><strong>{item.title}</strong><small>{item.app} {item.minimized && '· 已最小化'}</small></span><span className={`desktop-badge ${item.current ? 'current' : ''}`}>{item.current ? '当前桌面' : item.desktop >= 0 ? `桌面 ${item.desktop + 1}` : '窗口'}</span>{index === selected && <CornerDownLeft size={16} />}
      </button>)}
    </div><footer className="switcher-footer"><span><kbd>↑</kbd> <kbd>↓</kbd> 选择</span><span><kbd>↵</kbd> 切换窗口</span><span><kbd>Shift ↵</kbd> 移到当前桌面</span></footer>
  </div>
}
const widgetInfo = { quota: { title: 'AI 额度', icon: Gauge, accent: '#52ceb1' }, note: { title: '随手记', icon: StickyNote, accent: '#fbbf24' }, clock: { title: '时光', icon: Clock, accent: '#38bdf8' }, clipboard: { title: '剪贴板', icon: Clipboard, accent: '#a78bfa' }, group: { title: '桌面组件组', icon: PanelsTopLeft, accent: '#93a3bc' } }
function FloatingWidget({ kind, embedded }: { kind: FloatingKind; embedded?: FloatingWidgetState }) {
  const [ownState, setState] = useState<FloatingWidgetState>(), [note, setNote] = useState(embedded?.note ?? ''), [now, setNow] = useState(new Date())
  const state = embedded ?? ownState, isGroup = kind === 'group'
  const [error, setError] = useState(''), [saving, setSaving] = useState(false), [copied, setCopied] = useState(''), [filter, setFilter] = useState('')
  const drag = useRef(false), lastWrite = useRef(0), copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const panel = useRef<HTMLDivElement>(null), animation = useRef<Animation | undefined>(undefined)
  const isQuota = kind.startsWith('quota-'), isQuotaDock = kind === 'quota'
  const { title, icon: Icon, accent } = isQuota ? { title: state?.subscription?.name ?? 'AI 订阅', icon: Gauge, accent: '#52ceb1' } : widgetInfo[kind as keyof typeof widgetInfo]
  const summary = state?.subscription ? quotaSummary(state.subscription, now.getTime()) : undefined
  const action = (name: string, ...args: unknown[]) => window.api.invoke(`desktop:${name}`, ...args).catch(error => setError(String(error)))
  useLayoutEffect(() => {
    const element = panel.current, motion = state?.motion
    if (!element) return
    // Preserve the current visual frame when hover reverses a closing animation.
    const running = animation.current?.playState === 'running'
    const computed = running ? getComputedStyle(element) : undefined
    const previous = computed ? { opacity: computed.opacity, transform: computed.transform } : undefined
    animation.current?.cancel(); animation.current = undefined
    if (!motion) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { void action('widget-motion-done', motion.id); return }
    const offset = state.edge === 'left' ? 'translateX(-10px)' : state.edge === 'top' ? 'translateY(-10px)' : state.edge === 'bottom' ? 'translateY(10px)' : 'translateX(10px)'
    const tucked = { opacity: 0, transform: `${offset} scale(.985)` }, shown = { opacity: 1, transform: 'translate(0, 0) scale(1)' }
    const opening = motion.phase === 'opening'
    const effect = element.animate([previous ?? (opening ? tucked : shown), opening ? shown : tucked], { duration: widgetMotionDuration[motion.phase], easing: opening ? 'cubic-bezier(.16,1,.3,1)' : 'cubic-bezier(.4,0,1,1)', fill: 'forwards' })
    effect.id = 'widget-motion'
    animation.current = effect
    effect.onfinish = () => { void action('widget-motion-done', motion.id) }
  }, [state?.motion?.id])
  useEffect(() => {
    let alive = true
    if (!embedded) window.api.invoke('desktop:widget-state').then(value => { if (alive) { setState(value); setNote(value.note ?? '') } }).catch(error => { if (alive) setError(String(error)) })
    const off = !embedded ? window.api.on('desktop:widget-changed', value => setState(value)) : undefined
    const timer = kind === 'clock' || isQuota || isQuotaDock || isGroup ? setInterval(() => setNow(new Date()), kind === 'clock' ? 1000 : 30000) : undefined
    return () => { alive = false; off?.(); clearInterval(timer); clearTimeout(copiedTimer.current); animation.current?.cancel() }
  }, [kind])
  const startDrag = (e: PointerEvent<HTMLElement>, resize: boolean | ResizeDirection) => {
    if (e.button !== 0) return
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = true
    void action('widget-drag-start', resize)
  }
  const endDrag = () => { if (drag.current) { drag.current = false; void action('widget-drag-end') } }
  const dragEvents = { onPointerMove: () => { if (drag.current) void action('widget-drag') }, onPointerUp: endDrag, onPointerCancel: endDrag, onLostPointerCapture: endDrag }
  const updateNote = async (text: string) => {
    setNote(text); setSaving(true); setError(''); const revision = ++lastWrite.current
    try { await window.api.invoke('desktop:note-save', text) } catch (error) { setError(String(error)) } finally { if (revision === lastWrite.current) setSaving(false) }
  }
  const clips = (state?.clips ?? []).filter(item => item.text.toLocaleLowerCase().includes(filter.toLocaleLowerCase()))
  return <div ref={panel} data-edge={state?.edge} data-kind={kind} data-motion={state?.motion?.phase ?? 'idle'} className={`desktop-surface floating-widget ${embedded ? 'is-group-item' : ''} ${isGroup ? 'widget-group' : ''} ${state?.expanded === false ? 'is-collapsed' : ''}`} style={{ '--widget-accent': accent } as React.CSSProperties} onMouseEnter={() => { if (!embedded) void action('widget-enter') }} onMouseLeave={() => { if (!embedded && !drag.current) void action('widget-leave') }}>
    {state?.expanded === false ? isQuotaDock ? <button className="quota-dock-handle" aria-label="展开AI额度" onClick={() => void action('widget-enter')}><QuotaTiles records={state.subscriptions ?? []} now={now.getTime()} /></button> : isGroup ? <button className={`group-handle edge-${state.edge}`} aria-label="展开桌面组件组" onClick={() => void action('widget-enter')}>{state.items?.map(item => {
      if (item.kind === 'quota') { const grid = quotaDockGrid(quotaDockRecords(item.subscriptions ?? []).length); return <span key={item.kind} className="group-quota-tiles" style={{ width: grid.width, height: grid.height }}><QuotaTiles records={item.subscriptions ?? []} now={now.getTime()} /></span> }
      const info = item.subscription ? { icon: Gauge, title: item.subscription.name, accent: '#52ceb1' } : widgetInfo[item.kind as keyof typeof widgetInfo], Glyph = info.icon
      const quota = item.subscription ? quotaSummary(item.subscription, now.getTime()) : undefined
      return <span key={item.kind} data-kind={item.kind} className={`group-handle-item ${quota ? 'has-quota' : ''}`} title={info.title} style={{ '--widget-accent': info.accent } as React.CSSProperties}><Glyph size={17} /><span className="group-handle-label">{info.title}</span>{quota && <span className={`group-quota-track ${quota.stale ? 'stale' : ''}`} role="progressbar" aria-label={`${info.title} 剩余额度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={quota.remaining}><span style={{ height: `${quota.remaining ?? 0}%`, background: quota.remaining !== undefined && quota.remaining <= 10 ? '#f2778c' : quota.remaining !== undefined && quota.remaining <= 30 ? '#e5b45e' : info.accent }} /></span>}</span>
    })}</button> : isQuota ? <button className={`quota-handle ${summary?.stale ? 'stale' : ''}`} aria-label={`展开${title}`} title={`${title} · ${summary?.remaining === undefined ? '暂无额度' : `最紧张窗口剩余 ${Math.round(summary.remaining)}%`}${summary?.stale ? ' · 旧读数' : ''}`} onClick={() => void action('widget-enter')}><span role="progressbar" aria-label={`${title} 剩余额度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary?.remaining} className="quota-handle-track"><span style={{ height: `${summary?.remaining ?? 0}%`, background: summary?.remaining === undefined ? '#718096' : summary.remaining <= 10 ? '#f2778c' : summary.remaining <= 30 ? '#e5b45e' : accent }} /></span><span className="quota-handle-dot">{summary?.remaining === undefined ? '?' : ''}</span></button> : <button className={`widget-handle edge-${state.edge}`} aria-label={`展开${title}`} onClick={() => void action('widget-enter')}><Icon size={19} /><span>{title}</span><span className="handle-line" /></button> : <>
      <header className="widget-header"><div className="widget-grip" aria-label={embedded ? title : `拖动${title}`} onPointerDown={embedded ? undefined : event => startDrag(event, false)} {...(embedded ? {} : dragEvents)}><Icon size={17} /><strong>{title}</strong>{!embedded && <GripHorizontal size={16} />}</div>{!embedded && <><button title={state?.pinned ? '取消固定' : '固定展开'} aria-pressed={state?.pinned ?? false} onClick={() => void action('widget-pin')}><Pin size={15} fill={state?.pinned ? 'currentColor' : 'none'} /></button><button title="收起到边缘" disabled={state?.pinned || state?.edge === 'none'} onClick={() => void action('widget-collapse')}><ArrowDownLeft size={16} /></button></>}<button title={isGroup ? '关闭全部组件' : '关闭组件'} onClick={() => void (embedded ? action('widget-close-item', kind) : action('widget-close'))}><X size={16} /></button></header>
      {error && <p role="alert" className="surface-error">{error}</p>}
      {isQuotaDock && <QuotaDockDetails records={state?.subscriptions ?? []} />}
      {isGroup && <div className="group-content">{state?.items?.map(item => <FloatingWidget key={item.kind} kind={item.kind} embedded={item} />)}</div>}
      {isQuota && state?.subscription && <SubscriptionDetail record={state.subscription} compact />}
      {isQuota && <footer className="widget-footer"><span>{summary?.stale ? '旧读数 · 等待刷新' : state?.subscription?.connectionKind === 'local' ? '本地订阅' : 'SSH 远端订阅'}</span><button disabled={state?.subscription?.refreshing} onClick={() => { if (state?.subscription) void window.api.invoke('subscriptions:refresh', state.subscription.id).catch(e => setError(String(e))) }}>{state?.subscription?.refreshing ? '读取中…' : '刷新'}</button></footer>}
      {kind === 'note' && <><ParagraphEditor label="悬浮记事内容" placeholder="写下此刻的想法…" maxLength={100000} value={note} onChange={text => void updateNote(text)} compact /><footer className="widget-footer"><span>{error ? '保存失败' : saving ? '正在保存…' : '已保存在本机'}</span><span>{note.length} 字</span></footer></>}
      {kind === 'clock' && <div className="floating-clock"><span className="clock-eyebrow">此 时 此 刻</span><time>{now.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })}<small>{String(now.getSeconds()).padStart(2, '0')}</small></time><p>{now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</p><span className="clock-zone">{Intl.DateTimeFormat().resolvedOptions().timeZone}</span></div>}
      {kind === 'clipboard' && <><div className="clipboard-search"><Search size={14} /><input aria-label="搜索剪贴板" value={filter} onChange={event => setFilter(event.target.value)} placeholder="查找最近复制的文本" /><button title="清空剪贴板记录" onClick={() => void action('clipboard-clear')}><Trash2 size={14} /></button></div><div className="clipboard-items">{clips.length === 0 && <div className="surface-empty"><Clipboard size={26} /><p>等待下一次复制</p><small>仅记录开启后的文本 · 最多 30 条</small></div>}{clips.map(item => <button key={item.id} className="clipboard-item" onClick={async () => { try { await window.api.invoke('desktop:clipboard-copy', item.id); setCopied(item.id); clearTimeout(copiedTimer.current); copiedTimer.current = setTimeout(() => setCopied(''), 1500) } catch (error) { setError(String(error)) } }}><span>{item.text}</span><small>{copied === item.id ? <><Check size={12} /> 已复制</> : new Date(item.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</small></button>)}</div><footer className="widget-footer"><span>仅本次运行 · 关闭即清空</span><span>{state?.clips?.length ?? 0} / 30</span></footer></>}
      {!embedded && resizeDirections.filter(direction => !isQuotaDock || direction === 'e' || direction === 'w').map(direction => <button key={direction} className={`widget-resize resize-${direction}`} aria-label={`调整${title}大小 ${direction}`} title="拖动边缘或角落调整大小" onPointerDown={event => startDrag(event, direction)} {...dragEvents}>{direction.length === 2 && <ArrowUpRight size={14} />}</button>)}
    </>}
  </div>
}
export default function DesktopSurface({ surface }: { surface: string }) {
  useTheme()
  if (surface === 'launcher') return <QuickLauncher />
  if (surface === 'switcher') return <WindowSwitcher />
  const kind = surface.replace('widget-', '') as FloatingKind
  return kind in widgetInfo || kind.startsWith('quota-') ? <FloatingWidget kind={kind} /> : null
}
