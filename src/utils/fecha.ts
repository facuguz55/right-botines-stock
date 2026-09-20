// Fecha local en formato YYYY-MM-DD, a partir de los componentes locales de
// Date (año/mes/día) — nunca de toISOString(), que es UTC.
//
// Argentina es UTC-3: entre las 21:00 y las 23:59 hora local, el reloj UTC
// ya marca el día siguiente. Cualquier `new Date().toISOString().slice(0,10)`
// devuelve esa fecha de "mañana" durante esas tres horas — justo el horario
// de cierre de la tienda — así que "Hoy" en Ventas/Caja/etc. quedaba
// apuntando al día siguiente (todavía sin ventas) y las ventas reales de
// hoy aparecían recién al mirar "Ayer".
export function toLocalISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function hoyLocalISO(): string {
  return toLocalISO(new Date())
}
