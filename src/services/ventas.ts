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

// Resuelve "qué movimientos hizo un empleado en su turno": ventas de ese
// empleado dentro del rango [hora_entrada, hora_salida] de un fichaje puntual.
export async function fetchVentasPorEmpleadoYRango(empleadoId: string, desde: string, hasta: string): Promise<Venta[]> {
  const { data, error } = await supabase
    .from('ventas')
    .select('*, modelos(modelo, marca, categoria, gama)')
    .eq('empleado_id', empleadoId)
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false })
  if (error) throw error
  return (data || []) as Venta[]
}
