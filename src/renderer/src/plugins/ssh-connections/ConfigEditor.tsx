import { useState } from 'react'
import Modal from '../../components/common/Modal'
import type { ConfigDocument } from '../../../../shared/ssh-connections'

export default function ConfigEditor({ document, onClose, onSaved }: { document: ConfigDocument; onClose: () => void; onSaved: () => Promise<void> }) {
  const [original, setOriginal] = useState(document), [draft, setDraft] = useState(document.text)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const dirty = draft !== original.text
  const close = () => { if (!busy && (!dirty || window.confirm('Discard unsaved config changes?'))) onClose() }
  return <Modal open title="Edit source SSH config" onClose={close} width="max-w-4xl">
    <div className="space-y-4">
      <p className="break-all font-mono text-xs text-slate-300">{document.path}</p>
      <p className="text-xs text-slate-400">Edits apply to this Windows / WSL config only. DevToolkit connections are separate. A backup is saved before replacing existing content; config commands are never executed by this editor.</p>
      <textarea aria-label="SSH configuration text" spellCheck={false} className="h-[42vh] min-h-40 w-full resize-y rounded-xl border border-surface-600 bg-surface-950 p-4 font-mono text-sm leading-6 text-slate-200" value={draft} onChange={event => { setDraft(event.target.value); setMessage('') }} />
      {error && <p role="alert" className="text-sm text-red-400 break-words">{error}</p>}
      {message && <p role="status" className="text-xs text-emerald-400 break-all">{message}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-slate-500">{dirty ? 'Unsaved changes' : 'Up to date'} · {draft.split('\n').length} lines</span><div className="flex gap-2">
        <button disabled={busy} onClick={async () => { if (dirty && !window.confirm('Discard draft and reload the file?')) return; setBusy(true); try { const latest = await window.api.invoke('ssh:read-config', document.sourceId); setOriginal(latest); setDraft(latest.text); setError('') } catch (error) { setError(String(error)) } finally { setBusy(false) } }} className="rounded-lg px-3 py-2 text-sm text-slate-300">Reload file</button>
        <button disabled={busy || !dirty} onClick={async () => {
          setBusy(true); setError(''); try {
            const result = await window.api.invoke('ssh:save-config', document.sourceId, original.revision, draft)
            setOriginal(result.document); setDraft(result.document.text); setMessage(result.backup ? `Saved. Backup: ${result.backup}` : 'Config created.')
            await onSaved()
          } catch (error) { setError(String(error)) } finally { setBusy(false) }
        }} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-40">{busy ? 'Saving...' : 'Save source config'}</button>
      </div></div>
    </div>
  </Modal>
}
