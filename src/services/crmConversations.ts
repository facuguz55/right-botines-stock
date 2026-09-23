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

export async function renameConversacion(conversacionId: string, nuevoNombre: string): Promise<void> {
  const { error } = await supabase
    .from('wsp_conversaciones')
    .update({ nombre_personalizado: nuevoNombre.trim() || null })
    .eq('id', conversacionId)
  if (error) throw error
}

// Normaliza a formato wa_id de WhatsApp: solo dígitos, con código de país.
// Mismo criterio que numeroWhatsApp en ClientesLocales.tsx/TNPreventa.tsx —
// si ya empieza con 54 lo dejamos, si no le anteponemos 549 (Argentina,
// móvil) asumiendo que cargaron el número local sin código de país.
export function toWaContactId(numero: string): string {
  const digitos = numero.replace(/\D/g, '')
  return digitos.startsWith('54') ? digitos : `549${digitos}`
}

// Busca o crea una conversación a partir de un número de teléfono, para
// poder escribirle a cualquier persona desde el CRM aunque nunca haya
// escrito ella primero (o no tenga ningún modelo/stock asociado). Mismo
// patrón que getOrCreateConversation en api/whatsapp-webhook.ts, pero desde
// el cliente con la key anon (las políticas RLS de wsp_conversaciones/
// crm_clientes son abiertas, igual que el resto del stock).
export async function startOrGetConversacion(
  numero: string,
  nombre: string | null,
): Promise<WspConversacion> {
  const waContactId = toWaContactId(numero)

  const { data: existing } = await supabase
    .from('wsp_conversaciones')
    .select('*, crm_clientes(*, clientes_locales(*))')
    .eq('wa_contact_id', waContactId)
    .maybeSingle()
  if (existing) return existing as WspConversacion

  const { data: cliente, error: clienteErr } = await supabase
    .from('crm_clientes')
    .insert([{ wa_contact_id: waContactId, nombre, telefono: numero }])
    .select()
    .single()
  if (clienteErr) throw clienteErr

  const { data: conv, error: convErr } = await supabase
    .from('wsp_conversaciones')
    .insert([{
      wa_contact_id: waContactId,
      crm_cliente_id: cliente.id,
      nombre: nombre || numero,
      telefono: numero,
      ultimo_mensaje: null,
      ultimo_mensaje_at: new Date().toISOString(),
      estado: 'Respondido',
    }])
    .select('*, crm_clientes(*, clientes_locales(*))')
    .single()
  if (convErr) throw convErr
  return conv as WspConversacion
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
