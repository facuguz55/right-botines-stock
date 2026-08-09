import type { Modelo, RecargoTarjeta } from '../types'

// El "Promocional" de TiendaNube (precio_promocional) es el precio CON
// TARJETA de cada producto, no el de efectivo. Cuando ese campo no está
// cargado en TN, "Precio" (precio_venta) pasa a ser directamente el precio
// con tarjeta — no es vidriera de marketing en ese caso (confirmado contra
// la web pública: hay productos sin Promocional que igual muestran
// TRANSF/Tarjeta distintos, tomando "Precio" como base). El precio real de
// efectivo/transferencia (precio_efectivo) se deriva de ese valor en el sync
// (ver tnSync.ts / tn-webhook.ts / tnMapping.ts).
export function getPrecioReal(modelo: Modelo): number {
  return modelo.precio_efectivo ?? modelo.precio_promocional ?? modelo.precio_venta
}

export function tieneDescuentoPromocional(modelo: Modelo): boolean {
  return getPrecioReal(modelo) < modelo.precio_venta
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

// Crédito 3 cuotas es, casualmente, el mismo recargo que TiendaNube ya aplica
// online. El precio real con tarjeta de cada producto es precio_promocional
// si está cargado, o si no precio_venta (cuando TN no tiene "Promocional"
// seteado, "Precio" pasa a ser directamente el precio con tarjeta — ver
// tnMapping.ts). Para ese caso puntual se usa ese valor ya sincronizado en
// vez del % genérico de recargos_tarjeta, así el local cobra exactamente lo
// mismo que muestra la web pública.
export function getPrecioConRecargo(
  modelo: Modelo, tarjeta: string | null, cuotas: number | null, recargoPct: number,
): number {
  if (tarjeta === 'Crédito' && cuotas === 3) {
    return modelo.precio_promocional ?? modelo.precio_venta
  }
  return getPrecioReal(modelo) * (1 + recargoPct / 100)
}
