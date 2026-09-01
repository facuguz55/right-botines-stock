import { supabase } from '../lib/supabase'
import type { DevolucionCambio, MedioPago, TipoDevolucionCambio } from '../types'

const SELECT = `*,
  modelo_original:modelos!devoluciones_cambios_modelo_id_original_fkey(modelo, marca),
  modelo_nuevo:modelos!devoluciones_cambios_modelo_id_nuevo_fkey(modelo, marca),
  empleados(nombre)`

export async function fetchDevolucionesCambios(startDate?: string, endDate?: string): Promise<DevolucionCambio[]> {
  let query = supabase.from('devoluciones_cambios').select(SELECT).order('fecha', { ascending: false })
  if (startDate) query = query.gte('fecha', startDate)
  if (endDate) query = query.lte('fecha', endDate + 'T23:59:59')
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as DevolucionCambio[]
}

export interface RegistrarDevolucionCambioInput {
  tipo: TipoDevolucionCambio
  ventaId: string | null
  talleIdOriginal: string
  cantidad: number
  talleIdNuevo: string | null
  montoDiferencia: number
  medioPagoDiferencia: MedioPago | null
  motivo: string
  empleadoId: string | null
}

// El ajuste de stock (atómico) y el chequeo de caja/fichaje viven en
// registrar_devolucion_cambio (supabase/migrations/028_venta_y_devolucion_atomicas.sql),
// con el mismo criterio que registrar_venta_carrito.
export async function registrarDevolucionCambio(input: RegistrarDevolucionCambioInput): Promise<void> {
  const { error } = await supabase.rpc('registrar_devolucion_cambio', {
    p_tipo: input.tipo,
    p_venta_id: input.ventaId,
    p_talle_id_original: input.talleIdOriginal,
    p_cantidad: input.cantidad,
    p_talle_id_nuevo: input.tipo === 'cambio' ? input.talleIdNuevo : null,
    p_monto_diferencia: input.montoDiferencia,
    p_medio_pago_diferencia: input.montoDiferencia !== 0 ? input.medioPagoDiferencia : null,
    p_motivo: input.motivo,
    p_empleado_id: input.empleadoId,
  })
  if (error) throw error
}
