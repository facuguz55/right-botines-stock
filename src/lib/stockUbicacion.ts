import type { ModeloTalle } from '../types'

// La app guarda el total de cada talle; parte puede estar en el depósito de
// Buenos Aires (cantidad_ba, ubicación "Deposito CABA" de TiendaNube), que
// solo sale por envío. Lo demás está en el local.
export function paresBA(t: Pick<ModeloTalle, 'cantidad' | 'cantidad_ba'>): number {
  return Math.max(0, Math.min(t.cantidad, t.cantidad_ba ?? 0))
}

export function paresLocal(t: Pick<ModeloTalle, 'cantidad' | 'cantidad_ba'>): number {
  return Math.max(0, t.cantidad - paresBA(t))
}
