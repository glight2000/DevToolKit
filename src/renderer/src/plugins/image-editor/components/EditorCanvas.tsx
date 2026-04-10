import { forwardRef, useRef, useEffect, useImperativeHandle, useCallback, useState } from 'react'
import {
  Stage,
  Layer as KonvaLayer,
  Group as KonvaGroup,
  Rect,
  Transformer,
  Image as KImage,
  Text,
  Ellipse,
  Line
} from 'react-konva'
import useImage from 'use-image'
import type Konva from 'konva'
import type { Layer, CanvasState, ImageLayer, LineLayer } from '../types'

const SNAP_THRESHOLD = 6

interface EditorCanvasProps {
  canvas: CanvasState
  layers: Layer[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onChangeNoHistory: (id: string, updates: Partial<Layer>) => void
  onCommitSnapshot: () => void
}

export interface EditorCanvasHandle {
  stage: Konva.Stage | null
  exportDataUrl: (opts?: { pixelRatio?: number; mimeType?: string }) => string | null
  getSelectedAsDataUrl: () => string | null
  fitView: () => void
  setStageScale: (scale: number) => void
  getStageScale: () => number
}

// Individual layer renderers
function ImageLayerView({ layer }: { layer: ImageLayer }) {
  const [img] = useImage(layer.src, 'anonymous')
  return <KImage image={img} width={layer.width} height={layer.height} />
}

function renderLayerContent(layer: Layer) {
  switch (layer.kind) {
    case 'image':
      return <ImageLayerView layer={layer} />
    case 'text':
      return (
        <Text
          text={layer.text}
          fontSize={layer.fontSize}
          fontFamily={layer.fontFamily}
          fill={layer.fill}
          fontStyle={layer.fontStyle}
          align={layer.align}
          width={layer.width}
        />
      )
    case 'rect':
      return (
        <Rect
          width={layer.width}
          height={layer.height}
          fill={layer.fill}
          stroke={layer.stroke}
          strokeWidth={layer.strokeWidth}
          cornerRadius={layer.cornerRadius}
        />
      )
    case 'ellipse':
      return (
        <Ellipse
          radiusX={layer.radiusX}
          radiusY={layer.radiusY}
          fill={layer.fill}
          stroke={layer.stroke}
          strokeWidth={layer.strokeWidth}
        />
      )
    case 'line':
      return (
        <Line
          points={(layer as LineLayer).points}
          stroke={(layer as LineLayer).stroke}
          strokeWidth={(layer as LineLayer).strokeWidth}
        />
      )
    default:
      return null
  }
}

const EditorCanvas = forwardRef<EditorCanvasHandle, EditorCanvasProps>(function EditorCanvas(
  { canvas, layers, selectedId, onSelect, onChangeNoHistory, onCommitSnapshot },
  ref
) {
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const layerRefs = useRef<Record<string, Konva.Node>>({})
  const [stageScale, setStageScaleState] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })
  const [isPanning, setIsPanning] = useState(false)
  const lastPanPos = useRef<{ x: number; y: number } | null>(null)
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] })

  // Attach transformer to the selected node
  useEffect(() => {
    const transformer = transformerRef.current
    if (!transformer) return
    if (!selectedId) {
      transformer.nodes([])
      transformer.getLayer()?.batchDraw()
      return
    }
    const node = layerRefs.current[selectedId]
    if (node) {
      transformer.nodes([node])
      transformer.getLayer()?.batchDraw()
    }
  }, [selectedId, layers])

  // Fit view to container
  const fitView = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const clientWidth = container.clientWidth
    const clientHeight = container.clientHeight
    if (clientWidth === 0 || clientHeight === 0) return
    const padding = 60
    const sx = (clientWidth - padding * 2) / canvas.width
    const sy = (clientHeight - padding * 2) / canvas.height
    const scale = Math.max(0.1, Math.min(sx, sy, 1))
    setStageScaleState(scale)
    setStagePos({
      x: (clientWidth - canvas.width * scale) / 2,
      y: (clientHeight - canvas.height * scale) / 2
    })
  }, [canvas.width, canvas.height])

  useEffect(() => {
    fitView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas.width, canvas.height])

  // Observe container size for the Stage
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const updateSize = () => {
      setStageSize({ width: container.clientWidth, height: container.clientHeight })
      fitView()
    }
    updateSize()
    const ro = new ResizeObserver(updateSize)
    ro.observe(container)
    window.addEventListener('resize', updateSize)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', updateSize)
    }
  }, [fitView])

  useImperativeHandle(
    ref,
    () => ({
      stage: stageRef.current,
      exportDataUrl: (opts) => {
        const stage = stageRef.current
        if (!stage) return null
        // Temporarily reset view transform so export uses unscaled canvas
        const prevScale = stage.scaleX()
        const prevX = stage.x()
        const prevY = stage.y()
        stage.scale({ x: 1, y: 1 })
        stage.position({ x: 0, y: 0 })
        stage.draw()
        const transformer = transformerRef.current
        transformer?.hide()
        transformer?.getLayer()?.batchDraw()
        const data = stage.toDataURL({
          pixelRatio: opts?.pixelRatio ?? 1,
          mimeType: opts?.mimeType ?? 'image/png',
          x: 0,
          y: 0,
          width: canvas.width,
          height: canvas.height
        })
        stage.scale({ x: prevScale, y: prevScale })
        stage.position({ x: prevX, y: prevY })
        transformer?.show()
        stage.draw()
        return data
      },
      getSelectedAsDataUrl: () => {
        if (!selectedId) return null
        const node = layerRefs.current[selectedId]
        if (!node) return null
        const prev = node.visible()
        node.visible(true)
        const data = node.toDataURL({ pixelRatio: 2 })
        node.visible(prev)
        return data
      },
      fitView,
      setStageScale: (scale: number) => {
        const container = containerRef.current
        if (!container) return
        const clamped = Math.max(0.1, Math.min(5, scale))
        setStageScaleState(clamped)
        setStagePos({
          x: (container.clientWidth - canvas.width * clamped) / 2,
          y: (container.clientHeight - canvas.height * clamped) / 2
        })
      },
      getStageScale: () => stageScale
    }),
    [canvas.width, canvas.height, selectedId, stageScale, fitView]
  )

  // Mouse wheel to zoom
  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const oldScale = stage.scaleX()
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    const scaleBy = 1.1
    const direction = e.evt.deltaY > 0 ? -1 : 1
    const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy
    const clamped = Math.max(0.1, Math.min(5, newScale))

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale
    }

    setStageScaleState(clamped)
    setStagePos({
      x: pointer.x - mousePointTo.x * clamped,
      y: pointer.y - mousePointTo.y * clamped
    })
  }

  // Middle or space-drag to pan
  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // Click on empty canvas deselects
    if (e.target === e.target.getStage()) {
      onSelect(null)
    }
    if (e.evt.button === 1 || e.evt.shiftKey) {
      setIsPanning(true)
      lastPanPos.current = { x: e.evt.clientX, y: e.evt.clientY }
    }
  }

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isPanning || !lastPanPos.current) return
    const dx = e.evt.clientX - lastPanPos.current.x
    const dy = e.evt.clientY - lastPanPos.current.y
    setStagePos((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
    lastPanPos.current = { x: e.evt.clientX, y: e.evt.clientY }
  }

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false)
      lastPanPos.current = null
    }
  }

  // Snap helpers
  const computeSnapForLayer = useCallback(
    (layer: Layer, x: number, y: number): { x: number; y: number; guides: { v: number[]; h: number[] } } => {
      const guides: { v: number[]; h: number[] } = { v: [], h: [] }
      // Get current layer width/height from ref
      const node = layerRefs.current[layer.id]
      if (!node) return { x, y, guides }
      const box = node.getClientRect({ skipTransform: false, skipShadow: true, skipStroke: true })
      // Transformed box based on proposed x/y
      const dx = x - layer.x
      const dy = y - layer.y
      const testBox = {
        x: box.x + dx,
        y: box.y + dy,
        width: box.width,
        height: box.height
      }

      const canvasSnapX = [0, canvas.width / 2, canvas.width]
      const canvasSnapY = [0, canvas.height / 2, canvas.height]

      let snapX = x
      let snapY = y
      // Left edge
      for (const sx of canvasSnapX) {
        if (Math.abs(testBox.x - sx) < SNAP_THRESHOLD) {
          snapX = x + (sx - testBox.x)
          guides.v.push(sx)
        }
      }
      // Right edge
      for (const sx of canvasSnapX) {
        if (Math.abs(testBox.x + testBox.width - sx) < SNAP_THRESHOLD) {
          snapX = x + (sx - (testBox.x + testBox.width))
          guides.v.push(sx)
        }
      }
      // Center X
      for (const sx of canvasSnapX) {
        if (Math.abs(testBox.x + testBox.width / 2 - sx) < SNAP_THRESHOLD) {
          snapX = x + (sx - (testBox.x + testBox.width / 2))
          guides.v.push(sx)
        }
      }
      // Top edge
      for (const sy of canvasSnapY) {
        if (Math.abs(testBox.y - sy) < SNAP_THRESHOLD) {
          snapY = y + (sy - testBox.y)
          guides.h.push(sy)
        }
      }
      for (const sy of canvasSnapY) {
        if (Math.abs(testBox.y + testBox.height - sy) < SNAP_THRESHOLD) {
          snapY = y + (sy - (testBox.y + testBox.height))
          guides.h.push(sy)
        }
      }
      for (const sy of canvasSnapY) {
        if (Math.abs(testBox.y + testBox.height / 2 - sy) < SNAP_THRESHOLD) {
          snapY = y + (sy - (testBox.y + testBox.height / 2))
          guides.h.push(sy)
        }
      }
      return { x: snapX, y: snapY, guides }
    },
    [canvas.width, canvas.height]
  )

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden bg-surface-900"
      style={{ cursor: isPanning ? 'grabbing' : 'default' }}
    >
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePos.x}
        y={stagePos.y}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Canvas background */}
        <KonvaLayer listening={false}>
          <Rect
            x={0}
            y={0}
            width={canvas.width}
            height={canvas.height}
            fill={canvas.background}
            shadowColor="black"
            shadowBlur={20}
            shadowOpacity={0.3}
            shadowOffsetY={4}
          />
        </KonvaLayer>

        {/* Content layers */}
        <KonvaLayer>
          {layers.map((layer) => {
            if (!layer.visible) return null
            return (
              <Group
                key={layer.id}
                layer={layer}
                isSelected={selectedId === layer.id}
                onSelect={() => onSelect(layer.id)}
                onChangeNoHistory={onChangeNoHistory}
                onCommitSnapshot={onCommitSnapshot}
                registerRef={(node) => {
                  if (node) layerRefs.current[layer.id] = node
                  else delete layerRefs.current[layer.id]
                }}
                computeSnap={computeSnapForLayer}
                onGuidesChange={setGuides}
              />
            )
          })}
          <Transformer
            ref={transformerRef}
            rotateEnabled
            borderStroke="#3b82f6"
            anchorStroke="#3b82f6"
            anchorFill="#ffffff"
            anchorSize={8}
            rotateAnchorOffset={30}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 10 || newBox.height < 10) return oldBox
              return newBox
            }}
          />
        </KonvaLayer>

        {/* Snap guides */}
        <KonvaLayer listening={false}>
          {guides.v.map((x, i) => (
            <Line
              key={`v${i}`}
              points={[x, 0, x, canvas.height]}
              stroke="#ec4899"
              strokeWidth={1 / stageScale}
              dash={[4 / stageScale, 4 / stageScale]}
            />
          ))}
          {guides.h.map((y, i) => (
            <Line
              key={`h${i}`}
              points={[0, y, canvas.width, y]}
              stroke="#ec4899"
              strokeWidth={1 / stageScale}
              dash={[4 / stageScale, 4 / stageScale]}
            />
          ))}
        </KonvaLayer>
      </Stage>

      {/* Zoom indicator */}
      <div className="absolute bottom-2 left-2 rounded bg-surface-800/80 px-2 py-1 text-[10px] text-slate-400 backdrop-blur-sm">
        {Math.round(stageScale * 100)}%
      </div>
    </div>
  )
})

// ─────────────────────────────────────────────
// Group wrapper that handles drag + transform events for one layer
// ─────────────────────────────────────────────

interface GroupProps {
  layer: Layer
  isSelected: boolean
  onSelect: () => void
  onChangeNoHistory: (id: string, updates: Partial<Layer>) => void
  onCommitSnapshot: () => void
  registerRef: (node: Konva.Node | null) => void
  computeSnap: (
    layer: Layer,
    x: number,
    y: number
  ) => { x: number; y: number; guides: { v: number[]; h: number[] } }
  onGuidesChange: (guides: { v: number[]; h: number[] }) => void
}

function Group({
  layer,
  onSelect,
  onChangeNoHistory,
  onCommitSnapshot,
  registerRef,
  computeSnap,
  onGuidesChange
}: GroupProps) {
  const groupRef = useRef<Konva.Group>(null)

  useEffect(() => {
    registerRef(groupRef.current)
    return () => registerRef(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <KonvaGroup
      ref={groupRef}
      x={layer.x}
      y={layer.y}
      rotation={layer.rotation}
      scaleX={layer.scaleX}
      scaleY={layer.scaleY}
      opacity={layer.opacity}
      draggable={!layer.locked}
      onClick={onSelect}
      onTap={onSelect}
      onDragMove={(e) => {
        const { x, y, guides } = computeSnap(layer, e.target.x(), e.target.y())
        e.target.position({ x, y })
        onGuidesChange(guides)
      }}
      onDragEnd={(e) => {
        onChangeNoHistory(layer.id, { x: e.target.x(), y: e.target.y() })
        onGuidesChange({ v: [], h: [] })
        onCommitSnapshot()
      }}
      onTransformEnd={(e) => {
        const node = e.target
        onChangeNoHistory(layer.id, {
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          scaleX: node.scaleX(),
          scaleY: node.scaleY()
        })
        onCommitSnapshot()
      }}
    >
      {renderLayerContent(layer)}
    </KonvaGroup>
  )
}

export default EditorCanvas
