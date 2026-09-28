import { supabase } from '../lib/supabase'
import type { PhotoMatch } from '../types/crm'

export async function searchModelosByTalleDisponible(
  tipo: string | null,
  talle: number | null,
): Promise<PhotoMatch[]> {
  let query = supabase
    .from('modelos')
    .select('id, marca, modelo, categoria, gama, precio_venta, precio_promocional, precio_efectivo, modelo_talles(talle_arg, cantidad), modelo_fotos(foto_url, orden)')

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
      gama: m.gama ?? null,
      precio_venta: m.precio_venta,
      precio_efectivo: m.precio_efectivo,
      // Mismo criterio que getPrecioReal (utils/precios.ts): efectivo si
      // está cargado, si no promocional, si no el de lista.
      precio_real: m.precio_efectivo ?? m.precio_promocional ?? m.precio_venta,
      talles_disponibles: tallesDisponibles.sort((a: any, b: any) => a.talle_arg - b.talle_arg),
      fotos: fotos.sort((a: any, b: any) => a.orden - b.orden),
    })
  }

  // Gama alta primero, después media y el resto — se muestran y se mandan
  // en este orden (pedido de Facu). El sort es estable: dentro de cada gama
  // queda el orden de siempre.
  return results.sort((a, b) => rangoGama(a.gama) - rangoGama(b.gama))
}

function rangoGama(gama: string | null | undefined): number {
  const g = (gama ?? '').toLowerCase()
  if (g.includes('alta')) return 0
  if (g.includes('media')) return 1
  return 2
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
