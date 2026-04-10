import { useState, useCallback, useRef } from 'react'
import type { Layer, CanvasState, ImageLayer, TextLayer, RectLayer, EllipseLayer } from '../types'

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export function useEditorStore() {
  const [canvas, setCanvas] = useState<CanvasState>({
    width: 1280,
    height: 720,
    background: '#ffffff'
  })
  const [layers, setLayers] = useState<Layer[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Undo/redo stacks
  const historyRef = useRef<{ layers: Layer[]; canvas: CanvasState }[]>([])
  const futureRef = useRef<{ layers: Layer[]; canvas: CanvasState }[]>([])
  const [historyVersion, setHistoryVersion] = useState(0)

  const pushHistory = useCallback(
    (prevLayers: Layer[], prevCanvas: CanvasState) => {
      historyRef.current.push({ layers: prevLayers, canvas: prevCanvas })
      if (historyRef.current.length > 50) historyRef.current.shift()
      futureRef.current = []
      setHistoryVersion((v) => v + 1)
    },
    []
  )

  const undo = useCallback(() => {
    const prev = historyRef.current.pop()
    if (!prev) return
    futureRef.current.push({ layers, canvas })
    setLayers(prev.layers)
    setCanvas(prev.canvas)
    setHistoryVersion((v) => v + 1)
  }, [layers, canvas])

  const redo = useCallback(() => {
    const next = futureRef.current.pop()
    if (!next) return
    historyRef.current.push({ layers, canvas })
    setLayers(next.layers)
    setCanvas(next.canvas)
    setHistoryVersion((v) => v + 1)
  }, [layers, canvas])

  const canUndo = historyRef.current.length > 0
  const canRedo = futureRef.current.length > 0

  // Commit a mutation (with history snapshot)
  const commit = useCallback(
    (mutator: (layers: Layer[]) => Layer[]) => {
      setLayers((prev) => {
        pushHistory(prev, canvas)
        return mutator(prev)
      })
    },
    [canvas, pushHistory]
  )

  // Update a layer without pushing history (used during drag/transform)
  const updateLayerNoHistory = useCallback(
    (id: string, updates: Partial<Layer>) => {
      setLayers((prev) =>
        prev.map((layer) => (layer.id === id ? ({ ...layer, ...updates } as Layer) : layer))
      )
    },
    []
  )

  // Commit the current layers as a history snapshot (end of drag)
  const commitSnapshot = useCallback(() => {
    pushHistory(layers, canvas)
  }, [layers, canvas, pushHistory])

  const updateLayer = useCallback(
    (id: string, updates: Partial<Layer>) => {
      commit((layers) =>
        layers.map((layer) => (layer.id === id ? ({ ...layer, ...updates } as Layer) : layer))
      )
    },
    [commit]
  )

  const addLayer = useCallback(
    (layer: Layer) => {
      commit((layers) => [...layers, layer])
      setSelectedId(layer.id)
    },
    [commit]
  )

  const deleteLayer = useCallback(
    (id: string) => {
      commit((layers) => layers.filter((l) => l.id !== id))
      if (selectedId === id) setSelectedId(null)
    },
    [commit, selectedId]
  )

  const duplicateLayer = useCallback(
    (id: string) => {
      const layer = layers.find((l) => l.id === id)
      if (!layer) return
      const copy: Layer = {
        ...layer,
        id: uid(),
        name: `${layer.name} copy`,
        x: layer.x + 20,
        y: layer.y + 20
      }
      commit((layers) => [...layers, copy])
      setSelectedId(copy.id)
    },
    [layers, commit]
  )

  const reorderLayer = useCallback(
    (id: string, direction: 'up' | 'down' | 'top' | 'bottom') => {
      commit((layers) => {
        const idx = layers.findIndex((l) => l.id === id)
        if (idx === -1) return layers
        const next = [...layers]
        const [item] = next.splice(idx, 1)
        if (direction === 'up') next.splice(Math.min(idx + 1, next.length), 0, item)
        else if (direction === 'down') next.splice(Math.max(idx - 1, 0), 0, item)
        else if (direction === 'top') next.push(item)
        else if (direction === 'bottom') next.unshift(item)
        return next
      })
    },
    [commit]
  )

  const toggleVisibility = useCallback(
    (id: string) => {
      commit((layers) =>
        layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))
      )
    },
    [commit]
  )

  const toggleLock = useCallback(
    (id: string) => {
      commit((layers) =>
        layers.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l))
      )
    },
    [commit]
  )

  const renameLayer = useCallback(
    (id: string, name: string) => {
      commit((layers) => layers.map((l) => (l.id === id ? { ...l, name } : l)))
    },
    [commit]
  )

  const mergeWithBelow = useCallback(
    (_id: string) => {
      // Proper layer merge requires rasterizing — handled at the Stage level.
      // This is a placeholder; actual merge is done in ImageEditorPage using Konva.
    },
    []
  )

  const clearAll = useCallback(() => {
    commit(() => [])
    setSelectedId(null)
  }, [commit])

  // ---- Factory helpers ----
  const addImageLayer = useCallback(
    (src: string, width: number, height: number, name?: string) => {
      const maxW = canvas.width * 0.8
      const maxH = canvas.height * 0.8
      let scale = 1
      if (width > maxW || height > maxH) {
        scale = Math.min(maxW / width, maxH / height)
      }
      const layer: ImageLayer = {
        id: uid(),
        kind: 'image',
        name: name || 'Image',
        visible: true,
        locked: false,
        x: (canvas.width - width * scale) / 2,
        y: (canvas.height - height * scale) / 2,
        rotation: 0,
        scaleX: scale,
        scaleY: scale,
        opacity: 1,
        src,
        width,
        height
      }
      addLayer(layer)
    },
    [canvas.width, canvas.height, addLayer]
  )

  const addTextLayer = useCallback(
    (text = 'Text') => {
      const layer: TextLayer = {
        id: uid(),
        kind: 'text',
        name: text.slice(0, 20),
        visible: true,
        locked: false,
        x: canvas.width / 2 - 100,
        y: canvas.height / 2 - 24,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        text,
        fontSize: 48,
        fontFamily: 'sans-serif',
        fill: '#111111',
        fontStyle: 'normal',
        align: 'left',
        width: 400
      }
      addLayer(layer)
    },
    [canvas.width, canvas.height, addLayer]
  )

  const addRectLayer = useCallback(() => {
    const layer: RectLayer = {
      id: uid(),
      kind: 'rect',
      name: 'Rectangle',
      visible: true,
      locked: false,
      x: canvas.width / 2 - 100,
      y: canvas.height / 2 - 60,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      width: 200,
      height: 120,
      fill: '#3b82f6',
      stroke: '#1e3a8a',
      strokeWidth: 0,
      cornerRadius: 8
    }
    addLayer(layer)
  }, [canvas.width, canvas.height, addLayer])

  const addEllipseLayer = useCallback(() => {
    const layer: EllipseLayer = {
      id: uid(),
      kind: 'ellipse',
      name: 'Ellipse',
      visible: true,
      locked: false,
      x: canvas.width / 2,
      y: canvas.height / 2,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      radiusX: 100,
      radiusY: 70,
      fill: '#10b981',
      stroke: '#064e3b',
      strokeWidth: 0
    }
    addLayer(layer)
  }, [canvas.width, canvas.height, addLayer])

  const selectedLayer = layers.find((l) => l.id === selectedId) ?? null

  return {
    canvas,
    setCanvas,
    layers,
    setLayers,
    selectedId,
    setSelectedId,
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
    mergeWithBelow,
    clearAll,
    undo,
    redo,
    canUndo,
    canRedo,
    historyVersion
  }
}
