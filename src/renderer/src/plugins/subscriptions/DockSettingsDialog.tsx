import Modal from '../../components/common/Modal'
import QuotaDockSettings, { DockPosition } from '../desktop/QuotaDockSettings'
import { useDesktop } from '../desktop/SettingsPages'

function Settings() {
  const { settings, busy, error, action } = useDesktop()
  return <div className="space-y-4">
    <p className="text-xs leading-5 text-slate-400">停靠模式与其他悬浮组件共用，修改后立即生效。</p>
    <div className="flex gap-3">{(['independent', 'grouped'] as const).map(mode => <button key={mode} disabled={busy} aria-pressed={settings.widgetMode === mode} className={`flex-1 rounded-lg border px-4 py-3 text-sm ${settings.widgetMode === mode ? 'border-blue-400 bg-blue-500/10 text-blue-400' : 'border-surface-600 text-slate-300'}`} onClick={() => void action('desktop:update', { widgetMode: mode })}>{mode === 'independent' ? '独立停靠' : '联动停靠'}</button>)}</div>
    {settings.widgetMode === 'grouped' && <div className="flex flex-wrap items-center justify-between gap-3"><DockPosition label="组件组停靠位置" edge={settings.widgetGroup.edge} disabled={busy} onChange={edge => void action('desktop:widget-setting', 'group', { edge })} /><label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={settings.widgetGroup.pinned} disabled={busy} onChange={e => void action('desktop:widget-setting', 'group', { pinned: e.target.checked })} />固定整个组件组</label></div>}
    {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
    <QuotaDockSettings settings={settings} disabled={busy} />
  </div>
}
export default function DockSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Modal open={open} onClose={onClose} title="AI 额度停靠设置">{open && <Settings />}</Modal>
}
