import { useState, useEffect, useCallback } from 'react'
import type { Fichaje } from '../types'
import { fetchFichajes, cerrarFichajeManual } from '../services/fichajes'

export function useFichajes(startDate?: string, endDate?: string) {
  const [fichajes, setFichajes] = useState<Fichaje[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setFichajes(await fetchFichajes(startDate, endDate))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => { load() }, [load])

  const cerrarManual = async (fichajeId: string, horaSalida: string) => {
    await cerrarFichajeManual(fichajeId, horaSalida)
    await load()
  }

  return { fichajes, loading, error, reload: load, cerrarManual }
}
