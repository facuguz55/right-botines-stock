// Cómo se arma lo que lee la IA del bot a partir de los últimos mensajes del
// chat. Lo usan el webhook (producción) y la prueba del bot
// (.claude/hillclimb/bot-sugerencias), así la prueba mide exactamente lo mismo.
import { marcadorAdjunto } from './crmSugerencia'

export interface FilaMensaje {
  id?: string
  direccion: 'in' | 'out'
  tipo?: string
  contenido: string | null
  transcripcion: string | null
  imagen_descripcion?: string | null
  timestamp?: string
  automatico?: string | null
}

const textoDe = (m: FilaMensaje) => (m.contenido || m.transcripcion || '').trim()

function marcaFotoCliente(m: FilaMensaje): string {
  return `[foto del cliente: ${m.imagen_descripcion?.trim() || 'no se vio qué muestra'}]`
}

// La charla para la IA, de la más vieja a la más nueva. Las fotos cuentan:
// aparecen como [foto del cliente: lo que muestra].
export function armarContexto(filas: FilaMensaje[]): string {
  return filas
    .map(m => {
      const texto = textoDe(m)
      if (m.tipo === 'image') {
        const marca = m.direccion === 'in' ? marcaFotoCliente(m) : '[foto que mandó el local]'
        return `${m.direccion === 'in' ? 'Cliente' : 'Local'}: ${[texto, marca].filter(Boolean).join(' ')}`
      }
      return texto ? `${m.direccion === 'in' ? 'Cliente' : 'Local'}: ${texto}` : ''
    })
    .filter(Boolean)
    .join('\n')
}

// Mensajes con texto (sin fotos ni audios sin transcribir), en orden.
export function mensajesConTexto(filas: FilaMensaje[]): { direccion: 'in' | 'out'; texto: string }[] {
  return filas.map(m => ({ direccion: m.direccion, texto: textoDe(m) })).filter(m => m.texto)
}

// Lo último que escribió el cliente seguido (solo texto): con esto se buscan
// las respuestas aprobadas en "Aprendizaje".
export function bloqueDeTextoDelCliente(filas: FilaMensaje[]): string[] {
  const recientes = mensajesConTexto(filas)
  const bloque: string[] = []
  for (let i = recientes.length - 1; i >= 0 && recientes[i].direccion === 'in'; i--) bloque.unshift(recientes[i].texto)
  return bloque
}

// El mismo bloque, pero con las fotos y audios (no tienen texto): la
// sugerencia contesta todo lo que mandó seguido, sobre todo lo último.
export function bloqueConAdjuntos(filas: FilaMensaje[]): string[] {
  const bloque: string[] = []
  for (let i = filas.length - 1; i >= 0 && filas[i].direccion === 'in'; i--) {
    const m = filas[i]
    const adj = m.tipo === 'image' ? marcaFotoCliente(m) : marcadorAdjunto(m.tipo ?? '')
    bloque.unshift([textoDe(m), adj].filter(Boolean).join(' '))
  }
  return bloque
}

// ── Saludo repetido ──
// El modelo tiene la orden de no volver a saludar si la charla ya venía, y no
// la cumple (en la prueba de 150 casos, 1 de cada 7 respuestas malas era por
// esto). Se arregla por código: si el local (una persona, no un mensaje
// automático) escribió en las últimas 3 horas, se saca el saludo del principio.

// "Hola buenas! Cómo estás?", "Buen día!", "Buenas tardes, cómo andás?"…
// No saca "Todo bien y vos?": eso es contestarle al cliente, no saludar.
const SALUDO_INICIAL = /^\s*(?:hola+s?|holis|buenas+|buen d[ií]a|buenos d[ií]as|buenas tardes|buenas noches)(?:[\s,]+(?:buenas+|buen d[ií]a|buenos d[ií]as|buenas tardes|buenas noches))?[\s!.,]*(?:(?:c[oó]mo est[aá]s|c[oó]mo and[aá]s|c[oó]mo va|qu[eé] tal)\??[\s!.,]*)?/i

export const VENTANA_SALUDO_MS = 3 * 60 * 60 * 1000

// Cuánto hace que escribió el local por última vez (antes de `ahora`), o null.
export function ultimaRespuestaDelLocalMs(filas: FilaMensaje[], ahora: number): number | null {
  for (let i = filas.length - 1; i >= 0; i--) {
    const m = filas[i]
    if (m.direccion !== 'out' || m.automatico || !m.timestamp) continue
    const t = Date.parse(m.timestamp)
    if (Number.isFinite(t) && t <= ahora) return ahora - t
  }
  return null
}

export function sacarSaludoRepetido(mensajes: string[], localHabloHaceMs: number | null): string[] {
  if (mensajes.length === 0 || localHabloHaceMs == null || localHabloHaceMs > VENTANA_SALUDO_MS) return mensajes
  const [primero, ...resto] = mensajes
  const sinSaludo = primero.replace(SALUDO_INICIAL, '').trim()
  if (sinSaludo === primero.trim()) return mensajes
  const nuevos = sinSaludo ? [sinSaludo.charAt(0).toUpperCase() + sinSaludo.slice(1), ...resto] : resto
  return nuevos.length ? nuevos : mensajes
}
