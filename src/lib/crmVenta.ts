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

// ── Reglas (sin IA) ─────────────────────────────────────────────────────
// Sacadas de revisar a mano los 157 chats (24/10). Una venta cerrada por WhatsApp
// siempre tuvo esta forma: el local pasa el alias / CBU / link de pago → el cliente
// manda el comprobante (foto o PDF) o avisa que transfirió → el local confirma
// ("Recibido!", "quedó registrada tu compra", "muchas gracias").
// Si en esa charla hay un pedido de la web (nº de pedido, "hice una compra") es un
// pago web. Si se habla de cambio, diferencia, devolución… puede ser postventa: ahí
// (y solo ahí) decide la IA.

const ARCHIVO_IMPORTADO = /foto no incluida|documento no incluido|attachment\.pdf|\.pdf\b/i
const AVISA_PAGO = /(paso|mando|env[ií]o|adjunto|ah[ií] (va|est[aá])) (el |tu )?comprobante|comprobante (de (la )?(transferencia|pago))|te transfer[ií]|ya (te )?(transfer[ií]|pagu[eé]|abon[eé]|lo pagu[eé])|ah[ií] (te )?(transfer[ií]|pagu[eé])/i
const DATOS_PAGO = /alias|\bcbu\b|\bcvu\b|botines\.right|naranja\.botines|mpago\.la|link de pago|mercadopago\.com/i
// Si el chat original se perdió (o el alias se pasó por otro lado) no queda el mensaje del
// local con el alias: alcanza con que el cliente haya hablado de pagar por transferencia.
const PAGO_HABLADO_POR_CLIENTE = /(hago|hice|hacer|hacemos|voy a hacer|hiciste)\s+(la\s+|una\s+)?transfer|con transferencia/i
const CONFIRMA = /recibid[oa]|registrada tu compra|gracias por (tu compra|elegirnos)|pago (confirmado|acreditado)|ya (est[aá] )?(confirmad|acreditad)/i
const GRACIAS = /gracias|perfecto|buen[ií]simo/i
const WEB = /pedido n[º°o.]|pedido #?\d{3,4}|#\d{3,4}\b|en relaci[oó]n a tu pedido|hic(e|imos) (una|la) compr|realic[eé] (una|la) compr|compr[eé] (en|por|desde) la (web|p[aá]gina)|en la web ya est|compra (desde|por|en) la (web|p[aá]gina)|n[uú]mero de (orden|pedido)/i
const POSTVENTA = /cambi(o|ar|amos|arlo|arlos|arla)\b|diferencia|ida y vuelta|devol|r[oó]tulo|a favor|reembols|no (nos )?lleg[oó] (el|tu) paquete/i

const texto = (m: MensajeVenta) => m.contenido || m.transcripcion || ''
const esPagoDelCliente = (m: MensajeVenta) =>
  m.direccion === 'in' && (esArchivo(m.tipo) || ARCHIVO_IMPORTADO.test(texto(m)) || AVISA_PAGO.test(texto(m)))

export type ResultadoReglas = 'venta' | 'web' | 'dudoso' | 'nada'

// El monto: el último precio que pasó el local antes del pago. Si en el mismo mensaje
// hay dos (transferencia / tarjeta), se elige según lo que dijo el cliente.
export function montoDeLaCharla(msgs: MensajeVenta[]): number | null {
  const pagaConTarjeta = msgs.some(m => m.direccion === 'in' && /tarjeta|cuotas|link/i.test(texto(m)))
  // Primero lo que pasó el local; si el chat original se perdió, lo que el cliente repitió.
  for (const lado of ['out', 'in'] as const) {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]
      if (m.direccion !== lado) continue
      const t = texto(m)
      const montos = [...t.matchAll(/\$\s?(\d{1,3}(?:[.,]\d{3})+|\d{4,7})/g)]
        .map(x => ({ valor: Number(x[1].replace(/[.,]/g, '')), despues: t.slice(x.index! + x[0].length, x.index! + x[0].length + 30) }))
        .filter(x => x.valor >= 20000)
      if (!montos.length) continue
      if (montos.length === 1) return montos[0].valor
      const conTarjeta = montos.find(x => /tarjeta|cuotas/i.test(x.despues))
      if (pagaConTarjeta && conTarjeta) return conTarjeta.valor
      return montos.find(x => !/tarjeta|cuotas/i.test(x.despues))?.valor ?? montos[0].valor
    }
  }
  return null
}

// Mira un pago puntual del cliente (posición f). null si no es un pago confirmado.
function evaluarPago(msgs: MensajeVenta[], f: number): { resultado: Exclude<ResultadoReglas, 'nada'>; monto: number | null } | null {
  if (!esPagoDelCliente(msgs[f])) return null
  const despues = msgs.slice(f + 1, f + 11).filter(m => m.direccion === 'out')
  // "Recibido" / "quedó registrada tu compra" es firme. Un "gracias" o "perfecto"
  // suelto no: la foto puede ser el diseño del personalizado (pasó) → que mire la IA.
  const firme = despues.some(m => CONFIRMA.test(texto(m)))
  const suelto = despues.slice(0, 3).some(m => GRACIAS.test(texto(m)))
  if (!firme && !suelto) return null

  let p = -1
  for (let i = f - 1; i >= Math.max(0, f - 25); i--) {
    const t = texto(msgs[i])
    if ((msgs[i].direccion === 'out' && DATOS_PAGO.test(t)) || (msgs[i].direccion === 'in' && PAGO_HABLADO_POR_CLIENTE.test(t))) { p = i; break }
  }
  const desde = Math.max(0, (p >= 0 ? p : f) - 12)
  const ventana = msgs.slice(desde, f + 7)
  // "El número de orden del anterior es #826" habla de otra compra: no la hace web.
  const esWeb = ventana.some(m => WEB.test(texto(m)) && !/anterior|otra compra|la vez pasada/i.test(texto(m)))

  if (esWeb) return { resultado: 'web', monto: null }
  // Fotos sin alias ni charla de pago (por ejemplo "llegaron los botines"): no es un pago.
  if (p < 0 && !ventana.some(m => m.direccion === 'in' && AVISA_PAGO.test(texto(m)))) return null
  // Cambio/diferencia de una compra ya hecha. Una pregunta del cliente antes de comprar
  // ("¿si me quedan chicos los puedo cambiar?") no cuenta.
  // Tampoco cuando el local explica la política ("se puede hacer el cambio siempre y cuando…").
  const POLITICA = /se (puede|pueden) (hacer )?(el )?cambi|siempre y cuando|tiene(n)? cambio|pol[ií]tica de cambio/i
  const postventa = ventana.some(m => POSTVENTA.test(texto(m)) && !POLITICA.test(texto(m)) && !(m.direccion === 'in' && /\?\s*$/.test(texto(m))))
  if (p < 0 || postventa || !firme) return { resultado: 'dudoso', monto: null }
  return { resultado: 'venta', monto: montoDeLaCharla(msgs.slice(desde, f)) }
}

// El último pago del cliente que el local confirmó.
export function clasificarPorReglas(msgs: MensajeVenta[]): { resultado: ResultadoReglas; monto: number | null } {
  for (let f = msgs.length - 1; f >= 0; f--) {
    const r = evaluarPago(msgs, f)
    if (r) return r
  }
  return { resultado: 'nada', monto: null }
}

// Todos los pagos de un historial completo (para auditar las reglas contra los chats).
// Varios archivos del mismo pago (foto + PDF) cuentan una vez.
export function pagosDelHistorial(msgs: MensajeVenta[]): { fecha: string; resultado: ResultadoReglas; monto: number | null }[] {
  const out: { fecha: string; resultado: ResultadoReglas; monto: number | null; i: number }[] = []
  msgs.forEach((_, f) => {
    const r = evaluarPago(msgs, f)
    if (!r) return
    const prev = out[out.length - 1]
    if (prev && f - prev.i <= 6) return
    out.push({ ...r, fecha: msgs[f].timestamp, i: f })
  })
  return out.map(({ i: _i, ...r }) => r)
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
- "pedido_web": el cliente ya había comprado en la página web (menciona un número de pedido, "hice una compra", "realicé una compra", "compré en la web") y por WhatsApp solo manda el comprobante, pregunta por el pedido o confirma datos. Si en la charla no se eligió el producto ni se habló de precio o alias antes del comprobante, es "pedido_web".
- "postventa": todo lo que pasa con una compra ya hecha: el envío o el Uber de un pedido, avisar que llegó, seguimiento, cambios de talle o de modelo, reemplazos porque no había stock o el paquete no llegó, devoluciones, pagar el envío o la diferencia de un cambio, regalos por las molestias.
- "consulta": preguntas de precio o stock, pidió el alias, dijo que va a pagar o lo piensa, o nada de lo anterior.
Si en la charla aparece un cambio o una devolución (el cliente devolvió un producto, pide otro talle o modelo en lugar del que compró, o se habla de "la diferencia" o de "a favor"), es "postventa" aunque mande comprobantes: lo que paga es la diferencia o el envío, y el comprobante puede ser el de la compra original.
Ojo: las fotos que manda el cliente pueden ser botines, capturas de la tienda o del chat. Solo es comprobante si se ve un pago (monto, fecha, operación, destinatario).
Lo primero que tenés que hacer es mirar el ÚLTIMO archivo o foto del cliente y decidir si es un comprobante de transferencia o de pago (se ve un banco o billetera, monto, fecha, número de operación o destinatario). Si no lo es (una foto de botines, una captura de la tienda, un rótulo, un diseño), hay_comprobante es false. Si lo es, mirá la charla para decidir si es una venta nueva cerrada en este chat o el pago de un pedido de la web. Si en la charla el cliente elige el producto y habla de precio, talle o envío en este chat, y manda el comprobante, es "venta_nueva" con confianza "alta" aunque falte el mensaje del alias (a veces el chat se perdió y el cliente repite todo): no hace falta que el local ya haya confirmado el pago.
Si hay comprobante de una venta nueva, poné el monto (número, sin signos); si no, null.
El motivo es una frase corta en español que diga qué compró y cómo pagó (por ejemplo: "Nike Tiempo Blanco 39, transferencia de $85.000").
Usá confianza "alta" solo si no hay dudas.`

type Bloque =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'url'; url: string } }
  | { type: 'document'; source: { type: 'url'; url: string } }

// venta: compra nueva cerrada en el chat. pagoWeb: pedido de la web pagado por WhatsApp (va aparte).
export interface ResultadoVenta { venta: boolean; pagoWeb: boolean; tipo: string; motivo: string; monto: number | null }

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
  const pagoWeb = r.tipo === 'pedido_web' && r.hay_comprobante && r.confianza === 'alta'
  return { venta, pagoWeb, tipo: r.tipo, motivo: r.motivo, monto: typeof r.monto === 'number' && r.monto > 0 ? r.monto : null }
}

function fechaDelPago(msgs: MensajeVenta[]): string {
  const archivo = [...msgs].reverse().find(m => m.direccion === 'in' && esArchivo(m.tipo))
  return new Date(archivo?.timestamp ?? msgs[msgs.length - 1]?.timestamp ?? Date.now()).toISOString()
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
    // La última venta o pago web de este chat (crm_ventas tiene las dos).
    const ultima = (await deps.sbFetch(`crm_ventas?conversacion_id=eq.${conversacionId}&select=detectada_at&order=detectada_at.desc&limit=1`).then(r => r.json()) as { detectada_at: string }[])[0]
    const anterior = ultima ? Date.parse(ultima.detectada_at) : null

    let msgs = await traerMensajes(deps, conversacionId)
    // Si ya se marcó una venta, solo cuenta lo que vino después (una compra nueva).
    if (anterior) {
      if (Date.now() - anterior < DIAS_ENTRE_VENTAS * 86400_000) return false
      msgs = msgs.filter(m => Date.parse(m.timestamp) > anterior)
    }
    if (!valeLaPenaRevisar(msgs, disparador)) return false

    // Cada foto o PDF nuevo del cliente se mira SIEMPRE con la IA (ve el archivo): puede ser
    // un comprobante de transferencia, y ahí decide si es una venta cerrada en el chat o el
    // pago de un pedido de la web. No espera a que el local confirme. Para el resto
    // (texto, revisiones) van primero las reglas (gratis) y la IA solo en los dudosos.
    const ultimo = msgs[msgs.length - 1]
    const archivoNuevo = disparador === 'cliente' && ultimo.direccion === 'in' && esArchivo(ultimo.tipo) && !!ultimo.media_url
    const reglas = archivoNuevo ? { resultado: 'dudoso' as const, monto: null } : clasificarPorReglas(msgs)
    if (reglas.resultado === 'nada') return false
    const r: ResultadoVenta | null = reglas.resultado === 'venta'
      ? { venta: true, pagoWeb: false, tipo: 'venta_nueva', motivo: 'Pago confirmado en el chat (reglas)', monto: reglas.monto }
      : reglas.resultado === 'web'
        ? { venta: false, pagoWeb: true, tipo: 'pedido_web', motivo: 'Pedido de la web pagado por WhatsApp (reglas)', monto: null }
        : await evaluarVenta(deps, msgs)
    if (!r) return false
    if (r.pagoWeb) {
      // Pedido de la web que mandó el comprobante por WhatsApp: se guarda aparte,
      // no es una venta del CRM y el chat no cambia de estado.
      await deps.sbFetch('crm_ventas', {
        method: 'POST',
        body: JSON.stringify({ conversacion_id: conversacionId, detectada_at: fechaDelPago(msgs), monto: r.monto, motivo: r.motivo.slice(0, 300), origen: 'ia', tipo: 'web' }),
      })
      return false
    }
    if (!r.venta) return false

    const motivo = (r.monto ? `$${Math.round(r.monto).toLocaleString('es-AR')} · ` : '') + r.motivo
    // Fecha de la venta: la del último comprobante (foto/archivo) del cliente, así una
    // revisión de días anteriores no la anota como si fuera de hoy.
    const ahora = fechaDelPago(msgs)
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
