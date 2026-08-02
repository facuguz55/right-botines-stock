import { useState, useEffect, useCallback } from 'react'
import type { ClienteLocal } from '../types'
import { fetchClientes, createCliente, updateCliente, deleteCliente } from '../services/clientesLocales'

type ClienteInput = Omit<ClienteLocal, 'id' | 'created_at'>

export function useClientesLocales() {
  const [clientes, setClientes] = useState<ClienteLocal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setClientes(await fetchClientes())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addCliente = async (input: ClienteInput) => {
    const nuevo = await createCliente(input)
    setClientes(prev => [nuevo, ...prev])
    return nuevo
  }

  const editCliente = async (id: string, updates: Partial<ClienteInput>) => {
    const actualizado = await updateCliente(id, updates)
    setClientes(prev => prev.map(c => (c.id === id ? actualizado : c)))
    return actualizado
  }

  const removeCliente = async (id: string) => {
    await deleteCliente(id)
    setClientes(prev => prev.filter(c => c.id !== id))
  }

  return { clientes, loading, error, reload: load, addCliente, editCliente, removeCliente }
}

export function filterClientes(clientes: ClienteLocal[], search: string): ClienteLocal[] {
  if (!search.trim()) return clientes
  const q = search.toLowerCase()
  return clientes.filter(c =>
    c.nombre.toLowerCase().includes(q) ||
    (c.telefono ?? '').toLowerCase().includes(q) ||
    (c.email ?? '').toLowerCase().includes(q)
  )
}
