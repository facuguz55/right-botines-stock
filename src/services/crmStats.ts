import { supabase } from '../lib/supabase'
import type { CrmStatsData } from '../types/crm'

export async function fetchCrmStats(startDate: string, endDate: string): Promise<CrmStatsData> {
  const [mensajes, conversaciones, enviosFotos] = await Promise.all([
    supabase
      .from('wsp_mensajes')
      .select('id, direccion, timestamp, conversacion_id, enviado_por')
      .gte('timestamp', startDate)
      .lte('timestamp', endDate + 'T23:59:59'),
    supabase
      .from('wsp_conversaciones')
      .select('id, categoria, estado, created_at'),
    supabase
      .from('wsp_envios_fotos')
      .select('modelo_id, modelos(marca, modelo)')
      .gte('created_at', startDate)
      .lte('created_at', endDate + 'T23:59:59'),
  ])

  const msgs = (mensajes.data || []) as { id: string; direccion: string; timestamp: string; conversacion_id: string; enviado_por: string | null }[]
  const convs = (conversaciones.data || []) as { id: string; categoria: string; estado: string; created_at: string }[]
  const fotos = (enviosFotos.data || []) as unknown as { modelo_id: string; modelos: { marca: string; modelo: string } | null }[]

  const mensajesPorDia = groupByDate(msgs, m => m.timestamp)
  const tiempoRespuestaPromedio = calcTiempoRespuesta(msgs)
  const mensajesPorCategoria = countByField(convs, c => c.categoria)
  const totalConvs = convs.length
  const concretadas = convs.filter(c => c.estado === 'Venta concretada').length
  const conversionAVenta = {
    total: totalConvs,
    concretadas,
    porcentaje: totalConvs > 0 ? Math.round((concretadas / totalConvs) * 100) : 0,
  }

  const productosCounts: Record<string, { marca: string; modelo: string; consultas: number }> = {}
  for (const f of fotos) {
    if (!f.modelo_id || !f.modelos) continue
    if (!productosCounts[f.modelo_id]) {
      productosCounts[f.modelo_id] = { marca: f.modelos.marca, modelo: f.modelos.modelo, consultas: 0 }
    }
    productosCounts[f.modelo_id].consultas++
  }
  const productosMasConsultados = Object.entries(productosCounts)
    .map(([modelo_id, v]) => ({ modelo_id, ...v }))
    .sort((a, b) => b.consultas - a.consultas)
    .slice(0, 10)

  const outMsgs = msgs.filter(m => m.direccion === 'out')
  const actividadVendedora = groupByDate(outMsgs, m => m.timestamp).map(d => ({
    fecha: d.fecha,
    mensajes_enviados: d.cantidad,
    conversaciones_atendidas: new Set(outMsgs.filter(m => m.timestamp.startsWith(d.fecha)).map(m => m.conversacion_id)).size,
  }))

  const horasPico: { hora: number; cantidad: number }[] = []
  const horaCount: Record<number, number> = {}
  for (const m of msgs.filter(m => m.direccion === 'in')) {
    const h = new Date(m.timestamp).getHours()
    horaCount[h] = (horaCount[h] || 0) + 1
  }
  for (let h = 0; h < 24; h++) {
    horasPico.push({ hora: h, cantidad: horaCount[h] || 0 })
  }

  return {
    mensajesPorDia,
    tiempoRespuestaPromedio,
    mensajesPorCategoria,
    conversionAVenta,
    productosMasConsultados,
    actividadVendedora,
    horasPico,
  }
}

function groupByDate<T>(items: T[], getDate: (item: T) => string): { fecha: string; cantidad: number }[] {
  const counts: Record<string, number> = {}
  for (const item of items) {
    const fecha = getDate(item).slice(0, 10)
    counts[fecha] = (counts[fecha] || 0) + 1
  }
  return Object.entries(counts)
    .map(([fecha, cantidad]) => ({ fecha, cantidad }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

function countByField<T>(items: T[], getField: (item: T) => string): { categoria: string; cantidad: number }[] {
  const counts: Record<string, number> = {}
  for (const item of items) {
    const val = getField(item)
    counts[val] = (counts[val] || 0) + 1
  }
  return Object.entries(counts).map(([categoria, cantidad]) => ({ categoria, cantidad }))
}

function calcTiempoRespuesta(msgs: { direccion: string; timestamp: string; conversacion_id: string }[]): number {
  const byConv: Record<string, typeof msgs> = {}
  for (const m of msgs) {
    if (!byConv[m.conversacion_id]) byConv[m.conversacion_id] = []
    byConv[m.conversacion_id].push(m)
  }

  const tiempos: number[] = []
  for (const convMsgs of Object.values(byConv)) {
    convMsgs.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    for (let i = 0; i < convMsgs.length - 1; i++) {
      if (convMsgs[i].direccion === 'in' && convMsgs[i + 1].direccion === 'out') {
        const diff = new Date(convMsgs[i + 1].timestamp).getTime() - new Date(convMsgs[i].timestamp).getTime()
        if (diff > 0 && diff < 86400000) tiempos.push(diff)
      }
    }
  }

  if (tiempos.length === 0) return 0
  return Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length / 60000)
}
