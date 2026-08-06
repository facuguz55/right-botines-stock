// ── Cálculo de rentabilidad neta por canal (local / web) ────────────────────
// Combina ventas del local físico (`ventas`), órdenes pagadas de TiendaNube
// (`tn_ordenes`, ya sincronizadas localmente) y los costos configurables
// (`costos_config`/`costos_unicos`) para llegar a una ganancia neta real por
// canal, no solo al facturado bruto.

import { supabase } from '../lib/supabase'
import { fetchLocalTNOrdenes } from './tnOrdersSync'
import { fetchCostosConfig, fetchCostosUnicos } from './costosService'
import type { RentabilidadMes, RentabilidadCanal, CostoConfig, CostoCanal } from '../types'

function emptyCanal(): RentabilidadCanal {
  return {
    facturado: 0, costoProductos: 0, gananciaBruta: 0,
    costosFijos: 0, costosVariables: 0, costosUnicos: 0,
    gananciaNeta: 0, margenNeto: 0, sinVincular: 0,
  }
}

function rangoMes(mes: string): { start: Date; end: Date; daysInMonth: number; startDateStr: string; endDateStr: string } {
  const [y, m] = mes.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999))
  const daysInMonth = end.getUTCDate()
  return {
    start, end, daysInMonth,
    startDateStr: `${mes}-01`,
    endDateStr: `${mes}-${String(daysInMonth).padStart(2, '0')}`,
  }
}

// % del reparto que le corresponde a "web" para costos compartidos sin override manual.
function shareWebPorFacturacion(facturadoLocal: number, facturadoWeb: number): number {
  const total = facturadoLocal + facturadoWeb
  return total > 0 ? facturadoWeb / total : 0
}

function montoFijoDelMes(costo: CostoConfig, start: Date, end: Date, daysInMonth: number): number {
  const desde = new Date(Math.max(new Date(costo.vigente_desde + 'T00:00:00Z').getTime(), start.getTime()))
  const hastaMs = costo.vigente_hasta ? new Date(costo.vigente_hasta + 'T23:59:59Z').getTime() : end.getTime()
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

export async function computeRentabilidadMes(mes: string): Promise<RentabilidadMes> {
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
  const [costosConfig, costosUnicos] = await Promise.all([
    fetchCostosConfig(),
    fetchCostosUnicos(startDateStr, endDateStr),
  ])

  const vigentes = costosConfig.filter(c => {
    if (!c.activo) return false
    const desde = new Date(c.vigente_desde + 'T00:00:00Z').getTime()
    const hasta = c.vigente_hasta ? new Date(c.vigente_hasta + 'T23:59:59Z').getTime() : Infinity
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

  const local: RentabilidadCanal = {
    ...emptyCanal(),
    facturado: facturadoLocal,
    costoProductos: facturadoLocal - gananciaBrutaLocal,
    gananciaBruta: gananciaBrutaLocal,
    costosFijos: costosFijosLocal,
    costosVariables: costosVariablesLocal,
    costosUnicos: costosUnicosLocal,
  }
  local.gananciaNeta = local.gananciaBruta - local.costosFijos - local.costosVariables - local.costosUnicos
  local.margenNeto = local.facturado > 0 ? (local.gananciaNeta / local.facturado) * 100 : 0

  const web: RentabilidadCanal = {
    ...emptyCanal(),
    facturado: facturadoWeb,
    costoProductos: costoProductosWeb,
    gananciaBruta: gananciaBrutaWeb,
    costosFijos: costosFijosWeb,
    costosVariables: costosVariablesWeb,
    costosUnicos: costosUnicosWeb,
    sinVincular: sinVincularWeb,
  }
  web.gananciaNeta = web.gananciaBruta - web.costosFijos - web.costosVariables - web.costosUnicos
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
  }
}
