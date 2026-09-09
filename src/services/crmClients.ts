import { supabase } from '../lib/supabase'
import type { CrmCliente } from '../types/crm'

export async function fetchCrmCliente(conversacionId: string): Promise<CrmCliente | null> {
  const { data: conv } = await supabase
    .from('wsp_conversaciones')
    .select('crm_cliente_id')
    .eq('id', conversacionId)
    .single()
  if (!conv?.crm_cliente_id) return null

  const { data, error } = await supabase
    .from('crm_clientes')
    .select('*, clientes_locales(*)')
    .eq('id', conv.crm_cliente_id)
    .single()
  if (error) return null
  return data as CrmCliente
}

export async function updateCrmCliente(id: string, updates: Partial<Pick<CrmCliente, 'nombre' | 'telefono' | 'dni' | 'notas'>>): Promise<CrmCliente> {
  const { data, error } = await supabase
    .from('crm_clientes')
    .update(updates)
    .eq('id', id)
    .select('*, clientes_locales(*)')
    .single()
  if (error) throw error
  return data as CrmCliente
}

export async function linkClienteLocal(crmClienteId: string, clienteLocalId: string): Promise<void> {
  const { error } = await supabase
    .from('crm_clientes')
    .update({ cliente_local_id: clienteLocalId })
    .eq('id', crmClienteId)
  if (error) throw error
}

export async function fetchHistorialCompras(clienteLocalId: string) {
  const { data, error } = await supabase
    .from('ventas')
    .select('*, modelos(modelo, marca, categoria)')
    .eq('cliente_id', clienteLocalId)
    .order('fecha', { ascending: false })
    .limit(20)
  if (error) throw error
  return data || []
}
