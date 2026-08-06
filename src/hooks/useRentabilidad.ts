import { useState, useEffect, useCallback } from 'react'
import type { RentabilidadMes } from '../types'
import { computeRentabilidadMes } from '../services/rentabilidadService'

function mesActualStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function useRentabilidad(mesInicial: string = mesActualStr()) {
  const [mes, setMes] = useState(mesInicial)
  const [data, setData] = useState<RentabilidadMes | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await computeRentabilidadMes(mes))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [mes])

  useEffect(() => { load() }, [load])

  return { data, mes, setMes, loading, error, reload: load }
}
