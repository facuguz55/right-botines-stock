import { useState, useEffect, useCallback } from 'react'
import type { Fichaje } from '../types'
import { fetchFichajeAbierto, abrirFichaje, cerrarFichajeAbiertoDeEmpleado } from '../services/fichajes'

export function useFichajeActual(empleadoId: string | null) {
  const [fichaje, setFichaje] = useState<Fichaje | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!empleadoId) {
      setFichaje(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setFichaje(await fetchFichajeAbierto(empleadoId))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [empleadoId])

  useEffect(() => { reload() }, [reload])

  const ficharEntrada = async () => {
    if (!empleadoId) return
    await abrirFichaje(empleadoId)
    await reload()
  }

  const ficharSalida = async () => {
    if (!empleadoId) return
    await cerrarFichajeAbiertoDeEmpleado(empleadoId)
    await reload()
  }

  return { fichaje, loading, error, ficharEntrada, ficharSalida }
}
