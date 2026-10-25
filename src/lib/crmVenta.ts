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
    venta_concretada: { type: 'boolean' },
    hay_comprobante: { type: 'boolean' },
    confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
    monto: { type: ['number', 'null'] },
    motivo: { type: 'string' },
  },
  required: ['venta_concretada', 'hay_comprobante', 'confianza', 'monto', 'motivo'],
}

const SYSTEM_VENTA = `Leés la charla de WhatsApp entre un cliente y Right Botines (tienda de botines de fútbol) y decidís si la VENTA YA SE CONCRETÓ. Junto con la charla pueden venir las fotos o archivos que mandó el cliente.
Es venta concretada si pasa cualquiera de estas:
- El cliente mandó un comprobante de pago (transferencia, Mercado Pago, depósito): una captura o PDF con monto, fecha, destinatario u operación. Mirá las imágenes: si alguna es un comprobante, es venta aunque el local todavía no haya contestado.
- El cliente avisó que pagó (link de pago, tarjeta, efectivo, seña) y el local lo confirmó, o se pidieron/mandaron datos de envío o se coordinó el retiro de una compra ya pagada.
- El local confirma que recibió el pago o que ya despachó / preparó el pedido.
NO es venta si solo preguntó precios o stock, pidió el alias o los datos para transferir, dijo que va a pagar o que lo piensa, o mandó fotos de botines, capturas de la tienda o de un chat.
Si hay comprobante, poné el monto (número, sin signos) si se lee; si no, null.
El motivo es una frase corta en español (por ejemplo: "Mandó comprobante de transferencia por $85.000").
Usá confianza "alta" cuando se ve el comprobante o el pago está confirmado por el local.`

type Bloque =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'url'; url: string } }
  | { type: 'document'; source: { type: 'url'; url: string } }

export interface ResultadoVenta { venta: boolean; motivo: string; monto: number | null }

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
  const r = JSON.parse(raw) as { venta_concretada: boolean; hay_comprobante: boolean; confianza: string; monto: number | null; motivo: string }
  // Con comprobante a la vista alcanza con confianza media; sin comprobante, tiene que estar clarísimo.
  const venta = r.venta_concretada && (r.confianza === 'alta' || (r.confianza === 'media' && r.hay_comprobante))
  return { venta, motivo: r.motivo, monto: typeof r.monto === 'number' && r.monto > 0 ? r.monto : null }
}

// Revisa un chat y, si hubo venta, la marca. Devuelve true si la marcó.
export async function detectarVenta(deps: DepsVenta, conversacionId: string, disparador: Disparador): Promise<boolean> {
  try {
    if (!deps.anthropicKey) return false
    const conv = (await deps.sbFetch(`wsp_conversaciones?id=eq.${conversacionId}&select=venta_detectada_at&limit=1`).then(r => r.json()) as { venta_detectada_at: string | null }[])[0]
    if (!conv) return false
    const anterior = conv.venta_detectada_at ? Date.parse(conv.venta_detectada_at) : null

    let msgs = (await deps.sbFetch(`wsp_mensajes?conversacion_id=eq.${conversacionId}&select=direccion,tipo,contenido,transcripcion,media_url,timestamp&order=timestamp.desc&limit=30`).then(r => r.json()) as MensajeVenta[]).reverse()
    // Si ya se marcó una venta, solo cuenta lo que vino después (una compra nueva).
    if (anterior) {
      if (Date.now() - anterior < DIAS_ENTRE_VENTAS * 86400_000) return false
      msgs = msgs.filter(m => Date.parse(m.timestamp) > anterior)
    }
    if (!valeLaPenaRevisar(msgs, disparador)) return false

    const r = await evaluarVenta(deps, msgs)
    if (!r?.venta) return false

    const motivo = (r.monto ? `$${Math.round(r.monto).toLocaleString('es-AR')} · ` : '') + r.motivo
    await deps.sbFetch(`wsp_conversaciones?id=eq.${conversacionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ estado: 'Venta concretada', venta_detectada_at: new Date().toISOString(), venta_detectada_motivo: motivo.slice(0, 200) }),
    })
    return true
  } catch (err) {
    console.error('venta: error al detectar la venta', err)
    return false
  }
}
