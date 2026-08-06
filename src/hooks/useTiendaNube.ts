import { useState, useEffect, useCallback } from 'react'
import { buildTNMetrics, type TNMetrics } from '../services/tiendanubeService'
import { fetchLocalTNOrdenes, syncTNOrdenes } from '../services/tnOrdersSync'

// Progreso siempre 0: la lectura es local (Supabase), ya no pagina contra la
// API de TN. Se mantiene el campo para no tocar la UI de TNDashboard/TNAnalytics.
const progress = 0

export function useTiendaNube() {
  const [metrics, setMetrics] = useState<TNMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const orders = await fetchLocalTNOrdenes()
      setMetrics(buildTNMetrics(orders))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos de TiendaNube')
    } finally {
      setLoading(false)
    }
  }, [])

  const reload = useCallback(async () => {
    try {
      await syncTNOrdenes()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al sincronizar con TiendaNube')
    }
    await load()
  }, [load])

  useEffect(() => { load() }, [load])

  return { metrics, loading, error, progress, reload }
}
