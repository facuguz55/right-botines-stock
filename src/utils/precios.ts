import type { Modelo, RecargoTarjeta } from '../types'

// El precio de lista (modelos.precio_venta) es solo vidriera de marketing en
// la web. El precio real que cobra el local es el "Promocional" de
// TiendaNube — un campo propio de cada producto (variants[].promotional_price
// en la API), sincronizado por tnSync.ts/tn-webhook.ts. No es un % fijo: cada
// producto puede tener su propio descuento.
export function getPrecioReal(modelo: Modelo): number {
  return modelo.precio_promocional ?? modelo.precio_venta
}

export function tieneDescuentoPromocional(modelo: Modelo): boolean {
  return modelo.precio_promocional != null && modelo.precio_promocional < modelo.precio_venta
}

// Recargo fijo usado mientras no haya ningún recargo por tarjeta/cuotas
// cargado todavía en recargos_tarjeta (comportamiento previo a esa feature).
export const RECARGO_TARJETA_FALLBACK_PCT = 10

export function tarjetasDisponibles(recargos: RecargoTarjeta[]): string[] {
  return [...new Set(recargos.filter(r => r.activo).map(r => r.tarjeta))]
}

export function cuotasDisponibles(recargos: RecargoTarjeta[], tarjeta: string): number[] {
  return recargos.filter(r => r.activo && r.tarjeta === tarjeta).map(r => r.cuotas).sort((a, b) => a - b)
}

export function getRecargoPct(recargos: RecargoTarjeta[], tarjeta: string | null, cuotas: number | null): number {
  if (recargos.length === 0) return RECARGO_TARJETA_FALLBACK_PCT
  const match = recargos.find(r => r.activo && r.tarjeta === tarjeta && r.cuotas === cuotas)
  return match ? match.porcentaje : 0
}
