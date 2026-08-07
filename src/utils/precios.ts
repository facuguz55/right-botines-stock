import type { Modelo, RecargoTarjeta } from '../types'

// El precio de lista (modelos.precio_venta) es solo vidriera de marketing en
// la web — el precio real que cobra el local es el promocional (el mismo
// descuento que TiendaNube aplica en el checkout por transferencia, ver
// configuracion_ventas). No se persiste por modelo, se calcula acá.
export function getPrecioPromocional(modelo: Modelo, descuentoPct: number | null): number | null {
  if (descuentoPct == null || descuentoPct <= 0) return null
  return Math.round(modelo.precio_venta * (1 - descuentoPct / 100))
}

// Precio real que se cobra en el local: siempre el promocional. Si todavía
// no hay % de descuento configurado en Ajustes, cae al precio de lista como
// único fallback disponible (no hay otro precio real que mostrar).
export function getPrecioReal(modelo: Modelo, descuentoPct: number | null): number {
  return getPrecioPromocional(modelo, descuentoPct) ?? modelo.precio_venta
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
