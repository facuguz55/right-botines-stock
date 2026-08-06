import { useState, useEffect, useCallback } from 'react'
import { fetchTNMetrics, getTNCredentials, type TNMetrics } from '../services/tiendanubeService'

export function useTiendaNube(force = false) {
  const [metrics, setMetrics]   = useState<TNMetrics | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  const load = useCallback(async (forceLoad = false) => {
    const { storeId, token } = getTNCredentials()
    setLoading(true)
    setError(null)
    setProgress(0)
    try {
      const data = await fetchTNMetrics(storeId, token, n => setProgress(n), forceLoad)
      setMetrics(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos de TiendaNube')
    } finally {
      setLoading(false)
      setProgress(0)
    }
  }, [])

  useEffect(() => { load(force) }, [load, force])

  return { metrics, loading, error, progress, reload: () => load(true) }
}
