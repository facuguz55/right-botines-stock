import { useState, useEffect, useCallback } from 'react'
import type { Venta } from '../types'
import { fetchVentas } from '../services/ventas'

export function useVentas(startDate?: string, endDate?: string) {
  const [ventas, setVentas] = useState<Venta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setVentas(await fetchVentas(startDate, endDate))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => { load() }, [load])
  return { ventas, loading, error, reload: load }
}
