import { supabase } from '../lib/supabase'
import type { Modelo, ModeloTalle, Venta } from '../types'
import { pushStockToTN } from './tnSync'

export async function fetchVentas(startDate?: string, endDate?: string): Promise<Venta[]> {
  let query = supabase
    .from('ventas')
    .select('*, modelos(modelo, marca, categoria, gama), empleados(nombre)')
    .order('fecha', { ascending: false })

  if (startDate) query = query.gte('fecha', startDate)
  if (endDate) query = query.lte('fecha', endDate + 'T23:59:59')

  const { data, error } = await query
  if (error) throw error
  return (data || []) as Venta[]
}

// Elimina una venta y devuelve el stock vendido al talle correspondiente.
// Requiere el pin del dueño, verificado server-side en la función
// `delete_venta` (ver supabase/migrations/025_delete_venta.sql): no alcanza
// con tener el rol "dueño" en el cliente.
export async function deleteVenta(pin: string, venta: Venta): Promise<boolean> {
  const { data, error } = await supabase.rpc('delete_venta', {
    pin_input: pin,
    venta_id_input: venta.id,
  })
  if (error) throw error
  if (!data) return false

  // Best-effort: reflejar el stock restaurado en TiendaNube. No debe
  // bloquear ni revertir el borrado local si TN falla.
  if (venta.modelo_id) {
    (async () => {
      const { data: modelo } = await supabase
        .from('modelos')
        .select('*, modelo_talles(*)')
        .eq('id', venta.modelo_id)
        .single()
      if (!modelo) return
      const talle = (modelo.modelo_talles as ModeloTalle[]).find(
        t => Number(t.talle_arg) === Number(venta.talle_arg)
      )
      if (!talle) return
      await pushStockToTN(modelo as Modelo, venta.talle_arg, talle.cantidad)
    })().catch((err: unknown) => console.error('No se pudo actualizar el stock en TiendaNube:', err))
  }

  return true
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
