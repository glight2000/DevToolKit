import { useState } from 'react'
import {
  Network,
  Terminal,
  FileText,
  Shield,
  Clock,
  Languages,
  PanelLeftClose,
  PanelLeftOpen,
  Wrench,
  LayoutGrid,
  Rows3,
  Sun,
  Moon,
  MousePointer2,
  AppWindow,
  PanelsTopLeft,
  Gauge,
  Search
} from 'lucide-react'
import type { PluginRendererManifest } from '../../plugins/registry'
import type { Theme } from '../../hooks/useTheme'
import type { InterfaceMode } from '../../../../shared/settings'

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Terminal,
  Network,
  FileText,
  Shield,
  Clock,
  Languages,
  MousePointer2,
  AppWindow,
  PanelsTopLeft,
  Gauge,
  Search
}

interface SidebarProps {
  plugins: PluginRendererManifest[]
  activeId: string
  collapsed: boolean
  theme: Theme
  interfaceMode: InterfaceMode
  onInterfaceModeChange: (mode: InterfaceMode) => void
  onSelect: (id: string) => void
  onToggle: () => void
  onToggleTheme: () => void
}

export default function Sidebar({
  plugins,
  activeId,
  collapsed,
  theme,
  interfaceMode,
  onInterfaceModeChange,
  onSelect,
  onToggle,
  onToggleTheme
}: SidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  return (
    <aside
      className={`relative flex flex-col shrink-0 bg-surface-900 border-r border-surface-800 transition-all duration-300 ease-in-out ${
        collapsed ? 'w-16' : 'w-52'
      }`}
    >
      {/* App branding */}
      <div className="flex items-center gap-2.5 px-4 py-5 shrink-0">
        <Wrench className="h-5 w-5 text-blue-400 shrink-0" />
        {!collapsed && (
          <span className="text-sm font-bold text-slate-100 tracking-tight whitespace-nowrap overflow-hidden transition-opacity duration-200">
            DevToolkit
          </span>
        )}
      </div>

      {/* Plugin list */}
      {!collapsed && <p className="px-5 pb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Workspace</p>}
      {(['tools', 'settings'] as const).map(group => <nav key={group} aria-label={group === 'tools' ? 'Tools' : 'Settings'} className={group === 'tools' ? 'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-1' : 'mx-2 mt-2 flex shrink-0 flex-col gap-1 border-t border-surface-700 py-2'}>
        {group === 'settings' && !collapsed && <p className="px-3 py-1 text-[10px] font-semibold tracking-widest text-slate-500">设置</p>}
        {plugins.filter(plugin => (plugin.group === 'settings') === (group === 'settings')).map((plugin) => {
          const Icon = iconMap[plugin.icon] || Wrench
          const isActive = plugin.id === activeId
          const isHovered = plugin.id === hoveredId

          return (
            <div
              key={plugin.id}
              className="relative shrink-0"
              onMouseEnter={() => setHoveredId(plugin.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <button
                onClick={() => onSelect(plugin.id)}
                aria-label={plugin.name}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-3 w-full rounded-lg px-3 py-2.5 transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-500/10 text-blue-400 border-l-2 border-blue-500 pl-[10px]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-surface-800 border-l-2 border-transparent pl-[10px]'
                }`}
                title={collapsed ? plugin.name : undefined}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && (
                  <span className="text-sm font-medium truncate whitespace-nowrap">
                    {plugin.name}
                  </span>
                )}
              </button>

              {/* Tooltip when collapsed */}
              {collapsed && isHovered && (
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 pointer-events-none">
                  <div className="rounded-lg bg-surface-700 border border-surface-600 px-3 py-1.5 text-xs font-medium text-slate-200 shadow-lg whitespace-nowrap">
                    {plugin.name}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </nav>)}

      {/* Separator + bottom actions */}
      <div className="shrink-0 border-t border-surface-800 px-2 py-2 space-y-0.5">
        {collapsed ? (
          <button onClick={() => onInterfaceModeChange(interfaceMode === 'modern' ? 'compact' : 'modern')}
            aria-label={interfaceMode === 'modern' ? 'Switch to compact interface' : 'Switch to modern interface'}
            title={interfaceMode === 'modern' ? 'Modern style · Switch to compact' : 'Compact style · Switch to modern'}
            className="flex w-full items-center rounded-lg px-3 py-2.5 text-slate-400 hover:bg-surface-800 hover:text-slate-200">
            {interfaceMode === 'modern' ? <LayoutGrid className="h-[18px] w-[18px]" /> : <Rows3 className="h-[18px] w-[18px]" />}
          </button>
        ) : (
          <div className="px-1 pb-2 pt-1">
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Interface style</p>
            <div role="group" aria-label="Interface style" className="flex rounded-lg border border-surface-700 bg-surface-800 p-1">
              {(['modern', 'compact'] as const).map(mode => (
                <button key={mode} onClick={() => onInterfaceModeChange(mode)} aria-pressed={interfaceMode === mode}
                  title={mode === 'modern' ? 'Modern: spacious layout and softer corners' : 'Compact: denser controls and more room for content'}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-1 py-2 text-xs font-medium transition-colors ${interfaceMode === mode ? 'bg-surface-950 text-blue-400 shadow-xs' : 'text-slate-400 hover:text-slate-100'}`}>
                  {mode === 'modern' ? <LayoutGrid className="h-3.5 w-3.5" /> : <Rows3 className="h-3.5 w-3.5" />}
                  {mode === 'modern' ? 'Modern' : 'Compact'}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-slate-400 hover:text-slate-200 hover:bg-surface-800 transition-all duration-200"
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? (
            <Sun className="h-[18px] w-[18px] shrink-0" />
          ) : (
            <Moon className="h-[18px] w-[18px] shrink-0" />
          )}
          {!collapsed && (
            <span className="text-sm font-medium">
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </span>
          )}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-slate-400 hover:text-slate-200 hover:bg-surface-800 transition-all duration-200"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-[18px] w-[18px] shrink-0" />
          ) : (
            <>
              <PanelLeftClose className="h-[18px] w-[18px] shrink-0" />
              <span className="text-sm font-medium">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
