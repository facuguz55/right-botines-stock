import { useState, useEffect, useCallback } from 'react'
import type { CostoConfig, CostoUnico } from '../types'
import {
  fetchCostosConfig, createCostoConfig, updateCostoConfig, toggleCostoConfig, deleteCostoConfig,
  fetchCostosUnicos, createCostoUnico, deleteCostoUnico,
} from '../services/costosService'

type CostoConfigInput = Omit<CostoConfig, 'id' | 'created_at' | 'updated_at'>
type CostoUnicoInput = Omit<CostoUnico, 'id' | 'created_at'>

export function useCostos() {
  const [costosConfig, setCostosConfig] = useState<CostoConfig[]>([])
  const [costosUnicos, setCostosUnicos] = useState<CostoUnico[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [config, unicos] = await Promise.all([fetchCostosConfig(), fetchCostosUnicos()])
      setCostosConfig(config)
      setCostosUnicos(unicos)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addCostoConfig = async (input: CostoConfigInput) => {
    await createCostoConfig(input)
    await load()
  }

  const editCostoConfig = async (id: string, updates: Partial<CostoConfigInput>) => {
    await updateCostoConfig(id, updates)
    await load()
  }

  const toggleActivo = async (id: string, activo: boolean) => {
    await toggleCostoConfig(id, activo)
    await load()
  }

  const removeCostoConfig = async (id: string) => {
    await deleteCostoConfig(id)
    await load()
  }

  const addCostoUnico = async (input: CostoUnicoInput) => {
    await createCostoUnico(input)
    await load()
  }

  const removeCostoUnico = async (id: string) => {
    await deleteCostoUnico(id)
    await load()
  }

  return {
    costosConfig, costosUnicos, loading, error, reload: load,
    addCostoConfig, editCostoConfig, toggleActivo, removeCostoConfig,
    addCostoUnico, removeCostoUnico,
  }
}
