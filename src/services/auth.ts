import { supabase } from '../lib/supabase'

export async function verifyOwnerPin(pin: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('verify_owner_pin', { pin_input: pin })
  if (error) throw error
  return Boolean(data)
}

export async function setOwnerPin(newPin: string): Promise<void> {
  const { error } = await supabase.rpc('set_owner_pin', { new_pin: newPin })
  if (error) throw error
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
