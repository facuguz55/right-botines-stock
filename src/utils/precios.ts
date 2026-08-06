import type { Modelo } from '../types'

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
