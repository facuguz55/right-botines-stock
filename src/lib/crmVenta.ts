// Ventas que el CRM detecta solo. Lo usan el webhook de WhatsApp (cuando escribe
// el cliente) y api/crm-detectar-venta.ts (cuando contesta el local, y para
// revisar chats recientes). Corre en las funciones de Vercel: solo fetch, sin supabase-js.
//
// La venta queda marcada en wsp_conversaciones.venta_detectada_at: ese es el dato
// que cuentan las estadísticas. El estado del chat cambia con cada mensaje
// (Sin leer, Respondido…), así que no sirve para contar ventas.

export interface DepsVenta {
  sbFetch: (path: string, options?: RequestInit) => Promise<Response>
  anthropicKey: string
  modelo?: string
}

export interface MensajeVenta {
  direccion: 'in' | 'out'
  tipo: string
  contenido: string | null
  transcripcion: string | null
  media_url: string | null
  timestamp: string
  automatico?: string | null
}

export type Disparador = 'cliente' | 'local' | 'revision'

export const PISTAS_PAGO = /transferenc|transfer[ií]|comprobante|alias|cbu|cvu|mercado ?pago|\bmp\b|pagu[eé]|pag[oó]\b|abon[eé]|se[ñn]a\b|dep[oó]sit|link de pago|tarjeta|efectivo/i
export const PISTAS_ENVIO = /\bdni\b|domicilio|direcci[oó]n|c[oó]digo postal|\bcp\b|localidad|provincia|\bcalle\b|barrio|\b\d{7,8}\b|retir(o|ar|a)\b|env[ií]o/i
export const PISTAS_CONFIRMA = /recib|lleg[oó]|acredit|confirm|perfecto|gracias|listo|ya (te )?(lo )?(despach|envi|mand|prepar)|seguimiento|tracking|c[oó]digo de env/i

// Si ya hubo una venta en este chat hace menos de esto, no se busca otra (una
// misma compra genera muchos mensajes). Pasado ese tiempo, es otra compra.
const DIAS_ENTRE_VENTAS = 4

const esArchivo = (tipo: string) => tipo === 'image' || tipo === 'document'

// Filtro barato para no llamar a la IA en cada mensaje.
export function valeLaPenaRevisar(msgs: MensajeVenta[], disparador: Disparador): boolean {
  if (!msgs.length) return false
  const ultimo = msgs[msgs.length - 1]
  const hayArchivoDelCliente = msgs.some(m => m.direccion === 'in' && esArchivo(m.tipo))
  const texto = msgs.map(m => m.contenido || m.transcripcion || '').join('\n')
  const hablaronDePago = PISTAS_PAGO.test(texto)
  if (disparador === 'revision') return hayArchivoDelCliente || hablaronDePago
  if (disparador === 'local') {
    // El local confirmó algo después de un comprobante o de hablar de pago.
    return (hayArchivoDelCliente || hablaronDePago) && PISTAS_CONFIRMA.test(ultimo.contenido ?? '')
  }
  // Escribió el cliente: mandó una foto o archivo (puede ser el comprobante),
  // o habló de pago/envío.
  const t = ultimo.contenido || ultimo.transcripcion || ''
  return esArchivo(ultimo.tipo) || (hablaronDePago && (PISTAS_PAGO.test(t) || PISTAS_ENVIO.test(t)))
}

const VENTA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tipo: { type: 'string', enum: ['venta_nueva', 'pedido_web', 'postventa', 'consulta'] },
    hay_comprobante: { type: 'boolean' },
    confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
    monto: { type: ['number', 'null'] },
    motivo: { type: 'string' },
  },
  required: ['tipo', 'hay_comprobante', 'confianza', 'monto', 'motivo'],
}

// Revisado contra los chats reales (24/10): la mayoría de los falsos positivos eran
// postventa (cambios por falta de stock, envíos y llegadas de pedidos ya pagados).
const SYSTEM_VENTA = `Leés la charla de WhatsApp entre un cliente y Right Botines (tienda de botines de fútbol) y decidís si en esta charla se CERRÓ UNA COMPRA NUEVA. Junto con la charla pueden venir las fotos o archivos que mandó el cliente.
Clasificá la charla en un tipo:
- "venta_nueva": el cliente eligió un producto en esta charla (o pidió uno que no había comprado antes) y PAGÓ: mandó el comprobante de la transferencia / Mercado Pago / depósito, o el local confirmó que recibió el pago, o quedó registrada la compra con pago o seña. Tiene que haber pago, no alcanza con que elija.
- "pedido_web": el cliente ya había comprado en la página web (menciona un número de pedido, "hice una compra", "compré en la web") y por WhatsApp solo manda el comprobante, pregunta por el pedido o confirma datos.
- "postventa": todo lo que pasa con una compra ya hecha: el envío o el Uber de un pedido, avisar que llegó, seguimiento, cambios de talle o de modelo, reemplazos porque no había stock o el paquete no llegó, devoluciones, pagar el envío o la diferencia de un cambio, regalos por las molestias.
- "consulta": preguntas de precio o stock, pidió el alias, dijo que va a pagar o lo piensa, o nada de lo anterior.
Si en la charla aparece un cambio o una devolución (el cliente devolvió un producto, pide otro talle o modelo en lugar del que compró, o se habla de "la diferencia" o de "a favor"), es "postventa" aunque mande comprobantes: lo que paga es la diferencia o el envío, y el comprobante puede ser el de la compra original.
Ojo: las fotos que manda el cliente pueden ser botines, capturas de la tienda o del chat. Solo es comprobante si se ve un pago (monto, fecha, operación, destinatario).
Si hay comprobante de una venta nueva, poné el monto (número, sin signos); si no, null.
El motivo es una frase corta en español que diga qué compró y cómo pagó (por ejemplo: "Nike Tiempo Blanco 39, transferencia de $85.000").
Usá confianza "alta" solo si no hay dudas.`

type Bloque =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'url'; url: string } }
  | { type: 'document'; source: { type: 'url'; url: string } }

export interface ResultadoVenta { venta: boolean; tipo: string; motivo: string; monto: number | null }

export async function evaluarVenta(deps: DepsVenta, msgs: MensajeVenta[]): Promise<ResultadoVenta | null> {
  const lineas = msgs.map(m => {
    const marca = m.tipo === 'image' ? '[foto] ' : m.tipo === 'document' ? '[archivo] ' : m.tipo === 'audio' ? '[audio] ' : ''
    return `${m.direccion === 'in' ? 'Cliente' : 'Local'}: ${marca}${(m.contenido || m.transcripcion || '').trim()}`.trim()
  })
  // Las últimas fotos/archivos del cliente: ahí suele estar el comprobante.
  const archivos = msgs.filter(m => m.direccion === 'in' && esArchivo(m.tipo) && m.media_url).slice(-3)
  const contenido: Bloque[] = [{ type: 'text', text: `Charla (de la más vieja a la más nueva):\n${lineas.join('\n')}` }]
  for (const a of archivos) {
    const esPdf = a.tipo === 'document' && /\.pdf(\?|$)/i.test(a.media_url!)
    if (a.tipo === 'image') contenido.push({ type: 'image', source: { type: 'url', url: a.media_url! } })
    else if (esPdf) contenido.push({ type: 'document', source: { type: 'url', url: a.media_url! } })
  }
  if (contenido.length > 1) contenido.push({ type: 'text', text: 'Arriba están las fotos/archivos que mandó el cliente (los más recientes).' })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': deps.anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: deps.modelo ?? 'claude-haiku-4-5',
      max_tokens: 300,
      system: SYSTEM_VENTA,
      output_config: { format: { type: 'json_schema', schema: VENTA_SCHEMA } },
      messages: [{ role: 'user', content: contenido }],
    }),
  })
  if (!res.ok) { console.error('venta: Anthropic respondió', res.status, await res.text().catch(() => '')); return null }
  const data = await res.json() as { content?: { type: string; text?: string }[] }
  const raw = data.content?.find(b => b.type === 'text')?.text
  if (!raw) return null
  const r = JSON.parse(raw) as { tipo: string; hay_comprobante: boolean; confianza: string; monto: number | null; motivo: string }
  // Solo cuentan las compras nuevas cerradas en el chat, y sin dudas.
  const venta = r.tipo === 'venta_nueva' && r.confianza === 'alta'
  return { venta, tipo: r.tipo, motivo: r.motivo, monto: typeof r.monto === 'number' && r.monto > 0 ? r.monto : null }
}

// Los últimos 30 mensajes del chat, del más viejo al más nuevo (hasta `hasta`, si viene).
export async function traerMensajes(deps: DepsVenta, conversacionId: string, hasta?: string): Promise<MensajeVenta[]> {
  const filtro = hasta ? `&timestamp=lte.${encodeURIComponent(hasta)}` : ''
  const res = await deps.sbFetch(`wsp_mensajes?conversacion_id=eq.${conversacionId}${filtro}&select=direccion,tipo,contenido,transcripcion,media_url,timestamp,automatico&order=timestamp.desc&limit=30`)
  return (await res.json() as MensajeVenta[]).reverse()
}

// Revisa un chat y, si hubo venta, la marca. Devuelve true si la marcó.
export async function detectarVenta(deps: DepsVenta, conversacionId: string, disparador: Disparador): Promise<boolean> {
  try {
    if (!deps.anthropicKey) return false
    const conv = (await deps.sbFetch(`wsp_conversaciones?id=eq.${conversacionId}&select=venta_detectada_at&limit=1`).then(r => r.json()) as { venta_detectada_at: string | null }[])[0]
    if (!conv) return false
    const anterior = conv.venta_detectada_at ? Date.parse(conv.venta_detectada_at) : null

    let msgs = await traerMensajes(deps, conversacionId)
    // Si ya se marcó una venta, solo cuenta lo que vino después (una compra nueva).
    if (anterior) {
      if (Date.now() - anterior < DIAS_ENTRE_VENTAS * 86400_000) return false
      msgs = msgs.filter(m => Date.parse(m.timestamp) > anterior)
    }
    if (!valeLaPenaRevisar(msgs, disparador)) return false

    const r = await evaluarVenta(deps, msgs)
    if (!r?.venta) return false

    const motivo = (r.monto ? `$${Math.round(r.monto).toLocaleString('es-AR')} · ` : '') + r.motivo
    const ahora = new Date().toISOString()
    await deps.sbFetch(`wsp_conversaciones?id=eq.${conversacionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ estado: 'Venta concretada', venta_detectada_at: ahora, venta_detectada_motivo: motivo.slice(0, 200) }),
    })
    // Una fila por venta (tabla crm_ventas): monto y si la cerró el bot.
    // El bot guarda sus mensajes con automatico = 'bot'.
    const atendio = msgs.some(m => m.direccion === 'out' && m.automatico === 'bot') ? 'bot' : 'humano'
    await deps.sbFetch('crm_ventas', {
      method: 'POST',
      body: JSON.stringify({ conversacion_id: conversacionId, detectada_at: ahora, monto: r.monto, motivo: r.motivo.slice(0, 300), origen: 'ia', atendio }),
    }).catch(err => console.error('venta: no se pudo guardar en crm_ventas', err))
    return true
  } catch (err) {
    console.error('venta: error al detectar la venta', err)
    return false
  }
}
