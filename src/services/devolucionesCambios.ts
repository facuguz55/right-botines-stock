import { supabase } from '../lib/supabase'
import type { DevolucionCambio, MedioPago, Modelo, TipoDevolucionCambio } from '../types'
import { pushStockToTN } from './tnSync'

const SELECT = `*,
  modelo_original:modelos!devoluciones_cambios_modelo_id_original_fkey(modelo, marca),
  modelo_nuevo:modelos!devoluciones_cambios_modelo_id_nuevo_fkey(modelo, marca, precio_costo),
  empleados(nombre),
  proveedores(nombre)`

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
  // false = el par del talle original no vuelve al stock (ej. roto, se desecha).
  devolverAStock: boolean
  // Defecto de fábrica (no un cambio común) — ver types/index.ts DevolucionCambio.
  esGarantia: boolean
  proveedorId: string | null
}

// El ajuste de stock (atómico) y el chequeo de caja/fichaje viven en
// registrar_devolucion_cambio (supabase/migrations/028_venta_y_devolucion_atomicas.sql,
// 035_devolucion_sin_stock.sql, 037_garantias.sql), con el mismo criterio que
// registrar_venta_carrito.
// Lleva a TiendaNube el stock de los talles que tocó la devolución/cambio.
// Sin esto, TiendaNube seguía con el stock viejo y la siguiente
// sincronización (TN → app) pisaba `cantidad` y deshacía el cambio: el par
// devuelto "desaparecía" del stock y el entregado "volvía". Solo sobrevivía
// `cantidad_local`, que no se sincroniza (pasó el 07/10 con un cambio de
// talle 40 → 41). Se lee el stock ya actualizado de la base (no el de la
// pantalla), porque la base es la que hizo la cuenta.
// Devuelve un aviso si algún talle no se pudo llevar a TiendaNube.
async function reflejarStockEnTN(talleIds: string[]): Promise<string | null> {
  const ids = [...new Set(talleIds)]
  const { data: talles, error } = await supabase
    .from('modelo_talles').select('id, modelo_id, talle_arg, cantidad').in('id', ids)
  if (error || !talles) return 'no se pudo leer el stock actualizado'

  const fallas: string[] = []
  for (const t of talles) {
    try {
      const { data: modelo, error: errModelo } = await supabase
        .from('modelos').select('*, modelo_talles(*)').eq('id', t.modelo_id).single()
      if (errModelo || !modelo) throw errModelo ?? new Error('modelo no encontrado')
      await pushStockToTN(modelo as Modelo, Number(t.talle_arg), t.cantidad)
    } catch (e) {
      console.error('No se pudo actualizar el stock en TiendaNube:', e)
      fallas.push(`talle ${t.talle_arg}`)
    }
  }
  return fallas.length ? `no se pudo actualizar ${fallas.join(', ')}` : null
}

export async function registrarDevolucionCambio(input: RegistrarDevolucionCambioInput): Promise<{ avisoTN: string | null }> {
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
    p_devolver_a_stock: input.devolverAStock,
    p_es_garantia: input.esGarantia,
    p_proveedor_id: input.esGarantia ? input.proveedorId : null,
  })
  if (error) throw error

  // La devolución ya quedó registrada: si TiendaNube falla no se revierte,
  // pero se avisa, porque sin esto la próxima sincronización la deshace.
  const afectados = [
    ...(input.devolverAStock ? [input.talleIdOriginal] : []),
    ...(input.tipo === 'cambio' && input.talleIdNuevo ? [input.talleIdNuevo] : []),
  ]
  const avisoTN = afectados.length ? await reflejarStockEnTN(afectados) : null
  return { avisoTN }
}
