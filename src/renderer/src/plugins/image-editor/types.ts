export type LayerKind = 'image' | 'text' | 'rect' | 'ellipse' | 'line'

export interface BaseLayer {
  id: string
  kind: LayerKind
  name: string
  visible: boolean
  locked: boolean
  x: number
  y: number
  rotation: number
  scaleX: number
  scaleY: number
  opacity: number
}

export interface ImageLayer extends BaseLayer {
  kind: 'image'
  src: string // data URL
  width: number
  height: number
}

export interface TextLayer extends BaseLayer {
  kind: 'text'
  text: string
  fontSize: number
  fontFamily: string
  fill: string
  fontStyle: string // 'normal' | 'italic' | 'bold' | 'italic bold'
  align: 'left' | 'center' | 'right'
  width?: number
}

export interface RectLayer extends BaseLayer {
  kind: 'rect'
  width: number
  height: number
  fill: string
  stroke: string
  strokeWidth: number
  cornerRadius: number
}

export interface EllipseLayer extends BaseLayer {
  kind: 'ellipse'
  radiusX: number
  radiusY: number
  fill: string
  stroke: string
  strokeWidth: number
}

export interface LineLayer extends BaseLayer {
  kind: 'line'
  points: number[] // [x1, y1, x2, y2]
  stroke: string
  strokeWidth: number
}

export type Layer = ImageLayer | TextLayer | RectLayer | EllipseLayer | LineLayer

export interface CanvasState {
  width: number
  height: number
  background: string
}
