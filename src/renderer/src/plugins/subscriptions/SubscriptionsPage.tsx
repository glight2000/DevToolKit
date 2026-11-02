import { useEffect, useState } from 'react'
import { Gauge, Plus, RefreshCw, Search, Server, Monitor, LockKeyhole, Pencil, Trash2, ArrowUpRight, Settings2 } from 'lucide-react'
import type { ConnectionCatalog } from '../../../../shared/ssh-connections'
import { quotaSummary, type SubscriptionDraft, type SubscriptionRecord } from '../../../../shared/subscriptions'
import Modal from '../../components/common/Modal'
import SubscriptionDetail, { dateLabel } from './SubscriptionDetail'
import RefreshSettingsDialog from './RefreshSettingsDialog'
import DockSettingsDialog from './DockSettingsDialog'
import './subscriptions.css'

const blank: SubscriptionDraft = { name: '', connectionKind: 'profile', connectionId: '', providers: ['codex', 'claude'], codexHome: '', claudeHome: '', refreshMinutes: 5 }
export default function SubscriptionsPage() {
  const [records, setRecords] = useState<SubscriptionRecord[]>([]), [selected, setSelected] = useState(''), [error, setError] = useState(''), [query, setQuery] = useState('')
  const [refreshSettingsOpen, setRefreshSettingsOpen] = useState(false)
  const [dockSettingsOpen, setDockSettingsOpen] = useState(false)
  const [catalog, setCatalog] = useState<ConnectionCatalog>(), [form, setForm] = useState<{ draft: SubscriptionDraft; id?: string }>(), [remove, setRemove] = useState<SubscriptionRecord>(), [busy, setBusy] = useState(false), [formError, setFormError] = useState('')
  useEffect(() => { let alive = true; const off = window.api.on('subscriptions:changed', value => { if (alive) setRecords(value) }); window.api.invoke('subscriptions:list').then(value => { if (alive) setRecords(value) }).catch(e => setError(String(e))); return () => { alive = false; off() } }, [])
  const action = async (name: string, ...args: unknown[]) => { setError(''); try { const value = await window.api.invoke(`subscriptions:${name}`, ...args); setRecords(value) } catch (e) { setError(String(e)); window.api.invoke('subscriptions:list').then(setRecords).catch(() => {}) } }
  const edit = async (record?: SubscriptionRecord) => { setFormError(''); setForm({ draft: record ? { ...record } : { ...blank }, id: record?.id }); try { setCatalog(await window.api.invoke('ssh:catalog', true)) } catch (e) { setFormError(String(e)) } }
  const options = [...(catalog?.profiles ?? []).map(p => ({ kind: 'profile' as const, id: p.id, name: p.name, source: `${p.environment} · 软件配置` })), ...(catalog?.aliases ?? []).map(a => ({ kind: 'system' as const, id: a.id, name: a.alias, source: `${a.sourceId} · 系统 config` }))]
  const shown = records.filter(r => `${r.name} ${r.connectionName} ${r.accounts.map(a => `${a.account} ${a.plan}`).join(' ')}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const current = shown.find(r => r.id === selected) ?? shown[0]
  const needsAttention = records.filter(r => r.error || r.accounts.some(a => a.status !== 'live' || a.windows.some(w => w.usedPercent >= 90))).length
  const goSsh = () => window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'ssh-connections' }))
  return <div className="subscriptions-page">
    <header className="subscriptions-header"><div><span className="quota-eyebrow">AI ENVIRONMENTS</span><h1><Gauge size={25} />AI 订阅</h1><p>查看本地与远端账号、额度和对话历史。本地环境自动提供，远端环境通过 SSH 添加。</p></div><div className="quota-actions"><button onClick={() => setDockSettingsOpen(true)}><Monitor size={15} />停靠设置</button><button onClick={() => setRefreshSettingsOpen(true)}><Settings2 size={15} />刷新设置</button><button disabled={!records.length || records.some(r => r.refreshing)} onClick={() => void action('refresh-all')}><RefreshCw size={15} />刷新全部</button><button className="primary" onClick={() => void edit()}><Plus size={16} />添加环境</button></div></header>
    {error && <p role="alert" className="quota-alert">{error}</p>}
    <div className="quota-overview"><div><small>已添加环境</small><strong>{records.length}<span> 本地 + SSH</span></strong></div><div><small>需要留意</small><strong>{needsAttention}<span> 额度或连接</span></strong></div><div><small>收起时的缩略环境</small><strong>{records.filter(r => r.connectionKind === 'local' || r.widget.enabled).length}<span> / 9 项</span></strong></div></div>
    <div className="quota-toolbar"><Search size={16} /><input aria-label="搜索订阅环境" placeholder="搜索环境、账号或套餐…" value={query} onChange={e => setQuery(e.target.value)} /><button onClick={goSsh}>管理 SSH 连接<ArrowUpRight size={13} /></button></div>
    {!records.length ? <div className="quota-empty-state"><span><Server size={35} /></span><h2>从一个 SSH 环境开始</h2><p>先在 SSH Connections 添加远程连接，再选择该连接读取 Codex / Claude 登录与订阅信息。</p><button className="primary" onClick={() => void edit()}><Plus size={16} />添加第一个环境</button><button onClick={goSsh}>前往 SSH Connections</button></div> : <div className="subscriptions-layout">
      <div className="subscription-list" aria-label="订阅环境列表">{shown.map(record => { const summary = quotaSummary(record); return <article key={record.id} className={`subscription-card ${current?.id === record.id ? 'selected' : ''}`}>
        <button className="subscription-select" onClick={() => setSelected(record.id)} aria-pressed={current?.id === record.id}><span className="environment-symbol">{record.connectionKind === 'local' ? <Monitor size={20} /> : <Server size={20} />}</span><div><strong>{record.name}</strong><small>{record.connectionName} · {record.connectionKind === 'local' ? '内置' : record.connectionKind === 'profile' ? '软件配置' : '系统 config'}</small></div><span className={`quota-status ${record.error ? 'error' : ''}`}>{record.refreshing ? '读取中' : record.error ? '需检查' : record.accounts.length ? '已读取' : '待查询'}</span></button>
        <div className="subscription-tags">{record.providers.map(p => <span key={p}>{p === 'codex' ? 'Codex' : 'Claude'}</span>)}<span>{record.accounts.map(a => a.plan).filter(Boolean).join(' / ') || '套餐待查询'}</span></div>
        <div className={`subscription-meter ${summary.stale ? 'is-stale' : ''}`}><span>{summary.remaining === undefined ? '暂无额度读数' : `最紧张窗口剩余 ${Math.round(summary.remaining)}%`}</span><progress max={100} value={summary.remaining ?? 0} aria-label={`${record.name} 剩余额度`} /><small>{summary.stale ? '非实时读数 · ' : ''}{dateLabel(record.checkedAt)}</small></div>
        <footer><label><input type="checkbox" checked={record.connectionKind === 'local' || record.widget.enabled} disabled={record.connectionKind === 'local' || (!record.widget.enabled && records.filter(r => r.connectionKind === 'local' || r.widget.enabled).length >= 9)} onChange={e => { const enabled = e.target.checked; setRecords(rows => rows.map(r => r.id === record.id ? { ...r, widget: { ...r.widget, enabled } } : r)); void action('floating', record.id, enabled) }} />收起时显示</label><button aria-label={`刷新 ${record.name}`} disabled={record.refreshing} onClick={() => void action('refresh', record.id)}><RefreshCw size={14} /></button>{record.connectionKind === 'local' ? <span title="内置环境自动读取当前系统用户，不能修改或移除" aria-label="内置固定环境"><LockKeyhole size={14} /></span> : <><button aria-label={`编辑 ${record.name}`} disabled={record.refreshing} onClick={() => void edit(record)}><Pencil size={14} /></button><button aria-label={`移除 ${record.name}`} onClick={() => setRemove(record)}><Trash2 size={14} /></button></>}</footer>
      </article> })}{!shown.length && <div className="quota-empty">没有匹配的环境</div>}</div>
      {current && <section className="subscription-detail-panel"><header><div><h2>{current.name}</h2><small>{current.nextRefreshAt ? `下次查询 ${dateLabel(current.nextRefreshAt)}` : '自动刷新已暂停'} · 客户端独立调度</small></div><span className="quota-live-dot" /></header>{current.connectionKind === 'local' && <p className="quota-message">内置固定环境，读取当前系统用户的 Codex / Claude 配置，无需 SSH。Windows 与 WSL 是独立环境；本机 WSL 发行版自动读取（发行版内需 Python 3）。</p>}<SubscriptionDetail key={current.id} record={current} /></section>}
    </div>}
    <Modal open={!!form} title={form?.id ? '编辑远端环境' : '添加远端环境'} onClose={() => { if (!busy) setForm(undefined) }}>
      {form && <form className="quota-form" onSubmit={async e => { e.preventDefault(); setBusy(true); setFormError(''); try { const value = await window.api.invoke('subscriptions:save', form.draft, form.id); setRecords(value); setForm(undefined) } catch (e) { setFormError(String(e)) } finally { setBusy(false) } }}>
        <label>环境名称<input required maxLength={100} value={form.draft.name} onChange={e => setForm({ ...form, draft: { ...form.draft, name: e.target.value } })} placeholder="例如：开发工作站 · 主账号" /></label>
        <label>已有 SSH 连接<select aria-label="已有 SSH 连接" required value={form.draft.connectionId ? `${form.draft.connectionKind}:${form.draft.connectionId}` : ''} onChange={e => { const option = options.find(o => `${o.kind}:${o.id}` === e.target.value); if (option) setForm({ ...form, draft: { ...form.draft, connectionKind: option.kind, connectionId: option.id, name: form.draft.name || option.name } }) }}><option value="">请选择一个已保存的连接</option>{options.map(o => <option key={`${o.kind}:${o.id}`} value={`${o.kind}:${o.id}`}>{o.name} — {o.source}</option>)}</select></label>
        {catalog && !options.length && <p className="quota-alert">没有可用连接。请先在 SSH Connections 添加配置，或启动需要读取 config 的 WSL 发行版。</p>}
        <fieldset><legend>读取的客户端</legend>{(['codex', 'claude'] as const).map(p => <label key={p} className="quota-check"><input type="checkbox" checked={form.draft.providers.includes(p)} onChange={e => setForm({ ...form, draft: { ...form.draft, providers: e.target.checked ? [...form.draft.providers, p] : form.draft.providers.filter(v => v !== p) } })} />{p === 'codex' ? 'Codex' : 'Claude Code'}</label>)}</fieldset>
        <label>Codex 配置目录（远端）<input value={form.draft.codexHome} onChange={e => setForm({ ...form, draft: { ...form.draft, codexHome: e.target.value } })} placeholder="留空使用远端 CODEX_HOME 或 ~/.codex" /></label>
        <label>Claude 配置目录（远端）<input value={form.draft.claudeHome} onChange={e => setForm({ ...form, draft: { ...form.draft, claudeHome: e.target.value } })} placeholder="留空使用远端 CLAUDE_CONFIG_DIR 或 ~/.claude" /></label>
        <label>Codex 自动刷新（分钟）<input type="number" min={2} max={1440} value={form.draft.refreshMinutes} onChange={e => setForm({ ...form, draft: { ...form.draft, refreshMinutes: Number(e.target.value) } })} /></label>
        <p className="quota-message">Claude 的刷新与重试周期在页面右上角「刷新设置」中统一配置。</p>
        <p className="quota-message">支持有 Python 3 的 Linux／WSL／macOS 远端。后台查询使用已确认主机的 SSH 密钥／agent；密码连接请先配置免交互认证。登录凭据留在远端，不执行登录、退出或换号。</p>
        {formError && <p role="alert" className="quota-alert">{formError}</p>}
        <div className="quota-actions"><button type="button" disabled={busy} onClick={() => setForm(undefined)}>取消</button><button className="primary" disabled={busy || !form.draft.connectionId || !form.draft.providers.length}>{busy ? '正在保存…' : '保存并读取'}</button></div>
      </form>}
    </Modal>
    <Modal open={!!remove} title="移除环境" onClose={() => setRemove(undefined)}><p className="text-sm text-slate-300">移除“{remove?.name}”的展示记录和本机采样？远端登录、对话和 SSH 配置均保留。</p><div className="quota-actions mt-5"><button onClick={() => setRemove(undefined)}>取消</button><button className="danger" onClick={async () => { await action('remove', remove!.id); setRemove(undefined) }}>移除</button></div></Modal>
    <RefreshSettingsDialog open={refreshSettingsOpen} onClose={() => setRefreshSettingsOpen(false)} />
    <DockSettingsDialog open={dockSettingsOpen} onClose={() => setDockSettingsOpen(false)} />
  </div>
}
