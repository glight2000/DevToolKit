import { useRef } from 'react'

interface Tab {
  key: string
  label: string
  icon?: React.ReactNode
}

interface TabBarProps {
  tabs: Tab[]
  activeKey: string
  onChange: (key: string) => void
}

export default function TabBar({ tabs, activeKey, onChange }: TabBarProps) {
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  return (
    <div role="tablist" aria-label="Tool options" className="flex overflow-x-auto items-center gap-1 border-b border-surface-800">
      {tabs.map((tab, index) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={activeKey === tab.key}
          tabIndex={activeKey === tab.key ? 0 : -1}
          onKeyDown={event => {
            let next = index
            if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
            else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length
            else if (event.key === 'Home') next = 0
            else if (event.key === 'End') next = tabs.length - 1
            else return
            event.preventDefault()
            onChange(tabs[next].key)
            tabRefs.current[tabs[next].key]?.focus()
            tabRefs.current[tabs[next].key]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
          }}
          ref={(el) => {
            tabRefs.current[tab.key] = el
          }}
          onClick={() => onChange(tab.key)}
          className={`shrink-0 whitespace-nowrap border-b-2 flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors duration-200 ${
            activeKey === tab.key
              ? 'border-blue-500 bg-blue-500/5 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-surface-800'
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}

    </div>
  )
}
