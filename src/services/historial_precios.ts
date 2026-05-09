import { supabase } from '../lib/supabase'
import type { HistorialPrecio } from '../types'

export async function fetchHistorialPrecios(modeloId: string): Promise<HistorialPrecio[]> {
  const { data, error } = await supabase
    .from('historial_precios')
    .select('*')
    .eq('modelo_id', modeloId)
    .order('fecha', { ascending: false })
  if (error) throw error
  return data || []
}

export async function recordPriceChange(
  modeloId: string,
  anterior: number,
  nuevo: number
): Promise<void> {
  const { error } = await supabase.from('historial_precios').insert([{
    modelo_id: modeloId,
    precio_venta_anterior: anterior,
    precio_venta_nuevo: nuevo,
  }])
  if (error) throw error
}
