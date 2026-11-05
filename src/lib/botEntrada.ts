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
