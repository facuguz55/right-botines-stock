import { useState, useEffect, useCallback } from 'react'
import type { DevolucionCambio } from '../types'
import {
  fetchDevolucionesCambios, registrarDevolucionCambio, type RegistrarDevolucionCambioInput,
} from '../services/devolucionesCambios'

export function useDevoluciones(startDate?: string, endDate?: string) {
  const [registros, setRegistros] = useState<DevolucionCambio[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRegistros(await fetchDevolucionesCambios(startDate, endDate))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => { load() }, [load])

  const registrar = async (input: RegistrarDevolucionCambioInput) => {
    await registrarDevolucionCambio(input)
    await load()
  }

  return { registros, loading, error, reload: load, registrar }
}
