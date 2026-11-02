import { useState } from 'react'
import { pressure, type SubscriptionRecord, type AccountSnapshot } from '../../../../shared/subscriptions'
import './subscriptions.css'
export const dateLabel = (value?: number) => value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '未提供'
const statusNames = { live: '已验证', 'signed-out': '未登录', unavailable: '待查询 / 不支持', error: '读取失败' }
export function AccountUsage({ account, compact = false }: { account: AccountSnapshot; compact?: boolean }) {
  return <section className="quota-account">
    <header><span className={`provider-mark ${account.provider}`}>{account.provider === 'codex' ? 'CX' : 'CL'}</span><div><strong>{account.provider === 'codex' ? 'Codex' : 'Claude Code'}</strong><small>{account.account ?? '账号信息未提供'}</small></div><span className={`quota-status ${account.status}`}>{statusNames[account.status]}</span></header>
    <div className="quota-plan"><span>{account.plan ?? '套餐未提供'}</span><small>数据时间 {dateLabel(account.observedAt)}</small></div>
    {account.message && <p className="quota-message">{account.message}</p>}
    {account.windows.length === 0 && <p className="quota-message">尚无可展示的订阅额度</p>}
    {account.windows.map(w => { const assessment = pressure(w), stale = account.status !== 'live' || (w.resetsAt && w.resetsAt <= Date.now()); return <div className={`quota-window ${stale ? 'is-stale' : ''}`} key={w.id}>
      <div><span>{w.label}</span><strong>剩余 {Math.round(100 - w.usedPercent)}%</strong></div>
      <progress aria-label={`${account.provider} ${w.label} 剩余额度`} max={100} value={100 - w.usedPercent} />
      <footer><span>重置 {dateLabel(w.resetsAt)}</span><span title={assessment.explanation} className={`pressure-${stale ? 'unknown' : assessment.level}`}>{stale ? '旧读数' : assessment.label}</span></footer>
    </div> })}
    <div className="quota-facts"><div><small>充值余额 / Credits</small><strong>{account.credits?.unlimited ? '不限额' : account.credits?.balance !== undefined ? `${account.credits.balance} ${account.credits.unit}` : account.credits?.used !== undefined ? `${account.credits.used} / ${account.credits.limit ?? '—'} ${account.credits.unit} 已用` : '未提供'}</strong>{account.credits?.expiresAt && <small>到期 {dateLabel(account.credits.expiresAt)}</small>}</div><div><small>额度重置券</small><strong>{account.coupons ? `${account.coupons.available} 张` : '未提供'}</strong></div></div>
    {!!account.coupons?.items.length && <ul className="quota-coupons">{account.coupons.items.map((c, i) => <li key={i}><span>{c.title}</span><small>到期 {dateLabel(c.expiresAt)}</small></li>)}</ul>}
    {account.coupons && !account.coupons.detailsAvailable && <p className="quota-message">服务仅提供券数量，未提供到期明细。</p>}
    {!compact && account.usage && <details className="quota-usage"><summary>更多使用统计</summary><div className="quota-facts"><div><small>累计 tokens</small><strong>{account.usage.lifetimeTokens?.toLocaleString() ?? '未提供'}</strong></div><div><small>单日峰值 tokens</small><strong>{account.usage.peakDailyTokens?.toLocaleString() ?? '未提供'}</strong></div><div><small>连续使用天数</small><strong>{account.usage.currentStreakDays ?? '未提供'}</strong></div></div>{!!account.usage.daily.length && <table><caption>服务端每日用量</caption><thead><tr><th>日期</th><th>Tokens</th></tr></thead><tbody>{account.usage.daily.slice().reverse().map((day, i) => <tr key={i}><td>{day.date}</td><td>{day.tokens.toLocaleString()}</td></tr>)}</tbody></table>}</details>}
  </section>
}
export default function SubscriptionDetail({ record, compact = false }: { record: SubscriptionRecord; compact?: boolean }) {
  const [tab, setTab] = useState('quota'), [query, setQuery] = useState('')
  const sessions = record.accounts.flatMap(a => a.sessions.map(s => ({ ...s, provider: a.provider }))).filter(s => `${s.title} ${s.cwd} ${s.provider}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  return <div className={`subscription-detail ${compact ? 'quota-compact' : ''}`}>
    {!compact && <div className="quota-tabs" role="tablist" aria-label="环境详情">{[['quota', '订阅与额度'], ['sessions', `对话列表 (${record.accounts.reduce((n, a) => n + a.sessions.length, 0)})`], ['history', '本机采样']].map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div>}
    {record.error && <p role="alert" className="quota-alert">{record.error} · 最近查询 {dateLabel(record.checkedAt)}</p>}
    {!compact && <div className="quota-refresh-status">{record.providers.map(provider => { const schedule = record.providerRefresh?.[provider]; return <p key={provider}><strong>{provider === 'claude' ? 'Claude' : 'Codex'}</strong><span>{schedule?.paused ? '自动刷新已暂停 · 未登录或凭据不可读，登录后手动刷新' : `${schedule?.failures ? `连续失败 ${schedule.failures} 次 · 重试 ` : '下次刷新 '}${dateLabel(schedule?.nextRefreshAt)}`}</span></p> })}</div>}
    {(compact || tab === 'quota') && <>{record.accounts.map(a => <AccountUsage key={a.provider} account={a} compact={compact} />)}{!record.accounts.length && <div className="quota-empty">{record.refreshing ? record.connectionKind === 'local' ? '正在读取本地环境…' : '正在通过 SSH 读取远端环境…' : '尚未读取到订阅信息'}</div>}</>}
    {!compact && tab === 'sessions' && <><input className="quota-session-search" aria-label="搜索远端会话" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索标题、项目路径或 Codex / Claude" /><p className="quota-footnote">只展示会话索引，不下载完整对话。历史可能来自此环境的其他账号。</p>{record.accounts.map(a => <p key={a.provider} className="quota-message">{a.provider}: {a.sessionsMessage ?? '未提供会话信息'}</p>)}{sessions.length ? <ul className="quota-sessions">{sessions.map(s => <li key={`${s.provider}:${s.id}`}><span className={`provider-mark ${s.provider}`}>{s.provider === 'codex' ? 'CX' : 'CL'}</span><div><strong>{s.title}</strong><small title={s.cwd}>{s.cwd || '项目路径未提供'}</small><small>{dateLabel(s.updatedAt)} · {s.id}</small></div></li>)}</ul> : <div className="quota-empty">没有匹配的会话</div>}</>}
    {!compact && tab === 'history' && <><p className="quota-footnote">最近 7 天，本应用成功查询时记录的样本。不是服务端完整账单；离线期间不会补造数据。</p>{record.history.length ? <table className="quota-history"><thead><tr><th>时间 / 来源</th><th>已用</th><th>窗口</th></tr></thead><tbody>{record.history.slice(-100).reverse().map((sample, i) => <tr key={i}><td>{dateLabel(sample.at)}<small>{sample.provider}</small></td><td>{sample.usedPercent.toFixed(1)}%</td><td>{sample.windowId}</td></tr>)}</tbody></table> : <div className="quota-empty">成功读取额度后开始积累样本</div>}</>}
  </div>
}
