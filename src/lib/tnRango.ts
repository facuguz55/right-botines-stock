// Filtros de fecha de Análisis (Tienda Online): Hoy, Ayer, Este mes, Últimos
// 60 días y un rango personalizado. Todo en hora Argentina (UTC-3, sin horario
// de verano), igual que el resto de las métricas de TiendaNube. Funciones
// puras para poder probarlas sin pantalla.

export type PresetRango = 'hoy' | 'ayer' | 'mes' | '60d' | 'custom'

export interface RangoFechas { desde: string; hasta: string } // 'YYYY-MM-DD', ambos inclusivos

export interface OrdenMinima {
  created_at: string
  total: string
  status: string
  payment_status: string
}

const TZ = 'America/Argentina/Buenos_Aires'
const MAX_DIAS = 366

// 'YYYY-MM-DD' en hora Argentina de un instante ISO.
export function fechaAR(iso: string | number | Date): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
}

function horaAR(iso: string): number {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
  return parseInt(h, 10) % 24
}

export function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function rangoDe(preset: PresetRango, hoy: string, custom?: RangoFechas): RangoFechas {
  switch (preset) {
    case 'hoy': return { desde: hoy, hasta: hoy }
    case 'ayer': { const a = sumarDias(hoy, -1); return { desde: a, hasta: a } }
    case 'mes': return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy }
    case '60d': return { desde: sumarDias(hoy, -59), hasta: hoy }
    case 'custom': {
      const d = custom?.desde || hoy
      const h = custom?.hasta || d
      // Si las pusieron al revés, se acomodan en vez de mostrar vacío.
      return d <= h ? { desde: d, hasta: h } : { desde: h, hasta: d }
    }
  }
}

export function cantidadDias(r: RangoFechas): number {
  const ms = new Date(`${r.hasta}T12:00:00Z`).getTime() - new Date(`${r.desde}T12:00:00Z`).getTime()
  return Math.round(ms / 86_400_000) + 1
}

export interface ResumenRango {
  ordenes: number
  facturado: number
  ticketPromedio: number
  porDia: { name: string; value: number; facturado: number }[]
  porHora: { name: string; value: number }[]
  horaPico: { name: string; value: number }
}

// Mismo criterio que las métricas del dashboard: cuentan las órdenes pagadas
// o autorizadas que no están canceladas.
export function resumirRango(orders: OrdenMinima[], r: RangoFechas): ResumenRango {
  const dias = Math.min(cantidadDias(r), MAX_DIAS)
  const porFecha = new Map<string, { value: number; facturado: number }>()
  for (let i = 0; i < dias; i++) porFecha.set(sumarDias(r.desde, i), { value: 0, facturado: 0 })
  const horas = Array.from({ length: 24 }, () => 0)
  let ordenes = 0
  let facturado = 0

  for (const o of orders) {
    if (o.status === 'cancelled') continue
    if (o.payment_status !== 'paid' && o.payment_status !== 'authorized') continue
    const dia = fechaAR(o.created_at)
    const celda = porFecha.get(dia)
    if (!celda) continue
    const total = parseFloat(o.total ?? '0') || 0
    celda.value++
    celda.facturado += total
    horas[horaAR(o.created_at)]++
    ordenes++
    facturado += total
  }

  const porDia = [...porFecha.entries()].map(([fecha, v]) => ({
    name: `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`,
    value: v.value,
    facturado: v.facturado,
  }))
  const porHora = horas.map((value, h) => ({ name: `${String(h).padStart(2, '0')}:00`, value }))
  const horaPico = porHora.reduce((max, h) => (h.value > max.value ? h : max), { name: '—', value: 0 })

  return { ordenes, facturado, ticketPromedio: ordenes > 0 ? facturado / ordenes : 0, porDia, porHora, horaPico }
}

export function tituloRango(preset: PresetRango, r: RangoFechas): string {
  const f = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`
  if (preset === 'hoy') return 'hoy'
  if (preset === 'ayer') return 'ayer'
  if (preset === 'mes') return 'este mes'
  if (preset === '60d') return 'últimos 60 días'
  return r.desde === r.hasta ? f(r.desde) : `${f(r.desde)} al ${f(r.hasta)}`
}
