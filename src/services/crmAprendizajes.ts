import { supabase } from '../lib/supabase'
import {
  calcularOrigen, mensajesDe, mensajesDeSugerencia, palabrasClave, ubicarAncla, unirMensajes,
  type OrigenAprendizaje,
} from '../lib/crmAprendizaje'
import type { WspIaSugerencia, WspMensaje } from '../types/crm'

// Lo que aprende el bot: TODO lo que Right contesta desde el CRM es correcto (es
// el estilo que buscan), así que el bot aprende solo, sin aprobar nada. Cada vez
// que se contesta un chat se guarda la pregunta del cliente, lo que había
// sugerido el bot y lo que se mandó de verdad (todos los mensajes de esa
// respuesta, en orden). Eso se usa como guía en las próximas sugerencias
// (webhook). En "Enseñarle al bot" se ve, se corrige o se olvida.

export type { OrigenAprendizaje }
export type EstadoAprendizaje = 'pendiente' | 'aprobado' | 'descartado'

export interface CrmAprendizaje {
  id: string
  conversacion_id: string
  mensaje_cliente_id: string
  pregunta: string
  respuesta_bot: string | null
  respuesta_humano: string | null
  respuesta_aprobada: string | null
  mensajes_bot: unknown
  mensajes_humano: unknown
  mensajes_aprobados: unknown
  origen: OrigenAprendizaje
  estado: EstadoAprendizaje
  revisado_en: string | null
  created_at: string
  wsp_conversaciones?: { nombre: string | null; nombre_personalizado: string | null; telefono: string | null } | null
}

export const mensajesBotDe = (a: CrmAprendizaje) => mensajesDe(a.mensajes_bot, a.respuesta_bot)
export const mensajesHumanoDe = (a: CrmAprendizaje) => mensajesDe(a.mensajes_humano, a.respuesta_humano)
export const mensajesAprobadosDe = (a: CrmAprendizaje) => mensajesDe(a.mensajes_aprobados, a.respuesta_aprobada)

function textoDe(m: WspMensaje): string {
  if (m.contenido) return m.contenido
  if (m.tipo === 'image') return '[foto]'
  if (m.tipo === 'audio') return m.transcripcion || '[audio]'
  return ''
}

interface ArgsRegistro {
  conversacionId: string
  mensajes: WspMensaje[]
  sugerenciasPorMensaje: Record<string, WspIaSugerencia>
  textoEnviado: string
}

async function registrar(args: ArgsRegistro): Promise<void> {
  const enviado = args.textoEnviado.trim()
  if (!enviado) return
  const ancla = ubicarAncla(args.mensajes)
  if (!ancla) return
  const ultimo = ancla.bloque[ancla.bloque.length - 1]
  const pregunta = ancla.bloque.map(textoDe).filter(Boolean).slice(-3).join('\n')
  if (!pregunta) return

  // Un cliente que solo mandó una foto o un audio no deja nada para buscar casos parecidos.
  if (palabrasClave(pregunta).size === 0) return

  const { data: previo } = await supabase
    .from('crm_aprendizajes')
    .select('id, estado, mensajes_bot, respuesta_bot, mensajes_humano, respuesta_humano, mensajes_aprobados, respuesta_aprobada')
    .eq('mensaje_cliente_id', ultimo.id)
    .maybeSingle()

  // Si lo hicieron olvidar, o lo corrigieron a mano, no se pisa.
  if (previo?.estado === 'descartado') return
  const humanoPrevio = previo ? mensajesDe(previo.mensajes_humano, previo.respuesta_humano) : []
  if (previo && unirMensajes(mensajesDe(previo.mensajes_aprobados, previo.respuesta_aprobada)) !== unirMensajes(humanoPrevio)) return

  const bot = previo ? mensajesDe(previo.mensajes_bot, previo.respuesta_bot) : mensajesDeSugerencia(args.sugerenciasPorMensaje[ultimo.id])
  const humano = [...humanoPrevio, enviado]

  const fila = {
    pregunta,
    mensajes_bot: bot.length ? bot : null,
    respuesta_bot: bot.length ? unirMensajes(bot) : null,
    mensajes_humano: humano,
    respuesta_humano: unirMensajes(humano),
    origen: calcularOrigen(bot, humano),
    // Aprendido al instante: todo lo que Right contesta sirve.
    estado: 'aprobado',
    respuesta_aprobada: unirMensajes(humano),
    mensajes_aprobados: humano,
    revisado_en: new Date().toISOString(),
  }

  if (previo) {
    await supabase.from('crm_aprendizajes').update(fila).eq('id', previo.id)
  } else {
    await supabase.from('crm_aprendizajes').upsert(
      { conversacion_id: args.conversacionId, mensaje_cliente_id: ultimo.id, ...fila },
      { onConflict: 'mensaje_cliente_id', ignoreDuplicates: true },
    )
  }
}

// Una respuesta de varios mensajes se manda de a uno: se registran en fila, así
// cada uno ve lo que dejó el anterior.
let cola: Promise<void> = Promise.resolve()

// Se llama después de mandar un texto desde el CRM. Nunca tira error: aprender
// no puede frenar la atención.
export function registrarAprendizaje(args: ArgsRegistro): Promise<void> {
  cola = cola.then(() => registrar(args)).catch(err => {
    console.error('No se pudo registrar el aprendizaje:', err)
  })
  return cola
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

// Corregir lo que aprendió el bot (queda lo corregido, no lo que mandó Right).
export async function aprobarAprendizaje(id: string, mensajes: string[]): Promise<void> {
  const limpios = mensajes.map(m => m.trim()).filter(Boolean)
  const { error } = await supabase.from('crm_aprendizajes')
    .update({
      estado: 'aprobado',
      respuesta_aprobada: unirMensajes(limpios),
      mensajes_aprobados: limpios,
      revisado_en: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

// Que el bot lo olvide (para algún caso raro que no sirva).
export async function descartarAprendizaje(id: string): Promise<void> {
  const { error } = await supabase.from('crm_aprendizajes')
    .update({ estado: 'descartado', revisado_en: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export interface PruebaBot {
  mensajes: string[]
  usadas: string[]
  nota: string | null
}

// Qué contestaría el bot ahora. Con `leccion`, "como si ya estuviera aprobada"
// esa respuesta. No manda ni guarda nada.
export async function probarBot(cliente: string[], leccion?: string[]): Promise<PruebaBot> {
  const res = await fetch('/api/bot-probar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cliente, leccion: leccion?.length ? { mensajes: leccion } : null }),
  })
  const data = await res.json().catch(() => ({})) as Partial<PruebaBot> & { error?: string }
  if (!res.ok) throw new Error(data.error || 'No se pudo probar el bot.')
  return { mensajes: data.mensajes ?? [], usadas: data.usadas ?? [], nota: data.nota ?? null }
}
