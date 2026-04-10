import { useState } from 'react'
import {
  Network,
  FileText,
  Shield,
  Clock,
  Languages,
  Image as ImageIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Wrench,
  Sun,
  Moon
} from 'lucide-react'
import type { PluginRendererManifest } from '../../plugins/registry'
import type { Theme } from '../../hooks/useTheme'

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Network,
  FileText,
  Shield,
  Clock,
  Languages,
  Image: ImageIcon
}

interface SidebarProps {
  plugins: PluginRendererManifest[]
  activeId: string
  collapsed: boolean
  theme: Theme
  onSelect: (id: string) => void
  onToggle: () => void
  onToggleTheme: () => void
}

export default function Sidebar({
  plugins,
  activeId,
  collapsed,
  theme,
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
      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {plugins.map((plugin) => {
          const Icon = iconMap[plugin.icon] || Wrench
          const isActive = plugin.id === activeId
          const isHovered = plugin.id === hoveredId

          return (
            <div
              key={plugin.id}
              className="relative"
              onMouseEnter={() => setHoveredId(plugin.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <button
                onClick={() => onSelect(plugin.id)}
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
      </nav>

      {/* Separator + bottom actions */}
      <div className="shrink-0 border-t border-surface-800 px-2 py-2 space-y-0.5">
        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
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
