// @ts-nocheck
import { useState, useEffect, useCallback } from 'react'
import type { Producto, ProductoFilters, PhotoSlot, MedioPago } from '../types'
import {
  fetchProductos, createProducto, updateProducto, deleteProducto,
  sellProducto as sellProductoService, addStockIngreso, getUniqueCodigoRef,
  clearAllProductos,
} from '../services/productos'
import { saveFotos, deleteFotosForProducto } from '../services/fotos'
import { recordPriceChange } from '../services/historial_precios'

export function useProductos() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setProductos(await fetchProductos())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addProducto = async (
    producto: Omit<Producto, 'id' | 'created_at' | 'producto_fotos'>,
    photos: PhotoSlot[]
  ) => {
    const codigoRef = await getUniqueCodigoRef(producto.codigo_ref)
    const newProducto = await createProducto({ ...producto, codigo_ref: codigoRef })
    const fotos = await saveFotos(newProducto.id, codigoRef, photos, [])
    const withFotos = { ...newProducto, producto_fotos: fotos }
    setProductos(prev => [withFotos, ...prev])
    return withFotos
  }

  const editProducto = async (
    id: string,
    updates: Partial<Omit<Producto, 'id' | 'created_at' | 'producto_fotos'>>,
    photos: PhotoSlot[],
    toDeleteFotoIds: string[]
  ) => {
    const current = productos.find(p => p.id === id)
    if (current && updates.precio_venta !== undefined && updates.precio_venta !== current.precio_venta) {
      await recordPriceChange(id, current.precio_venta, updates.precio_venta)
    }
    const updated = await updateProducto(id, updates)
    const fotos = await saveFotos(id, updated.codigo_ref, photos, toDeleteFotoIds)
    const withFotos = { ...updated, producto_fotos: fotos }
    setProductos(prev => prev.map(p => (p.id === id ? withFotos : p)))
    return withFotos
  }

  const removeProducto = async (id: string) => {
    await deleteFotosForProducto(id)
    await deleteProducto(id)
    setProductos(prev => prev.filter(p => p.id !== id))
  }

  const venderProducto = async (producto: Producto, medioPago: MedioPago) => {
    await sellProductoService(producto, medioPago)
    setProductos(prev => prev.map(p => (p.id === producto.id ? { ...p, cantidad: p.cantidad - 1 } : p)))
  }

  const ingresarStock = async (productoId: string, cantidad: number, costoTotal: number) => {
    const producto = productos.find(p => p.id === productoId)
    if (!producto) throw new Error('Producto no encontrado')
    await addStockIngreso(productoId, producto.cantidad, cantidad, costoTotal)
    setProductos(prev => prev.map(p => (p.id === productoId ? { ...p, cantidad: p.cantidad + cantidad } : p)))
  }

  const clearAll = async () => {
    await clearAllProductos()
    setProductos([])
  }

  return {
    productos, loading, error, reload: load,
    addProducto, editProducto, removeProducto, venderProducto, ingresarStock, clearAll,
  }
}

export function filterProductos(productos: Producto[], filters: ProductoFilters): Producto[] {
  return productos.filter(p => {
    if (filters.talle && String(p.talle_us) !== filters.talle) return false
    if (filters.marca && p.marca.toLowerCase() !== filters.marca.toLowerCase()) return false
    if (filters.categoria && p.categoria !== filters.categoria) return false
    if (filters.gama && p.gama !== filters.gama) return false
    if (filters.disponibilidad === 'disponible' && p.cantidad <= 0) return false
    if (filters.disponibilidad === 'agotado' && p.cantidad > 0) return false
    if (
      filters.search &&
      !p.codigo_ref.toLowerCase().includes(filters.search.toLowerCase()) &&
      !p.modelo.toLowerCase().includes(filters.search.toLowerCase())
    ) return false
    return true
  })
}
