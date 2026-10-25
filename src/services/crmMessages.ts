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

// Después de contestar: el chat pasa a "Respondido" salvo que ya sea una venta, y
// se le pide al detector que lo vuelva a mirar (por ejemplo "recibido, gracias"
// después de un comprobante). Sin esperar: si falla, el mensaje igual salió.
async function trasContestar(conversacionId: string, ultimoMensaje: string): Promise<void> {
  await supabase
    .from('wsp_conversaciones')
    .update({ ultimo_mensaje: ultimoMensaje, ultimo_mensaje_at: new Date().toISOString() })
    .eq('id', conversacionId)
  await supabase
    .from('wsp_conversaciones')
    .update({ estado: 'Respondido' })
    .eq('id', conversacionId)
    .neq('estado', 'Venta concretada')
  fetch('/api/crm-detectar-venta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversacionId }),
  }).catch(() => {})
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
  contextoWaId?: string | null,
): Promise<WspMensaje> {
  const waMessageId = await sendViaWhatsApp(waContactId, { type: 'text', text: contenido, contextId: contextoWaId ?? undefined })

  const { data: msg, error: msgErr } = await supabase
    .from('wsp_mensajes')
    .insert([{
      conversacion_id: conversacionId,
      direccion: 'out',
      tipo: 'text',
      contenido,
      enviado_por: empleadoId,
      wa_message_id: waMessageId,
      contexto_wa_id: contextoWaId ?? null,
    }])
    .select('*, empleados(nombre)')
    .single()
  if (msgErr) throw msgErr

  await trasContestar(conversacionId, contenido.slice(0, 200))

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

  await trasContestar(conversacionId, caption || '📷 Foto')

  return msg as WspMensaje
}

// WhatsApp acepta imágenes de hasta 5 MB y documentos de hasta 100 MB; acá se
// pone un tope más bajo para documentos porque se suben desde el celular.
export const MAX_IMAGEN_BYTES = 5 * 1024 * 1024
export const MAX_DOCUMENTO_BYTES = 16 * 1024 * 1024

// La guía de talles es un archivo estático de la app (public/): Meta necesita
// una URL pública, así que va siempre la de producción, aunque se mande desde
// localhost.
export const GUIA_TALLES_URL = 'https://right-botines-stock.vercel.app/guia-talles.png'

// Sube un archivo del dispositivo a crm-media/salida y devuelve su URL
// pública, para que Meta lo pueda bajar y mandarlo.
export async function uploadSalidaMedia(file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin'
  const path = `salida/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from('crm-media').upload(path, file, {
    contentType: file.type || undefined,
    cacheControl: '31536000',
  })
  if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`)
  return supabase.storage.from('crm-media').getPublicUrl(path).data.publicUrl
}

export async function sendDocumentMessage(
  conversacionId: string,
  mediaUrl: string,
  filename: string,
  caption: string | null,
  empleadoId: string | null,
  waContactId: string,
): Promise<WspMensaje> {
  const waMessageId = await sendViaWhatsApp(waContactId, { type: 'document', documentUrl: mediaUrl, filename, caption: caption || undefined })

  const { data: msg, error } = await supabase
    .from('wsp_mensajes')
    .insert([{
      conversacion_id: conversacionId,
      direccion: 'out',
      tipo: 'document',
      // El nombre del archivo queda en el contenido para mostrarlo en el chat.
      contenido: caption ? `${filename} · ${caption}` : filename,
      media_url: mediaUrl,
      enviado_por: empleadoId,
      wa_message_id: waMessageId,
    }])
    .select('*, empleados(nombre)')
    .single()
  if (error) throw error

  await trasContestar(conversacionId, `📎 ${filename}`.slice(0, 200))

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

// Todas las sugerencias de la conversación (no solo la última) — para poder
// mostrar el botón de "mandar disponibles" pegado al mensaje puntual donde
// se preguntó por un talle, en vez de un cartel general arriba del input
// que no aclaraba a qué mensaje se refería.
export async function fetchSugerenciasPorMensaje(conversacionId: string) {
  const { data, error } = await supabase
    .from('wsp_ia_sugerencias')
    .select('*')
    .eq('conversacion_id', conversacionId)
    .not('mensaje_id', 'is', null)
  if (error) throw error
  return data || []
}
