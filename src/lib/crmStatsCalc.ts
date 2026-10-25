import { toISOLocal } from '../utils/fecha'
import type { CrmStatsData } from '../types/crm'

// Cálculo de las estadísticas del CRM a partir de los datos crudos (sin base de
// datos, para poder probarlo). Todo en hora de Argentina (UTC-3 fijo).

export interface MsgRaw {
  direccion: string
  tipo: string
  timestamp: string
  conversacion_id: string
  automatico?: string | null
}
export interface ConvRaw {
  id: string
  categoria: string
  estado: string
  created_at: string
  no_leidos: number | null
  ultimo_mensaje_at: string | null
  venta_detectada_at?: string | null
}
export interface SugRaw {
  conversacion_id: string | null
  intencion: string | null
  talle_detectado: number | null
  tipo_detectado: string | null
  modelo_buscado?: string | null
}
export interface FotoRaw {
  conversacion_id: string | null
  modelo_id: string | null
  modelos: { marca: string; modelo: string } | null
}
export interface AprRaw { origen: string }
export interface VentaRaw { conversacion_id: string; detectada_at: string; monto: number | null; atendio: string; tipo?: string }
export interface EtiquetaRaw { id: string; nombre: string; color: string }
export interface AsignacionRaw { conversacion_id: string; etiqueta_id: string }

export interface DatosStats {
  inicio: string // YYYY-MM-DD (Argentina)
  fin: string
  mensajes: MsgRaw[]
  conversaciones: ConvRaw[]
  sugerencias: SugRaw[]
  fotos: FotoRaw[]
  aprendizajes: AprRaw[]
  etiquetas: EtiquetaRaw[]
  asignaciones: AsignacionRaw[]
  // Tabla crm_ventas (una fila por venta). Si no viene, se cuenta por chat como antes.
  ventas?: VentaRaw[]
  ahora?: number
}

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const AR_MS = -3 * 3600 * 1000

// El instante como si el reloj de Argentina fuera UTC (se leen con getUTC*).
export function enArgentina(iso: string | number): Date {
  return new Date(new Date(iso).getTime() + AR_MS)
}

// Lunes = 0 ... Domingo = 6
export function diaSemana(d: Date): number {
  return (d.getUTCDay() + 6) % 7
}

export function mediana(valores: number[]): number {
  if (valores.length === 0) return 0
  const v = [...valores].sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0)

// Todos los días del rango (con 0 si no hubo mensajes), así el gráfico no salta días.
export function diasDelRango(inicio: string, fin: string): string[] {
  const out: string[] = []
  const d = new Date(`${inicio}T12:00:00Z`)
  const hasta = new Date(`${fin}T12:00:00Z`)
  while (d <= hasta && out.length < 800) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

// Cuánto tardó Right en contestar: desde el primer mensaje del cliente que
// quedó sin contestar hasta la primera respuesta de una persona (no cuenta los
// mensajes automáticos). Se ignoran esperas de más de 48 hs.
export function tiemposDeRespuesta(mensajes: MsgRaw[]): number[] {
  const porChat = new Map<string, MsgRaw[]>()
  for (const m of mensajes) {
    const l = porChat.get(m.conversacion_id)
    if (l) l.push(m); else porChat.set(m.conversacion_id, [m])
  }
  const minutos: number[] = []
  for (const lista of porChat.values()) {
    lista.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    let esperaDesde: number | null = null
    for (const m of lista) {
      const t = new Date(m.timestamp).getTime()
      if (m.direccion === 'in') {
        if (esperaDesde === null) esperaDesde = t
      } else if (!m.automatico && esperaDesde !== null) {
        const diff = t - esperaDesde
        if (diff >= 0 && diff < 48 * 3600 * 1000) minutos.push(diff / 60000)
        esperaDesde = null
      }
    }
  }
  return minutos
}

const BUCKETS: { label: string; hasta: number }[] = [
  { label: 'Hasta 5 min', hasta: 5 },
  { label: '5 a 30 min', hasta: 30 },
  { label: '30 min a 1 h', hasta: 60 },
  { label: '1 a 4 h', hasta: 240 },
  { label: 'Más de 4 h', hasta: Infinity },
]

export function bucketsDeRespuesta(minutos: number[]): { label: string; cantidad: number }[] {
  const cuentas = BUCKETS.map(b => ({ label: b.label, cantidad: 0 }))
  for (const m of minutos) {
    const i = BUCKETS.findIndex(b => m <= b.hasta)
    cuentas[i === -1 ? cuentas.length - 1 : i].cantidad++
  }
  return cuentas
}

function contarUnicos(items: { chat: string; clave: string }[]): Map<string, number> {
  const vistos = new Set<string>()
  const cuentas = new Map<string, number>()
  for (const it of items) {
    const k = `${it.chat}|${it.clave}`
    if (vistos.has(k)) continue
    vistos.add(k)
    cuentas.set(it.clave, (cuentas.get(it.clave) ?? 0) + 1)
  }
  return cuentas
}

const top = <T>(l: T[], n: number) => l.slice(0, n)

export function calcularStats(d: DatosStats): CrmStatsData {
  const ahora = d.ahora ?? Date.now()
  const msgs = d.mensajes
  const recibidos = msgs.filter(m => m.direccion === 'in')
  const enviados = msgs.filter(m => m.direccion === 'out')

  // Mensajes por día
  // En rangos cortos se ven todos los días (con 0). Si el rango arranca mucho antes que
  // los datos (con "Todo" empieza en 2020), el gráfico arranca en el primer día con mensajes.
  const primerDia = msgs.reduce<string | null>((min, m) => {
    const f = toISOLocal(new Date(m.timestamp))
    return min === null || f < min ? f : min
  }, null)
  const diasAntes = primerDia ? (Date.parse(`${primerDia}T12:00:00Z`) - Date.parse(`${d.inicio}T12:00:00Z`)) / 86400000 : 0
  const desdeGrafico = primerDia && diasAntes > 60 ? primerDia : d.inicio
  const porDia = new Map<string, { recibidos: number; enviados: number }>()
  for (const f of diasDelRango(desdeGrafico, d.fin)) porDia.set(f, { recibidos: 0, enviados: 0 })
  for (const m of msgs) {
    const f = toISOLocal(new Date(m.timestamp))
    const fila = porDia.get(f) ?? { recibidos: 0, enviados: 0 }
    if (m.direccion === 'in') fila.recibidos++; else fila.enviados++
    porDia.set(f, fila)
  }
  const mensajesPorDia = [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, v]) => ({ fecha, ...v }))

  // Chats
  const chatsActivos = new Set(msgs.map(m => m.conversacion_id))
  const convPorId = new Map(d.conversaciones.map(c => [c.id, c]))
  const nuevos = d.conversaciones.filter(c => {
    const f = toISOLocal(new Date(c.created_at))
    return f >= d.inicio && f <= d.fin
  })

  // Tiempo de respuesta
  const minutos = tiemposDeRespuesta(msgs)
  const respuesta = {
    medianaMin: Math.round(mediana(minutos)),
    promedioMin: minutos.length ? Math.round(minutos.reduce((a, b) => a + b, 0) / minutos.length) : 0,
    dentroDe5: pct(minutos.filter(m => m <= 5).length, minutos.length),
    dentroDe60: pct(minutos.filter(m => m <= 60).length, minutos.length),
    total: minutos.length,
    buckets: bucketsDeRespuesta(minutos),
  }

  // Sin leer ahora (no depende del rango)
  const sinLeerConvs = d.conversaciones.filter(c => (c.no_leidos ?? 0) > 0 && c.categoria !== 'Spam')
  const masViejo = sinLeerConvs
    .map(c => (c.ultimo_mensaje_at ? new Date(c.ultimo_mensaje_at).getTime() : null))
    .filter((t): t is number => t !== null)
  const sinLeer = {
    cantidad: sinLeerConvs.length,
    masViejaHoras: masViejo.length ? Math.max(0, Math.round((ahora - Math.min(...masViejo)) / 3600000)) : null,
  }

  // Ventas y embudo (los chats con actividad en el período)
  const fotosPorChat = new Set(d.fotos.map(f => f.conversacion_id).filter((x): x is string => !!x))
  const conRespuesta = new Set(enviados.filter(m => !m.automatico).map(m => m.conversacion_id))
  const activosLista = [...chatsActivos]
  const conFotos = activosLista.filter(id => fotosPorChat.has(id))
  // La venta se cuenta por venta_detectada_at (la marca el detector o quien la
  // marca a mano): el estado cambia con cada mensaje y no sirve para contar.
  // Chats viejos sin esa fecha: vale el estado, como antes.
  const ventaEnRango = (c: ConvRaw | undefined) => {
    if (!c) return false
    if (c.venta_detectada_at) {
      const f = toISOLocal(new Date(c.venta_detectada_at))
      return f >= d.inicio && f <= d.fin
    }
    return c.estado === 'Venta concretada'
  }
  const enRango = d.ventas?.filter(v => {
    const f = toISOLocal(new Date(v.detectada_at))
    return f >= d.inicio && f <= d.fin
  })
  // Los pedidos de la web que pagan por WhatsApp no son ventas del CRM: van aparte.
  const ventasRango = enRango?.filter(v => v.tipo !== 'web')
  const pagosWeb = (enRango ?? []).filter(v => v.tipo === 'web')
  const chatsConVenta = ventasRango ? new Set(ventasRango.map(v => v.conversacion_id)) : null
  const concretadasActivas = activosLista.filter(id => chatsConVenta ? chatsConVenta.has(id) : ventaEnRango(convPorId.get(id)))
  const concretadasNuevas = ventasRango
    ? ventasRango.length
    : d.conversaciones.filter(c => ventaEnRango(c) && c.categoria !== 'Spam' && (c.venta_detectada_at || nuevos.includes(c))).length
  const conMonto = (ventasRango ?? []).filter(v => v.monto != null && v.monto > 0)
  const embudo = [
    { etapa: 'Chats con actividad', cantidad: activosLista.length },
    { etapa: 'Right les contestó', cantidad: activosLista.filter(id => conRespuesta.has(id)).length },
    { etapa: 'Se les mandaron fotos', cantidad: conFotos.length },
    { etapa: 'Venta concretada', cantidad: concretadasActivas.length },
  ]

  // Cuándo escriben (hora de Argentina)
  const heatmap = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
  for (const m of recibidos) {
    const a = enArgentina(m.timestamp)
    heatmap[diaSemana(a)][a.getUTCHours()]++
  }
  let mejorMomento: CrmStatsData['mejorMomento'] = null
  heatmap.forEach((fila, di) => fila.forEach((n, h) => {
    if (n > 0 && (!mejorMomento || n > mejorMomento.cantidad)) mejorMomento = { dia: DIAS[di], hora: h, cantidad: n }
  }))

  // Qué mandan
  const tipoLabel: Record<string, string> = { text: 'Texto', image: 'Fotos', audio: 'Audios', video: 'Videos', document: 'Archivos', sticker: 'Stickers' }
  const tiposCuenta = new Map<string, number>()
  for (const m of recibidos) {
    const l = tipoLabel[m.tipo] ?? 'Otros'
    tiposCuenta.set(l, (tiposCuenta.get(l) ?? 0) + 1)
  }
  const tiposMensaje = [...tiposCuenta.entries()].map(([tipo, cantidad]) => ({ tipo, cantidad })).sort((a, b) => b.cantidad - a.cantidad)

  // Qué consultan, talles, tipos y modelos (cada chat cuenta una vez por cosa)
  const intencionCuenta = new Map<string, number>()
  for (const s of d.sugerencias) {
    if (!s.intencion) continue
    intencionCuenta.set(s.intencion, (intencionCuenta.get(s.intencion) ?? 0) + 1)
  }
  const intenciones = [...intencionCuenta.entries()]
    .map(([intencion, cantidad]) => ({ intencion, cantidad }))
    .sort((a, b) => (a.intencion === 'otro' ? 1 : b.intencion === 'otro' ? -1 : b.cantidad - a.cantidad))

  const chatDe = (s: SugRaw) => s.conversacion_id ?? ''
  const talles = [...contarUnicos(d.sugerencias.filter(s => s.talle_detectado != null).map(s => ({ chat: chatDe(s), clave: String(s.talle_detectado) }))).entries()]
    .map(([t, chats]) => ({ talle: Number(t), chats }))
    .sort((a, b) => b.chats - a.chats || a.talle - b.talle)
  const tiposBotin = [...contarUnicos(d.sugerencias.filter(s => s.tipo_detectado).map(s => ({ chat: chatDe(s), clave: s.tipo_detectado as string }))).entries()]
    .map(([tipo, chats]) => ({ tipo, chats }))
    .sort((a, b) => b.chats - a.chats)
  const modelosBuscados = [...contarUnicos(d.sugerencias.filter(s => s.modelo_buscado).map(s => ({ chat: chatDe(s), clave: s.modelo_buscado as string }))).entries()]
    .map(([modelo, chats]) => ({ modelo, chats }))
    .sort((a, b) => b.chats - a.chats)

  // Productos de los que se mandaron fotos
  const prod: Record<string, { marca: string; modelo: string; consultas: number }> = {}
  for (const f of d.fotos) {
    if (!f.modelo_id || !f.modelos) continue
    prod[f.modelo_id] ??= { marca: f.modelos.marca, modelo: f.modelos.modelo, consultas: 0 }
    prod[f.modelo_id].consultas++
  }
  const productosMasConsultados = Object.entries(prod)
    .map(([modelo_id, v]) => ({ modelo_id, ...v }))
    .sort((a, b) => b.consultas - a.consultas)
    .slice(0, 10)

  // Categorías y etiquetas de los chats con actividad
  const catCuenta = new Map<string, number>()
  for (const id of activosLista) {
    const c = convPorId.get(id)
    if (c) catCuenta.set(c.categoria, (catCuenta.get(c.categoria) ?? 0) + 1)
  }
  const porCategoria = [...catCuenta.entries()].map(([categoria, cantidad]) => ({ categoria, cantidad })).sort((a, b) => b.cantidad - a.cantidad)

  const activosSet = new Set(activosLista)
  const etiCuenta = new Map<string, number>()
  for (const a of d.asignaciones) {
    if (activosSet.has(a.conversacion_id)) etiCuenta.set(a.etiqueta_id, (etiCuenta.get(a.etiqueta_id) ?? 0) + 1)
  }
  const etiquetas = d.etiquetas
    .map(e => ({ nombre: e.nombre, color: e.color, cantidad: etiCuenta.get(e.id) ?? 0 }))
    .filter(e => e.cantidad > 0)
    .sort((a, b) => b.cantidad - a.cantidad)

  // El bot: cuánto acierta lo que sugiere
  const bot = {
    total: d.aprendizajes.length,
    igual: d.aprendizajes.filter(a => a.origen === 'usada').length,
    distinto: d.aprendizajes.filter(a => a.origen === 'distinta').length,
    sinSugerencia: d.aprendizajes.filter(a => a.origen === 'sin_sugerencia').length,
  }

  // Actividad de la vendedora (personas, sin automáticos)
  const personas = enviados.filter(m => !m.automatico)
  const porDiaPersona = new Map<string, { mensajes: number; chats: Set<string> }>()
  for (const m of personas) {
    const f = toISOLocal(new Date(m.timestamp))
    const fila = porDiaPersona.get(f) ?? { mensajes: 0, chats: new Set<string>() }
    fila.mensajes++
    fila.chats.add(m.conversacion_id)
    porDiaPersona.set(f, fila)
  }
  const actividadVendedora = [...porDiaPersona.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, v]) => ({ fecha, mensajes_enviados: v.mensajes, conversaciones_atendidas: v.chats.size }))

  return {
    totales: {
      mensajes: msgs.length,
      recibidos: recibidos.length,
      enviados: enviados.length,
      chatsConActividad: activosLista.length,
      chatsNuevos: nuevos.length,
      fotosEnviadas: d.fotos.length,
    },
    mensajesPorDia,
    respuesta,
    sinLeer,
    conversion: {
      chatsNuevos: nuevos.length,
      concretadas: concretadasNuevas,
      porcentaje: pct(concretadasNuevas, activosLista.length),
      monto: Math.round(conMonto.reduce((s, v) => s + Number(v.monto), 0)),
      conMonto: conMonto.length,
      porBot: (ventasRango ?? []).filter(v => v.atendio === 'bot').length,
      pedidosWeb: pagosWeb.length,
      montoWeb: Math.round(pagosWeb.reduce((s, v) => s + Number(v.monto ?? 0), 0)),
    },
    embudo,
    porCategoria,
    heatmap,
    mejorMomento,
    tiposMensaje,
    intenciones,
    talles: top(talles, 8),
    tiposBotin,
    modelosBuscados: top(modelosBuscados, 8),
    productosMasConsultados,
    etiquetas,
    bot,
    actividadVendedora,
  }
}
