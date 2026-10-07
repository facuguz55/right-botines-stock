import { supabase } from '../lib/supabase'
import type { Modelo } from '../types'
import { pushStockToTN } from './tnSync'
import { logFallaDevolucionCambio } from './devolucionesCambiosFallos'

// Lleva a TiendaNube el stock de los talles que tocó una operación (venta,
// ingreso, cambio o devolución) y devuelve un aviso si alguno no se pudo.
//
// Por qué importa: si TiendaNube se queda con el stock viejo, la siguiente
// sincronización (TiendaNube → app) pisa `cantidad` y deshace la operación
// (pasó el 07/10 con un cambio de talle). Se lee el stock ya actualizado de
// la base, no el de la pantalla: con varios dispositivos usando la app a la
// vez, el que tiene el dispositivo puede estar viejo.
export async function reflejarStockEnTN(talleIds: string[]): Promise<string | null> {
  const ids = [...new Set(talleIds.filter(Boolean))]
  if (!ids.length) return null
  const { data: talles, error } = await supabase
    .from('modelo_talles').select('id, modelo_id, talle_arg, cantidad').in('id', ids)
  if (error || !talles) return 'no se pudo leer el stock actualizado'

  const fallas: string[] = []
  for (const t of talles) {
    let nombre = `talle ${t.talle_arg}`
    try {
      const { data: modelo, error: errModelo } = await supabase
        .from('modelos').select('*, modelo_talles(*)').eq('id', t.modelo_id).single()
      if (errModelo || !modelo) throw errModelo ?? new Error('modelo no encontrado')
      nombre = `${modelo.marca} ${modelo.modelo} talle ${t.talle_arg} (debería quedar en ${t.cantidad})`
      await pushStockToTN(modelo as Modelo, Number(t.talle_arg), t.cantidad)
    } catch (e) {
      console.error('No se pudo actualizar el stock en TiendaNube:', e)
      fallas.push(nombre)
    }
  }
  return fallas.length ? `no se pudo actualizar ${fallas.join(', ')}` : null
}

// Avisa que una operación quedó registrada en la app pero no llegó a
// TiendaNube: cartel para quien la hizo y registro en la campanita de fallas
// del dueño (la operación la suele cargar un empleado, que puede no avisar).
export function avisarFallaStockTN(
  operacion: 'La venta' | 'El ingreso de stock' | 'El cambio' | 'La devolución',
  aviso: string,
  empleadoId: string | null,
) {
  logFallaDevolucionCambio(empleadoId, `${operacion} se registró, pero ${aviso} en TiendaNube — corregir el stock en la web`).catch(() => {})
  window.alert(
    `${operacion} se registró, pero ${aviso} en TiendaNube.\n\n` +
    'Revisá ese stock en la web (o avisale al dueño): si no se corrige, la próxima sincronización puede deshacer el ajuste.',
  )
}
