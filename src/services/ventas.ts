import { supabase } from '../lib/supabase'
import type { Venta } from '../types'

export async function fetchVentas(startDate?: string, endDate?: string): Promise<Venta[]> {
  let query = supabase
    .from('ventas')
    .select('*, modelos(modelo, marca, categoria, gama)')
    .order('fecha', { ascending: false })

  if (startDate) query = query.gte('fecha', startDate)
  if (endDate) query = query.lte('fecha', endDate + 'T23:59:59')

  const { data, error } = await query
  if (error) throw error
  return (data || []) as Venta[]
}
