import { useEffect, useState, useCallback, useRef } from 'react'

export type Theme = 'dark' | 'light'

function applyTheme(theme: Theme): void {
  const root = document.documentElement
  root.classList.remove('dark', 'light')
  root.classList.add(theme)
  root.style.colorScheme = theme
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('dark')
  const revision = useRef(0)

  // Load persisted theme
  useEffect(() => {
    let alive = true
    const initial = revision.current
    const accept = (next: Theme) => { if (alive && (next === 'dark' || next === 'light')) { setThemeState(next); applyTheme(next) } }
    const off = window.api.on('app:theme-changed', (next: Theme) => { revision.current++; accept(next) })
    window.api
      .invoke('app:get-settings')
      .then((settings: { theme?: Theme }) => {
        if (revision.current === initial) accept(settings?.theme ?? 'dark')
      })
      .catch(() => {
        if (revision.current === initial) accept('dark')
      })
    return () => { alive = false; off() }
  }, [])

  const setTheme = useCallback((next: Theme) => {
    revision.current++
    setThemeState(next)
    applyTheme(next)
    window.api.invoke('app:save-theme', next).catch(() => {})
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  return { theme, setTheme, toggleTheme }
}
