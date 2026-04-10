import { useState, useEffect, useCallback, useRef } from 'react'
import type { TunnelInfo, TunnelState } from '../../../types'

export function useTunnels() {
  const [tunnels, setTunnels] = useState<TunnelInfo[]>([])
  const [loading, setLoading] = useState(true)
  const cleanupRef = useRef<(() => void) | null>(null)

  const refreshTunnels = useCallback(async () => {
    try {
      const list = await window.api.invoke('tunnel:list')
      setTunnels(list)
    } catch (err) {
      console.error('Failed to load tunnels:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshTunnels()

    cleanupRef.current = window.api.on('tunnel:state-update', (tunnelId: string, state: TunnelState) => {
      setTunnels((prev) =>
        prev.map((t) => (t.config.id === tunnelId ? { ...t, state } : t))
      )
    })

    return () => {
      cleanupRef.current?.()
    }
  }, [refreshTunnels])

  const createTunnel = useCallback(
    async (config: Partial<TunnelInfo['config']>) => {
      await window.api.invoke('tunnel:create', config)
      await refreshTunnels()
    },
    [refreshTunnels]
  )

  const updateTunnel = useCallback(
    async (id: string, config: Partial<TunnelInfo['config']>) => {
      await window.api.invoke('tunnel:update', id, config)
      await refreshTunnels()
    },
    [refreshTunnels]
  )

  const deleteTunnel = useCallback(
    async (id: string) => {
      await window.api.invoke('tunnel:delete', id)
      await refreshTunnels()
    },
    [refreshTunnels]
  )

  const startTunnel = useCallback(async (id: string) => {
    await window.api.invoke('tunnel:start', id)
  }, [])

  const stopTunnel = useCallback(async (id: string) => {
    await window.api.invoke('tunnel:stop', id)
  }, [])

  const startAll = useCallback(async () => {
    await window.api.invoke('tunnel:start-all')
  }, [])

  const stopAll = useCallback(async () => {
    await window.api.invoke('tunnel:stop-all')
  }, [])

  return {
    tunnels,
    loading,
    createTunnel,
    updateTunnel,
    deleteTunnel,
    startTunnel,
    stopTunnel,
    startAll,
    stopAll,
    refreshTunnels
  }
}
