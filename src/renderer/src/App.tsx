import { useState, useEffect, Suspense } from 'react'
import Sidebar from './components/shell/Sidebar'
import { plugins } from './plugins/registry'
import { RefreshCw } from 'lucide-react'
import { useTheme } from './hooks/useTheme'

export default function App() {
  const [activePluginId, setActivePluginId] = useState<string>('ssh-tunnel')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const { theme, toggleTheme } = useTheme()

  // Load saved settings on mount
  useEffect(() => {
    window.api.invoke('app:get-settings').then((settings: any) => {
      if (settings.activePluginId) setActivePluginId(settings.activePluginId)
      if (settings.sidebarCollapsed !== undefined) setSidebarCollapsed(settings.sidebarCollapsed)
    })
  }, [])

  // Save active plugin when it changes
  const handleSelectPlugin = (id: string) => {
    setActivePluginId(id)
    window.api.invoke('app:save-active-plugin', id)
  }

  const handleToggleSidebar = () => {
    const newVal = !sidebarCollapsed
    setSidebarCollapsed(newVal)
    window.api.invoke('app:save-sidebar-collapsed', newVal)
  }

  const activePlugin = plugins.find((p) => p.id === activePluginId)
  const ActiveComponent = activePlugin?.component

  return (
    <div className="flex h-screen bg-surface-950 overflow-hidden">
      <Sidebar
        plugins={plugins}
        activeId={activePluginId}
        collapsed={sidebarCollapsed}
        theme={theme}
        onSelect={handleSelectPlugin}
        onToggle={handleToggleSidebar}
        onToggleTheme={toggleTheme}
      />
      <main className="flex-1 min-w-0 overflow-hidden">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
            </div>
          }
        >
          {ActiveComponent && <ActiveComponent />}
        </Suspense>
      </main>
    </div>
  )
}
