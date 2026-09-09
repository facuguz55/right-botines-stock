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

export async function sendTextMessage(
  conversacionId: string,
  contenido: string,
  empleadoId: string | null,
): Promise<WspMensaje> {
  const { data: msg, error: msgErr } = await supabase
    .from('wsp_mensajes')
    .insert([{
      conversacion_id: conversacionId,
      direccion: 'out',
      tipo: 'text',
      contenido,
      enviado_por: empleadoId,
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
): Promise<WspMensaje> {
  const { data: msg, error } = await supabase
    .from('wsp_mensajes')
    .insert([{
      conversacion_id: conversacionId,
      direccion: 'out',
      tipo: 'image',
      contenido: caption,
      media_url: mediaUrl,
      enviado_por: empleadoId,
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
