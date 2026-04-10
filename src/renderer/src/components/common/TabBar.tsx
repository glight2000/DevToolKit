import { useRef, useState, useEffect } from 'react'

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
  const containerRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number }>({
    left: 0,
    width: 0
  })

  useEffect(() => {
    const el = tabRefs.current[activeKey]
    if (el && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect()
      const tabRect = el.getBoundingClientRect()
      setIndicatorStyle({
        left: tabRect.left - containerRect.left,
        width: tabRect.width
      })
    }
  }, [activeKey, tabs])

  return (
    <div ref={containerRef} className="relative flex items-center gap-1 border-b border-surface-800">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          ref={(el) => {
            tabRefs.current[tab.key] = el
          }}
          onClick={() => onChange(tab.key)}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors duration-200 ${
            activeKey === tab.key
              ? 'text-blue-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}

      {/* Animated underline indicator */}
      <div
        className="absolute bottom-0 h-0.5 bg-blue-500 transition-all duration-200 ease-in-out"
        style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
      />
    </div>
  )
}
