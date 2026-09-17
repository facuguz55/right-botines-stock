// ── Fecha en hora de Argentina, no UTC ───────────────────────────────────────
// Bug extendido detectado en toda la app: convertir una fecha a "YYYY-MM-DD"
// con `d.toISOString().split('T')[0]` corta en horario UTC. Argentina es
// UTC-3 (sin horario de verano desde 2009, así que el offset es fijo todo
// el año) — después de las 21:00 hs locales, ese corte ya cae en el día
// siguiente. Esto corrompía en silencio los filtros "Hoy"/rangos de fecha,
// el arqueo de caja, el cierre de mes de Rentabilidad, y varios presets de
// fecha duplicados en distintos componentes.
//
// Este archivo centraliza esa conversión en un solo lugar correcto, para no
// seguir copiando el mismo bug (o el mismo fix) en cada componente nuevo.

const OFFSET_ARG_MIN = -180 // UTC-3 fijo

// Reinterpreta el instante `d` como si el reloj de Argentina fuera UTC —
// permite usar los getters getUTC*() de la Date resultante como si fueran
// "hora local de Argentina", sin depender de la zona horaria del navegador
// ni de Intl.
function aArgentina(d: Date): Date {
  return new Date(d.getTime() + OFFSET_ARG_MIN * 60000)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// Reemplazo directo de `d.toISOString().split('T')[0]`, pero en hora de
// Argentina en vez de UTC.
export function toISOLocal(d: Date): string {
  const a = aArgentina(d)
  return `${a.getUTCFullYear()}-${pad2(a.getUTCMonth() + 1)}-${pad2(a.getUTCDate())}`
}

// "Hoy", en hora de Argentina — reemplazo directo de `toISO(new Date())`.
export function hoyLocal(): string {
  return toISOLocal(new Date())
}

// Lunes a domingo de la semana calendario que contiene `base` (por defecto
// hoy), en hora de Argentina — no una ventana rodante de los últimos 7 días
// (el bug que tenían los presets "Semana" de Caja/Devoluciones/Empleados/
// Proveedores/Órdenes TN/Historial de Ventas).
export function semanaActual(base: Date = new Date()): { start: string; end: string } {
  const a = aArgentina(base)
  const diaSemana = a.getUTCDay() // 0 = domingo, 1 = lunes, ..., 6 = sábado
  const diffHastaLunes = diaSemana === 0 ? 6 : diaSemana - 1
  const lunes = new Date(a)
  lunes.setUTCDate(a.getUTCDate() - diffHastaLunes)
  const domingo = new Date(lunes)
  domingo.setUTCDate(lunes.getUTCDate() + 6)
  const fmt = (x: Date) => `${x.getUTCFullYear()}-${pad2(x.getUTCMonth() + 1)}-${pad2(x.getUTCDate())}`
  return { start: fmt(lunes), end: fmt(domingo) }
}

// String ISO con offset explícito -03:00 para los límites de un rango de
// fecha en queries a Supabase (columnas timestamptz) — así el filtro
// `gte`/`lte` cubre el día/mes calendario real de Argentina, no el de UTC.
export function inicioDiaLocalISO(isoDate: string): string {
  return `${isoDate}T00:00:00.000-03:00`
}

export function finDiaLocalISO(isoDate: string): string {
  return `${isoDate}T23:59:59.999-03:00`
}

// Rango [inicio, fin] del mes calendario de Argentina que contiene `base`
// (por defecto el mes actual), como strings ISO con offset -03:00 listos
// para usar en queries.
export function rangoMesLocalISO(base: Date = new Date()): { startISO: string; endISO: string } {
  const a = aArgentina(base)
  const anio = a.getUTCFullYear()
  const mes = a.getUTCMonth() + 1 // 1-indexado
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  return {
    startISO: inicioDiaLocalISO(`${anio}-${pad2(mes)}-01`),
    endISO: finDiaLocalISO(`${anio}-${pad2(mes)}-${pad2(ultimoDia)}`),
  }
}

// Rango [inicio, fin] del mes calendario de Argentina anterior al de `base`.
export function rangoMesAnteriorLocalISO(base: Date = new Date()): { startISO: string; endISO: string } {
  const a = aArgentina(base)
  const anio = a.getUTCFullYear()
  const mes = a.getUTCMonth() + 1
  const mesAnteriorDate = new Date(Date.UTC(anio, mes - 1, 1)) // mes 0-indexado - 1 = mes anterior
  return rangoMesLocalISO(mesAnteriorDate)
}
