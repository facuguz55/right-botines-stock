import { useState, useCallback, useEffect } from 'react'
import type { CartItem, Modelo, ModeloTalle } from '../types'
import { getPrecioItem } from '../utils/precios'

const CART_KEY = 'rb_carrito'

// sessionStorage, no localStorage: con dos empleados vendiendo a la vez en
// dos pestañas (ej. Rocío y Bernardino los sábados), un carrito en
// localStorage se pisaba entre pestañas — el carrito de uno tapaba el del
// otro. sessionStorage es propio de cada pestaña.
//
// Fallback a localStorage (sin borrarlo) si sessionStorage viene vacío: no
// perder un carrito en curso justo en la pestaña que estaba abierta cuando
// esta versión se despliega. Ver el mismo patrón en hooks/useAuth.ts.
function loadInitial(): CartItem[] {
  try {
    const saved = sessionStorage.getItem(CART_KEY) ?? localStorage.getItem(CART_KEY)
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

export function useCarrito() {
  const [items, setItems] = useState<CartItem[]>(loadInitial)

  useEffect(() => {
    try {
      sessionStorage.setItem(CART_KEY, JSON.stringify(items))
      // Limpio el localStorage viejo apenas el carrito cambia en esta pestaña
      // (incluido el clear() al confirmar una venta), para que ese carrito ya
      // completado no "reaparezca" por el fallback de arriba en otra pestaña
      // o recarga futura.
      localStorage.removeItem(CART_KEY)
    } catch { /* noop */ }
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
