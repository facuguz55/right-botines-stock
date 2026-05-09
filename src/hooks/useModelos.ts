import { useState, useEffect, useCallback } from 'react'
import type { Modelo, ModeloFilters, PhotoSlot, TalleRow, MedioPago } from '../types'
import {
  fetchModelos, createModelo, updateModelo, deleteModelo,
  sellTalle, addIngreso, upsertTalle, deleteTalle,
  getUniqueCodigoBase, clearAllModelos,
} from '../services/modelos'
import { saveFotos, deleteFotosForModelo } from '../services/fotos'
import { recordPriceChange } from '../services/historial_precios'

type ModeloInput = Omit<Modelo, 'id' | 'created_at' | 'modelo_talles' | 'modelo_fotos'>

export function useModelos() {
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setModelos(await fetchModelos())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addModelo = async (
    data: ModeloInput,
    photos: PhotoSlot[],
    talleRows: TalleRow[]
  ) => {
    const codigoBase = await getUniqueCodigoBase(data.codigo_base)
    const newModelo = await createModelo({ ...data, codigo_base: codigoBase })

    for (const row of talleRows.filter(r => !r.toDelete)) {
      await upsertTalle({
        modelo_id: newModelo.id,
        talle_us: parseFloat(row.talle_us),
        talle_arg: parseFloat(row.talle_arg),
        cantidad: parseInt(row.cantidad) || 0,
        stock_minimo: parseInt(row.stock_minimo) || 1,
      })
    }

    await saveFotos(newModelo.id, codigoBase, photos, [])
    await load()
  }

  const editModelo = async (
    id: string,
    data: Partial<ModeloInput>,
    photos: PhotoSlot[],
    toDeleteFotoIds: string[],
    talleRows: TalleRow[]
  ) => {
    const current = modelos.find(m => m.id === id)
    if (current && data.precio_venta !== undefined && data.precio_venta !== current.precio_venta) {
      await recordPriceChange(id, current.precio_venta, data.precio_venta)
    }

    const updated = await updateModelo(id, data)

    for (const row of talleRows) {
      if (row.id && row.toDelete) {
        await deleteTalle(row.id)
      } else if (!row.toDelete) {
        await upsertTalle({
          id: row.id,
          modelo_id: id,
          talle_us: parseFloat(row.talle_us),
          talle_arg: parseFloat(row.talle_arg),
          cantidad: parseInt(row.cantidad) || 0,
          stock_minimo: parseInt(row.stock_minimo) || 1,
        })
      }
    }

    await saveFotos(id, updated.codigo_base, photos, toDeleteFotoIds)
    await load()
  }

  const removeModelo = async (id: string) => {
    await deleteFotosForModelo(id)
    await deleteModelo(id)
    setModelos(prev => prev.filter(m => m.id !== id))
  }

  const venderModelo = async (modelo: Modelo, talleId: string, medioPago: MedioPago) => {
    await sellTalle(modelo, talleId, medioPago)
    setModelos(prev => prev.map(m =>
      m.id !== modelo.id ? m : {
        ...m,
        modelo_talles: m.modelo_talles.map(t =>
          t.id !== talleId ? t : { ...t, cantidad: t.cantidad - 1 }
        ),
      }
    ))
  }

  const ingresarStock = async (
    modeloId: string,
    talleArg: number,
    talleUs: number,
    cantidadActual: number,
    cantidad: number,
    costoTotal: number,
    talleId?: string
  ) => {
    await addIngreso(modeloId, talleArg, talleUs, cantidadActual, cantidad, costoTotal, talleId)
    await load()
  }

  const clearAll = async () => {
    await clearAllModelos()
    setModelos([])
  }

  return {
    modelos, loading, error, reload: load,
    addModelo, editModelo, removeModelo, venderModelo, ingresarStock, clearAll,
  }
}

export function filterModelos(modelos: Modelo[], filters: ModeloFilters): Modelo[] {
  return modelos.filter(m => {
    if (filters.marca && m.marca.toLowerCase() !== filters.marca.toLowerCase()) return false
    if (filters.categoria && m.categoria !== filters.categoria) return false
    if (filters.gama && m.gama !== filters.gama) return false
    const total = m.modelo_talles.reduce((s, t) => s + t.cantidad, 0)
    if (filters.disponibilidad === 'disponible' && total <= 0) return false
    if (filters.disponibilidad === 'agotado' && total > 0) return false
    if (
      filters.search &&
      !m.codigo_base.toLowerCase().includes(filters.search.toLowerCase()) &&
      !m.modelo.toLowerCase().includes(filters.search.toLowerCase())
    ) return false
    return true
  })
}
