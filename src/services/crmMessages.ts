import { supabase } from '../lib/supabase'
import type { WspMensaje } from '../types/crm'

export async function fetchMensajes(conversacionId: string): Promise<WspMensaje[]> {
  const { data, error } = await supabase
    .from('wsp_mensajes')
    .select('*, empleados(nombre)')
    .eq('conversacion_id', conversacionId)
    .order('timestamp', { ascending: true })
  if (error) throw error
  return (data || []) as WspMensaje[]
}

// Manda el mensaje de verdad por WhatsApp (Meta Cloud API) antes de
// guardarlo — antes esta función solo insertaba la fila en wsp_mensajes,
// así que el mensaje aparecía en el CRM pero nunca salía por WhatsApp.
// Si el envío real falla, se corta acá y no queda un mensaje "fantasma"
// en la bandeja que diga que se mandó sin haberse mandado.
async function sendViaWhatsApp(waContactId: string, body: Record<string, unknown>): Promise<string | null> {
  const res = await fetch('/api/whatsapp-send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: waContactId, ...body }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(data?.error?.error?.message || data?.error || 'No se pudo enviar el mensaje por WhatsApp')
  }
  return data?.data?.messages?.[0]?.id ?? null
}

export async function sendTextMessage(
  conversacionId: string,
  contenido: string,
  empleadoId: string | null,
  waContactId: string,
): Promise<WspMensaje> {
  const waMessageId = await sendViaWhatsApp(waContactId, { type: 'text', text: contenido })

  const { data: msg, error: msgErr } = await supabase
    .from('wsp_mensajes')
    .insert([{
      conversacion_id: conversacionId,
      direccion: 'out',
      tipo: 'text',
      contenido,
      enviado_por: empleadoId,
      wa_message_id: waMessageId,
    }])
    .select('*, empleados(nombre)')
    .single()
  if (msgErr) throw msgErr

  await supabase
    .from('wsp_conversaciones')
    .update({
      ultimo_mensaje: contenido.slice(0, 200),
      ultimo_mensaje_at: new Date().toISOString(),
      estado: 'Respondido',
    })
    .eq('id', conversacionId)

  return msg as WspMensaje
}

export async function sendImageMessage(
  conversacionId: string,
  mediaUrl: string,
  caption: string | null,
  empleadoId: string | null,
  waContactId: string,
): Promise<WspMensaje> {
  const waMessageId = await sendViaWhatsApp(waContactId, { type: 'image', imageUrl: mediaUrl, caption: caption || undefined })

  const { data: msg, error } = await supabase
    .from('wsp_mensajes')
    .insert([{
      conversacion_id: conversacionId,
      direccion: 'out',
      tipo: 'image',
      contenido: caption,
      media_url: mediaUrl,
      enviado_por: empleadoId,
      wa_message_id: waMessageId,
    }])
    .select('*, empleados(nombre)')
    .single()
  if (error) throw error

  await supabase
    .from('wsp_conversaciones')
    .update({
      ultimo_mensaje: caption || '📷 Foto',
      ultimo_mensaje_at: new Date().toISOString(),
      estado: 'Respondido',
    })
    .eq('id', conversacionId)

  return msg as WspMensaje
}

// Borra el mensaje del historial del CRM. Ojo: esto NO lo "desmanda" del
// WhatsApp real del cliente (Meta no da API para eso pasado un rato muy
// corto) — solo lo saca de la vista acá.
export async function deleteMensaje(mensajeId: string): Promise<void> {
  const { error } = await supabase
    .from('wsp_mensajes')
    .delete()
    .eq('id', mensajeId)
  if (error) throw error
}

export async function markSuggestionUsed(sugerenciaId: string): Promise<void> {
  const { error } = await supabase
    .from('wsp_ia_sugerencias')
    .update({ usada: true })
    .eq('id', sugerenciaId)
  if (error) throw error
}

export async function fetchLatestSugerencia(conversacionId: string) {
  const { data, error } = await supabase
    .from('wsp_ia_sugerencias')
    .select('*')
    .eq('conversacion_id', conversacionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}
