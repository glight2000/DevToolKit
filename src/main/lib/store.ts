import Store from 'electron-store'

export type Theme = 'dark' | 'light'

interface AppSettings {
  windowBounds: { width: number; height: number; x?: number; y?: number }
  activePluginId: string
  sidebarCollapsed: boolean
  theme: Theme
}

const store = new Store<AppSettings>({
  defaults: {
    windowBounds: { width: 1280, height: 850 },
    activePluginId: 'ssh-tunnel',
    sidebarCollapsed: false,
    theme: 'dark'
  }
})

export function getWindowBounds() {
  return store.get('windowBounds')
}

export function saveWindowBounds(bounds: AppSettings['windowBounds']) {
  store.set('windowBounds', bounds)
}

export function getActivePluginId() {
  return store.get('activePluginId')
}

export function saveActivePluginId(id: string) {
  store.set('activePluginId', id)
}

export function getSidebarCollapsed() {
  return store.get('sidebarCollapsed')
}

export function saveSidebarCollapsed(collapsed: boolean) {
  store.set('sidebarCollapsed', collapsed)
}

export function getTheme(): Theme {
  return store.get('theme')
}

export function saveTheme(theme: Theme) {
  store.set('theme', theme)
}

export default store
