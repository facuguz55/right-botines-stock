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

// Marcar "Venta concretada" a mano también deja la fecha de la venta (es lo que
// cuentan las estadísticas). Sacarla a mano la borra: fue un error.
export async function updateEstado(conversacionId: string, estado: CrmEstado): Promise<void> {
  const { data: actual } = await supabase
    .from('wsp_conversaciones').select('estado, venta_detectada_at').eq('id', conversacionId).maybeSingle()
  const cambios: Record<string, unknown> = { estado }
  if (estado === 'Venta concretada' && !actual?.venta_detectada_at) {
    cambios.venta_detectada_at = new Date().toISOString()
    cambios.venta_detectada_motivo = 'Marcada a mano'
  } else if (estado !== 'Venta concretada' && actual?.estado === 'Venta concretada') {
    cambios.venta_detectada_at = null
    cambios.venta_detectada_motivo = null
  }
  const { error } = await supabase
    .from('wsp_conversaciones')
    .update(cambios)
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

// Vuelve a dejar el chat como no leído (para acordarse de volver a mirarlo).
// Solo toca el contador: el estado (Respondido, Venta concretada…) se mantiene.
export async function markAsUnread(conversacionId: string): Promise<void> {
  const { error } = await supabase
    .from('wsp_conversaciones')
    .update({ no_leidos: 1 })
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

// Borra lo que el cliente "está buscando" (talle/tipo detectados en la
// charla) — para cuando la IA entendió mal o el cliente arranca otra consulta.
export async function clearBusqueda(conversacionId: string): Promise<void> {
  const { error } = await supabase
    .from('wsp_conversaciones')
    .update({ busqueda_talle: null, busqueda_tipo: null, busqueda_modelo: null, busqueda_updated_at: null })
    .eq('id', conversacionId)
  if (!error) return
  // Sin la migración 039 no existe busqueda_modelo: se borra lo demás igual.
  const { error: error2 } = await supabase
    .from('wsp_conversaciones')
    .update({ busqueda_talle: null, busqueda_tipo: null, busqueda_updated_at: null })
    .eq('id', conversacionId)
  if (error2) throw error2
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

// ── Menú de cada chat (mantener apretado / clic derecho) ─────────────────────

async function patchConversacion(id: string, cambios: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('wsp_conversaciones').update(cambios).eq('id', id)
  if (error) throw error
}

export const setArchivada = (id: string, archivada: boolean) => patchConversacion(id, { archivada })
export const setBloqueada = (id: string, bloqueada: boolean) => patchConversacion(id, { bloqueada })
// hasta = null: deja de silenciar.
export const setSilenciada = (id: string, hasta: string | null) => patchConversacion(id, { silenciada_hasta: hasta })

// Borra todos los mensajes del chat pero deja el chat en la lista, vacío.
export async function vaciarChat(id: string): Promise<void> {
  const { error } = await supabase.from('wsp_mensajes').delete().eq('conversacion_id', id)
  if (error) throw error
  await supabase.from('wsp_ia_sugerencias').delete().eq('conversacion_id', id)
  await patchConversacion(id, {
    ultimo_mensaje: null, no_leidos: 0,
    busqueda_talle: null, busqueda_tipo: null, busqueda_modelo: null, busqueda_updated_at: null,
  })
}

// Borra el chat y todos sus mensajes. Lo que el bot aprendió de él se conserva.
export async function eliminarChat(id: string): Promise<void> {
  const { error } = await supabase.from('wsp_conversaciones').delete().eq('id', id)
  if (error) throw error
}
