import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Activity, ChartNoAxesCombined, Clock3, Flame, History, MessageSquare, Pause, Ticket, TriangleAlert, Wallet } from 'lucide-react'
import Modal from '../../components/common/Modal'
import { pressure, type Provider, type SubscriptionRecord } from '../../../../shared/subscriptions'
import openaiIcon from '../subscriptions/icons/openai.svg'
import claudeIcon from '../subscriptions/icons/claude.svg'

const date = (value?: number) => value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '—'
const number = (value?: number) => value === undefined ? '—' : new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
const names = { live: '已验证', 'signed-out': '未登录', unavailable: '暂无可用数据', error: '读取失败' }
function remainingTime(value: number | undefined, now: number): string {
  if (!value) return '—'
  const seconds = Math.max(0, Math.ceil((value - now) / 1000))
  if (!seconds) return '00:00'
  const days = Math.floor(seconds / 86400), hours = Math.floor(seconds % 86400 / 3600), minutes = Math.floor(seconds % 3600 / 60)
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function QuotaHint({ text, children, className = '' }: { text: string; children: ReactNode; className?: string }) {
  const [tip, setTip] = useState<{ left: number; top: number; above: boolean }>()
  const show = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect(), above = rect.top > innerHeight / 2
    setTip({ left: Math.max(8, Math.min(rect.left, innerWidth - Math.min(280, innerWidth - 16) - 8)), top: above ? rect.top - 7 : rect.bottom + 7, above })
  }
  return <span className={`dock-hint ${className}`} aria-label={text} tabIndex={0} onMouseEnter={e => show(e.currentTarget)} onMouseLeave={() => setTip(undefined)} onFocus={e => show(e.currentTarget)} onBlur={() => setTip(undefined)} onKeyDown={e => { if (e.key === 'Escape') setTip(undefined) }}>{children}{tip && createPortal(<span className="dock-tooltip" role="tooltip" style={{ left: tip.left, top: tip.top, transform: tip.above ? 'translateY(-100%)' : undefined }}>{text}</span>, document.body)}</span>
}

export default function QuotaAccountPanel({ record, provider }: { record: SubscriptionRecord; provider: Provider }) {
  const [tab, setTab] = useState('usage'), [query, setQuery] = useState(''), [statsOpen, setStatsOpen] = useState(false), [now, setNow] = useState(Date.now())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    if (!statsOpen) return
    void window.api.invoke('desktop:widget-modal', true).catch(() => {})
    return () => { void window.api.invoke('desktop:widget-modal', false).catch(() => {}) }
  }, [statsOpen])
  const account = record.accounts.find(a => a.provider === provider), schedule = record.providerRefresh?.[provider]
  const providerName = provider === 'codex' ? 'Codex' : 'Claude'
  const status = record.error ? 'error' : account?.status ?? 'unavailable'
  const stateHint = [names[status], record.error, account?.message, `数据时间：${date(account?.observedAt)}`].filter(Boolean).join('\n')
  const sessions = (account?.sessions ?? []).filter(s => `${s.title} ${s.cwd}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const history = record.history.filter(sample => sample.provider === provider).slice(-100).reverse()
  const credits = account?.credits
  const balance = credits?.unlimited ? '∞' : credits?.balance !== undefined ? `${credits.balance} ${credits.unit}` : credits?.used !== undefined ? `${credits.used} / ${credits.limit ?? '—'} ${credits.unit}` : '—'
  const couponHint = account?.coupons ? [`额度重置券：${account.coupons.available} 张`, ...account.coupons.items.map(c => `${c.title} · 到期 ${date(c.expiresAt)}`)].join('\n') : '额度重置券：服务未提供数据'
  const scheduleHint = schedule?.paused ? '自动刷新已暂停；未登录或凭据不可读，登录后手动刷新' : `${schedule?.failures ? `连续失败 ${schedule.failures} 次；下次重试` : '下次自动刷新'}：${date(schedule?.nextRefreshAt)}`
  return <div className="subscription-detail dock-account" aria-label={`${record.name} ${providerName}`}>
    <header className="dock-account-heading">
      <QuotaHint text={providerName}><span className={`dock-provider-icon ${provider}`} role="img" aria-label={providerName} style={{ maskImage: `url("${provider === 'codex' ? openaiIcon : claudeIcon}")` }} /></QuotaHint>
      <div className="dock-identity"><QuotaHint text={`订阅套餐：${account?.plan ?? '未提供'}`} className="dock-plan">{account?.plan ?? '—'}</QuotaHint>
      <QuotaHint text={`账号：${account?.account ?? '未提供'}`} className="dock-username">{account?.account ?? '—'}</QuotaHint></div>
      <QuotaHint text={stateHint}><span className={`dock-status-dot ${status}`} /></QuotaHint>
      <button className="dock-more-stats" aria-label={`${record.name} ${providerName}更多统计`} title="更多统计" onClick={() => { setTab('usage'); setStatsOpen(true) }}><ChartNoAxesCombined size={14} /></button>
    </header>
    <div className="dock-account-body">
      <>
        {!account?.windows.length && <QuotaHint text={stateHint} className="dock-no-data">{status === 'error' ? <TriangleAlert size={14} /> : null}<span>{record.refreshing ? '…' : status === 'signed-out' ? '未登录' : '—'}</span></QuotaHint>}
        {account?.windows.map(w => { const assessment = pressure(w), stale = status !== 'live' || !!(w.resetsAt && w.resetsAt <= Date.now()); return <div className={`dock-quota-window ${stale ? 'is-stale' : ''}`} key={w.id}>
          <div><QuotaHint text={w.label} className="dock-window-name">{w.label.replace(/额度/g, '').replace(/^(?:codex|claude)\s*[·:：]\s*/i, '').trim()}</QuotaHint><QuotaHint text={stale ? `旧读数 · ${assessment.explanation}` : `剩余额度 · ${assessment.explanation}`} className={`dock-remaining pressure-${stale ? 'unknown' : assessment.level}`}>{Math.round(100 - w.usedPercent)}%</QuotaHint></div>
          <progress aria-label={`${providerName} ${w.label} 剩余额度`} max={100} value={100 - w.usedPercent} />
          <div className="dock-reset-row"><QuotaHint text={`距离额度重置的剩余时间${w.resetsAt && w.resetsAt <= now ? '；已到期，等待新读数' : ''}`}><Clock3 size={10} /><time>{remainingTime(w.resetsAt, now)}</time></QuotaHint><QuotaHint text={`额度重置时间：${date(w.resetsAt)}`}>{date(w.resetsAt)}</QuotaHint></div>
        </div> })}
        <div className="dock-values"><QuotaHint text={`充值余额 / Credits：${balance}${credits?.expiresAt ? `\n到期：${date(credits.expiresAt)}` : ''}`}><Wallet size={13} /><span>{balance}</span></QuotaHint><QuotaHint text={couponHint}><Ticket size={13} /><span>{account?.coupons?.available ?? '—'}</span></QuotaHint></div>
        {!!account?.coupons?.items.length && <ul className="dock-coupons" aria-label="重置券详情">{account.coupons.items.map((coupon, index) => <li key={index}><Ticket size={11} /><span>{coupon.title}</span><QuotaHint text={`到期时间：${date(coupon.expiresAt)}`}><time>{date(coupon.expiresAt)}</time></QuotaHint></li>)}</ul>}
        <QuotaHint text={scheduleHint} className="dock-poll-time">{schedule?.paused ? <Pause size={11} /> : <History size={11} />}<time>{schedule?.paused ? '—' : remainingTime(schedule?.nextRefreshAt, now)}</time><span>{date(schedule?.nextRefreshAt)}</span></QuotaHint>
      </>
    </div>
    {statsOpen && createPortal(<Modal open={statsOpen} onClose={() => setStatsOpen(false)} title={`${record.name} · 更多统计`} width="max-w-2xl dock-stats-dialog"><div className="subscription-detail dock-stats-content">
      <div className="dock-account-nav"><div role="tablist" aria-label="更多统计">{[{ key: 'usage', label: '用量', icon: Activity }, { key: 'sessions', label: `对话 ${account?.sessions.length ?? 0}`, icon: MessageSquare }, { key: 'history', label: '采样', icon: History }].map(({ key, label, icon: Icon }) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}><Icon size={12} />{label}</button>)}</div></div>
      {tab === 'sessions' && <><input className="dock-session-search" aria-label={`${providerName}搜索会话`} placeholder="搜索会话" value={query} onChange={e => setQuery(e.target.value)} /><ul className="dock-session-list">{sessions.map(s => <li key={s.id}><QuotaHint text={[s.title, s.cwd, s.id, account?.sessionsMessage, '只读会话索引；历史可能来自其他账号'].filter(Boolean).join('\n')}><strong>{s.title}</strong><small>{date(s.updatedAt)}</small></QuotaHint></li>)}</ul>{!sessions.length && <QuotaHint text={account?.sessionsMessage ?? '没有匹配的会话索引'} className="dock-no-data">—</QuotaHint>}</>}
      {tab === 'history' && <>{history.length ? <table aria-label={`${providerName}采样历史`}><thead><tr><th>时间</th><th>已用</th><th>窗口</th></tr></thead><tbody>{history.map((sample, i) => <tr key={i}><td><QuotaHint text="本机最近 7 天成功查询的样本；非完整账单，离线期间不补造数据">{date(sample.at)}</QuotaHint></td><td>{sample.usedPercent.toFixed(1)}%</td><td><QuotaHint text={sample.windowId}>{sample.windowId}</QuotaHint></td></tr>)}</tbody></table> : <QuotaHint text="成功查询额度后积累本机样本" className="dock-no-data">—</QuotaHint>}</>}
      {tab === 'usage' && <><div className="dock-values"><QuotaHint text={`累计 tokens：${account?.usage?.lifetimeTokens?.toLocaleString() ?? '未提供'}`}><Activity size={13} />{number(account?.usage?.lifetimeTokens)}</QuotaHint><QuotaHint text={`单日峰值 tokens：${account?.usage?.peakDailyTokens?.toLocaleString() ?? '未提供'}`}><ChartNoAxesCombined size={13} />{number(account?.usage?.peakDailyTokens)}</QuotaHint><QuotaHint text={`连续使用天数：${account?.usage?.currentStreakDays ?? '未提供'}`}><Flame size={13} />{account?.usage?.currentStreakDays ?? '—'}</QuotaHint></div>{account?.usage?.daily.length ? <table aria-label={`${providerName}每日用量`}><thead><tr><th>日期</th><th>Tokens</th></tr></thead><tbody>{account.usage.daily.slice().reverse().map((day, i) => <tr key={i}><td>{day.date}</td><td><QuotaHint text={`服务端每日用量：${day.tokens.toLocaleString()} tokens`}>{number(day.tokens)}</QuotaHint></td></tr>)}</tbody></table> : <QuotaHint text="服务未提供每日用量明细" className="dock-no-data">—</QuotaHint>}{!!account?.coupons?.items.length && <table aria-label="额度重置券"><thead><tr><th>券</th><th>到期</th></tr></thead><tbody>{account.coupons.items.map((c, i) => <tr key={i}><td>{c.title}</td><td>{date(c.expiresAt)}</td></tr>)}</tbody></table>}</>}
    </div></Modal>, document.body)}
  </div>
}
