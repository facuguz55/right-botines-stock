import { supabase } from '../lib/supabase'
import type { PhotoMatch } from '../types/crm'

export async function searchModelosByTalleDisponible(
  tipo: string | null,
  talle: number | null,
): Promise<PhotoMatch[]> {
  let query = supabase
    .from('modelos')
    .select('id, marca, modelo, categoria, precio_venta, precio_efectivo, modelo_talles(talle_arg, cantidad), modelo_fotos(foto_url, orden)')

  if (tipo) {
    query = query.ilike('categoria', `%${tipo}%`)
  }

  const { data, error } = await query
  if (error) throw error
  if (!data) return []

  const results: PhotoMatch[] = []

  for (const m of data as any[]) {
    const talles = (m.modelo_talles || []) as { talle_arg: number; cantidad: number }[]
    const fotos = (m.modelo_fotos || []) as { foto_url: string; orden: number }[]

    const tallesDisponibles = talle
      ? talles.filter(t => Number(t.talle_arg) === talle && t.cantidad > 0)
      : talles.filter(t => t.cantidad > 0)

    if (tallesDisponibles.length === 0) continue
    if (fotos.length === 0) continue

    results.push({
      modelo_id: m.id,
      marca: m.marca,
      modelo: m.modelo,
      categoria: m.categoria,
      precio_venta: m.precio_venta,
      precio_efectivo: m.precio_efectivo,
      talles_disponibles: tallesDisponibles.sort((a: any, b: any) => a.talle_arg - b.talle_arg),
      fotos: fotos.sort((a: any, b: any) => a.orden - b.orden),
    })
  }

  return results
}

export async function logEnvioFotos(
  conversacionId: string,
  modeloId: string,
  talle: number | null,
  empleadoId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('wsp_envios_fotos')
    .insert([{
      conversacion_id: conversacionId,
      modelo_id: modeloId,
      talle,
      enviado_por: empleadoId,
    }])
  if (error) throw error
}
