export type WidgetKind = 'note' | 'clock' | 'clipboard' | 'quota'
export type DockEdge = 'left' | 'right' | 'top' | 'bottom' | 'none'
export const resizeDirections = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const
export type ResizeDirection = typeof resizeDirections[number]
export const widgetMotionDuration = { opening: 150, closing: 110, leave: 80 } as const
export interface WidgetMotion { id: number; phase: 'opening' | 'closing' }
export interface WidgetSettings {
  enabled: boolean
  pinned: boolean
  edge: DockEdge
  bounds?: { x: number; y: number; width: number; height: number }
}
export interface DesktopSettings {
  dragEnabled: boolean
  modifier: 'alt' | 'alt-shift'
  switcherEnabled: boolean
  widgetMode: 'independent' | 'grouped'
  widgetDisplayId: string
  widgetDisplayArea?: { x: number; y: number; width: number; height: number }
  widgetGroup: WidgetSettings
  widgets: Record<WidgetKind, WidgetSettings>
}
export interface DesktopStatus {
  supported: boolean
  running: boolean
  virtualDesktop: boolean
  dragActive: boolean
  switcherActive: boolean
  error: string | null
}
export interface DockDisplay { id: string; label: string; width: number; height: number; primary: boolean }
export interface OpenWindow { id: string; pid: number; title: string; app: string; desktop: number; current: boolean; minimized: boolean }
export interface ClipboardItem { id: string; text: string; time: number }
export type FloatingKind = WidgetKind | `quota-${string}` | 'group'
export interface FloatingWidgetState extends WidgetSettings {
  kind: FloatingKind; expanded: boolean; motion?: WidgetMotion; note?: string; clips?: ClipboardItem[]
  subscription?: import('./subscriptions').SubscriptionRecord
  items?: FloatingWidgetState[]
  subscriptions?: import('./subscriptions').SubscriptionRecord[]
}
export const widgetKinds: WidgetKind[] = ['note', 'clock', 'clipboard', 'quota']
export const defaultDesktopSettings = (): DesktopSettings => ({
  dragEnabled: false, modifier: 'alt', switcherEnabled: false, widgetMode: 'independent', widgetDisplayId: 'primary', widgetGroup: { enabled: false, pinned: false, edge: 'right' },
  widgets: Object.fromEntries(widgetKinds.map(kind => [kind, { enabled: false, pinned: false, edge: 'right' }])) as DesktopSettings['widgets']
})
export function validateDesktopPatch(value: unknown): Partial<DesktopSettings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid desktop settings')
  const patch = value as Record<string, unknown>
  if (Object.keys(patch).some(key => !['dragEnabled', 'modifier', 'switcherEnabled', 'widgetMode', 'widgetDisplayId'].includes(key))) throw new Error('Unknown desktop setting')
  for (const name of ['dragEnabled', 'switcherEnabled']) if (name in patch && typeof patch[name] !== 'boolean') throw new Error('Expected a switch value')
  if ('modifier' in patch && patch.modifier !== 'alt' && patch.modifier !== 'alt-shift') throw new Error('Invalid modifier')
  if ('widgetMode' in patch && patch.widgetMode !== 'independent' && patch.widgetMode !== 'grouped') throw new Error('Invalid widget mode')
  if ('widgetDisplayId' in patch && (typeof patch.widgetDisplayId !== 'string' || !/^(primary|-?\d{1,20})$/.test(patch.widgetDisplayId))) throw new Error('Invalid display')
  return patch as Partial<DesktopSettings>
}
export function searchWindows(windows: OpenWindow[], query: string): OpenWindow[] {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  return windows.filter(window => terms.every(term => `${window.title} ${window.app}`.toLocaleLowerCase().includes(term)))
}
