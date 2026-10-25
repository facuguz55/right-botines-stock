import { supabase } from '../lib/supabase'
import type { CrmStatsData } from '../types/crm'
import { calcularStats, type AprRaw, type AsignacionRaw, type VentaRaw, type ConvRaw, type EtiquetaRaw, type FotoRaw, type MsgRaw, type SugRaw } from '../lib/crmStatsCalc'

const PAGINA = 1000

// Supabase devuelve como mucho 1000 filas por consulta: sin paginar, el total de
// mensajes quedaba clavado en 1000 (y todo lo calculado con ellos, incompleto).
async function traerTodo<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await pagina(desde, desde + PAGINA - 1)
    if (error) throw new Error(error.message)
    const filas = (data ?? []) as T[]
    out.push(...filas)
    if (filas.length < PAGINA) break
  }
  return out
}

// Las fechas del rango son días de Argentina (UTC-3).
export async function fetchCrmStats(inicio: string, fin: string): Promise<CrmStatsData> {
  const desdeISO = `${inicio}T00:00:00-03:00`
  const hastaISO = `${fin}T23:59:59.999-03:00`

  const [mensajes, conversaciones, sugerencias, fotos, aprendizajes, etiquetas, asignaciones, ventas] = await Promise.all([
    traerTodo<MsgRaw>((a, b) => supabase.from('wsp_mensajes')
      .select('id, direccion, tipo, timestamp, conversacion_id, automatico')
      .gte('timestamp', desdeISO).lte('timestamp', hastaISO)
      .order('timestamp').order('id').range(a, b)),
    traerTodo<ConvRaw>((a, b) => supabase.from('wsp_conversaciones')
      .select('id, categoria, estado, created_at, no_leidos, ultimo_mensaje_at, venta_detectada_at')
      .order('created_at').order('id').range(a, b)),
    traerTodo<SugRaw>((a, b) => supabase.from('wsp_ia_sugerencias')
      .select('id, conversacion_id, intencion, talle_detectado, tipo_detectado, modelo_buscado')
      .gte('created_at', desdeISO).lte('created_at', hastaISO)
      .order('created_at').order('id').range(a, b)),
    traerTodo<FotoRaw>((a, b) => supabase.from('wsp_envios_fotos')
      .select('id, conversacion_id, modelo_id, modelos(marca, modelo)')
      .gte('created_at', desdeISO).lte('created_at', hastaISO)
      .order('created_at').order('id').range(a, b)),
    traerTodo<AprRaw>((a, b) => supabase.from('crm_aprendizajes')
      .select('id, origen')
      .gte('created_at', desdeISO).lte('created_at', hastaISO)
      .order('created_at').order('id').range(a, b)),
    traerTodo<EtiquetaRaw>((a, b) => supabase.from('wsp_etiquetas').select('id, nombre, color').order('id').range(a, b)).catch(() => [] as EtiquetaRaw[]),
    traerTodo<AsignacionRaw>((a, b) => supabase.from('wsp_conversacion_etiquetas')
      .select('conversacion_id, etiqueta_id').order('conversacion_id').order('etiqueta_id').range(a, b)).catch(() => [] as AsignacionRaw[]),
    traerTodo<VentaRaw>((a, b) => supabase.from('crm_ventas')
      .select('id, conversacion_id, detectada_at, monto, atendio, tipo')
      .gte('detectada_at', desdeISO).lte('detectada_at', hastaISO)
      .order('detectada_at').order('id').range(a, b)).catch(() => undefined),
  ])

  return calcularStats({ inicio, fin, mensajes, conversaciones, sugerencias, fotos, aprendizajes, etiquetas, asignaciones, ventas })
}
