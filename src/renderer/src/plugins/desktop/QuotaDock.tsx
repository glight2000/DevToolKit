import { useState } from 'react'
import { Monitor, RefreshCw, Server, Terminal, TriangleAlert } from 'lucide-react'
import type { SubscriptionRecord } from '../../../../shared/subscriptions'
import { quotaSummary, quotaDockRecords, quotaDockGrid } from '../../../../shared/subscriptions'
import QuotaAccountPanel, { QuotaHint } from './QuotaAccountPanel'

export function QuotaTiles({ records, now }: { records: SubscriptionRecord[]; now: number }) {
  const shown = quotaDockRecords(records)
  return <div className="quota-dock-tiles" style={{ gridTemplateColumns: `repeat(${quotaDockGrid(shown.length).columns},1fr)` }}>
    {shown.map(record => <div className="quota-dock-tile" key={record.id} title={`${record.name} · ${record.connectionName}`}><strong>{record.connectionKind === 'local' ? record.connectionId ? 'WSL' : record.connectionName.startsWith('Windows') ? 'Win' : record.connectionName.split(' · ')[0] : record.name}</strong><span className="quota-tile-providers">{record.providers.map(provider => {
      const account = record.accounts.find(a => a.provider === provider)
      const summary = quotaSummary({ ...record, accounts: account ? [account] : [] }, now)
      const remaining = summary.remaining === undefined ? '暂无额度读数' : `剩余 ${Math.round(summary.remaining)}%`
      return <span key={provider} className={`quota-tile-provider ${provider} ${summary.stale ? 'stale' : ''}`} title={`${record.name} · ${provider} · ${account?.plan ?? '套餐未知'} · ${remaining}`}><span className="quota-tile-track" role="progressbar" aria-label={`${record.name} ${provider} 剩余额度`} aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary.remaining} aria-valuetext={`${account?.plan ?? '套餐未知'} · ${remaining}`}><span className="quota-tile-fill" style={{ height: `${summary.remaining ?? 0}%` }} />{summary.remaining === undefined && <span className="quota-tile-unknown">—</span>}</span><i>{provider === 'codex' ? 'CX' : 'CL'}</i></span>
    })}</span></div>)}
    {!shown.length && <span className="quota-dock-tile">AI 额度</span>}
  </div>
}

export function QuotaDockDetails({ records }: { records: SubscriptionRecord[] }) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  return <div className="quota-dock-details" aria-label="全部环境额度详情" onWheel={event => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && !(event.target as HTMLElement).closest('.subscription-detail')) { event.currentTarget.scrollLeft += event.deltaY; event.preventDefault() } }}>
    {records.map(record => { const Icon = record.connectionKind === 'local' ? record.connectionId ? Terminal : Monitor : Server; return <section className="quota-dock-environment" key={record.id} aria-label={`${record.name}额度详情`}><header><QuotaHint text={`${record.connectionName}\nShift + 滚轮横向浏览`}><Icon size={13} /><strong>{record.name}</strong></QuotaHint><span className="dock-environment-actions">{errors[record.id] && <QuotaHint text={errors[record.id]}><TriangleAlert size={13} className="dock-refresh-error" /></QuotaHint>}<button aria-label={`刷新 ${record.name}`} title={record.refreshing ? '正在读取' : '刷新此环境'} disabled={record.refreshing} onClick={() => { setErrors(old => ({ ...old, [record.id]: '' })); void window.api.invoke('subscriptions:refresh', record.id).catch(e => setErrors(old => ({ ...old, [record.id]: String(e) }))) }}><RefreshCw size={13} className={record.refreshing ? 'animate-spin' : ''} /></button></span></header><div className="quota-dock-accounts">{record.providers.map(provider => <QuotaAccountPanel key={provider} record={record} provider={provider} />)}</div></section> })}
  </div>
}
