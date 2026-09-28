// ── Cálculo de rentabilidad neta por canal (local / web) ────────────────────
// Combina ventas del local físico (`ventas`), órdenes pagadas de TiendaNube
// (`tn_ordenes`, ya sincronizadas localmente) y los costos configurables
// (`costos_config`/`costos_unicos`) para llegar a una ganancia neta real por
// canal, no solo al facturado bruto.

import { supabase } from '../lib/supabase'
import { fetchLocalTNOrdenes } from './tnOrdersSync'
import { fetchCostosConfig, fetchCostosUnicos } from './costosService'
import { verifyOwnerPin } from './auth'
import { fetchValoresHora } from './valoresHora'
import { calcularPagos } from '../utils/valoresHora'
import { inicioDiaLocalISO, finDiaLocalISO } from '../utils/fecha'
import type { RentabilidadMes, RentabilidadCanal, CostoConfig, CostoCanal } from '../types'

function emptyCanal(): RentabilidadCanal {
  return {
    facturado: 0, costoProductos: 0, gananciaBruta: 0,
    costosFijos: 0, costosVariables: 0, costosUnicos: 0, costoManoObra: 0, costoGarantias: 0,
    gananciaNeta: 0, margenNeto: 0, sinVincular: 0,
  }
}

// Garantías de fábrica del mes (devoluciones_cambios.es_garantia = true):
// el par que se entrega a cambio es una pérdida real, no cubierta por
// ninguna venta. Solo se puede costear el caso 'cambio' (se sabe qué par se
// entregó); una garantía tipo 'devolucion' se ve en el resumen de
// Devoluciones pero no aporta costo acá, porque no hay par de reemplazo.
// Siempre 100% canal local — el flujo de devoluciones/cambios es del local
// físico, no existe para pedidos web.
async function costoGarantiasDelMes(start: Date, end: Date): Promise<number> {
  const { data, error } = await supabase
    .from('devoluciones_cambios')
    .select('cantidad, modelo_nuevo:modelos!devoluciones_cambios_modelo_id_nuevo_fkey(precio_costo)')
    .eq('tipo', 'cambio')
    .eq('es_garantia', true)
    .gte('fecha', start.toISOString())
    .lte('fecha', end.toISOString())
  if (error) throw error
  return (data ?? []).reduce((s, r: any) => s + (Number(r.modelo_nuevo?.precio_costo) || 0) * r.cantidad, 0)
}

// Sueldos del mes (fichajes × valor por hora vigente) — dato sensible, solo
// se calcula si viene un PIN de dueño válido. Se verifica explícitamente en
// vez de confiar en que fetch_valores_hora devuelva algo, porque esa función
// devuelve [] tanto con PIN incorrecto como sin valores cargados todavía, y
// necesitamos distinguir "no autorizado" de "autorizado pero en $0".
//
// Se consulta `fichajes` directo (con los mismos límites start/end en hora
// de Argentina que usa el resto del cálculo del mes) en vez de reusar
// fetchFichajes con fechas "YYYY-MM-DD" sueltas — esas se comparan en UTC
// contra hora_entrada y correrían la ventana ~3hs, exactamente el bug de
// huso horario que utils/fecha.ts documenta para "el cierre de mes de
// Rentabilidad".
async function costoManoObraDelMes(pin: string | null, start: Date, end: Date): Promise<{ total: number; incluida: boolean }> {
  if (!pin) return { total: 0, incluida: false }
  const pinValido = await verifyOwnerPin(pin)
  if (!pinValido) return { total: 0, incluida: false }
  const [fichajesRes, valores] = await Promise.all([
    supabase
      .from('fichajes')
      .select('empleado_id, hora_entrada, hora_salida')
      .gte('hora_entrada', start.toISOString())
      .lte('hora_entrada', end.toISOString()),
    fetchValoresHora(pin),
  ])
  if (fichajesRes.error) throw fichajesRes.error
  const pagos = calcularPagos(fichajesRes.data ?? [], valores)
  return { total: pagos.reduce((s, p) => s + p.importe, 0), incluida: true }
}

// Límites del mes en hora de Argentina, no UTC: con Date.UTC puro, la última
// noche del mes (21:00-23:59 ART del último día) cae ya en el 1º del mes
// siguiente en UTC, y esas ventas se contaban en el mes equivocado — un
// número de facturación/ganancia distinto al que corresponde a ese mes
// calendario real. `daysInMonth` sí es aritmética pura de calendario (no
// depende de huso horario), se puede seguir calculando con Date.UTC.
function rangoMes(mes: string): { start: Date; end: Date; daysInMonth: number; startDateStr: string; endDateStr: string } {
  const [y, m] = mes.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const startDateStr = `${mes}-01`
  const endDateStr = `${mes}-${String(daysInMonth).padStart(2, '0')}`
  const start = new Date(inicioDiaLocalISO(startDateStr))
  const end = new Date(finDiaLocalISO(endDateStr))
  return { start, end, daysInMonth, startDateStr, endDateStr }
}

// % del reparto que le corresponde a "web" para costos compartidos sin override manual.
function shareWebPorFacturacion(facturadoLocal: number, facturadoWeb: number): number {
  const total = facturadoLocal + facturadoWeb
  return total > 0 ? facturadoWeb / total : 0
}

function montoFijoDelMes(costo: CostoConfig, start: Date, end: Date, daysInMonth: number): number {
  const desde = new Date(Math.max(new Date(inicioDiaLocalISO(costo.vigente_desde)).getTime(), start.getTime()))
  const hastaMs = costo.vigente_hasta ? new Date(finDiaLocalISO(costo.vigente_hasta)).getTime() : end.getTime()
  const hasta = new Date(Math.min(hastaMs, end.getTime()))
  const overlapDays = Math.max(0, Math.round((hasta.getTime() - desde.getTime()) / 86_400_000) + 1)
  return costo.valor * (overlapDays / daysInMonth)
}

// Reparte un monto "de canal ambos" entre local/web. Costos fijos y únicos no
// tienen una "actividad" propia que los reparta naturalmente (a diferencia de
// un costo variable por venta), así que se usa el % manual si está definido,
// o proporcional a la facturación del mes como default.
function repartir(monto: number, canal: CostoCanal, shareWebDefault: number, prorateoWebPct: number | null) {
  if (canal === 'local') return { local: monto, web: 0 }
  if (canal === 'web') return { local: 0, web: monto }
  const shareWeb = prorateoWebPct != null ? prorateoWebPct / 100 : shareWebDefault
  return { local: monto * (1 - shareWeb), web: monto * shareWeb }
}

export async function computeRentabilidadMes(mes: string, pin: string | null = null): Promise<RentabilidadMes> {
  const { start, end, daysInMonth, startDateStr, endDateStr } = rangoMes(mes)

  // ── Ventas locales del mes ──
  const { data: ventasData, error: ventasError } = await supabase
    .from('ventas')
    .select('precio_venta, ganancia')
    .gte('fecha', start.toISOString())
    .lte('fecha', end.toISOString())
  if (ventasError) throw ventasError
  const ventas = ventasData ?? []
  const facturadoLocal = ventas.reduce((s, v) => s + (Number(v.precio_venta) || 0), 0)
  const gananciaBrutaLocal = ventas.reduce((s, v) => s + (Number(v.ganancia) || 0), 0)
  const cantidadVentasLocal = ventas.length

  // ── Órdenes de TiendaNube del mes (pagadas, no canceladas) ──
  const allOrders = await fetchLocalTNOrdenes()
  const ordenesMes = allOrders.filter(o => {
    const isPaid = o.payment_status === 'paid' || o.payment_status === 'authorized'
    if (!isPaid || o.status === 'cancelled') return false
    const ts = new Date(o.created_at).getTime()
    return ts >= start.getTime() && ts <= end.getTime()
  })
  const facturadoWeb = ordenesMes.reduce((s, o) => s + (parseFloat(o.total) || 0), 0)
  const cantidadVentasWeb = ordenesMes.length

  // ── Costo de productos vendidos en TN (resolver vía tn_product_id) ──
  const { data: modelosData, error: modelosError } = await supabase
    .from('modelos')
    .select('tn_product_id, precio_costo')
    .not('tn_product_id', 'is', null)
  if (modelosError) throw modelosError
  const costoPorProductId = new Map<number, number>()
  for (const m of modelosData ?? []) {
    if (m.tn_product_id != null) costoPorProductId.set(Number(m.tn_product_id), Number(m.precio_costo) || 0)
  }

  let costoProductosWeb = 0
  let sinVincularWeb = 0
  for (const orden of ordenesMes) {
    for (const p of orden.products) {
      const costoUnitario = p.product_id != null ? costoPorProductId.get(p.product_id) : undefined
      if (costoUnitario != null) {
        costoProductosWeb += costoUnitario * p.quantity
      } else {
        sinVincularWeb += (parseFloat(p.price) || 0) * p.quantity
      }
    }
  }
  const gananciaBrutaWeb = facturadoWeb - costoProductosWeb

  // ── Costos configurados vigentes en el mes + costos únicos del mes ──
  const [costosConfig, costosUnicos, manoObra, costoGarantiasLocal] = await Promise.all([
    fetchCostosConfig(),
    fetchCostosUnicos(startDateStr, endDateStr),
    costoManoObraDelMes(pin, start, end),
    costoGarantiasDelMes(start, end),
  ])

  const vigentes = costosConfig.filter(c => {
    if (!c.activo) return false
    const desde = new Date(inicioDiaLocalISO(c.vigente_desde)).getTime()
    const hasta = c.vigente_hasta ? new Date(finDiaLocalISO(c.vigente_hasta)).getTime() : Infinity
    return desde <= end.getTime() && hasta >= start.getTime()
  })

  const shareWebDefault = shareWebPorFacturacion(facturadoLocal, facturadoWeb)

  let costosFijosLocal = 0, costosFijosWeb = 0
  let costosVariablesLocal = 0, costosVariablesWeb = 0

  for (const c of vigentes) {
    if (c.tipo === 'fijo_mensual') {
      const monto = montoFijoDelMes(c, start, end, daysInMonth)
      const { local, web } = repartir(monto, c.canal, shareWebDefault, c.prorateo_web_pct)
      costosFijosLocal += local
      costosFijosWeb += web
    } else {
      // variable_venta: se calcula por canal usando SU propia facturación/cantidad
      // de ventas — el reparto ya es natural según la actividad real, no hace
      // falta (ni tiene sentido) un % manual acá.
      const calcular = (facturado: number, cantidad: number) =>
        c.modo_valor === 'porcentaje' ? (c.valor / 100) * facturado : c.valor * cantidad

      if (c.canal === 'local' || c.canal === 'ambos') costosVariablesLocal += calcular(facturadoLocal, cantidadVentasLocal)
      if (c.canal === 'web' || c.canal === 'ambos') costosVariablesWeb += calcular(facturadoWeb, cantidadVentasWeb)
    }
  }

  let costosUnicosLocal = 0, costosUnicosWeb = 0
  for (const c of costosUnicos) {
    const { local, web } = repartir(c.monto, c.canal, shareWebDefault, null)
    costosUnicosLocal += local
    costosUnicosWeb += web
  }

  // Los sueldos son un costo "de ambos canales" sin un % manual propio (no
  // hay dónde configurarlo por persona/turno), así que se reparten igual que
  // un costo fijo mensual sin override: proporcional a la facturación.
  const { local: manoObraLocal, web: manoObraWeb } = repartir(manoObra.total, 'ambos', shareWebDefault, null)

  const local: RentabilidadCanal = {
    ...emptyCanal(),
    facturado: facturadoLocal,
    costoProductos: facturadoLocal - gananciaBrutaLocal,
    gananciaBruta: gananciaBrutaLocal,
    costosFijos: costosFijosLocal,
    costosVariables: costosVariablesLocal,
    costosUnicos: costosUnicosLocal,
    costoManoObra: manoObraLocal,
    costoGarantias: costoGarantiasLocal,
  }
  local.gananciaNeta = local.gananciaBruta - local.costosFijos - local.costosVariables - local.costosUnicos - local.costoManoObra - local.costoGarantias
  local.margenNeto = local.facturado > 0 ? (local.gananciaNeta / local.facturado) * 100 : 0

  const web: RentabilidadCanal = {
    ...emptyCanal(),
    facturado: facturadoWeb,
    costoProductos: costoProductosWeb,
    gananciaBruta: gananciaBrutaWeb,
    costosFijos: costosFijosWeb,
    costosVariables: costosVariablesWeb,
    costosUnicos: costosUnicosWeb,
    costoManoObra: manoObraWeb,
    sinVincular: sinVincularWeb,
  }
  web.gananciaNeta = web.gananciaBruta - web.costosFijos - web.costosVariables - web.costosUnicos - web.costoManoObra
  web.margenNeto = web.facturado > 0 ? (web.gananciaNeta / web.facturado) * 100 : 0

  const facturadoTotal = local.facturado + web.facturado
  const gananciaNetaTotal = local.gananciaNeta + web.gananciaNeta

  return {
    mes,
    local,
    web,
    total: {
      facturado: facturadoTotal,
      gananciaNeta: gananciaNetaTotal,
      margenNeto: facturadoTotal > 0 ? (gananciaNetaTotal / facturadoTotal) * 100 : 0,
    },
    manoObraIncluida: manoObra.incluida,
  }
}
