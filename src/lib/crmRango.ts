// Filtros de fecha de "Stats CRM": Hoy, Ayer, semana, mes (el más usado: se
// puede elegir cualquier mes) y rangos sueltos. Todo con fechas 'YYYY-MM-DD'
// (hora Argentina). Funciones puras para probarlas sin pantalla.

export interface RangoCrm { start: string; end: string }

export function sumarDiasISO(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function ultimoDiaDelMesISO(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

export function mesAnteriorISO(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// Lunes de la semana de `fecha` (la semana argentina arranca el lunes).
export function lunesDeISO(fecha: string): string {
  const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay() // 0 = domingo
  return sumarDiasISO(fecha, dia === 0 ? -6 : 1 - dia)
}

// Un mes completo; si es el actual, llega hasta hoy.
export function rangoDeMes(mes: string, hoy: string): RangoCrm {
  const fin = ultimoDiaDelMesISO(mes)
  return { start: `${mes}-01`, end: fin > hoy ? hoy : fin }
}

// Los últimos `cantidad` meses, el actual primero (para el selector).
export function ultimosMeses(hoy: string, cantidad = 12): string[] {
  const lista = [hoy.slice(0, 7)]
  while (lista.length < cantidad) lista.push(mesAnteriorISO(lista[lista.length - 1]))
  return lista
}

// Si el rango es exactamente un mes (completo, o del 1 a hoy en el actual),
// devuelve ese mes para marcarlo en el selector.
export function mesDelRango(r: RangoCrm, hoy: string): string | null {
  const mes = r.start.slice(0, 7)
  if (r.start !== `${mes}-01`) return null
  return rangoDeMes(mes, hoy).end === r.end ? mes : null
}

export function nombreMesLargo(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  const txt = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return (txt.charAt(0).toUpperCase() + txt.slice(1)).replace(' de ', ' ')
}

export function presetsCrm(hoy: string): { label: string; start: string; end: string }[] {
  const lunes = lunesDeISO(hoy)
  const mesPasado = mesAnteriorISO(hoy.slice(0, 7))
  const ayer = sumarDiasISO(hoy, -1)
  return [
    { label: 'Hoy', start: hoy, end: hoy },
    { label: 'Ayer', start: ayer, end: ayer },
    { label: 'Esta semana', start: lunes, end: hoy },
    { label: 'Semana pasada', start: sumarDiasISO(lunes, -7), end: sumarDiasISO(lunes, -1) },
    { label: '30 días', start: sumarDiasISO(hoy, -29), end: hoy },
    { label: 'Este mes', ...rangoDeMes(hoy.slice(0, 7), hoy) },
    { label: 'Mes pasado', ...rangoDeMes(mesPasado, hoy) },
    { label: 'Todo', start: '2020-01-01', end: hoy },
  ]
}
