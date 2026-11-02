import { useEffect, useState } from 'react'
import { defaultSubscriptionRefreshSettings, validateSubscriptionRefreshSettings, type SubscriptionRefreshSettings } from '../../../../shared/subscription-refresh'
import Modal from '../../components/common/Modal'

export default function RefreshSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [settings, setSettings] = useState(defaultSubscriptionRefreshSettings), [stages, setStages] = useState('5, 20, 60, 1440')
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false)
  const apply = (value: SubscriptionRefreshSettings) => { setSettings(value); setStages(value.claudeFailureMinutes.join(', ')) }
  useEffect(() => {
    if (!open) return
    let active = true; setLoading(true); setError('')
    window.api.invoke('subscriptions:refresh-settings').then(value => { if (active) apply(value) }).catch(e => { if (active) setError(String(e)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [open])
  return <Modal open={open} title="订阅刷新设置" width="max-w-xl" onClose={() => { if (!saving) onClose() }}>
    <form className="quota-form quota-refresh-form" onSubmit={async e => {
      e.preventDefault(); setError(''); setSaving(true)
      try {
        const value = validateSubscriptionRefreshSettings({ ...settings, claudeFailureMinutes: stages.split(/[,，]/).map(v => Number(v.trim())) })
        await window.api.invoke('subscriptions:save-refresh-settings', value); onClose()
      } catch (e) { setError(String(e)) } finally { setSaving(false) }
    }}>
      <p className="quota-message">适用于所有本地与 SSH 环境中的 Claude。Codex 按环境的刷新周期独立运行。</p>
      <label>Claude 正常刷新（分钟）<input type="number" required min={2} max={10080} disabled={loading || saving} value={settings.claudeRefreshMinutes} onChange={e => setSettings({ ...settings, claudeRefreshMinutes: Number(e.target.value) })} /></label>
      <label>连续失败的重试间隔（分钟）<input required disabled={loading || saving} value={stages} onChange={e => setStages(e.target.value)} placeholder="5, 20, 60, 1440" /></label>
      <p className="quota-message">用逗号分隔递增间隔，最后一个间隔会重复使用。1440 分钟 = 24 小时。重试不会短于正常刷新间隔，成功后恢复正常周期。</p>
      <label className="quota-check"><input type="checkbox" disabled={loading || saving} checked={settings.claudePauseWhenSignedOut} onChange={e => setSettings({ ...settings, claudePauseWhenSignedOut: e.target.checked })} />Claude 未登录或凭据不可读时，暂停自动刷新</label>
      <p className="quota-message">暂停后不再自动查询 Claude。登录后可点环境的刷新按钮重新检测，或关闭此开关恢复定期检测。手动刷新至少间隔 2 分钟，可提前结束自动重试等待。</p>
      {error && <p role="alert" className="quota-alert">{error}</p>}
      <div className="quota-actions"><button type="button" disabled={loading || saving} onClick={() => apply(defaultSubscriptionRefreshSettings())}>恢复默认</button><button type="button" disabled={saving} onClick={onClose}>取消</button><button className="primary" disabled={loading || saving}>{saving ? '正在保存…' : '保存刷新设置'}</button></div>
    </form>
  </Modal>
}
