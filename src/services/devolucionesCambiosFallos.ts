import { supabase } from '../lib/supabase'
import type { FallaDevolucionCambio } from '../types'

// Se llama desde el catch de Devoluciones.tsx, best-effort (el llamador la
// swallowea) — un fallo al loguear no debe tapar el error real que ya se le
// mostró al empleado.
export async function logFallaDevolucionCambio(empleadoId: string | null, mensaje: string): Promise<void> {
  const { error } = await supabase.from('devoluciones_cambios_fallos').insert({ empleado_id: empleadoId, mensaje })
  if (error) throw error
}

export async function getFallasDevolucionesCambios(soloNoVistos = false): Promise<FallaDevolucionCambio[]> {
  let query = supabase
    .from('devoluciones_cambios_fallos')
    .select('*, empleados(nombre)')
    .order('fecha', { ascending: false })
    .limit(50)
  if (soloNoVistos) query = query.eq('visto', false)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as FallaDevolucionCambio[]
}

export async function marcarFallasVistas(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('devoluciones_cambios_fallos').update({ visto: true }).in('id', ids)
  if (error) throw error
}
