// Cerebro del bot de sugerencias de Right: el prompt, el schema y la llamada a
// la IA. Lo usan el webhook (sugerir una respuesta cuando entra un mensaje) y
// la pantalla "Aprendizaje" (probar qué contestaría el bot sin mandar nada),
// así las dos usan EXACTAMENTE lo mismo.
import { TIPOS_BOTIN, type EstadoBusqueda } from './crmBusqueda'
import { EJEMPLOS_ESTILO_CAMI, INFO_NEGOCIO } from './crmNegocio'
import { humanizar } from './crmTexto'

export const CATEGORIAS_CRM = ['Urgente', 'Pedido de talles', 'Normal', 'Spam', 'Postventa/Reclamos', 'Mayorista'] as const
export const INTENCIONES = ['pedido_talle', 'consulta_precio', 'consulta_envio', 'estado_pedido', 'garantia', 'reclamo', 'saludo', 'spam', 'otro'] as const

export const MAX_MENSAJES_SUGERIDOS = 3

export interface ClasificacionIA {
  categoria: string
  intencion: string
  talle_arg: number | null
  tipo: string | null
  // Lo que contestaría Cami, en mensajes cortos que se mandan uno atrás del otro.
  mensajes_sugeridos: string[]
  // Los mismos mensajes unidos con una línea en blanco (para el resto del código).
  respuesta_sugerida: string
  cambio_de_tema: boolean
}

// Structured outputs: la API garantiza que la respuesta respete este schema
// (antes se le pedía "respondé solo JSON" y se rescataba con una regex, que
// fallaba cada tanto y se perdía la clasificación entera).
export const CLASIFICACION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    categoria: { type: 'string', enum: [...CATEGORIAS_CRM] },
    intencion: { type: 'string', enum: [...INTENCIONES] },
    talle_arg: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    tipo: { anyOf: [{ type: 'string', enum: [...TIPOS_BOTIN] }, { type: 'null' }] },
    mensajes_sugeridos: { type: 'array', items: { type: 'string' } },
    cambio_de_tema: { type: 'boolean' },
  },
  required: ['categoria', 'intencion', 'talle_arg', 'tipo', 'mensajes_sugeridos', 'cambio_de_tema'],
}

// Cómo contesta Cami cuando son varios mensajes seguidos (sacado de sus chats
// reales; los textos del cliente están reescritos, sin datos de nadie).
export const SECUENCIAS_ESTILO_CAMI: { cliente: string; mensajes: string[] }[] = [
  { cliente: 'Hola, quería consultar por unos botines', mensajes: ['Hola buenas! Cómo estás?', 'En qué talle los estabas buscando?'] },
  { cliente: 'Buenas tardes, tienen disponibles?', mensajes: ['Hola buenas tardes! Cómo estás? Si obvio ya te envío lo disponible', 'Preferís ver en foto o con el link de la web con los precios?'] },
  { cliente: 'Hola, dónde están ubicados?', mensajes: ['Hola buen día! Todo bien y vos?', 'Estamos en fray Cayetano Rodríguez 3985, de lunes a viernes de 9 a 13 y 16 a 20 hs y sábados de 9 a 13 hs'] },
  { cliente: 'Hola cómo andás? Consulta qué modelos tienen de los Adidas Predator en talle 43,5 y el precio', mensajes: ['Hola buenas! Todo bien y vos?', 'El precio depende del modelo que elijas, ya te envío el link para que puedas ver cada modelo con sus precios', 'En qué talle los usás normalmente?'] },
  { cliente: 'Dale, gracias por todo!', mensajes: ['A vos!!', 'Cualquier cosa mándanos!'] },
  { cliente: 'Quiero cambiar el talle, ya pagué', mensajes: ['Sisi no hay problema! Ahora te confirmo si están disponibles en ese talle', 'Sisi los tenemos disponibles, ahora hacemos el cambio, no te preocupes'] },
]

export const SYSTEM_CLASIFICADOR = `Sos el asistente que clasifica los mensajes de WhatsApp que recibe Right Botines, una tienda de botines de fútbol de Santa Fe, Argentina, y le sugiere a la vendedora qué responder. Te paso la conversación reciente y el último mensaje del cliente; clasificás ESE último mensaje usando el resto como contexto.

<informacion_del_negocio>
${INFO_NEGOCIO}
</informacion_del_negocio>

Campos:
- categoria: Urgente, Pedido de talles, Normal, Spam, Postventa/Reclamos o Mayorista.
- intencion: pedido_talle, consulta_precio, consulta_envio (pregunta ANTES de comprar: si hacen envíos, a dónde, cuánto sale, cuánto tarda), estado_pedido (pregunta por un pedido que YA hizo: si salió, cuándo le llega, el código de seguimiento, qué compró), garantia (un producto que ya compró se rompió o falló), reclamo (otra queja o problema con una compra), saludo, spam u otro.
- talle_arg: el talle ARGENTINO que el CLIENTE dijo que busca (en este mensaje o antes en la conversación). Si lo dio en talle US o en centímetros del pie, convertilo con la guía de talles de arriba (si está entre dos, el más grande); si no está en la guía, null. Si pidió más de un talle, si no está claro, o si el número no es un talle (precio, edad, hora, cantidad), devolvé null. Nunca uses un talle que solo mencionó el local.
- tipo: F11 (fútbol 11, cancha de 11, pasto natural, tapones), F5 (fútbol 5, sintético, papi, multitapón; también cancha de 7 u 8), Futsal (futsal, sala, piso, indoor) o Hockey. Solo si el CLIENTE lo dijo o lo dejó claro; si mencionó más de uno o no dijo nada, null.
- cambio_de_tema: true si con este mensaje el cliente dejó de hablar del producto que venía consultando (el de "lo que ya sabemos que busca") y pasó a otro asunto —compra por mayor, un pedido que ya hizo, un reclamo, otra consulta sin relación— o si empieza a buscar algo nuevo que no tiene que ver con lo anterior (otro talle para otra persona, otro tipo de botín desde cero). false si sigue con lo mismo, aunque sea un "gracias", "¿cuánto salen?", "¿hacen envíos?" o un detalle más (tipo, color, modelo) de lo que ya venía buscando. Si no había nada guardado, false.
- mensajes_sugeridos: lo que contestaría la vendedora, en 1 a ${MAX_MENSAJES_SUGERIDOS} mensajes cortos que se mandan uno atrás del otro, como los manda ella por WhatsApp (por ejemplo, primero el saludo o la respuesta y después el dato o la pregunta). Cada mensaje es una frase o dos, nunca un bloque largo ni un párrafo. Si con una frase alcanza, mandá un solo mensaje. Saludá una sola vez y solo si la charla recién empieza. Para dirección, horarios, web, envíos, pagos, garantía y cambios usá la información del negocio de arriba, tal cual está. No inventes nada que no esté ahí: ni precios, ni porcentajes de descuento, ni promociones, ni estados de pedidos, códigos de seguimiento o fechas de entrega. NUNCA digas qué modelos, talles, tipos o marcas tenemos o no tenemos en stock: vos no ves el stock (lo resuelve el sistema aparte). Si preguntan por stock, pedí el talle (y si juega fútbol 11, 5 o futsal) para fijarte. Si el talle que dice el cliente no está en la guía (por ejemplo 43,5), NUNCA digas que ese talle no existe ni que no lo comercializamos, y no inventes equivalencias: preguntale en qué talle los usa normalmente. Si el cliente saluda o pregunta cómo estás, el primer mensaje le devuelve el saludo. Si hace falta un dato que no tenés, decí que lo revisás o pedí lo que falte.

Estilo de mensajes_sugeridos: tienen que parecer escritos por Cami, la vendedora, contestando desde el celular, no por una IA. Copiá su forma de escribir de estos mensajes reales suyos:
${EJEMPLOS_ESTILO_CAMI.map(e => `- "${e}"`).join('\n')}
Y así reparte ella la respuesta en varios mensajes seguidos (cada guion es un mensaje distinto):
${SECUENCIAS_ESTILO_CAMI.map(s => `Cliente: "${s.cliente}"\n${s.mensajes.map(m => `  - ${m}`).join('\n')}`).join('\n')}
Frases cortas y naturales, voseo, cálida ("Hola buenas!", "Dale buenisimo!", "Sisi"). Sin signos de apertura (nada de ¿ ni ¡): solo el de cierre. NUNCA uses emojis. Sin guiones largos, sin viñetas ni listas, sin negritas. Si la charla ya venía, no vuelvas a saludar. Nada de frases de manual como "Estoy acá para ayudarte" o "Excelente pregunta".

Ante la duda en talle o tipo, null: es preferible no sugerir nada a mandarle al cliente fotos del talle o tipo equivocado.

"Lo que ya sabemos que busca" es solo contexto: si el cliente cambió de tema, respondé al tema NUEVO y no vuelvas a mencionar ese talle, tipo o modelo.`

export interface OpcionesClasificador {
  apiKey: string
  modelo: string
  contexto: string
  busquedaGuardada: EstadoBusqueda
  text: string
  // Respuestas que los dueños aprobaron para casos parecidos (ya formateadas).
  aprendizajes?: string
}

export async function llamarClasificadorIA(o: OpcionesClasificador): Promise<ClasificacionIA | null> {
  if (!o.apiKey) {
    console.error('classifyWithAI: falta ANTHROPIC_API_KEY / VITE_ANTHROPIC_API_KEY')
    return null
  }
  const b = o.busquedaGuardada
  const guardada = b.talle || b.tipo || b.modelo
    ? `talle ${b.talle ?? 'sin definir'}, tipo ${b.tipo ?? 'sin definir'}` + (b.modelo ? `, modelo "${b.modelo}"` : '')
    : 'nada todavía'

  const bloqueAprendizajes = o.aprendizajes
    ? `\nRight (los dueños) aprobó estas respuestas para casos como los de esta charla. Si el caso es el mismo o muy parecido, contestá igual que ella: mismo contenido, mismo tono y la misma cantidad de mensajes cortos seguidos. Solo cambiá lo que dependa de este cliente (talle, modelo, nombre). Si el caso no se parece, ignoralas:\n${o.aprendizajes}\n`
    : ''

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': o.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: o.modelo,
      max_tokens: 1024,
      system: SYSTEM_CLASIFICADOR,
      output_config: { format: { type: 'json_schema', schema: CLASIFICACION_SCHEMA } },
      messages: [{
        role: 'user',
        content: `Conversación reciente (de la más vieja a la más nueva):\n${o.contexto || '(sin mensajes previos)'}\n\nLo que ya sabemos que busca: ${guardada}\n${bloqueAprendizajes}\nÚltimo mensaje del cliente, el que hay que clasificar:\n${o.text}`,
      }],
    }),
  })

  if (!res.ok) {
    console.error('classifyWithAI: Anthropic respondió', res.status, await res.text().catch(() => ''))
    return null
  }
  const data = await res.json() as { stop_reason?: string; content?: { type: string; text?: string }[] }
  if (data.stop_reason === 'refusal' || data.stop_reason === 'max_tokens') {
    console.error('classifyWithAI: respuesta incompleta de Anthropic, stop_reason =', data.stop_reason)
    return null
  }
  const raw = data.content?.find(b => b.type === 'text')?.text
  if (!raw) {
    console.error('classifyWithAI: sin texto en la respuesta de Anthropic', JSON.stringify(data))
    return null
  }
  try {
    const p = JSON.parse(raw) as Omit<ClasificacionIA, 'respuesta_sugerida'>
    const mensajes = limpiarMensajes(p.mensajes_sugeridos)
    return { ...p, mensajes_sugeridos: mensajes, respuesta_sugerida: mensajes.join('\n\n') }
  } catch {
    console.error('classifyWithAI: JSON inválido de Anthropic:', raw)
    return null
  }
}

// Pasa cada mensaje por humanizar (sin emojis, ¿ ¡ ni guiones largos), saca los
// vacíos y deja como mucho MAX_MENSAJES_SUGERIDOS.
export function limpiarMensajes(lista: unknown): string[] {
  if (!Array.isArray(lista)) return []
  return lista
    .map(m => (typeof m === 'string' ? humanizar(m) : ''))
    .filter(Boolean)
    .slice(0, MAX_MENSAJES_SUGERIDOS)
}

// ── Lo que aprendió el bot ───────────────────────────────────────────────
// Las respuestas aprobadas en "Aprendizaje" se buscan por palabras en común con
// lo que dijo el cliente y se le pasan a la IA como ejemplos de casos parecidos.
export interface FilaAprendizaje {
  pregunta: string
  respuesta_aprobada: string | null
  mensajes_aprobados?: unknown
  origen?: string | null
}

export function palabrasClave(t: string): Set<string> {
  return new Set(t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]{4,}/g) ?? [])
}

function mensajesAprobados(f: FilaAprendizaje): string[] {
  if (Array.isArray(f.mensajes_aprobados)) {
    const l = f.mensajes_aprobados.filter((m): m is string => typeof m === 'string' && m.trim() !== '')
    if (l.length) return l
  }
  return f.respuesta_aprobada?.trim() ? [f.respuesta_aprobada.trim()] : []
}

export function formatearAprendizaje(f: FilaAprendizaje): string {
  const msgs = mensajesAprobados(f)
  const cuerpo = msgs.length === 1
    ? `  Right contestó: ${msgs[0]}`
    : `  Right contestó en ${msgs.length} mensajes seguidos:\n${msgs.map((m, i) => `    ${i + 1}) ${m}`).join('\n')}`
  return `- Cliente dijo: ${f.pregunta.slice(0, 200)}\n${cuerpo}`
}

// Las filas aprobadas que más se parecen a lo que dijo el cliente.
export function elegirAprendizajes(texto: string, filas: FilaAprendizaje[], max = 5): FilaAprendizaje[] {
  const claves = palabrasClave(texto)
  if (claves.size === 0) return []
  const minimo = Math.min(2, claves.size)
  return filas
    .filter(f => mensajesAprobados(f).length > 0)
    .map(f => {
      const p = palabrasClave(f.pregunta)
      let n = 0
      claves.forEach(c => { if (p.has(c)) n++ })
      return { f, n }
    })
    .filter(x => x.n >= minimo)
    // Con igual coincidencia, primero lo que Right corrigió (lo que se mandó
    // tal cual lo que sugirió el bot enseña menos).
    .sort((a, b) => b.n - a.n || Number(b.f.origen !== 'usada') - Number(a.f.origen !== 'usada'))
    .slice(0, max)
    .map(x => x.f)
}

export function rankearAprendizajes(texto: string, filas: FilaAprendizaje[], max = 5): string {
  return elegirAprendizajes(texto, filas, max).map(formatearAprendizaje).join('\n')
}
