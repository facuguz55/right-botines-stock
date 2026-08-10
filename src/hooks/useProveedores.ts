import { useState, useEffect, useCallback } from 'react'
import type { Proveedor } from '../types'
import { fetchProveedores, createProveedor, updateProveedor } from '../services/proveedores'

export function useProveedores() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setProveedores(await fetchProveedores())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addProveedor = async (nombre: string, contacto: string | null, telefono: string | null, notas: string | null) => {
    await createProveedor(nombre, contacto, telefono, notas)
    await load()
  }

  const toggleActivo = async (id: string, activo: boolean) => {
    await updateProveedor(id, { activo })
    await load()
  }

  return { proveedores, loading, error, reload: load, addProveedor, toggleActivo }
}
