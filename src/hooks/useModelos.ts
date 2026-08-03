import { useState, useEffect, useCallback } from 'react'
import type { Modelo, ModeloFilters, PhotoSlot, TalleRow, MedioPago, CartItem } from '../types'
import {
  fetchModelos, createModelo, updateModelo, deleteModelo,
  sellCarrito, addIngreso, addIngresoBatch, upsertTalle, deleteTalle,
  getUniqueCodigoBase, clearAllModelos,
} from '../services/modelos'
import { saveFotos, deleteFotosForModelo } from '../services/fotos'
import { recordPriceChange } from '../services/historial_precios'
import { pushStockToTN, createTNProductAndLink } from '../services/tnSync'

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
    talleRows: TalleRow[],
    tnCategoryId: number | null = null
  ) => {
    const codigoBase = await getUniqueCodigoBase(data.codigo_base)
    const newModelo = await createModelo({ ...data, codigo_base: codigoBase })

    const talles: { talleArg: number; talleUs: number; cantidad: number }[] = []
    for (const row of talleRows.filter(r => !r.toDelete)) {
      const talleArg = parseFloat(row.talle_arg)
      const talleUs = parseFloat(row.talle_us)
      const cantidad = parseInt(row.cantidad) || 0
      await upsertTalle({
        modelo_id: newModelo.id,
        talle_us: talleUs,
        talle_arg: talleArg,
        cantidad,
        stock_minimo: parseInt(row.stock_minimo) || 1,
      })
      talles.push({ talleArg, talleUs, cantidad })
    }

    const fotos = await saveFotos(newModelo.id, codigoBase, photos, [])

    // Best-effort: publicar también en TiendaNube. No bloquea el alta local
    // si TN falla (queda con su código local normal, sin vincular).
    createTNProductAndLink(newModelo, talles, fotos.map(f => f.foto_url), tnCategoryId).catch(err => {
      console.error('No se pudo crear el producto en TiendaNube:', err)
    })

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

  const venderCarrito = async (items: CartItem[], medioPago: MedioPago, clienteId: string) => {
    const resolved = items.map(item => {
      const modelo = modelos.find(m => m.id === item.modelo.id)
      if (!modelo) throw new Error(`El modelo ${item.modelo.modelo} ya no existe`)
      return { modelo, talleId: item.talleId, cantidad: item.cantidad }
    })

    await sellCarrito(resolved, medioPago, clienteId)

    setModelos(prev => prev.map(m => {
      const afectados = resolved.filter(r => r.modelo.id === m.id)
      if (!afectados.length) return m
      return {
        ...m,
        modelo_talles: m.modelo_talles.map(t => {
          const match = afectados.find(a => a.talleId === t.id)
          return match ? { ...t, cantidad: t.cantidad - match.cantidad } : t
        }),
      }
    }))

    // Best-effort: si el modelo viene de TiendaNube, reflejar el nuevo stock allá.
    // No debe bloquear ni revertir la venta local si TN falla.
    for (const { modelo, talleId, cantidad } of resolved) {
      const talle = modelo.modelo_talles.find(t => t.id === talleId)
      if (talle) {
        pushStockToTN(modelo, talle.talle_arg, talle.cantidad - cantidad).catch(err => {
          console.error('No se pudo actualizar el stock en TiendaNube:', err)
        })
      }
    }
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

    // Best-effort: reflejar el nuevo stock en TiendaNube.
    const modelo = modelos.find(m => m.id === modeloId)
    if (modelo) {
      pushStockToTN(modelo, talleArg, cantidadActual + cantidad).catch(err => {
        console.error('No se pudo actualizar el stock en TiendaNube:', err)
      })
    }
  }

  const ingresarStockBatch = async (
    modeloId: string,
    changes: { talleId: string; talleArg: number; talleUs: number; cantidadActual: number; delta: number }[],
    newTalle: { talleArg: number; talleUs: number; cantidad: number } | null,
    costoTotal: number
  ) => {
    await addIngresoBatch(modeloId, changes, newTalle, costoTotal)
    await load()

    // Best-effort: reflejar el nuevo stock en TiendaNube (el talle nuevo, si
    // lo hay, todavía no tiene variante en TN — queda logueado y sin bloquear).
    const modelo = modelos.find(m => m.id === modeloId)
    if (modelo) {
      for (const c of changes) {
        pushStockToTN(modelo, c.talleArg, c.cantidadActual + c.delta).catch(err => {
          console.error('No se pudo actualizar el stock en TiendaNube:', err)
        })
      }
    }
  }

  const clearAll = async () => {
    await clearAllModelos()
    setModelos([])
  }

  return {
    modelos, loading, error, reload: load,
    addModelo, editModelo, removeModelo, venderCarrito, ingresarStock, ingresarStockBatch, clearAll,
  }
}

export function filterModelos(modelos: Modelo[], filters: ModeloFilters): Modelo[] {
  return modelos.filter(m => {
    if (filters.marca && m.marca.toLowerCase() !== filters.marca.toLowerCase()) return false
    if (filters.categoria && m.categoria !== filters.categoria) return false
    if (filters.gama && m.gama !== filters.gama) return false
    if (filters.talle && !m.modelo_talles.some(t => String(t.talle_arg) === filters.talle)) return false
    const total = m.modelo_talles.reduce((s, t) => s + t.cantidad, 0)
    if (filters.disponibilidad === 'disponible' && total <= 0) return false
    if (filters.disponibilidad === 'agotado' && total > 0) return false
    if (
      filters.search &&
      !m.codigo_base.toLowerCase().includes(filters.search.toLowerCase()) &&
      !m.modelo.toLowerCase().includes(filters.search.toLowerCase())
    ) return false
    if (filters.talle && !m.modelo_talles.some(t => String(t.talle_arg) === filters.talle)) return false
    return true
  })
}
