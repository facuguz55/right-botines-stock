import { useState, useEffect, useCallback } from 'react'
import type { RecargoTarjeta } from '../types'
import { fetchRecargosTarjeta, createRecargoTarjeta, toggleRecargoTarjeta, deleteRecargoTarjeta } from '../services/recargosTarjeta'

type RecargoTarjetaInput = Omit<RecargoTarjeta, 'id' | 'created_at'>

export function useRecargosTarjeta() {
  const [recargos, setRecargos] = useState<RecargoTarjeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRecargos(await fetchRecargosTarjeta())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addRecargo = async (input: RecargoTarjetaInput) => {
    await createRecargoTarjeta(input)
    await load()
  }

  const toggleActivo = async (id: string, activo: boolean) => {
    await toggleRecargoTarjeta(id, activo)
    await load()
  }

  const removeRecargo = async (id: string) => {
    await deleteRecargoTarjeta(id)
    await load()
  }

  return { recargos, loading, error, reload: load, addRecargo, toggleActivo, removeRecargo }
}
