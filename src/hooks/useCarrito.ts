import { useState, useCallback, useEffect } from 'react'
import type { CartItem, Modelo, ModeloTalle } from '../types'
import { getPrecioUnitario } from '../utils/precios'

const CART_KEY = 'rb_carrito'

function loadInitial(): CartItem[] {
  try {
    const saved = localStorage.getItem(CART_KEY)
    const parsed = saved ? JSON.parse(saved) : []
    // Carritos guardados antes de sumar el toggle lista/promocional no traen
    // el campo — default seguro para no romperlos.
    return (parsed as CartItem[]).map(i => ({ ...i, usarPromocional: i.usarPromocional ?? false }))
  } catch {
    return []
  }
}

export function useCarrito(descuentoPct: number | null = null) {
  const [items, setItems] = useState<CartItem[]>(loadInitial)

  useEffect(() => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)) } catch { /* noop */ }
  }, [items])

  const addItem = useCallback((modelo: Modelo, talle: ModeloTalle, cantidad: number) => {
    setItems(prev => {
      const idx = prev.findIndex(i => i.modelo.id === modelo.id && i.talleId === talle.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], cantidad: next[idx].cantidad + cantidad }
        return next
      }
      return [...prev, { modelo, talleId: talle.id, talleArg: talle.talle_arg, talleUs: talle.talle_us, cantidad, usarPromocional: false }]
    })
  }, [])

  const setUsarPromocional = useCallback((modeloId: string, talleId: string, value: boolean) => {
    setItems(prev => prev.map(i => (i.modelo.id === modeloId && i.talleId === talleId) ? { ...i, usarPromocional: value } : i))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const count = items.reduce((s, i) => s + i.cantidad, 0)
  const subtotal = items.reduce((s, i) => s + getPrecioUnitario(i.modelo, i.usarPromocional, descuentoPct) * i.cantidad, 0)

  return { items, addItem, setUsarPromocional, clear, count, subtotal }
}
