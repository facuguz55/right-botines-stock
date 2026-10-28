import { supabase } from '../lib/supabase'
import type { Modelo } from '../types'
import { pushStockToTN } from './tnSync'

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

// El envío desde el dispositivo es solo para que la web se actualice al
// instante. Si falla no hace falta que nadie haga nada: el cambio quedó en la
// cola del servidor (migración 054, Edge Function tn-stock), que lo manda a
// TiendaNube en menos de un minuto y reintenta hasta que llegue. Si el
// servidor tampoco puede después de varios intentos, avisa él en la campanita.
// Antes esto mostraba un cartel y pedía corregir a mano: ya no corresponde.
export function avisarFallaStockTN(
  operacion: 'La venta' | 'El ingreso de stock' | 'El cambio' | 'La devolución',
  aviso: string,
  _empleadoId: string | null,
) {
  console.warn(`${operacion}: ${aviso} desde este dispositivo; lo manda el servidor.`)
}
