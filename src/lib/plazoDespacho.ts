// Plazo para despachar un pedido de Buenos Aires: 2 días hábiles (lunes a
// viernes, hora de Argentina) desde que entró. Pasado eso, figura atrasado.
// Los feriados no se descuentan.
export const DIAS_HABILES_PLAZO = 2
const AR = -3 * 3600_000 // Argentina no tiene horario de verano

const esFinde = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6

// Vencimiento: se suman días hábiles a la hora local del pedido. Si entró un
// sábado o domingo, cuenta desde el lunes a las 00:00.
export function vencimientoDespacho(fechaIso: string, dias = DIAS_HABILES_PLAZO): Date {
  const d = new Date(Date.parse(fechaIso) + AR) // "reloj" argentino en campos UTC
  if (esFinde(d)) {
    while (esFinde(d)) d.setUTCDate(d.getUTCDate() + 1)
    d.setUTCHours(0, 0, 0, 0)
  }
  let n = 0
  while (n < dias) {
    d.setUTCDate(d.getUTCDate() + 1)
    if (!esFinde(d)) n++
  }
  return new Date(d.getTime() - AR)
}

export function estaAtrasado(fechaIso: string, ahora = new Date()): boolean {
  return ahora.getTime() > vencimientoDespacho(fechaIso).getTime()
}
