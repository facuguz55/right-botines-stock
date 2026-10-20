import { supabase } from '../lib/supabase'
import { humanizar } from '../lib/crmTexto'
import type { WspIaSugerencia, WspMensaje } from '../types/crm'

// Lo que aprende el bot: cada vez que una persona contesta un chat, se guarda la
// pregunta del cliente, lo que había sugerido el bot y lo que se mandó de verdad.
// Los dueños lo revisan en "Aprendizaje" y aprueban (o corrigen) la respuesta
// final; las aprobadas se usan como guía en las próximas sugerencias (webhook).

export type OrigenAprendizaje = 'usada' | 'distinta' | 'sin_sugerencia'
export type EstadoAprendizaje = 'pendiente' | 'aprobado' | 'descartado'

export interface CrmAprendizaje {
  id: string
  conversacion_id: string
  mensaje_cliente_id: string
  pregunta: string
  respuesta_bot: string | null
  respuesta_humano: string | null
  respuesta_aprobada: string | null
  origen: OrigenAprendizaje
  estado: EstadoAprendizaje
  revisado_en: string | null
  created_at: string
  wsp_conversaciones?: { nombre: string | null; nombre_personalizado: string | null; telefono: string | null } | null
}

function textoDe(m: WspMensaje): string {
  if (m.contenido) return m.contenido
  if (m.tipo === 'image') return '[foto]'
  if (m.tipo === 'audio') return m.transcripcion || '[audio]'
  return ''
}

// Se llama después de mandar un texto desde el CRM. Nunca tira error: aprender
// no puede frenar la atención.
export async function registrarAprendizaje(args: {
  conversacionId: string
  mensajes: WspMensaje[]
  sugerenciasPorMensaje: Record<string, WspIaSugerencia>
  textoEnviado: string
}): Promise<void> {
  try {
    const reales = args.mensajes.filter(m => !m._pending && !m._hidden)
    const bloque: WspMensaje[] = []
    for (let i = reales.length - 1; i >= 0 && reales[i].direccion === 'in'; i--) bloque.unshift(reales[i])
    if (bloque.length === 0) return
    const ancla = bloque[bloque.length - 1]
    const pregunta = bloque.map(textoDe).filter(Boolean).slice(-3).join('\n')
    if (!pregunta) return

    const sug = args.sugerenciasPorMensaje[ancla.id]
    const bot = sug?.respuesta_sugerida ? humanizar(sug.respuesta_sugerida) : null
    const enviado = args.textoEnviado.trim()
    const origen: OrigenAprendizaje = !bot ? 'sin_sugerencia' : bot === enviado ? 'usada' : 'distinta'

    await supabase.from('crm_aprendizajes').upsert({
      conversacion_id: args.conversacionId,
      mensaje_cliente_id: ancla.id,
      pregunta,
      respuesta_bot: bot,
      respuesta_humano: enviado,
      origen,
    }, { onConflict: 'mensaje_cliente_id', ignoreDuplicates: true })
  } catch (err) {
    console.error('No se pudo registrar el aprendizaje:', err)
  }
}

export async function fetchAprendizajes(estado: EstadoAprendizaje): Promise<CrmAprendizaje[]> {
  const { data, error } = await supabase
    .from('crm_aprendizajes')
    .select('*, wsp_conversaciones(nombre, nombre_personalizado, telefono)')
    .eq('estado', estado)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? []) as CrmAprendizaje[]
}

export async function contarPendientes(): Promise<number> {
  const { count, error } = await supabase
    .from('crm_aprendizajes').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente')
  if (error) throw error
  return count ?? 0
}

export async function aprobarAprendizaje(id: string, respuesta: string): Promise<void> {
  const { error } = await supabase.from('crm_aprendizajes')
    .update({ estado: 'aprobado', respuesta_aprobada: respuesta.trim(), revisado_en: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function descartarAprendizaje(id: string): Promise<void> {
  const { error } = await supabase.from('crm_aprendizajes')
    .update({ estado: 'descartado', revisado_en: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
