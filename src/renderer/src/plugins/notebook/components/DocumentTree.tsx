import { useState, useMemo, useRef, useEffect } from 'react'
import {
  ChevronRight,
  ChevronDown,
  FileText,
  FolderOpen,
  Lock,
  Shield,
  Trash2,
  Plus
} from 'lucide-react'
import type { DocumentMeta } from '../hooks/useNotebook'

interface DocumentTreeProps {
  documents: DocumentMeta[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: (parentId: string | null, title: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
}

interface TreeNode {
  doc: DocumentMeta
  children: TreeNode[]
}

function buildTree(documents: DocumentMeta[]): TreeNode[] {
  const sorted = [...documents].sort((a, b) => a.sortOrder - b.sortOrder)
  const childrenMap = new Map<string | null, DocumentMeta[]>()

  for (const doc of sorted) {
    const key = doc.parentId
    if (!childrenMap.has(key)) {
      childrenMap.set(key, [])
    }
    childrenMap.get(key)!.push(doc)
  }

  function buildNodes(parentId: string | null): TreeNode[] {
    const docs = childrenMap.get(parentId) ?? []
    return docs.map((doc) => ({
      doc,
      children: buildNodes(doc.id)
    }))
  }

  return buildNodes(null)
}

interface TreeItemProps {
  node: TreeNode
  depth: number
  selectedId: string | null
  expandedIds: Set<string>
  onToggle: (id: string) => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
}

function TreeItem({
  node,
  depth,
  selectedId,
  expandedIds,
  onToggle,
  onSelect,
  onDelete,
  onRename
}: TreeItemProps) {
  const { doc, children } = node
  const hasChildren = children.length > 0
  const isExpanded = expandedIds.has(doc.id)
  const isSelected = doc.id === selectedId
  const [hovering, setHovering] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditValue(doc.title)
    setEditing(true)
  }

  const commitRename = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== doc.title) {
      onRename(doc.id, trimmed)
    }
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commitRename()
    } else if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  const handleClick = () => {
    onSelect(doc.id)
    if (hasChildren) {
      onToggle(doc.id)
    }
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete(doc.id)
  }

  const paddingLeft = 8 + depth * 16

  return (
    <>
      <div
        className={`group flex items-center gap-1.5 cursor-pointer rounded-md px-1.5 py-1 text-sm transition-colors ${
          isSelected
            ? 'bg-blue-500/15 text-blue-400'
            : 'text-slate-300 hover:bg-surface-700'
        }`}
        style={{ paddingLeft }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        {/* Expand/collapse chevron */}
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
            )
          ) : null}
        </span>

        {/* Icon */}
        {hasChildren && isExpanded ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-blue-400/70" />
        ) : (
          <FileText className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        )}

        {/* Title */}
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 rounded border border-surface-600 bg-surface-700 px-1 py-0 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        ) : (
          <span className="flex-1 min-w-0 truncate">{doc.title}</span>
        )}

        {/* Status icons */}
        {doc.isLocked && <Lock className="h-3 w-3 shrink-0 text-amber-400/60" />}
        {doc.isEncrypted && <Shield className="h-3 w-3 shrink-0 text-blue-400/60" />}

        {/* Delete on hover */}
        {hovering && !editing && (
          <button
            onClick={handleDelete}
            className="shrink-0 rounded p-0.5 text-slate-500 transition-colors hover:bg-red-500/15 hover:text-red-400"
            title="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {children.map((child) => (
            <TreeItem
              key={child.doc.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onSelect={onSelect}
              onDelete={onDelete}
              onRename={onRename}
            />
          ))}
        </div>
      )}
    </>
  )
}

export default function DocumentTree({
  documents,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
  onRename
}: DocumentTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const tree = useMemo(() => buildTree(documents), [documents])

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleNewDoc = () => {
    const title = 'Untitled'
    onCreate(null, title)
  }

  return (
    <div className="flex h-full w-64 shrink-0 flex-col bg-surface-900 border-r border-surface-800">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-800 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Documents
        </span>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <FileText className="mb-2 h-8 w-8 text-slate-700" />
            <p className="text-xs text-slate-500">No documents yet</p>
            <p className="mt-1 text-xs text-slate-600">Create one to get started</p>
          </div>
        ) : (
          tree.map((node) => (
            <TreeItem
              key={node.doc.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onToggle={toggleExpand}
              onSelect={onSelect}
              onDelete={onDelete}
              onRename={onRename}
            />
          ))
        )}
      </div>

      {/* New document button at bottom */}
      <div className="shrink-0 border-t border-surface-800 p-2">
        <button
          onClick={handleNewDoc}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-surface-700 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:border-surface-600 hover:bg-surface-800 hover:text-slate-300"
        >
          <Plus className="h-3.5 w-3.5" />
          New Document
        </button>
      </div>
    </div>
  )
}
