import { useState } from 'react'
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  ImageIcon,
  Type,
  Square,
  Circle as CircleIcon,
  Minus
} from 'lucide-react'
import type { Layer } from '../types'

interface LayerPanelProps {
  layers: Layer[]
  selectedId: string | null
  onSelect: (id: string) => void
  onToggleVisibility: (id: string) => void
  onToggleLock: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onReorder: (id: string, direction: 'up' | 'down' | 'top' | 'bottom') => void
  onRename: (id: string, name: string) => void
}

const layerIcon: Record<Layer['kind'], React.ComponentType<{ className?: string }>> = {
  image: ImageIcon,
  text: Type,
  rect: Square,
  ellipse: CircleIcon,
  line: Minus
}

export default function LayerPanel({
  layers,
  selectedId,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onDelete,
  onDuplicate,
  onReorder,
  onRename
}: LayerPanelProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Render in reverse order so top-most layers appear at top of list
  const ordered = [...layers].reverse()

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue.trim())
    }
    setRenamingId(null)
  }

  return (
    <aside className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between border-b border-surface-800 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Layers</h3>
        <span className="text-[10px] text-slate-500">{layers.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {layers.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-slate-500">
            No layers yet.
            <br />
            Paste an image, or add text / shapes.
          </div>
        ) : (
          <ul className="py-1">
            {ordered.map((layer) => {
              const Icon = layerIcon[layer.kind]
              const isSelected = layer.id === selectedId
              return (
                <li key={layer.id}>
                  <div
                    onClick={() => onSelect(layer.id)}
                    className={`group flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors border-l-2 ${
                      isSelected
                        ? 'bg-blue-500/10 border-blue-500'
                        : 'border-transparent hover:bg-surface-800'
                    }`}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleVisibility(layer.id)
                      }}
                      className="rounded p-0.5 text-slate-500 hover:text-slate-200"
                    >
                      {layer.visible ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" />
                      )}
                    </button>

                    <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />

                    {renamingId === layer.id ? (
                      <input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename()
                          if (e.key === 'Escape') setRenamingId(null)
                        }}
                        autoFocus
                        className="min-w-0 flex-1 rounded border border-surface-600 bg-surface-700 px-1 py-0 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    ) : (
                      <span
                        className="min-w-0 flex-1 truncate text-xs text-slate-300"
                        onDoubleClick={() => {
                          setRenamingId(layer.id)
                          setRenameValue(layer.name)
                        }}
                      >
                        {layer.name}
                      </span>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleLock(layer.id)
                      }}
                      className="rounded p-0.5 text-slate-500 opacity-0 group-hover:opacity-100 hover:text-slate-200"
                    >
                      {layer.locked ? (
                        <Lock className="h-3 w-3" />
                      ) : (
                        <Unlock className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Action bar */}
      {selectedId && (
        <div className="flex items-center gap-1 border-t border-surface-800 px-2 py-1.5">
          <button
            onClick={() => onReorder(selectedId, 'up')}
            className="rounded p-1 text-slate-400 hover:bg-surface-800 hover:text-slate-200"
            title="Move up"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onReorder(selectedId, 'down')}
            className="rounded p-1 text-slate-400 hover:bg-surface-800 hover:text-slate-200"
            title="Move down"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDuplicate(selectedId)}
            className="rounded p-1 text-slate-400 hover:bg-surface-800 hover:text-slate-200"
            title="Duplicate"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <div className="ml-auto">
            <button
              onClick={() => onDelete(selectedId)}
              className="rounded p-1 text-slate-400 hover:bg-red-500/15 hover:text-red-400"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
