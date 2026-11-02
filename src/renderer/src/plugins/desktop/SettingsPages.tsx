import { useEffect, useState, type ReactNode } from 'react'
import { AppWindow, ArrowUpRight, Clipboard, Clock, Grip, Keyboard, MousePointer2, Move, Pin, StickyNote, ToggleRight } from 'lucide-react'
import { defaultDesktopSettings, type DesktopSettings, type DesktopStatus, type WidgetKind, type DockDisplay } from '../../../../shared/desktop'
import QuotaDockSettings, { DockPosition } from './QuotaDockSettings'

export function useDesktop() {
  const [state, setState] = useState<{ settings: DesktopSettings; status: DesktopStatus; displays: DockDisplay[]; activeWidgetDisplayId: string } | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => {
    let alive = true
    window.api.invoke('desktop:get').then(value => { if (alive) setState(value) }).catch(error => { if (alive) setError(String(error)) })
    const off = window.api.on('desktop:changed', value => setState(value))
    return () => { alive = false; off() }
  }, [])
  const action = async (channel: string, ...args: unknown[]) => {
    setBusy(true); setError('')
    try { const result = await window.api.invoke(channel, ...args); if (result?.settings) setState(result) }
    catch (error) { setError(String(error)) }
    finally { setBusy(false) }
  }
  return { settings: state?.settings ?? defaultDesktopSettings(), status: state?.status, displays: state?.displays ?? [], activeWidgetDisplayId: state?.activeWidgetDisplayId, busy: busy || !state, error, action }
}
function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: () => void; disabled?: boolean; label: string }) {
  return <button role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${checked ? 'bg-blue-500' : 'bg-surface-600'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${checked ? 'left-6' : 'left-1'}`} /></button>
}
const card = 'rounded-2xl border border-surface-700 bg-surface-900 p-5'
const button = 'rounded-lg border border-surface-600 bg-surface-800 px-4 py-2 text-sm text-slate-200 hover:border-blue-400 disabled:opacity-40'
function Layout({ title, description, icon, children, error }: { title: string; description: string; icon: ReactNode; children: ReactNode; error: string }) {
  return <div className="h-full overflow-y-auto bg-surface-950 p-6"><div className="mx-auto max-w-4xl space-y-5"><header className="mb-7"><div className="mb-3 inline-flex rounded-xl border border-blue-400/20 bg-blue-500/10 p-3 text-blue-400">{icon}</div><h1 className="text-2xl font-semibold text-slate-100">{title}</h1><p className="mt-2 text-sm leading-6 text-slate-400">{description}</p></header>{error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</p>}{children}</div></div>
}
function NativeState({ model }: { model: ReturnType<typeof useDesktop> }) {
  const { status, action, busy } = model
  if (!status) return null
  return <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span>{!status.supported ? '窗口控制暂仅支持 Windows x64。悬浮组件仍可使用。' : status.error ? status.error : status.running ? '桌面服务运行中 · 设置自动保存' : '按需启动 · 开启后在托盘后台运行'}</span>{status.supported && <button className="text-blue-400 disabled:opacity-40" disabled={busy} onClick={() => void action('desktop:retry')}>检查 / 重启服务</button>}</div>
}
export function DesktopSettingsPage() {
  const model = useDesktop(), { settings, status, error, busy, action } = model
  const modifier = settings.modifier === 'alt' ? 'Alt' : 'Alt + Shift'
  return <Layout title="桌面设置" description="让窗口跟着鼠标走，减少寻找标题栏和边缘的动作。" icon={<MousePointer2 className="h-6 w-6" />} error={error}>
    <section className={card}><div className="flex items-center justify-between gap-4"><div><h2 className="font-semibold text-slate-100">随处拖动窗口</h2><p className="mt-1 text-sm text-slate-400">按住修饰键，在窗口内容区域移动或调整大小。</p></div><Toggle label="开启窗口拖动" checked={settings.dragEnabled} disabled={busy || !status?.supported} onChange={() => void action('desktop:update', { dragEnabled: !settings.dragEnabled })} /></div>
      <div className="mt-6 border-t border-surface-700 pt-5"><p className="mb-3 text-xs text-slate-400">修饰键</p><div className="flex gap-3">{(['alt', 'alt-shift'] as const).map(value => <button key={value} disabled={busy} aria-pressed={settings.modifier === value} onClick={() => void action('desktop:update', { modifier: value })} className={`${button} ${settings.modifier === value ? 'border-blue-400! text-blue-400!' : ''}`}>{value === 'alt' ? 'Alt' : 'Alt + Shift'}</button>)}</div></div>
    </section>
    <div className="grid grid-cols-2 gap-4"><div className={card}><Move className="mb-5 h-7 w-7 text-sky-400" /><h3 className="text-sm font-semibold text-slate-100">移动窗口</h3><p className="mt-2 text-sm text-slate-400"><kbd>{modifier}</kbd> ＋ 鼠标左键拖动</p></div><div className={card}><ArrowUpRight className="mb-5 h-7 w-7 text-violet-400" /><h3 className="text-sm font-semibold text-slate-100">调整大小</h3><p className="mt-2 text-sm text-slate-400"><kbd>{modifier}</kbd> ＋ 鼠标右键拖动</p></div></div>
    <p className="text-xs leading-6 text-slate-500">支持普通可调整大小的窗口。最大化、全屏窗口保持原操作；管理员权限窗口可能需要同等权限。Alt + Shift 可减少与软件自身 Alt 操作的冲突。</p><NativeState model={model} />
  </Layout>
}
export function WindowSwitcherSettings() {
  const model = useDesktop(), { settings, status, busy, error, action } = model
  return <Layout title="窗口速切" description="输入名字，回到正在做的事。聚焦已打开的窗口，不混入应用推荐和文件搜索。" icon={<AppWindow className="h-6 w-6" />} error={error}>
    <section className={card}><div className="flex items-center justify-between gap-4"><div><h2 className="font-semibold text-slate-100">开启窗口速切</h2><p className="mt-1 text-sm text-slate-400">在鼠标所在屏幕中央呼出搜索栏。</p></div><Toggle label="开启窗口速切" checked={settings.switcherEnabled} disabled={busy || !status?.supported} onChange={() => void action('desktop:update', { switcherEnabled: !settings.switcherEnabled })} /></div><div className="mt-6 flex items-center justify-between border-t border-surface-700 pt-5"><div className="flex items-center gap-3"><Keyboard className="h-5 w-5 text-slate-400" /><kbd className="rounded-lg border border-surface-600 bg-surface-800 px-4 py-2 text-sm text-slate-100">Win + Space</kbd></div><button className={button} disabled={busy || !status?.supported} onClick={() => void action('desktop:preview-switcher')}>立即试用</button></div><p className="mt-4 text-xs text-slate-500">开启期间，Win + Space 用于窗口速切；关闭后恢复 Windows 原有快捷键。</p></section>
    <section className={`${card} space-y-4`}><h2 className="text-sm font-semibold text-slate-100">键盘优先，也支持鼠标</h2>{[['输入窗口标题 / 应用名', '即时过滤当前打开的窗口'], ['↑ / ↓', '选择窗口'], ['回车 / 点击', '激活窗口，必要时切换到它所在的桌面'], ['Shift + 回车 / Shift + 点击', '将窗口移到当前桌面并激活'], ['Esc / 再按 Win + Space', '关闭搜索栏']].map(([key, value]) => <div key={key} className="flex justify-between gap-6 text-sm"><span className="shrink-0 text-slate-200">{key}</span><span className="text-right text-slate-400">{value}</span></div>)}</section>
    <p className="text-xs leading-6 text-slate-500">{status?.virtualDesktop ? '已检测到多桌面支持，可跨桌面检索和移动窗口。' : '多桌面功能需兼容的 Windows 11 桌面接口；服务启动后检测。不可用时仍可切换当前桌面的窗口。'}</p><NativeState model={model} />
  </Layout>
}
const widgets: { kind: WidgetKind; title: string; description: string; color: string; icon: typeof Clock }[] = [
  { kind: 'note', title: '悬浮记事本', description: '随手写下想法，自动加密保存在本机。', color: 'text-amber-400', icon: StickyNote },
  { kind: 'clock', title: '悬浮时钟', description: '时间、星期与日期，抬眼即见。', color: 'text-sky-400', icon: Clock },
  { kind: 'clipboard', title: '悬浮剪贴板', description: '开启后记录最近 30 条文本，点击复制。', color: 'text-violet-400', icon: Clipboard }
]
export function FloatingSettings() {
  const { settings, displays, activeWidgetDisplayId, busy, error, action } = useDesktop()
  return <Layout title="悬浮组件" description="把常用的小工具停靠在屏幕边缘。选择独立使用，或组合为一起展开的桌面侧栏。" icon={<Grip className="h-6 w-6" />} error={error}>
    <section className={card}><label htmlFor="dock-display" className="block font-semibold text-slate-100">停靠显示器</label><p className="mt-2 text-sm text-slate-400">随手记、时钟、剪贴板和 AI 额度统一显示在这一块屏幕，拖动和缩放也保持在屏幕内。</p><select id="dock-display" className="mt-4 w-full rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-sm text-slate-200" value={settings.widgetDisplayId} disabled={busy} onChange={event => void action('desktop:update', { widgetDisplayId: event.target.value })}><option value="primary">主显示器（自动跟随）</option>{displays.map(display => <option key={display.id} value={display.id}>{display.label}{display.primary ? ' · 主显示器' : ''} · {display.width} × {display.height}</option>)}{settings.widgetDisplayId !== 'primary' && !displays.some(display => display.id === settings.widgetDisplayId) && <option value={settings.widgetDisplayId}>已选显示器（未连接）</option>}</select><p className="mt-3 text-xs leading-5 text-slate-500">当前：{displays.find(display => display.id === activeWidgetDisplayId)?.label ?? '主显示器'}。所选屏幕断开时临时回到主屏，重连后自动恢复。独立停靠和联动停靠共用此设置。</p></section>
    <section className={card}><h2 className="font-semibold text-slate-100">停靠模式</h2><div className="mt-4 grid grid-cols-2 gap-3" role="group" aria-label="停靠模式">{([{ value: 'independent', title: '独立停靠', description: '分别移动、缩放和固定。悬停切换时，自动收起上一个面板。' }, { value: 'grouped', title: '联动停靠', description: '已开启的组件连续排列，统一移动、展开、收起和固定。' }] as const).map(mode => <button key={mode.value} aria-label={mode.title} aria-pressed={settings.widgetMode === mode.value} disabled={busy} onClick={() => void action('desktop:update', { widgetMode: mode.value })} className={`${button} text-left ${settings.widgetMode === mode.value ? 'border-blue-400! bg-blue-500/10!' : ''}`}><strong className="block font-medium">{mode.title}</strong><span className="mt-2 block text-xs leading-5 text-slate-400">{mode.description}</span></button>)}</div><p className="mt-4 text-xs leading-5 text-slate-500">切换模式会保留各组件原来的位置和固定状态。AI 订阅中开启桌面悬浮的环境也会加入组件组。</p>{settings.widgetMode === 'grouped' && <button className={`${button} mt-4 flex items-center gap-2`} disabled={busy} aria-pressed={settings.widgetGroup.pinned} onClick={() => void action('desktop:widget-setting', 'group', { pinned: !settings.widgetGroup.pinned })}><Pin size={14} />{settings.widgetGroup.pinned ? '取消固定组件组' : '固定整个组件组'}</button>}</section>
    {widgets.map(({ kind, title, description, icon: Icon, color }) => <section key={kind} className={card}><div className="flex items-center gap-4"><div className={`rounded-xl bg-surface-800 p-3 ${color}`}><Icon className="h-6 w-6" /></div><div className="flex-1"><h2 className="font-semibold text-slate-100">{title}</h2><p className="mt-1 text-sm text-slate-400">{description}</p></div><Toggle label={`开启${title}`} checked={settings.widgets[kind].enabled} disabled={busy} onChange={() => void action('desktop:widget-setting', kind, { enabled: !settings.widgets[kind].enabled })} /></div><div className="mt-4 flex items-center justify-between border-t border-surface-700 pt-4 text-xs"><span className="text-slate-500">{settings.widgetMode === 'grouped' ? '联动停靠 · 由组件组统一控制' : settings.widgets[kind].edge === 'none' ? '自由悬浮 · 保持展开' : '靠边停靠 · 鼠标移开后收起'}</span>{settings.widgetMode === 'independent' && <button disabled={busy} aria-pressed={settings.widgets[kind].pinned} onClick={() => void action('desktop:widget-setting', kind, { pinned: !settings.widgets[kind].pinned })} className={`flex items-center gap-1.5 ${settings.widgets[kind].pinned ? 'text-blue-400' : 'text-slate-400'}`}><Pin className="h-3.5 w-3.5" />{settings.widgets[kind].pinned ? '已固定展开' : '固定展开'}</button>}</div></section>)}
    {settings.widgetMode === 'grouped' && <section className={card}><DockPosition label="组件组停靠位置" edge={settings.widgetGroup.edge} disabled={busy} onChange={edge => void action('desktop:widget-setting', 'group', { edge })} /><p className="mt-3 text-xs leading-5 text-slate-500">拖动四边或角落调整整个组件组大小。向内侧拖宽后自动分列，尺寸会保存。</p></section>}
    <QuotaDockSettings settings={settings} disabled={busy} />
    <div className="grid grid-cols-3 gap-3 text-xs text-slate-400">{[[Grip, '拖动顶部手柄', '靠边停靠，移到中间自由悬浮'], [ArrowUpRight, '拖动边缘或角落', '调整大小，联动组件加宽后自动分列'], [ToggleRight, '悬停展开 / Pin 固定', '移开后快速收起，固定后保持展开']].map(([Icon, title, text]) => { const Glyph = Icon as typeof Grip; return <div key={String(title)} className="rounded-xl bg-surface-900 p-4"><Glyph className="mb-3 h-5 w-5 text-slate-400" /><p className="text-slate-200">{String(title)}</p><p className="mt-2 leading-5">{String(text)}</p></div> })}</div>
    <p className="text-xs leading-6 text-slate-500">剪贴板记录仅保留在内存，关闭组件或退出程序即清空。带有密码管理器保密标记的内容会跳过；普通文本可能包含敏感信息，可随时清空记录。</p>
  </Layout>
}
