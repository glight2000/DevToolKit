import { useEffect, useState } from 'react'
import { Keyboard, Search } from 'lucide-react'
import { defaultLauncherSettings, launcherGroups, type LauncherSettings, type LauncherState } from '../../../../shared/launcher'

export default function LauncherSettingsPage() {
  const [state, setState] = useState<LauncherState>({ settings: defaultLauncherSettings(), active: false, error: null }), [busy, setBusy] = useState(true), [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    void window.api.invoke('launcher:get').then(value => { if (alive) setState(value) }).catch(error => { if (alive) setError(String(error)) }).finally(() => { if (alive) setBusy(false) })
    const off = window.api.on('launcher:changed', setState)
    return () => { alive = false; off() }
  }, [])
  const update = async (patch: Partial<LauncherSettings>) => {
    const previous = state
    setState({ ...state, settings: { ...state.settings, ...patch } })
    setBusy(true); setError('')
    try { setState(await window.api.invoke('launcher:update', patch)) } catch (error) { setState(previous); setError(String(error)) } finally { setBusy(false) }
  }
  const settings = state.settings
  return <div className="h-full overflow-y-auto bg-surface-950 p-6"><div className="mx-auto max-w-4xl space-y-5">
    <header className="mb-7"><div className="mb-3 inline-flex rounded-xl border border-blue-400/20 bg-blue-500/10 p-3 text-blue-400"><Search size={24} /></div><h1 className="text-2xl font-semibold text-slate-100">快捷启动</h1><p className="mt-2 text-sm leading-6 text-slate-400">按下 Alt + Space，在屏幕中央搜索并执行常用操作。</p></header>
    {(error || state.error) && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-400">{error || state.error}</p>}
    <section className="rounded-2xl border border-surface-700 bg-surface-900 p-5"><div className="flex items-center justify-between gap-4"><div><h2 className="font-semibold text-slate-100">全局快捷键</h2><p className="mt-1 text-sm text-slate-400">程序在托盘运行时也可使用。</p></div><button role="switch" aria-label="开启快捷启动" aria-checked={settings.enabled} disabled={busy} onClick={() => void update({ enabled: !settings.enabled })} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${settings.enabled ? 'bg-blue-500' : 'bg-surface-600'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${settings.enabled ? 'left-6' : 'left-1'}`} /></button></div><div className="mt-5 flex items-center justify-between border-t border-surface-700 pt-5"><div className="flex items-center gap-3 text-slate-300"><Keyboard size={20} /><kbd className="rounded-lg border border-surface-600 bg-surface-800 px-4 py-2 text-sm">Alt + Space</kbd></div><button disabled={busy} className="rounded-lg border border-surface-600 px-4 py-2 text-sm text-slate-200 hover:border-blue-400 disabled:opacity-40" onClick={() => void window.api.invoke('launcher:preview').catch(error => setError(String(error)))}>立即试用</button></div><p className="mt-4 text-xs text-slate-500">{state.active ? '快捷键已生效；关闭后恢复系统原有操作。' : settings.enabled ? '快捷键尚未生效。' : '关闭状态 · 可通过“立即试用”预览。'} Win + Space 仍用于窗口速切。</p>{settings.enabled && !state.active && <button className="mt-3 text-sm text-blue-400" disabled={busy} onClick={() => void update({ enabled: true })}>重新注册快捷键</button>}</section>
    <section className="rounded-2xl border border-surface-700 bg-surface-900 p-5"><h2 className="mb-4 font-semibold text-slate-100">常用功能</h2><div className="grid gap-3 sm:grid-cols-2">{launcherGroups.map(group => <label key={group.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-surface-700 p-4"><input type="checkbox" disabled={busy} checked={settings.groups.includes(group.id)} onChange={event => void update({ groups: event.target.checked ? [...settings.groups, group.id] : settings.groups.filter(id => id !== group.id) })} className="mt-1 accent-blue-500" /><span><strong className="text-sm font-medium text-slate-200">{group.name}</strong><span className="mt-1 block text-xs leading-5 text-slate-400">{group.description}</span></span></label>)}</div></section>
    <section className="rounded-2xl border border-surface-700 bg-surface-900 p-5"><label className="flex cursor-pointer items-center gap-3 text-sm text-slate-200"><input type="checkbox" disabled={busy} checked={settings.hideOnBlur} onChange={event => void update({ hideOnBlur: event.target.checked })} className="accent-blue-500" />切换到其他窗口时关闭快捷栏</label><p className="mt-3 text-xs leading-6 text-slate-500">↑ / ↓ 选择，回车执行，Esc 或再次按 Alt + Space 关闭。可输入中文名称或英文关键词；例如“剪贴板”、“uuid”、“(128 + 32) / 4”。</p></section>
  </div></div>
}
