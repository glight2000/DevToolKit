import { useState } from 'react'
import Modal from '../../components/common/Modal'
import type { ConnectionDraft } from '../../../../shared/ssh-connections'
import type { SshConfigSource } from '../../../../shared/ssh-config'

export const emptyConnection = (environment: string): ConnectionDraft => ({ name: '', host: '', username: '', port: 22, environment, auth: 'auto', keyPath: '', group: '', tags: [], notes: '', favorite: false })
export default function ConnectionForm({ initial, sources, groups, quick, onClose, onSave }: {
  initial: ConnectionDraft; sources: SshConfigSource[]; groups: string[]; quick?: boolean; onClose: () => void; onSave: (draft: ConnectionDraft) => Promise<void>
}) {
  const [form, setForm] = useState(initial)
  const [tags, setTags] = useState(initial.tags.join(', '))
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const set = <K extends keyof ConnectionDraft>(key: K, value: ConnectionDraft[K]) => setForm(old => ({ ...old, [key]: value }))
  const close = () => { if (!busy && (JSON.stringify(form) === JSON.stringify(initial) && tags === initial.tags.join(', ') || window.confirm('Discard unsaved connection changes?'))) onClose() }
  const field = 'mt-1 w-full rounded-lg border border-surface-600 bg-surface-900 px-3 py-2 text-sm text-slate-100'
  return <Modal open onClose={close} title={quick ? 'Quick connect' : 'Connection details'} width="max-w-2xl">
    <form onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { await onSave({ ...form, tags: tags.split(',').map(value => value.trim()).filter(Boolean) }); onClose() } catch (error) { setError(String(error)) } finally { setBusy(false) } }} className="space-y-4">
      <p className="text-xs leading-relaxed text-slate-400">{quick ? 'Open a one-time connection without saving it.' : 'Saved only in DevToolkit. Windows and WSL SSH config files are unchanged.'} Passwords and key passphrases are entered in the terminal.</p>
      <div className="grid grid-cols-2 gap-4">
        <label className="col-span-2 text-xs text-slate-400">Display name<input required maxLength={255} autoFocus aria-label="Connection name" className={field} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Production API" /></label>
        <label className="text-xs text-slate-400">Environment<select aria-label="Connection environment" className={field} value={form.environment} onChange={e => set('environment', e.target.value)}>
          {sources.filter(source => source.id === 'local' || source.id.startsWith('wsl:')).map(source => <option key={source.id} value={source.id}>{source.label}{source.state === 'stopped' ? ' (starts on connect)' : ''}</option>)}
          {!sources.some(source => source.id === form.environment) && <option value={form.environment}>{form.environment} (unavailable)</option>}
        </select></label>
        <label className="text-xs text-slate-400">Port<input required type="number" min={1} max={65535} aria-label="Connection port" className={field} value={form.port} onChange={e => set('port', Number(e.target.value))} /></label>
        <label className="text-xs text-slate-400">Hostname<input required aria-label="Connection hostname" className={field} value={form.host} onChange={e => set('host', e.target.value)} placeholder="192.168.1.10" /></label>
        <label className="text-xs text-slate-400">Username<input required aria-label="Connection username" className={field} value={form.username} onChange={e => set('username', e.target.value)} placeholder="deploy" /></label>
        <label className="col-span-2 text-xs text-slate-400">Authentication<select aria-label="Connection authentication" className={field} value={form.auth} onChange={e => set('auth', e.target.value as ConnectionDraft['auth'])}>
          <option value="auto">Automatic (agent, default keys, or password)</option><option value="key">Private key</option><option value="password">Password / keyboard interactive</option>
        </select></label>
        {form.auth === 'key' && <label className="col-span-2 text-xs text-slate-400">Private key path · in the selected environment<input required aria-label="Connection key path" className={field} value={form.keyPath} onChange={e => set('keyPath', e.target.value)} placeholder={form.environment.startsWith('wsl:') ? '~/.ssh/id_ed25519' : 'C:/Users/you/.ssh/id_ed25519'} /></label>}
        {!quick && <><label className="text-xs text-slate-400">Group<input aria-label="Connection group" list="ssh-groups" className={field} value={form.group} onChange={e => set('group', e.target.value)} placeholder="Production" /><datalist id="ssh-groups">{groups.map(group => <option key={group} value={group} />)}</datalist></label>
          <label className="text-xs text-slate-400">Tags · comma separated<input aria-label="Connection tags" className={field} value={tags} onChange={e => setTags(e.target.value)} placeholder="api, linux" /></label>
          <label className="col-span-2 text-xs text-slate-400">Notes<textarea aria-label="Connection notes" className={`${field} resize-y`} rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} /></label></>}
      </div>
      {error && <p role="alert" className="text-sm text-red-400 break-words">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-surface-700 pt-4"><button type="button" disabled={busy} onClick={close} className="rounded-lg px-4 py-2 text-sm text-slate-300">Cancel</button><button disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{busy ? 'Working...' : quick ? 'Connect once' : 'Save connection'}</button></div>
    </form>
  </Modal>
}
