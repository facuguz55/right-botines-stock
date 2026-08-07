import { supabase } from '../lib/supabase'
import type { RecargoTarjeta } from '../types'

type RecargoTarjetaInput = Omit<RecargoTarjeta, 'id' | 'created_at'>

export async function fetchRecargosTarjeta(): Promise<RecargoTarjeta[]> {
  const { data, error } = await supabase
    .from('recargos_tarjeta')
    .select('*')
    .order('tarjeta', { ascending: true })
    .order('cuotas', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createRecargoTarjeta(input: RecargoTarjetaInput): Promise<RecargoTarjeta> {
  const { data, error } = await supabase
    .from('recargos_tarjeta')
    .insert([input])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function toggleRecargoTarjeta(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from('recargos_tarjeta').update({ activo }).eq('id', id)
  if (error) throw error
}

export async function deleteRecargoTarjeta(id: string): Promise<void> {
  const { error } = await supabase.from('recargos_tarjeta').delete().eq('id', id)
  if (error) throw error
}
