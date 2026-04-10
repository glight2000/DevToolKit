import { useState, useRef, useEffect } from 'react'
import {
  Plus,
  FolderPlus,
  Edit3,
  Eye,
  Lock,
  Unlock,
  Shield,
  ShieldOff
} from 'lucide-react'
import type { DocumentMeta } from '../hooks/useNotebook'

interface EditorToolbarProps {
  selectedDoc: DocumentMeta | null
  mode: 'edit' | 'preview'
  onModeChange: (mode: 'edit' | 'preview') => void
  onToggleLock: () => void
  onToggleEncrypt: () => void
  onTitleChange: (title: string) => void
  onNewDoc: () => void
  onNewSubDoc: () => void
}

export default function EditorToolbar({
  selectedDoc,
  mode,
  onModeChange,
  onToggleLock,
  onToggleEncrypt,
  onTitleChange,
  onNewDoc,
  onNewSubDoc
}: EditorToolbarProps) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [editingTitle])

  const startEditTitle = () => {
    if (!selectedDoc || selectedDoc.isLocked) return
    setTitleValue(selectedDoc.title)
    setEditingTitle(true)
  }

  const commitTitle = () => {
    const trimmed = titleValue.trim()
    if (trimmed && trimmed !== selectedDoc?.title) {
      onTitleChange(trimmed)
    }
    setEditingTitle(false)
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commitTitle()
    } else if (e.key === 'Escape') {
      setEditingTitle(false)
    }
  }

  return (
    <div className="flex items-center gap-2 bg-surface-900 border-b border-surface-800 px-4 py-2">
      {/* New document buttons */}
      <button
        onClick={onNewDoc}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-surface-700 hover:text-slate-100"
        title="New Document"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onNewSubDoc}
        disabled={!selectedDoc}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-surface-700 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        title="New Sub-document"
      >
        <FolderPlus className="h-3.5 w-3.5" />
      </button>

      {/* Divider */}
      <div className="mx-1 h-5 w-px bg-surface-700" />

      {/* Document title */}
      <div className="flex-1 min-w-0">
        {selectedDoc ? (
          editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={handleTitleKeyDown}
              className="w-full max-w-xs rounded border border-surface-600 bg-surface-700 px-2 py-0.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <button
              onClick={startEditTitle}
              className="max-w-xs truncate rounded px-2 py-0.5 text-sm font-medium text-slate-200 transition-colors hover:bg-surface-700 hover:text-slate-100"
              title="Click to rename"
            >
              {selectedDoc.title}
            </button>
          )
        ) : (
          <span className="text-sm text-slate-500">No document selected</span>
        )}
      </div>

      {/* Mode toggle */}
      <div className="flex items-center rounded-lg border border-surface-700 bg-surface-800">
        <button
          onClick={() => onModeChange('edit')}
          disabled={!selectedDoc || selectedDoc.isLocked}
          className={`inline-flex items-center gap-1.5 rounded-l-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === 'edit'
              ? 'bg-surface-700 text-slate-100'
              : 'text-slate-400 hover:text-slate-200'
          } disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <Edit3 className="h-3 w-3" />
          Edit
        </button>
        <button
          onClick={() => onModeChange('preview')}
          disabled={!selectedDoc}
          className={`inline-flex items-center gap-1.5 rounded-r-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === 'preview'
              ? 'bg-surface-700 text-slate-100'
              : 'text-slate-400 hover:text-slate-200'
          } disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <Eye className="h-3 w-3" />
          Preview
        </button>
      </div>

      {/* Lock toggle */}
      <button
        onClick={onToggleLock}
        disabled={!selectedDoc}
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          selectedDoc?.isLocked
            ? 'bg-amber-600/15 text-amber-400 hover:bg-amber-600/25'
            : 'text-slate-400 hover:bg-surface-700 hover:text-slate-100'
        }`}
        title={selectedDoc?.isLocked ? 'Unlock document' : 'Lock document'}
      >
        {selectedDoc?.isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
      </button>

      {/* Encrypt toggle */}
      <button
        onClick={onToggleEncrypt}
        disabled={!selectedDoc}
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          selectedDoc?.isEncrypted
            ? 'bg-blue-600/15 text-blue-400 hover:bg-blue-600/25'
            : 'text-slate-400 hover:bg-surface-700 hover:text-slate-100'
        }`}
        title={selectedDoc?.isEncrypted ? 'Remove encryption' : 'Encrypt document'}
      >
        {selectedDoc?.isEncrypted ? <Shield className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}
