import { useState, useCallback, useEffect } from 'react'
import type { CartItem, Modelo, ModeloTalle } from '../types'
import { getPrecioItem } from '../utils/precios'

const CART_KEY = 'rb_carrito'

function loadInitial(): CartItem[] {
  try {
    const saved = localStorage.getItem(CART_KEY)
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

export function useCarrito() {
  const [items, setItems] = useState<CartItem[]>(loadInitial)

  useEffect(() => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)) } catch { /* noop */ }
  }, [items])

  const addItem = useCallback((modelo: Modelo, talle: ModeloTalle, cantidad: number, precioManual: number | null = null) => {
    setItems(prev => {
      // Solo se acumula en la misma línea si coincide también el precio —
      // dos cantidades del mismo modelo/talle a precios distintos quedan
      // como líneas separadas del carrito.
      const idx = prev.findIndex(i => i.modelo.id === modelo.id && i.talleId === talle.id && (i.precioManual ?? null) === precioManual)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], cantidad: next[idx].cantidad + cantidad }
        return next
      }
      return [...prev, { modelo, talleId: talle.id, talleArg: talle.talle_arg, talleUs: talle.talle_us, cantidad, precioManual }]
    })
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const count = items.reduce((s, i) => s + i.cantidad, 0)
  const subtotal = items.reduce((s, i) => s + getPrecioItem(i) * i.cantidad, 0)

  return { items, addItem, clear, count, subtotal }
}
