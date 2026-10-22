// Garantía de Right: 30 días desde la fecha de compra, solo botines de gama alta
// y solo por fallas de fábrica (ver INFO_NEGOCIO en src/lib/crmNegocio.ts).
export const DIAS_GARANTIA = 30

const DIA_MS = 86400000
const AR_MS = -3 * 3600 * 1000 // Argentina, UTC-3 fijo

// Número de día entero en hora de Argentina (para contar días de calendario).
const diaAR = (t: number) => Math.floor((t + AR_MS) / DIA_MS)

export interface EstadoGarantia {
  vigente: boolean
  // Días que quedan (si está vigente) o hace cuántos días venció.
  dias: number
  // Último día cubierto, dd/mm/aaaa.
  venceEl: string
}

// null = esta venta no tiene garantía (no es gama alta, o no se sabe la gama).
export function estadoGarantia(fechaVenta: string, gama: string | null | undefined, ahora = Date.now()): EstadoGarantia | null {
  if ((gama ?? '').trim().toLowerCase() !== 'alta') return null
  const diaVenta = diaAR(new Date(fechaVenta).getTime())
  const restantes = DIAS_GARANTIA - (diaAR(ahora) - diaVenta)
  const v = new Date((diaVenta + DIAS_GARANTIA) * DIA_MS)
  const venceEl = `${String(v.getUTCDate()).padStart(2, '0')}/${String(v.getUTCMonth() + 1).padStart(2, '0')}/${v.getUTCFullYear()}`
  return { vigente: restantes >= 0, dias: Math.abs(restantes), venceEl }
}

export function textoGarantia(g: EstadoGarantia): string {
  if (g.vigente) return g.dias === 0 ? 'Vence hoy' : `Quedan ${g.dias} ${g.dias === 1 ? 'día' : 'días'}`
  return `Venció hace ${g.dias} ${g.dias === 1 ? 'día' : 'días'}`
}
