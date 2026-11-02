import { useEffect, useState } from 'react'
import { Gauge, Pin } from 'lucide-react'
import type { DesktopSettings, DockEdge } from '../../../../shared/desktop'
import type { SubscriptionRecord } from '../../../../shared/subscriptions'

export function DockPosition({ edge, disabled, onChange, label = '停靠位置' }: { edge: DockEdge; disabled?: boolean; onChange: (edge: DockEdge) => void; label?: string }) {
  return <label className="flex items-center gap-3 text-xs text-slate-400">{label}<select aria-label={label} disabled={disabled} value={edge} onChange={e => onChange(e.target.value as DockEdge)} className="rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-slate-200">{([['left', '左侧'], ['right', '右侧'], ['top', '顶部'], ['bottom', '底部'], ['none', '自由悬浮']] as const).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
}

export default function QuotaDockSettings({ settings, disabled = false }: { settings: DesktopSettings; disabled?: boolean }) {
  const [records, setRecords] = useState<SubscriptionRecord[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    let alive = true, received = false
    const off = window.api.on('subscriptions:changed', value => { received = true; if (alive) setRecords(value) })
    window.api.invoke('subscriptions:list').then(value => { if (alive && !received) setRecords(value) }).catch(e => { if (alive) setError(String(e)) })
    return () => { alive = false; off() }
  }, [])
  const update = async (channel: string, ...args: unknown[]) => {
    setBusy(true); setError('')
    try { await window.api.invoke(channel, ...args) } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }
  const grouped = settings.widgetMode === 'grouped', quota = settings.widgets.quota
  const selected = records.filter(r => r.connectionKind === 'local' || r.widget.enabled).length
  return <section className="rounded-2xl border border-surface-700 bg-surface-900 p-5" aria-label="AI 额度停靠设置">
    <div className="flex items-center gap-3"><Gauge className="h-6 w-6 shrink-0 text-emerald-400" /><div className="flex-1"><h2 className="font-semibold text-slate-100">AI 额度组件</h2><p className="mt-1 text-xs leading-5 text-slate-400">一个组件汇总所有环境，收起时最多展示 9 个环境缩略格。</p></div><button role="switch" aria-label="开启AI额度组件" aria-checked={quota.enabled} disabled={busy || disabled} onClick={() => void update('desktop:widget-setting', 'quota', { enabled: !quota.enabled })} className={`relative h-7 w-12 shrink-0 rounded-full disabled:opacity-40 ${quota.enabled ? 'bg-blue-500' : 'bg-surface-600'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${quota.enabled ? 'left-6' : 'left-1'}`} /></button></div>
    {error && <p role="alert" className="mt-3 text-xs text-red-400">{error}</p>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">{grouped ? <span className="text-xs text-slate-500">联动停靠 · 跟随组件组展开和收起</span> : <><DockPosition label="AI额度停靠位置" edge={quota.edge} disabled={busy || disabled} onChange={edge => void update('desktop:widget-setting', 'quota', { edge })} /><button aria-label="固定AI额度展开" aria-pressed={quota.pinned} disabled={busy || disabled} className={`flex items-center gap-1.5 text-xs ${quota.pinned ? 'text-blue-400' : 'text-slate-400'}`} onClick={() => void update('desktop:widget-setting', 'quota', { pinned: !quota.pinned })}><Pin size={14} />{quota.pinned ? '已固定展开' : '固定展开'}</button></>}</div>
    <p className="mb-2 mt-5 text-xs text-slate-400">收起时显示 · {Math.min(selected, 9)} / 9</p>
    <div className="space-y-2">{records.map(record => { const local = record.connectionKind === 'local'; return <label key={record.id} className="flex items-center gap-3 rounded-lg border border-surface-700 px-3 py-2 text-xs text-slate-200"><input type="checkbox" aria-label={`${record.name}加入缩略网格`} checked={local || record.widget.enabled} disabled={disabled || busy || local || (!record.widget.enabled && selected >= 9)} onChange={e => void update('subscriptions:floating', record.id, e.target.checked)} /><span className="flex-1 truncate">{record.name}</span><span className="text-slate-500">{local ? '本机 · 默认显示' : 'SSH'}</span></label> })}</div>
    <p className="mt-4 text-xs leading-5 text-slate-500">1–3 项一行，4–6 项两行，7–9 项三行。展开后展示全部环境；高度固定，左右边缘可调整宽度，超出屏幕宽度的内容横向滚动。</p>
  </section>
}
