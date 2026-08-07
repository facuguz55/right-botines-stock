import { useState, useEffect, useCallback } from 'react'
import type { Empleado } from '../types'
import { fetchEmpleados, createEmpleado, updateEmpleado } from '../services/empleados'

export function useEmpleados() {
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setEmpleados(await fetchEmpleados())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addEmpleado = async (nombre: string) => {
    await createEmpleado(nombre)
    await load()
  }

  const toggleActivo = async (id: string, activo: boolean) => {
    await updateEmpleado(id, { activo })
    await load()
  }

  const renombrar = async (id: string, nombre: string) => {
    await updateEmpleado(id, { nombre })
    await load()
  }

  return { empleados, loading, error, reload: load, addEmpleado, toggleActivo, renombrar }
}
