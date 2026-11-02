import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Plus, GripVertical } from 'lucide-react'
import CopyButton from './CopyButton'
import { paragraph, splitParagraphs, joinParagraphs, type Paragraph } from './paragraphs'
import './paragraph-editor.css'

interface Props { value: string; onChange: (value: string) => void; label: string; placeholder?: string; readOnly?: boolean; maxLength?: number; compact?: boolean }
type Selection = { id: string; start: number; end: number }
type Snapshot = { blocks: Paragraph[]; selection?: Selection }

export default function ParagraphEditor({ value, onChange, label, placeholder = '写下想法…', readOnly, maxLength, compact }: Props) {
  const [blocks, setBlocks] = useState(() => splitParagraphs(value)), [error, setError] = useState('')
  const current = useRef(blocks), emitted = useRef(value), root = useRef<HTMLDivElement>(null)
  const fields = useRef(new Map<string, HTMLTextAreaElement>()), pending = useRef<Selection | undefined>(undefined)
  const undo = useRef<Snapshot[]>([]), redo = useRef<Snapshot[]>([]), typing = useRef({ id: '', at: 0 })
  const selection = (): Selection | undefined => {
    const input = document.activeElement as HTMLTextAreaElement
    return input?.dataset.blockId ? { id: input.dataset.blockId, start: input.selectionStart, end: input.selectionEnd } : undefined
  }
  useEffect(() => {
    if (value === emitted.current) return
    emitted.current = value; current.current = splitParagraphs(value); setBlocks(current.current)
    undo.current = []; redo.current = []; typing.current = { id: '', at: 0 }
  }, [value])
  const resize = () => fields.current.forEach(input => { input.style.height = '0'; input.style.height = `${input.scrollHeight}px` })
  useLayoutEffect(() => {
    resize()
    const target = pending.current
    if (target) { const input = fields.current.get(target.id); input?.focus(); input?.setSelectionRange(target.start, target.end); pending.current = undefined }
  }, [blocks])
  useEffect(() => {
    const observer = new ResizeObserver(resize)
    if (root.current) observer.observe(root.current)
    return () => observer.disconnect()
  }, [])
  const publish = (next: Paragraph[], focus?: Selection) => {
    current.current = next; emitted.current = joinParagraphs(next); pending.current = focus; setBlocks(next); onChange(emitted.current)
  }
  const commit = (next: Paragraph[], focus?: Selection, typingId = '') => {
    if (readOnly) return
    if (maxLength && joinParagraphs(next).length > maxLength) { setError(`最多 ${maxLength.toLocaleString()} 字`); return }
    setError('')
    if (!typingId || typing.current.id !== typingId || Date.now() - typing.current.at > 750) {
      undo.current.push({ blocks: current.current, selection: selection() }); if (undo.current.length > 100) undo.current.shift()
    }
    typing.current = { id: typingId, at: Date.now() }; redo.current = []; publish(next, focus)
  }
  const travel = (back: boolean) => {
    if (readOnly) return
    const from = back ? undo : redo, to = back ? redo : undo, snapshot = from.current.pop()
    if (!snapshot) return
    to.current.push({ blocks: current.current, selection: selection() }); typing.current.id = ''; publish(snapshot.blocks, snapshot.selection)
  }
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>, index: number) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229 || readOnly) return
    const input = event.currentTarget, start = input.selectionStart, end = input.selectionEnd
    const items = current.current, block = items[index]
    if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
      event.preventDefault(); travel(event.key.toLowerCase() === 'z' && !event.shiftKey); return
    }
    if (event.key === 'Enter' && !event.shiftKey && (!/^ {0,3}(`{3,}|~{3,})/m.test(block.text) || event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      const next = paragraph(block.text.slice(end), block.separator)
      commit([...items.slice(0, index), { ...block, text: block.text.slice(0, start), separator: '\n\n' }, next, ...items.slice(index + 1)], { id: next.id, start: 0, end: 0 })
    } else if (event.key === 'Backspace' && start === 0 && end === 0 && index > 0) {
      event.preventDefault(); const previous = items[index - 1], cursor = previous.text.length
      commit([...items.slice(0, index - 1), { ...previous, text: previous.text + block.text, separator: block.separator }, ...items.slice(index + 1)], { id: previous.id, start: cursor, end: cursor })
    } else if (event.key === 'Delete' && start === block.text.length && start === end && index < items.length - 1) {
      event.preventDefault(); const next = items[index + 1]
      commit([...items.slice(0, index), { ...block, text: block.text + next.text, separator: next.separator }, ...items.slice(index + 2)], { id: block.id, start, end })
    } else if (start === end && ((event.key === 'ArrowUp' && start === 0 && index > 0) || (event.key === 'ArrowDown' && end === block.text.length && index < items.length - 1))) {
      event.preventDefault(); const previous = event.key === 'ArrowUp', target = items[index + (previous ? -1 : 1)], cursor = previous ? target.text.length : 0
      fields.current.get(target.id)?.focus(); fields.current.get(target.id)?.setSelectionRange(cursor, cursor)
    }
  }
  return <div ref={root} className={`paragraph-editor ${compact ? 'is-compact' : ''}`} role="group" aria-label={label}>
    {blocks.map((block, index) => <div className="paragraph-block" key={block.id}>
      <span className="paragraph-grip" aria-hidden="true"><GripVertical size={13} /></span>
      <textarea ref={element => { if (element) fields.current.set(block.id, element); else fields.current.delete(block.id) }} data-block-id={block.id} aria-label={index ? `${label} · 段落 ${index + 1}` : label} value={block.text} readOnly={readOnly} rows={1} spellCheck={false} placeholder={index ? '继续写…' : placeholder} onKeyDown={event => keyDown(event, index)} onChange={event => commit(current.current.map(item => item.id === block.id ? { ...item, text: event.target.value } : item), undefined, block.id)} onPaste={event => {
        if (readOnly) return
        const text = event.clipboardData.getData('text/plain'), pasted = splitParagraphs(text)
        if (pasted.length < 2) return
        event.preventDefault()
        const input = event.currentTarget, prefix = block.text.slice(0, input.selectionStart), suffix = block.text.slice(input.selectionEnd)
        pasted[0] = { ...pasted[0], id: block.id, text: prefix + pasted[0].text }
        const last = pasted.at(-1)!, cursor = last.text.length
        pasted[pasted.length - 1] = { ...last, text: last.text + suffix, separator: block.separator }
        commit([...current.current.slice(0, index), ...pasted, ...current.current.slice(index + 1)], { id: last.id, start: cursor, end: cursor })
      }} />
      <div className="paragraph-actions"><CopyButton text={block.text} label={`复制段落 ${index + 1}`} />{!readOnly && <button aria-label={`在段落 ${index + 1} 后插入`} title="插入段落" onClick={() => { const next = paragraph('', block.separator); commit([...current.current.slice(0, index), { ...block, separator: '\n\n' }, next, ...current.current.slice(index + 1)], { id: next.id, start: 0, end: 0 }) }}><Plus size={14} /></button>}</div>
    </div>)}
    {!readOnly && <button className="paragraph-add" onClick={() => { const items = current.current, last = items.at(-1)!, next = paragraph(); commit([...items.slice(0, -1), { ...last, separator: '\n\n' }, next], { id: next.id, start: 0, end: 0 }) }}><Plus size={13} />添加段落<span>Enter 分段 · Shift+Enter 换行</span></button>}
    {error && <p role="alert" className="paragraph-error">{error}</p>}
  </div>
}
