// Piezas chicas del bot de sugerencias: qué hacer cuando el cliente manda una
// foto, un audio o un "Bien" suelto, y cómo se limpian los nombres de contacto
// con letras decoradas. Todo puro, sin red, para poder probarlo.

const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

// Lo que se guarda en el chat cuando el mensaje no trae texto.
const MARCADORES: Record<string, string> = {
  image: '[foto]', audio: '[audio]', video: '[video]', sticker: '[sticker]', document: '[documento]',
}
export function marcadorAdjunto(tipo: string): string {
  return MARCADORES[tipo] ?? ''
}

export function esMarcadorAdjunto(texto: string): boolean {
  return /^\[[^\]]+\]$/.test(texto.trim())
}

const PALABRAS_DE_SALUDO = new Set([
  'hola', 'holaa', 'holi', 'buenas', 'buenos', 'buen', 'dia', 'dias', 'tarde', 'tardes', 'noche', 'noches',
  'que', 'tal', 'como', 'va', 'estas', 'andas', 'andan', 'todo', 'bien', 'les', 'vos', 'y', 'todos', 'gente', 'cómo',
])

// "Hola buenas tardes", "Cómo va?" o una foto/audio sin texto: no dicen qué
// quiere el cliente, así que no cambian cómo se le contesta una foto de botín.
export function esSaludoOMedia(texto: string): boolean {
  const t = normalizar(texto)
  if (!t || esMarcadorAdjunto(t)) return true
  const palabras = t.replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/).filter(Boolean)
  return palabras.length > 0 && palabras.every(p => PALABRAS_DE_SALUDO.has(p.replace(/(.)\1{2,}/g, '$1')))
}

// Lo que se le cuenta a la IA que escribe la sugerencia de la foto que acaba de
// mandar el cliente (ella no la ve; otra IA la describió).
export function descripcionFoto(descripcion: string | null, caption: string | null): string {
  const marca = `[foto del cliente: ${descripcion?.trim() || 'no se vio qué muestra'}]`
  return caption?.trim() ? `${caption.trim()} ${marca}` : marca
}

// Intenciones en las que la respuesta sale del stock real ("Sisi los tenemos,
// qué talle usás?"). En cualquier otra (envíos, la horma, un reclamo…) manda lo
// que preguntó el cliente: contestar con el stock sería ignorar su pregunta.
const INTENCIONES_DE_STOCK = new Set(['pedido_talle', 'consulta_precio', 'saludo'])
export function usarRespuestaArmadaDeStock(intencion: string | null | undefined, hayMensajesIA: boolean): boolean {
  if (!intencion || !hayMensajesIA) return true
  return INTENCIONES_DE_STOCK.has(intencion)
}

const CIERRE = /\b(gracias|genial|bien|dale|ok|okey|oka|listo|barbaro|perfecto|buenisimo|excelente|joya|de una|ya esta)\b/

// Último recurso: que nunca quede el chat sin sugerencia aunque la IA falle o
// devuelva vacío. Mensajes simples, sin inventar nada.
export function sugerenciaDeRescate(ultimo: string): string[] {
  const t = normalizar(ultimo)
  if (t && !esMarcadorAdjunto(t) && t.split(/\s+/).length <= 6 && CIERRE.test(t)) {
    return ['Buenísimo!', 'Cualquier cosa mándanos!']
  }
  return ['Hola buenas! Cómo estás?', 'Contame en qué te puedo ayudar']
}

// Si el pedido se contesta con el estado real del pedido: no alcanza con que la
// IA lo diga (se confundía con un "Dale" o un "Bien" a mitad de una compra).
// El mensaje tiene que hablar de un pedido, un envío o un seguimiento.
export function preguntaPorPedidoConfiable(
  intencionEsEstadoPedido: boolean, hablaDePedido: boolean,
): boolean {
  return intencionEsEstadoPedido && hablaDePedido
}

// ── Nombres de contacto con letras decoradas ──
// Hay quien se pone el nombre así: "Åłę%¥§ Pëřę¥řą" (Alexys Pereyra). Se
// reemplaza cada símbolo por la letra que imita y se sacan los adornos. Los
// nombres normales con acento (José, María, Ñandú) no se tocan.

const SIMBOLOS: Record<string, string> = {
  '%': 'x', '¥': 'y', '§': 's', '€': 'e', '£': 'l', '¢': 'c', '©': 'c', '®': 'r', '™': 't',
  'ß': 'ss', 'æ': 'ae', 'Æ': 'AE', 'œ': 'oe', 'Œ': 'OE', 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D',
  'ø': 'o', 'Ø': 'O', 'ħ': 'h', 'ŧ': 't',
}
const ACENTO_ESPANOL = /[áéíóúüñÁÉÍÓÚÜÑ]/

export function limpiarNombreWsp(nombre: string | null | undefined): string {
  if (!nombre) return ''
  const n = nombre.normalize('NFC')
  let raros = 0
  for (const ch of n) {
    if (ch in SIMBOLOS) raros++
    else if (/\p{L}/u.test(ch) && ch.charCodeAt(0) > 127 && !ACENTO_ESPANOL.test(ch)) raros++
  }
  if (raros < 2) return nombre
  return [...n]
    .map(ch => SIMBOLOS[ch] ?? ch)
    .join('')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
