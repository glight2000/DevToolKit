import { useEffect, useState, useCallback } from 'react'

export type Theme = 'dark' | 'light'

function applyTheme(theme: Theme): void {
  const root = document.documentElement
  root.classList.remove('dark', 'light')
  root.classList.add(theme)
  root.style.colorScheme = theme
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('dark')

  // Apply dark by default immediately (before settings load) to avoid flash
  useEffect(() => {
    applyTheme('dark')
  }, [])

  // Load persisted theme
  useEffect(() => {
    window.api
      .invoke('app:get-settings')
      .then((settings: { theme?: Theme }) => {
        const savedTheme = settings?.theme ?? 'dark'
        setThemeState(savedTheme)
        applyTheme(savedTheme)
      })
      .catch(() => {
        applyTheme('dark')
      })
  }, [])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    applyTheme(next)
    window.api.invoke('app:save-theme', next).catch(() => {})
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  return { theme, setTheme, toggleTheme }
}
