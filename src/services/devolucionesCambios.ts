import { supabase } from '../lib/supabase'
import type { DevolucionCambio, MedioPago, TipoDevolucionCambio } from '../types'
import { ajustarStockTalle } from './modelos'

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
  modeloIdOriginal: string
  talleIdOriginal: string
  talleArgOriginal: number
  cantidadActualOriginal: number
  cantidad: number
  modeloIdNuevo: string | null
  talleIdNuevo: string | null
  talleArgNuevo: number | null
  cantidadActualNuevo: number | null
  montoDiferencia: number
  medioPagoDiferencia: MedioPago | null
  motivo: string
  empleadoId: string | null
}

export async function registrarDevolucionCambio(input: RegistrarDevolucionCambioInput): Promise<void> {
  if (input.tipo === 'cambio') {
    if (!input.talleIdNuevo || input.cantidadActualNuevo == null) {
      throw new Error('Falta elegir el talle nuevo para el cambio')
    }
    if (input.cantidad > input.cantidadActualNuevo) {
      throw new Error('No hay stock suficiente del talle nuevo')
    }
  }

  // Suma stock del talle devuelto.
  await ajustarStockTalle(input.talleIdOriginal, input.cantidadActualOriginal, input.cantidad)

  // Resta stock del talle nuevo (solo cambio).
  if (input.tipo === 'cambio' && input.talleIdNuevo && input.cantidadActualNuevo != null) {
    await ajustarStockTalle(input.talleIdNuevo, input.cantidadActualNuevo, -input.cantidad)
  }

  const { error } = await supabase.from('devoluciones_cambios').insert([{
    tipo: input.tipo,
    venta_id: input.ventaId,
    modelo_id_original: input.modeloIdOriginal,
    talle_arg_original: input.talleArgOriginal,
    cantidad: input.cantidad,
    modelo_id_nuevo: input.tipo === 'cambio' ? input.modeloIdNuevo : null,
    talle_arg_nuevo: input.tipo === 'cambio' ? input.talleArgNuevo : null,
    monto_diferencia: input.montoDiferencia,
    medio_pago_diferencia: input.montoDiferencia !== 0 ? input.medioPagoDiferencia : null,
    motivo: input.motivo,
    empleado_id: input.empleadoId,
  }])
  if (error) throw error
}
