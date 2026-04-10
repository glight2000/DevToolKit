import type { Layer, CanvasState } from '../types'

interface PropertiesPanelProps {
  layer: Layer | null
  canvas: CanvasState
  onCanvasChange: (next: Partial<CanvasState>) => void
  onLayerChange: (id: string, updates: Partial<Layer>) => void
}

const inputCls =
  'w-full rounded border border-surface-600 bg-surface-800 px-2 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
const labelCls = 'block text-[10px] uppercase tracking-wider text-slate-500 mb-0.5'
const sectionCls = 'border-b border-surface-800 px-3 py-3 space-y-2.5'

export default function PropertiesPanel({
  layer,
  canvas,
  onCanvasChange,
  onLayerChange
}: PropertiesPanelProps) {
  return (
    <div className="flex flex-col overflow-y-auto">
      {/* Canvas settings */}
      <div className={sectionCls}>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Canvas</h3>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Width</label>
            <input
              type="number"
              value={canvas.width}
              onChange={(e) =>
                onCanvasChange({ width: Math.max(1, parseInt(e.target.value) || 0) })
              }
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Height</label>
            <input
              type="number"
              value={canvas.height}
              onChange={(e) =>
                onCanvasChange({ height: Math.max(1, parseInt(e.target.value) || 0) })
              }
              className={inputCls}
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>Background</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={canvas.background}
              onChange={(e) => onCanvasChange({ background: e.target.value })}
              className="h-7 w-10 cursor-pointer rounded border border-surface-600 bg-surface-800"
            />
            <input
              type="text"
              value={canvas.background}
              onChange={(e) => onCanvasChange({ background: e.target.value })}
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* Layer properties */}
      {layer ? (
        <>
          <div className={sectionCls}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Transform
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>X</label>
                <input
                  type="number"
                  value={Math.round(layer.x)}
                  onChange={(e) => onLayerChange(layer.id, { x: parseFloat(e.target.value) || 0 })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Y</label>
                <input
                  type="number"
                  value={Math.round(layer.y)}
                  onChange={(e) => onLayerChange(layer.id, { y: parseFloat(e.target.value) || 0 })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Rotation</label>
                <input
                  type="number"
                  value={Math.round(layer.rotation)}
                  onChange={(e) =>
                    onLayerChange(layer.id, { rotation: parseFloat(e.target.value) || 0 })
                  }
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Opacity</label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={layer.opacity}
                  onChange={(e) =>
                    onLayerChange(layer.id, { opacity: parseFloat(e.target.value) || 0 })
                  }
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Scale X</label>
                <input
                  type="number"
                  step={0.1}
                  value={layer.scaleX.toFixed(2)}
                  onChange={(e) =>
                    onLayerChange(layer.id, { scaleX: parseFloat(e.target.value) || 1 })
                  }
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Scale Y</label>
                <input
                  type="number"
                  step={0.1}
                  value={layer.scaleY.toFixed(2)}
                  onChange={(e) =>
                    onLayerChange(layer.id, { scaleY: parseFloat(e.target.value) || 1 })
                  }
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* Kind-specific props */}
          {layer.kind === 'text' && (
            <div className={sectionCls}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Text</h3>
              <div>
                <label className={labelCls}>Content</label>
                <textarea
                  value={layer.text}
                  rows={3}
                  onChange={(e) => onLayerChange(layer.id, { text: e.target.value })}
                  className={`${inputCls} resize-none`}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Font Size</label>
                  <input
                    type="number"
                    value={layer.fontSize}
                    onChange={(e) =>
                      onLayerChange(layer.id, { fontSize: parseFloat(e.target.value) || 12 })
                    }
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Color</label>
                  <input
                    type="color"
                    value={layer.fill}
                    onChange={(e) => onLayerChange(layer.id, { fill: e.target.value })}
                    className="h-7 w-full cursor-pointer rounded border border-surface-600 bg-surface-800"
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Font Family</label>
                <select
                  value={layer.fontFamily}
                  onChange={(e) => onLayerChange(layer.id, { fontFamily: e.target.value })}
                  className={inputCls}
                >
                  <option value="sans-serif">Sans-serif</option>
                  <option value="serif">Serif</option>
                  <option value="monospace">Monospace</option>
                  <option value="Arial">Arial</option>
                  <option value="Helvetica">Helvetica</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Courier New">Courier New</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Style</label>
                <select
                  value={layer.fontStyle}
                  onChange={(e) => onLayerChange(layer.id, { fontStyle: e.target.value })}
                  className={inputCls}
                >
                  <option value="normal">Normal</option>
                  <option value="bold">Bold</option>
                  <option value="italic">Italic</option>
                  <option value="italic bold">Bold Italic</option>
                </select>
              </div>
            </div>
          )}

          {layer.kind === 'rect' && (
            <div className={sectionCls}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Rectangle
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Width</label>
                  <input
                    type="number"
                    value={Math.round(layer.width)}
                    onChange={(e) =>
                      onLayerChange(layer.id, { width: parseFloat(e.target.value) || 0 })
                    }
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Height</label>
                  <input
                    type="number"
                    value={Math.round(layer.height)}
                    onChange={(e) =>
                      onLayerChange(layer.id, { height: parseFloat(e.target.value) || 0 })
                    }
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Fill</label>
                <input
                  type="color"
                  value={layer.fill}
                  onChange={(e) => onLayerChange(layer.id, { fill: e.target.value })}
                  className="h-7 w-full cursor-pointer rounded border border-surface-600 bg-surface-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Stroke</label>
                  <input
                    type="color"
                    value={layer.stroke}
                    onChange={(e) => onLayerChange(layer.id, { stroke: e.target.value })}
                    className="h-7 w-full cursor-pointer rounded border border-surface-600 bg-surface-800"
                  />
                </div>
                <div>
                  <label className={labelCls}>Stroke W</label>
                  <input
                    type="number"
                    value={layer.strokeWidth}
                    onChange={(e) =>
                      onLayerChange(layer.id, { strokeWidth: parseFloat(e.target.value) || 0 })
                    }
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Corner Radius</label>
                <input
                  type="number"
                  value={layer.cornerRadius}
                  onChange={(e) =>
                    onLayerChange(layer.id, { cornerRadius: parseFloat(e.target.value) || 0 })
                  }
                  className={inputCls}
                />
              </div>
            </div>
          )}

          {layer.kind === 'ellipse' && (
            <div className={sectionCls}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Ellipse
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Radius X</label>
                  <input
                    type="number"
                    value={Math.round(layer.radiusX)}
                    onChange={(e) =>
                      onLayerChange(layer.id, { radiusX: parseFloat(e.target.value) || 0 })
                    }
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Radius Y</label>
                  <input
                    type="number"
                    value={Math.round(layer.radiusY)}
                    onChange={(e) =>
                      onLayerChange(layer.id, { radiusY: parseFloat(e.target.value) || 0 })
                    }
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Fill</label>
                <input
                  type="color"
                  value={layer.fill}
                  onChange={(e) => onLayerChange(layer.id, { fill: e.target.value })}
                  className="h-7 w-full cursor-pointer rounded border border-surface-600 bg-surface-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Stroke</label>
                  <input
                    type="color"
                    value={layer.stroke}
                    onChange={(e) => onLayerChange(layer.id, { stroke: e.target.value })}
                    className="h-7 w-full cursor-pointer rounded border border-surface-600 bg-surface-800"
                  />
                </div>
                <div>
                  <label className={labelCls}>Stroke W</label>
                  <input
                    type="number"
                    value={layer.strokeWidth}
                    onChange={(e) =>
                      onLayerChange(layer.id, { strokeWidth: parseFloat(e.target.value) || 0 })
                    }
                    className={inputCls}
                  />
                </div>
              </div>
            </div>
          )}

          {layer.kind === 'image' && (
            <div className={sectionCls}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Image</h3>
              <div className="text-xs text-slate-500">
                {layer.width} × {layer.height}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="px-4 py-8 text-center text-xs text-slate-500">
          Select a layer to edit its properties
        </div>
      )}
    </div>
  )
}
