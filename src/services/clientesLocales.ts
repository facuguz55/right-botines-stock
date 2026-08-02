import { supabase } from '../lib/supabase'
import type { ClienteLocal } from '../types'

type ClienteInput = Omit<ClienteLocal, 'id' | 'created_at'>

export async function fetchClientes(): Promise<ClienteLocal[]> {
  const { data, error } = await supabase
    .from('clientes_locales')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createCliente(input: ClienteInput): Promise<ClienteLocal> {
  const { data, error } = await supabase
    .from('clientes_locales')
    .insert([input])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCliente(id: string, updates: Partial<ClienteInput>): Promise<ClienteLocal> {
  const { data, error } = await supabase
    .from('clientes_locales')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteCliente(id: string): Promise<void> {
  const { error } = await supabase.from('clientes_locales').delete().eq('id', id)
  if (error) throw error
}
