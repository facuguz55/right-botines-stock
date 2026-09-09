import { supabase } from '../lib/supabase'
import type { WspConversacion, CrmCategoria, CrmEstado } from '../types/crm'

export async function fetchConversaciones(categoriaFilter?: CrmCategoria): Promise<WspConversacion[]> {
  let query = supabase
    .from('wsp_conversaciones')
    .select('*, crm_clientes(*, clientes_locales(*))')
    .order('ultimo_mensaje_at', { ascending: false })

  if (categoriaFilter) query = query.eq('categoria', categoriaFilter)

  const { data, error } = await query
  if (error) throw error
  return (data || []) as WspConversacion[]
}

export async function fetchConversacion(id: string): Promise<WspConversacion | null> {
  const { data, error } = await supabase
    .from('wsp_conversaciones')
    .select('*, crm_clientes(*, clientes_locales(*))')
    .eq('id', id)
    .single()
  if (error) return null
  return data as WspConversacion
}

export async function updateCategoria(
  conversacionId: string,
  categoriaAnterior: CrmCategoria,
  categoriaNueva: CrmCategoria,
  empleadoId: string | null,
): Promise<void> {
  const { error: updateErr } = await supabase
    .from('wsp_conversaciones')
    .update({ categoria: categoriaNueva })
    .eq('id', conversacionId)
  if (updateErr) throw updateErr

  const { error: logErr } = await supabase
    .from('wsp_reclasificaciones')
    .insert([{
      conversacion_id: conversacionId,
      categoria_anterior: categoriaAnterior,
      categoria_nueva: categoriaNueva,
      por: empleadoId,
    }])
  if (logErr) throw logErr
}

export async function updateEstado(conversacionId: string, estado: CrmEstado): Promise<void> {
  const { error } = await supabase
    .from('wsp_conversaciones')
    .update({ estado })
    .eq('id', conversacionId)
  if (error) throw error
}

export async function markAsRead(conversacionId: string): Promise<void> {
  const { error } = await supabase
    .from('wsp_conversaciones')
    .update({ no_leidos: 0 })
    .eq('id', conversacionId)
  if (error) throw error
}

export async function searchConversaciones(term: string): Promise<WspConversacion[]> {
  const { data, error } = await supabase
    .from('wsp_conversaciones')
    .select('*, crm_clientes(*, clientes_locales(*))')
    .or(`nombre.ilike.%${term}%,telefono.ilike.%${term}%,ultimo_mensaje.ilike.%${term}%`)
    .order('ultimo_mensaje_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data || []) as WspConversacion[]
}
