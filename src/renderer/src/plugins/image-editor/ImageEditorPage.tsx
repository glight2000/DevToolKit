import { useRef, useEffect, useCallback } from 'react'
import {
  Image as ImageIcon,
  Type,
  Square,
  Circle,
  FolderOpen,
  Download,
  Clipboard,
  Undo2,
  Redo2,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2
} from 'lucide-react'
import { useEditorStore } from './hooks/useEditorStore'
import EditorCanvas, { type EditorCanvasHandle } from './components/EditorCanvas'
import LayerPanel from './components/LayerPanel'
import PropertiesPanel from './components/PropertiesPanel'

function loadImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = reject
    img.src = src
  })
}

export default function ImageEditorPage() {
  const canvasRef = useRef<EditorCanvasHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const store = useEditorStore()
  const {
    canvas,
    setCanvas,
    layers,
    selectedId,
    selectedLayer,
    addImageLayer,
    addTextLayer,
    addRectLayer,
    addEllipseLayer,
    updateLayer,
    updateLayerNoHistory,
    commitSnapshot,
    deleteLayer,
    duplicateLayer,
    reorderLayer,
    toggleVisibility,
    toggleLock,
    renameLayer,
    setSelectedId,
    clearAll,
    undo,
    redo,
    canUndo,
    canRedo
  } = store

  // Load image from file input / open dialog
  const handleOpenFile = useCallback(async () => {
    const result = await window.api.invoke('image-editor:open-file')
    if (result.canceled || !result.dataUrl) return
    try {
      const dims = await loadImageDimensions(result.dataUrl)
      const name = result.filePath ? result.filePath.split(/[\\/]/).pop() : 'Image'
      addImageLayer(result.dataUrl, dims.width, dims.height, name)
    } catch (err) {
      console.error('Failed to load image:', err)
    }
  }, [addImageLayer])

  // File input change (alternative to IPC open — used by the browse button)
  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = async () => {
        const dataUrl = reader.result as string
        try {
          const dims = await loadImageDimensions(dataUrl)
          addImageLayer(dataUrl, dims.width, dims.height, file.name)
        } catch (err) {
          console.error(err)
        }
      }
      reader.readAsDataURL(file)
      e.target.value = '' // allow same file re-selection
    },
    [addImageLayer]
  )

  // Global paste handler — paste images from clipboard
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile()
          if (!blob) continue
          e.preventDefault()
          const reader = new FileReader()
          reader.onload = async () => {
            const dataUrl = reader.result as string
            try {
              const dims = await loadImageDimensions(dataUrl)
              addImageLayer(dataUrl, dims.width, dims.height, 'Pasted image')
            } catch (err) {
              console.error(err)
            }
          }
          reader.readAsDataURL(blob)
          return
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [addImageLayer])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Ignore if an input/textarea has focus
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault()
        if (selectedId) duplicateLayer(selectedId)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
          e.preventDefault()
          deleteLayer(selectedId)
        }
      } else if (e.key === 'Escape') {
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [undo, redo, selectedId, deleteLayer, duplicateLayer, setSelectedId])

  // Export full canvas to file
  const handleExportFile = async () => {
    const dataUrl = canvasRef.current?.exportDataUrl({ pixelRatio: 2 })
    if (!dataUrl) return
    await window.api.invoke('image-editor:save-file', dataUrl, 'canvas.png')
  }

  // Copy full canvas to clipboard
  const handleCopyToClipboard = async () => {
    const dataUrl = canvasRef.current?.exportDataUrl({ pixelRatio: 2 })
    if (!dataUrl) return
    const result = await window.api.invoke('image-editor:copy-to-clipboard', dataUrl)
    if (!result.success) {
      console.error('Copy failed:', result.error)
    }
  }

  // Merge all visible layers into a single image layer
  const handleMergeAll = async () => {
    const dataUrl = canvasRef.current?.exportDataUrl({ pixelRatio: 1 })
    if (!dataUrl) return
    try {
      const dims = await loadImageDimensions(dataUrl)
      // Replace all layers with a single merged one using clearAll then add
      clearAll()
      setTimeout(() => addImageLayer(dataUrl, dims.width, dims.height, 'Merged'), 0)
    } catch (err) {
      console.error(err)
    }
  }

  // Zoom controls
  const handleZoomIn = () => {
    const current = canvasRef.current?.getStageScale() ?? 1
    canvasRef.current?.setStageScale(current * 1.2)
  }
  const handleZoomOut = () => {
    const current = canvasRef.current?.getStageScale() ?? 1
    canvasRef.current?.setStageScale(current / 1.2)
  }
  const handleFit = () => canvasRef.current?.fitView()

  const ToolbarButton = ({
    onClick,
    icon: Icon,
    label,
    disabled
  }: {
    onClick: () => void
    icon: React.ComponentType<{ className?: string }>
    label: string
    disabled?: boolean
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-surface-700 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )

  const Divider = () => <div className="mx-1 h-5 w-px bg-surface-700" />

  return (
    <div className="flex h-full flex-col bg-surface-950">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-surface-800 bg-surface-900 px-3 py-2">
        <ToolbarButton onClick={handleOpenFile} icon={FolderOpen} label="Open" />
        <ToolbarButton onClick={() => fileInputRef.current?.click()} icon={ImageIcon} label="Image" />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileInputChange}
          className="hidden"
        />
        <ToolbarButton onClick={() => addTextLayer('Text')} icon={Type} label="Text" />
        <ToolbarButton onClick={addRectLayer} icon={Square} label="Rect" />
        <ToolbarButton onClick={addEllipseLayer} icon={Circle} label="Ellipse" />

        <Divider />

        <ToolbarButton onClick={undo} icon={Undo2} label="Undo" disabled={!canUndo} />
        <ToolbarButton onClick={redo} icon={Redo2} label="Redo" disabled={!canRedo} />

        <Divider />

        <ToolbarButton onClick={handleZoomOut} icon={ZoomOut} label="Zoom Out" />
        <ToolbarButton onClick={handleFit} icon={Maximize2} label="Fit" />
        <ToolbarButton onClick={handleZoomIn} icon={ZoomIn} label="Zoom In" />

        <Divider />

        <ToolbarButton
          onClick={handleMergeAll}
          icon={Square}
          label="Merge All"
          disabled={layers.length < 2}
        />
        <ToolbarButton
          onClick={clearAll}
          icon={Trash2}
          label="Clear"
          disabled={layers.length === 0}
        />

        <div className="ml-auto flex items-center gap-1">
          <ToolbarButton onClick={handleCopyToClipboard} icon={Clipboard} label="Copy" />
          <button
            onClick={handleExportFile}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500"
          >
            <Download className="h-3.5 w-3.5" />
            Export PNG
          </button>
        </div>
      </div>

      {/* Main area: canvas + right sidebar (layers on top, properties below) */}
      <div className="flex flex-1 overflow-hidden">
        <EditorCanvas
          ref={canvasRef}
          canvas={canvas}
          layers={layers}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onChangeNoHistory={updateLayerNoHistory}
          onCommitSnapshot={commitSnapshot}
        />

        {/* Right sidebar: layer panel + properties split */}
        <div className="flex shrink-0 flex-col border-l border-surface-800 bg-surface-900" style={{ width: 260 }}>
          <div className="flex-1 min-h-0 overflow-hidden">
            <LayerPanel
              layers={layers}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onToggleVisibility={toggleVisibility}
              onToggleLock={toggleLock}
              onDelete={deleteLayer}
              onDuplicate={duplicateLayer}
              onReorder={reorderLayer}
              onRename={renameLayer}
            />
          </div>
          <div className="shrink-0 border-t border-surface-800" style={{ maxHeight: '55%' }}>
            <PropertiesPanel
              layer={selectedLayer}
              canvas={canvas}
              onCanvasChange={(next) => setCanvas((c) => ({ ...c, ...next }))}
              onLayerChange={updateLayer}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
