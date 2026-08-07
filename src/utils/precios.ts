import type { Modelo, RecargoTarjeta } from '../types'

// El "precio promocional" no es un campo por producto: TiendaNube aplica un
// % de descuento fijo en el checkout cuando el cliente paga por transferencia
// (configurado en el panel de TN, ver configuracion_ventas). Se calcula acá,
// no se persiste por modelo.
export function getPrecioPromocional(modelo: Modelo, descuentoPct: number | null): number | null {
  if (descuentoPct == null || descuentoPct <= 0) return null
  return Math.round(modelo.precio_venta * (1 - descuentoPct / 100))
}

export function getPrecioUnitario(modelo: Modelo, usarPromocional: boolean, descuentoPct: number | null): number {
  if (!usarPromocional) return modelo.precio_venta
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
