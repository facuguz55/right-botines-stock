// Detección de "qué está buscando el cliente" (talle + tipo de botín) en los
// mensajes de WhatsApp del CRM. Lo usan tanto el webhook (api/whatsapp-webhook.ts,
// que clasifica cada mensaje entrante) como el frontend (botones de respuesta
// rápida y filtros del modal de fotos) — por eso vive en src/lib sin depender
// de nada del navegador ni de Supabase.
//
// Filosofía: primero reglas deterministas (un "talle 38" escrito tal cual no
// puede fallar), la IA solo completa lo que las reglas no entienden, y todo lo
// que diga la IA se valida contra lo que el cliente escribió de verdad. Ante la
// duda (dos talles distintos, dos tipos distintos) NO se adivina: queda vacío y
// decide la persona que atiende — mandar fotos del talle equivocado es peor que
// no sugerir nada.

export type TipoBotin = 'F11' | 'F5' | 'Futsal' | 'Hockey'

export const TIPOS_BOTIN: TipoBotin[] = ['F11', 'F5', 'Futsal', 'Hockey']

export const TIPO_LABEL: Record<TipoBotin, string> = {
  F11: 'Fútbol 11',
  F5: 'Fútbol 5',
  Futsal: 'Futsal',
  Hockey: 'Hockey',
}

// Talles argentinos que tiene sentido detectar. Fuera de este rango un número
// suelto casi seguro es otra cosa (precio, hora, cantidad).
export const TALLE_ARG_MIN = 33
export const TALLE_ARG_MAX = 47

// Misma equivalencia que usa el alta de modelos (ModelForm.tsx, ARG_TO_US),
// invertida. Si el cliente da un talle US que no está acá no se convierte a
// ojo: queda sin detectar.
const US_TO_ARG: Record<string, number> = {
  '5': 34, '5.5': 35, '6': 36, '7': 37, '7.5': 38,
  '8': 39, '9': 40, '9.5': 41, '10': 42, '11': 43, '11.5': 44,
}

// Pasados estos días sin mencionar talle/tipo, lo guardado de la
// conversación se considera una consulta vieja y no se arrastra a la nueva.
export const BUSQUEDA_VIGENCIA_HORAS = 72

export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[º°]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Acepta lo que venga (valor viejo "f11" guardado por la IA anterior, "Futbol 5",
// etc.) y lo lleva al valor canónico que usa la columna modelos.categoria.
export function normalizeTipo(valor: string | null | undefined): TipoBotin | null {
  if (!valor) return null
  const t = normalizar(valor).replace(/\s+/g, '')
  if (t === 'f11' || t === 'futbol11' || t === '11') return 'F11'
  if (t === 'f5' || t === 'futbol5' || t === '5') return 'F5'
  if (t === 'futsal' || t === 'futbolsala' || t === 'sala') return 'Futsal'
  if (t === 'hockey') return 'Hockey'
  return null
}

const TIPO_PATTERNS: Record<TipoBotin, RegExp[]> = {
  F11: [
    /\bf ?11\b/,
    /\bfutbol (de )?11\b/,
    /\bcancha (de )?11\b/,
    /\b(botines|botin|par|unos|uno) (de|para) (futbol )?11\b/,
    /\bcesped natural\b/,
    /\bpasto natural\b/,
    /\bcon tapones\b/,
    /\bfg\b/,
  ],
  F5: [
    /\bf ?5\b/,
    /\bfutbol (de )?5\b/,
    /\bcancha (de )?5\b/,
    /\b(botines|botin|par|unos|uno) (de|para) (futbol )?5\b/,
    /\bsinteticos?\b/,
    /\bsinteticas?\b/,
    /\bmultitapon(es)?\b/,
    /\bmultitaco(s)?\b/,
    /\bpapi\b/,
    /\bturf\b/,
    /\btf\b/,
  ],
  Futsal: [
    /\bfutsal\b/,
    /\bfutbol (de )?sala\b/,
    /\bbaby futbol\b/,
    /\bindoor\b/,
    /\bparquet\b/,
  ],
  Hockey: [/\bhockey\b/],
}

// Palabras que, justo después de un número, indican que NO es un talle
// ("40 mil", "38 años", "45 minutos").
const UNIDADES_NO_TALLE = /^\s*(anos|años|min|mins|minutos|hs|horas|dias|km|cuadras|personas|mil|lucas|luquitas|k\b|%|pesos|dolares|usd|cm|kg|metros|mts|us\b|usa\b)/

// Palabras que, justo antes de un número, dan a entender que es un talle.
const PREVIAS_TALLE = /\b(talle|talles|numero|nro|n|calzo|calza|calzado|uso|size|en|del|el|de|un|una|par|tenes|tienen|hay)\s*$/

export interface DeteccionBusqueda {
  talle: number | null
  tipo: TipoBotin | null
  // Para diagnóstico/tests: todo lo que se encontró, aunque sea ambiguo.
  tallesEncontrados: number[]
  tiposEncontrados: TipoBotin[]
}

export interface ContextoDeteccion {
  // Último mensaje que mandó el local (si lo hay) — si preguntó por el tipo o
  // por el talle, una respuesta cortita como "11" o "38" se entiende sola.
  ultimoMensajeLocal?: string | null
}

export function localPreguntoTipo(textoLocal: string | null | undefined): boolean {
  if (!textoLocal) return false
  const t = normalizar(textoLocal)
  return /(f ?11|futbol 11|futbol 5|f ?5|futsal)/.test(t) && /\?|que tipo|para que cancha/.test(t)
}

export function localPreguntoTalle(textoLocal: string | null | undefined): boolean {
  if (!textoLocal) return false
  const t = normalizar(textoLocal)
  return /(que talle|que numero|talle usas|numero calzas|cuanto calzas|que calzas)/.test(t)
}

function detectarTipos(t: string, ctx: ContextoDeteccion): TipoBotin[] {
  const encontrados = new Set<TipoBotin>()
  for (const tipo of TIPOS_BOTIN) {
    if (TIPO_PATTERNS[tipo].some(re => re.test(t))) encontrados.add(tipo)
  }

  // Respuesta cortita a "¿F11, F5 o Futsal?": "11", "el de 5", "de sala".
  if (encontrados.size === 0 && localPreguntoTipo(ctx.ultimoMensajeLocal)) {
    const relleno = new Set(['el', 'la', 'los', 'las', 'de', 'para', 'uno', 'unos', 'una', 'unas', 'cancha', 'futbol', 'porfa', 'por', 'favor', 'gracias', 'busco', 'quiero', 'necesito', 'seria', 'es', 'y'])
    const palabras = t.replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(p => p && !relleno.has(p))
    if (palabras.length === 1) {
      const p = palabras[0]
      if (p === '11' || p === 'once') encontrados.add('F11')
      else if (p === '5' || p === 'cinco') encontrados.add('F5')
      else if (p === 'sala') encontrados.add('Futsal')
    }
  }
  return [...encontrados]
}

function detectarTalles(t: string, ctx: ContextoDeteccion): number[] {
  const encontrados = new Set<number>()
  const esCorto = t.split(' ').length <= 6
  const preguntoTalle = localPreguntoTalle(ctx.ultimoMensajeLocal)

  // Talle US explícito: "9.5 us", "us 10", "talle 8 usa".
  const usRegexes = [
    /(?:^|[^\d.,])(\d{1,2}(?:[.,]5)?)\s*(?:us|usa|americano)\b/g,
    /\bus\s*(\d{1,2}(?:[.,]5)?)(?![\d.,])/g,
  ]
  for (const re of usRegexes) {
    for (const m of t.matchAll(re)) {
      const arg = US_TO_ARG[m[1].replace(',', '.')]
      if (arg) encontrados.add(arg)
    }
  }

  // Talle ARG: número de 2 cifras suelto (no parte de un teléfono, precio,
  // hora ni decimal).
  const argRe = /(^|[^\d$.,:])(\d{2})(?![\d])(?!\s*[.,:]\d)/g
  for (const m of t.matchAll(argRe)) {
    const n = Number(m[2])
    if (n < TALLE_ARG_MIN || n > TALLE_ARG_MAX) continue
    const fin = (m.index ?? 0) + m[0].length
    const despues = t.slice(fin, fin + 14)
    if (UNIDADES_NO_TALLE.test(despues)) continue
    const antes = t.slice(0, fin - m[2].length)
    if (!(PREVIAS_TALLE.test(antes) || esCorto || preguntoTalle)) continue
    encontrados.add(n)
  }
  return [...encontrados]
}

export function detectarBusqueda(texto: string, ctx: ContextoDeteccion = {}): DeteccionBusqueda {
  const t = normalizar(texto)
  const tiposEncontrados = detectarTipos(t, ctx)
  const tallesEncontrados = detectarTalles(t, ctx)
  return {
    // Más de uno distinto = ambiguo ("tenés 38 o 39?", "f5 o f11?"): no se elige.
    talle: tallesEncontrados.length === 1 ? tallesEncontrados[0] : null,
    tipo: tiposEncontrados.length === 1 ? tiposEncontrados[0] : null,
    tallesEncontrados,
    tiposEncontrados,
  }
}

// Valida un talle que propuso la IA: tiene que ser un entero razonable y el
// cliente tiene que haberlo escrito (como ARG, o su equivalente US) en alguno
// de sus mensajes recientes. Así la IA no puede "inventar" un talle.
export function talleIaEsConfiable(talle: unknown, textosCliente: string[]): talle is number {
  if (typeof talle !== 'number' || !Number.isInteger(talle)) return false
  if (talle < TALLE_ARG_MIN || talle > TALLE_ARG_MAX) return false
  const equivalentesUs = Object.entries(US_TO_ARG).filter(([, arg]) => arg === talle).map(([us]) => us)
  return textosCliente.some(texto => {
    const t = normalizar(texto).replace(/,/g, '.')
    if (new RegExp(`(^|[^\\d.])${talle}(?![\\d]|\\.\\d)`).test(t)) return true
    return equivalentesUs.some(us => new RegExp(`(^|[^\\d.])${us.replace('.', '\\.')}(?![\\d]|\\.\\d)`).test(t))
  })
}

// Igual para el tipo: las reglas deterministas ya cubren las formas explícitas
// ("f11", "futsal"); la IA aporta en frases menos obvias ("cancha de 7", "para
// jugar en pasto"). Pero solo se le cree si el mensaje del cliente habla de
// algo relacionado — si no, un "F11" salido de la nada se descarta.
const PISTAS_TIPO = /\b(11|5|7|8|once|cinco|siete|ocho|cancha|pasto|cesped|sintetic\w*|piso|sala|futbol|futsal|campo|tapon\w*|taco\w*|papi|hockey|indoor|parquet|turf|baby)\b/

export function tipoIaEsConfiable(tipo: unknown, textoCliente: string): TipoBotin | null {
  const canonico = typeof tipo === 'string' ? normalizeTipo(tipo) : null
  if (!canonico) return null
  return PISTAS_TIPO.test(normalizar(textoCliente)) ? canonico : null
}

export interface EstadoBusqueda {
  talle: number | null
  tipo: TipoBotin | null
}

export function busquedaVigente(
  estado: { busqueda_talle?: number | null; busqueda_tipo?: string | null; busqueda_updated_at?: string | null },
  ahora: Date = new Date(),
): EstadoBusqueda {
  if (!estado.busqueda_updated_at) return { talle: null, tipo: null }
  const horas = (ahora.getTime() - new Date(estado.busqueda_updated_at).getTime()) / 3_600_000
  if (horas > BUSQUEDA_VIGENCIA_HORAS) return { talle: null, tipo: null }
  return {
    talle: estado.busqueda_talle ?? null,
    tipo: normalizeTipo(estado.busqueda_tipo ?? null),
  }
}

// Lo nuevo del mensaje pisa a lo guardado; lo que el mensaje no menciona se
// mantiene (el cliente dice "38" y dos mensajes después "de 11": queda 38+F11).
export function combinarBusqueda(previo: EstadoBusqueda, nuevo: EstadoBusqueda): EstadoBusqueda {
  return {
    talle: nuevo.talle ?? previo.talle,
    tipo: nuevo.tipo ?? previo.tipo,
  }
}

// ── Respuestas rápidas ──

export function textoPreguntarTipo(talle: number | null): string {
  return talle
    ? `¡Hola! Sí, tenemos modelos en talle ${talle} 👟 ¿Para qué cancha los buscás? ¿Fútbol 11, Fútbol 5 o Futsal?`
    : '¿Para qué cancha los buscás? ¿Fútbol 11, Fútbol 5 o Futsal? 👟'
}

export function textoPreguntarTalle(tipo: TipoBotin | null): string {
  return tipo
    ? `¡Genial! ¿Qué talle usás para los de ${TIPO_LABEL[tipo]}? 👟`
    : '¿Qué talle usás? 👟'
}

// Respuesta sugerida cuando el mensaje aportó talle/tipo. `stock` es cuántos
// modelos hay con stock para lo buscado (null si no se pudo consultar).
export function respuestaSugeridaBusqueda(estado: EstadoBusqueda, stock: number | null): string | null {
  const { talle, tipo } = estado
  if (talle && !tipo) {
    if (stock === 0) return `Uh, por ahora no nos queda stock en talle ${talle} 😕 Si querés te aviso cuando entre.`
    return textoPreguntarTipo(talle)
  }
  if (tipo && !talle) return textoPreguntarTalle(tipo)
  if (talle && tipo) {
    if (stock === 0) return `En talle ${talle} de ${TIPO_LABEL[tipo]} ahora no nos queda stock 😕 ¿Te muestro de otro tipo?`
    return `¡Perfecto! Te paso los modelos de ${TIPO_LABEL[tipo]} que tenemos en talle ${talle} 👇`
  }
  return null
}
