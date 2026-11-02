import { useState, useEffect, useRef, Suspense } from 'react'
import Sidebar from './components/shell/Sidebar'
import { plugins } from './plugins/registry'
import { RefreshCw } from 'lucide-react'
import { useTheme } from './hooks/useTheme'
import type { InterfaceMode } from '../../shared/settings'

export default function App() {
  const [activePluginId, setActivePluginId] = useState<string>('ssh-tunnel')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [interfaceMode, setInterfaceMode] = useState<InterfaceMode>('modern')
  const [interfaceError, setInterfaceError] = useState<string | null>(null)
  const interfaceChanged = useRef(false)
  const pluginChanged = useRef(false)
  const visited = useRef(new Set<string>())
  visited.current.add(activePluginId)
  const { theme, toggleTheme } = useTheme()

  // Load saved settings on mount
  useEffect(() => {
    window.api.invoke('app:get-settings').then((settings: any) => {
      const savedPlugin = plugins.find((plugin) => plugin.id === settings.activePluginId)
      const restoredPluginId = savedPlugin?.id ?? plugins[0].id
      if (!pluginChanged.current) setActivePluginId(restoredPluginId)
      if (!pluginChanged.current && settings.activePluginId !== restoredPluginId) {
        window.api.invoke('app:save-active-plugin', restoredPluginId).catch(console.error)
      }
      if (settings.sidebarCollapsed !== undefined) setSidebarCollapsed(settings.sidebarCollapsed)
      if (!interfaceChanged.current) setInterfaceMode(settings.interfaceMode === 'compact' ? 'compact' : 'modern')
    }).catch(console.error)
  }, [])

  // Save active plugin when it changes
  const handleSelectPlugin = (id: string) => {
    pluginChanged.current = true
    setActivePluginId(id)
    window.api.invoke('app:save-active-plugin', id).catch(console.error)
  }
  useEffect(() => {
    const navigate = (event: Event) => { const id = (event as CustomEvent).detail; if (plugins.some(plugin => plugin.id === id)) handleSelectPlugin(id) }
    window.addEventListener('app:navigate', navigate)
    const off = window.api.on('app:open-plugin', (id: string) => { if (plugins.some(plugin => plugin.id === id)) handleSelectPlugin(id) })
    return () => { window.removeEventListener('app:navigate', navigate); off() }
  }, [])

  const handleToggleSidebar = () => {
    const newVal = !sidebarCollapsed
    setSidebarCollapsed(newVal)
    window.api.invoke('app:save-sidebar-collapsed', newVal).catch(console.error)
  }

  const handleInterfaceMode = (mode: InterfaceMode) => {
    interfaceChanged.current = true
    setInterfaceMode(mode)
    setInterfaceError(null)
    window.api.invoke('app:save-interface-mode', mode).catch(() => {
      setInterfaceError('Could not save interface style. Try switching again.')
    })
  }

  return (
    <div data-interface={interfaceMode} className="flex h-screen bg-surface-950 overflow-hidden">
      <Sidebar
        plugins={plugins}
        activeId={activePluginId}
        collapsed={sidebarCollapsed}
        theme={theme}
        onSelect={handleSelectPlugin}
        onToggle={handleToggleSidebar}
        onToggleTheme={toggleTheme}
        interfaceMode={interfaceMode}
        onInterfaceModeChange={handleInterfaceMode}
      />
      <main className="flex-1 min-w-0 overflow-hidden">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
            </div>
          }
        >
          {plugins.filter(plugin => plugin.id === activePluginId || plugin.keepAlive && visited.current.has(plugin.id)).map(plugin => {
            const Component = plugin.component
            return <div key={plugin.id} hidden={plugin.id !== activePluginId} className="h-full"><Component /></div>
          })}
        </Suspense>
      </main>
      {interfaceError && <div role="alert" className="fixed bottom-4 right-4 z-50 rounded-lg border border-red-400 bg-surface-900 px-4 py-3 text-sm text-red-400">{interfaceError}</div>}
    </div>
  )
}
