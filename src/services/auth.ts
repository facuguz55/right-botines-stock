import { supabase } from '../lib/supabase'

export async function verifyOwnerPin(pin: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('verify_owner_pin', { pin_input: pin })
  if (error) throw error
  return Boolean(data)
}

// Pide el PIN actual: sin eso cualquiera con la clave pública de la app podía
// cambiarlo. La base responde { ok, error } (y limita los intentos fallidos).
export async function setOwnerPin(currentPin: string, newPin: string): Promise<void> {
  const { data, error } = await supabase.rpc('set_owner_pin', { current_pin: currentPin, new_pin: newPin })
  if (error) throw error
  const res = data as { ok?: boolean; error?: string } | null
  if (!res?.ok) throw new Error(res?.error ?? 'No se pudo actualizar el PIN')
}

export async function logFailedOwnerAttempt(): Promise<void> {
  const { error } = await supabase.from('intentos_acceso_fallidos').insert({})
  if (error) throw error
}

export interface IntentoFallido {
  id: string
  fecha: string
  visto: boolean
}

export async function getIntentosFallidos(soloNoVistos = false): Promise<IntentoFallido[]> {
  let query = supabase
    .from('intentos_acceso_fallidos')
    .select('id, fecha, visto')
    .order('fecha', { ascending: false })
    .limit(50)
  if (soloNoVistos) query = query.eq('visto', false)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function marcarIntentosVistos(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('intentos_acceso_fallidos').update({ visto: true }).in('id', ids)
  if (error) throw error
}
