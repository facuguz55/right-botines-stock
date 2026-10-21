import { humanizar } from './crmTexto'
import type { WspIaSugerencia, WspMensaje } from '../types/crm'

// Lógica pura de "Aprendizaje del bot" (sin base de datos), para poder probarla.

export type OrigenAprendizaje = 'usada' | 'distinta' | 'sin_sugerencia'

// Si Right ya venía contestando hace más que esto, lo que manda ahora no es la
// respuesta a esa pregunta.
export const VENTANA_RESPUESTA_MS = 20 * 60_000

export function unirMensajes(mensajes: string[]): string {
  return mensajes.join('\n\n')
}

// Lee una lista de mensajes guardada como jsonb; si la fila es vieja (solo tiene
// el texto), devuelve ese texto como un único mensaje.
export function mensajesDe(lista: unknown, texto: string | null | undefined): string[] {
  if (Array.isArray(lista)) {
    const l = lista.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    if (l.length) return l
  }
  return texto && texto.trim() ? [texto.trim()] : []
}

// Los mensajes que sugirió el bot, listos para mostrar o mandar.
export function mensajesDeSugerencia(
  s: Pick<WspIaSugerencia, 'mensajes_sugeridos' | 'respuesta_sugerida'> | null | undefined,
): string[] {
  if (!s) return []
  return mensajesDe(s.mensajes_sugeridos, s.respuesta_sugerida).map(humanizar).filter(Boolean)
}

const normalizar = (t: string) =>
  t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

// 'usada' = TODO lo que mandó Right ya estaba entre lo que sugirió el bot.
// Eso no hace falta revisarlo: se mandó, así que ya está aprobado.
export function calcularOrigen(bot: string[], humano: string[]): OrigenAprendizaje {
  if (bot.length === 0) return 'sin_sugerencia'
  const delBot = new Set(bot.map(normalizar))
  return humano.length > 0 && humano.every(h => delBot.has(normalizar(h))) ? 'usada' : 'distinta'
}

export interface AnclaAprendizaje {
  // Lo último que escribió el cliente antes de que Right contestara.
  bloque: WspMensaje[]
  // Lo que Right ya mandó en respuesta a eso (mensajes anteriores de la misma respuesta).
  salientes: WspMensaje[]
}

// Dónde "engancha" lo que Right está mandando: el último bloque de mensajes del
// cliente, saltando lo que Right ya mandó atrás de ese bloque (así los varios
// mensajes de una misma respuesta quedan juntos en un solo aprendizaje).
export function ubicarAncla(mensajes: WspMensaje[], ahora = Date.now()): AnclaAprendizaje | null {
  const reales = mensajes.filter(m => !m._pending && !m._hidden && !m._failed && !m.automatico)
  const salientes: WspMensaje[] = []
  let i = reales.length - 1
  while (i >= 0 && reales[i].direccion === 'out') { salientes.unshift(reales[i]); i-- }
  const bloque: WspMensaje[] = []
  while (i >= 0 && reales[i].direccion === 'in') { bloque.unshift(reales[i]); i-- }
  if (bloque.length === 0) return null
  const ultima = salientes[salientes.length - 1]
  if (ultima && ahora - new Date(ultima.timestamp).getTime() > VENTANA_RESPUESTA_MS) return null
  return { bloque, salientes }
}
