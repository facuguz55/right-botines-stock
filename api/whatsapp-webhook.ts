import {
  TIPOS_BOTIN,
  busquedaVigente,
  decidirBusqueda,
  detectarBusqueda,
  respuestaSugeridaBusqueda,
  resumirStock,
  type StockResumen,
  talleIaEsConfiable,
  tipoIaEsConfiable,
  coincidenciaModelo,
  extraerModeloBuscado,
  parseModeloQuery,
  vocabularioCatalogo,
  type EstadoBusqueda,
  combinarBusqueda,
  respuestaPorModeloFoto,
  tipoDeCategoria,
} from '../src/lib/crmBusqueda'
import { llamarClasificadorIA, rankearAprendizajes, type FilaAprendizaje } from '../src/lib/botIa'
import { humanizar } from '../src/lib/crmTexto'
import { variantesWaId } from '../src/lib/crmWaId'
import { decidirAutomatico } from '../src/lib/crmHorario'
import { enviarPush } from '../src/lib/webpush'
import {
  esConsultaEnvioSegura,
  extraerNumeroPedido,
  mencionaPedido,
  respuestaEstadoPedido,
  sufijoTelefono,
  type PedidoTN,
} from '../src/lib/crmPedidos'
import { detectarVenta } from '../src/lib/crmVenta'

export const config = { runtime: 'edge' }

const SB_URL = process.env.SUPABASE_URL ?? ''
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''
const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN ?? ''
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID ?? ''
const WA_APP_SECRET = process.env.WA_APP_SECRET ?? ''
// Reutiliza la misma key de Anthropic que ya usa el asistente de stock
// (src/services/aiChat.ts) — nunca se configuraron AI_API_KEY/AI_API_URL acá,
// así que la clasificación automática de mensajes jamás se había ejecutado.
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? process.env.VITE_ANTHROPIC_API_KEY ?? ''
const ANTHROPIC_MODEL = 'claude-haiku-4-5'
// Las mismas credenciales de TiendaNube que usan api/tiendanube.ts y
// api/tn-webhook.ts — para leer en vivo el estado/seguimiento de un pedido.
const TN_STORE_ID = process.env.TN_STORE_ID ?? ''
const TN_TOKEN = process.env.TN_TOKEN ?? ''

// Verifica que el POST venga realmente de Meta: recalcula el HMAC-SHA256 del
// body crudo con el App Secret y lo compara contra el header que manda Meta
// (mismo patrón que verifyHmac en api/tn-webhook.ts, adaptado al formato hex
// con prefijo "sha256=" que usa Meta en vez del base64 de TiendaNube).
// Falla CERRADO si falta el secret (el handler ya corta antes con 503 en ese
// caso, así que llegar acá sin WA_APP_SECRET no debería pasar — pero un
// "true" por defecto aceptaría cualquier POST sin firma si algo cambia el
// orden de los chequeos más adelante).
async function verifyMetaSignature(req: Request, rawBody: string): Promise<boolean> {
  if (!WA_APP_SECRET) return false
  const header = req.headers.get('x-hub-signature-256') ?? ''
  const expectedPrefix = 'sha256='
  if (!header.startsWith(expectedPrefix)) return false
  const sigHex = header.slice(expectedPrefix.length)
  try {
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey('raw', enc.encode(WA_APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const digest = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody))
    const computedHex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
    if (computedHex.length !== sigHex.length) return false
    let diff = 0
    for (let i = 0; i < computedHex.length; i++) diff |= computedHex.charCodeAt(i) ^ sigHex.charCodeAt(i)
    return diff === 0
  } catch { return false }
}

// Meta manda solo un media id en el mensaje (image.id / audio.id) — hay que
// pedirle a la Graph API la URL temporal real (vence en minutos) y bajar los
// bytes con el mismo token, para recién ahí poder subirlo a nuestro storage
// y tener una URL pública estable que el CRM pueda mostrar después.
async function descargarYSubirMedia(mediaId: string, mimeType: string): Promise<string | null> {
  const WA_TOKEN = process.env.WA_TOKEN ?? ''
  if (!WA_TOKEN) return null
  try {
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${WA_TOKEN}` },
    })
    if (!metaRes.ok) return null
    const meta = await metaRes.json() as { url?: string }
    if (!meta.url) return null

    const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${WA_TOKEN}` } })
    if (!fileRes.ok) return null
    const bytes = await fileRes.arrayBuffer()

    const ext = mimeType.split('/')[1]?.split(';')[0] || 'bin'
    const path = `${mediaId}.${ext}`
    const uploadRes = await fetch(`${SB_URL}/storage/v1/object/crm-media/${path}`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': mimeType,
        'x-upsert': 'true',
      },
      body: bytes,
    })
    if (!uploadRes.ok) return null

    return `${SB_URL}/storage/v1/object/public/crm-media/${path}`
  } catch (err) {
    console.error('Error descargando media de WhatsApp:', err)
    return null
  }
}

async function sbFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers as Record<string, string> | undefined),
    },
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`sbFetch ${path} → ${res.status}: ${txt}`)
  }
  return res
}

// Devuelve también no_leidos actual: el llamador lo necesita para incrementar
// en vez de pisarlo con 1 fijo (ver el PATCH más abajo).
async function getOrCreateConversation(
  waContactId: string, name: string | null, phone: string | null,
): Promise<{ id: string; noLeidosActual: number; silenciada: boolean; bloqueada: boolean }> {
  // El mismo celular puede llegar con o sin el 9 (ver crmWaId.ts): se buscan las dos formas.
  const candidatos = variantesWaId(waContactId).map(encodeURIComponent).join(',')
  const existing = await sbFetch(`wsp_conversaciones?wa_contact_id=in.(${candidatos})&select=id,no_leidos,silenciada_hasta,bloqueada&limit=1`)
  const rows = await existing.json() as { id: string; no_leidos: number | null; silenciada_hasta: string | null; bloqueada: boolean | null }[]
  if (rows[0]) {
    return {
      id: rows[0].id,
      noLeidosActual: rows[0].no_leidos ?? 0,
      // Menú del chat (migración 058): silenciada = sin aviso al celular; bloqueada = se guarda y nada más.
      silenciada: !!rows[0].silenciada_hasta && new Date(rows[0].silenciada_hasta).getTime() > Date.now(),
      bloqueada: rows[0].bloqueada === true,
    }
  }

  const clienteRes = await sbFetch('crm_clientes', {
    method: 'POST',
    body: JSON.stringify({ wa_contact_id: waContactId, nombre: name, telefono: phone }),
  })
  const cliente = (await clienteRes.json() as { id: string }[])[0]

  const convRes = await sbFetch('wsp_conversaciones', {
    method: 'POST',
    body: JSON.stringify({
      wa_contact_id: waContactId,
      crm_cliente_id: cliente.id,
      nombre: name || phone || waContactId,
      telefono: phone,
    }),
  })
  const conv = (await convRes.json() as { id: string }[])[0]
  return { id: conv.id, noLeidosActual: 0, silenciada: false, bloqueada: false }
}

// Bienvenida y ausencia automáticas (tabla crm_mensajes_auto, empiezan apagadas).
// Se mandan como respuesta al mensaje que el cliente acaba de mandar, o sea dentro
// de la ventana de 24 horas, así que no necesitan plantilla. Nunca rompen el flujo
// del webhook: si algo falla se anota y se sigue.
async function mensajeAnteriorYAusencia(conversacionId: string): Promise<{ anterior: Date | null; ausencia: Date | null }> {
  try {
    const [ant, aus] = await Promise.all([
      sbFetch(`wsp_mensajes?conversacion_id=eq.${conversacionId}&select=timestamp&order=timestamp.desc&limit=1`).then(r => r.json()),
      sbFetch(`wsp_mensajes?conversacion_id=eq.${conversacionId}&automatico=eq.ausencia&select=timestamp&order=timestamp.desc&limit=1`).then(r => r.json()),
    ]) as [{ timestamp: string }[], { timestamp: string }[]]
    return { anterior: ant[0] ? new Date(ant[0].timestamp) : null, ausencia: aus[0] ? new Date(aus[0].timestamp) : null }
  } catch (err) {
    console.error('auto: no se pudo leer el historial', err)
    return { anterior: null, ausencia: null }
  }
}

async function enviarMensajeAutomatico(
  conversacionId: string, waContactId: string, previo: { anterior: Date | null; ausencia: Date | null },
): Promise<void> {
  try {
    const filas = await sbFetch('crm_mensajes_auto?select=clave,activo,texto').then(r => r.json()) as { clave: string; activo: boolean; texto: string }[]
    const bienvenida = filas.find(f => f.clave === 'bienvenida')
    const ausencia = filas.find(f => f.clave === 'ausencia')
    const cual = decidirAutomatico({
      ahora: new Date(),
      mensajeAnteriorAt: previo.anterior,
      ultimaAusenciaAt: previo.ausencia,
      bienvenidaActiva: !!bienvenida?.activo,
      ausenciaActiva: !!ausencia?.activo,
    })
    if (!cual) return
    const texto = humanizar((cual === 'bienvenida' ? bienvenida : ausencia)?.texto ?? '')
    if (!texto) return

    const res = await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WA_TOKEN ?? ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: waContactId, type: 'text', text: { body: texto } }),
    })
    if (!res.ok) { console.error('auto: WhatsApp rechazó el mensaje', res.status, await res.text().catch(() => '')); return }
    const waId = ((await res.json()) as { messages?: { id: string }[] }).messages?.[0]?.id ?? null
    await sbFetch('wsp_mensajes', {
      method: 'POST',
      body: JSON.stringify({ conversacion_id: conversacionId, direccion: 'out', tipo: 'text', contenido: texto, wa_message_id: waId, automatico: cual }),
    })
  } catch (err) {
    console.error('auto: error en el mensaje automático', err)
  }
}

// ── Lo que aprende el bot ────────────────────────────────────────────────
// Las respuestas que los dueños aprobaron en la pantalla "Aprendizaje" del CRM
// (tabla crm_aprendizajes) se le pasan a la IA como ejemplos de casos parecidos
// (ranking en src/lib/botIa.ts, el mismo que usa la prueba del bot).
async function buscarAprendizajes(texto: string): Promise<string> {
  try {
    const res = await sbFetch('crm_aprendizajes?estado=eq.aprobado&select=pregunta,respuesta_aprobada,mensajes_aprobados,origen&order=revisado_en.desc&limit=120')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return rankearAprendizajes(texto, await res.json() as FilaAprendizaje[])
  } catch (err) {
    console.error('aprendizajes: no se pudieron leer', err)
    return ''
  }
}

// ── Ventas que el CRM detecta solo ──────────────────────────────────────
// La lógica vive en src/lib/crmVenta.ts (la usa también api/crm-detectar-venta.ts
// cuando contesta el local). Mira la charla y las fotos/archivos del cliente: si
// hay comprobante o pago confirmado, marca venta_detectada_at, que es lo que cuentan
// las estadísticas del CRM.

// Stock real para el talle buscado (y el modelo, si lo nombró), contado POR
// TIPO — sin filtrar por el tipo pedido, para poder decir "de Fútbol 5 no,
// pero de Fútbol 11 sí". La respuesta sugerida sale de estos números; la IA
// nunca redacta nada sobre stock.
async function contarStock(estado: EstadoBusqueda): Promise<StockResumen | null> {
  if (!estado.talle) return null
  try {
    const path = `modelos?select=marca,modelo,categoria,modelo_talles!inner(cantidad)`
      + `&modelo_talles.talle_arg=eq.${estado.talle}&modelo_talles.cantidad=gt.0`
    let rows = await (await sbFetch(path)).json() as { marca: string; modelo: string; categoria: string | null }[]
    if (estado.modelo) {
      const q = parseModeloQuery(estado.modelo)
      rows = rows.filter(r => coincidenciaModelo(r, q).pasa)
    }
    return resumirStock(rows.map(r => r.categoria))
  } catch (err) {
    console.error('No se pudo consultar el stock para la respuesta sugerida:', err)
    return null
  }
}

// Estado real de un pedido, en vivo desde TiendaNube (tracking incluido).
// Tope de 3,5 s: el webhook entero tiene que responderle a Meta a tiempo.
async function fetchPedidoTNEnVivo(tnOrderId: number): Promise<PedidoTN | null> {
  if (!TN_STORE_ID || !TN_TOKEN) {
    console.error('Sin TN_STORE_ID/TN_TOKEN: no se puede leer el estado del pedido')
    return null
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 3500)
  try {
    const res = await fetch(`https://api.tiendanube.com/v1/${TN_STORE_ID}/orders/${tnOrderId}`, {
      headers: { Authentication: `bearer ${TN_TOKEN}`, 'User-Agent': 'RightBotinesStock (contacto@rightbotines.com)' },
      signal: ctrl.signal,
    })
    if (!res.ok) {
      console.error('TN orders/', tnOrderId, '→', res.status)
      return null
    }
    return await res.json() as PedidoTN
  } catch (err) {
    console.error('No se pudo leer el pedido de TiendaNube:', err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

// El pedido por el que pregunta: el número que haya mencionado o, si no, el
// más reciente de su teléfono (en tn_clientes o en la orden misma — ver la
// migración 040). Se busca en la copia local de Supabase (rápido) y recién
// ese pedido puntual se pide en vivo a TiendaNube.
async function buscarPedidoDelCliente(telefono: string | null, numero: number | null): Promise<PedidoTN | null> {
  try {
    let tnOrderId: number | null = null
    if (numero) {
      const rows = await (await sbFetch(`tn_ordenes?number=eq.${numero}&select=tn_order_id&limit=1`)).json() as { tn_order_id: number }[]
      tnOrderId = rows[0]?.tn_order_id ?? null
    }
    const suf = sufijoTelefono(telefono)
    if (!tnOrderId && suf) {
      const clientes = await (await sbFetch(`tn_clientes?telefono_digitos=like.*${suf}&select=tn_customer_id&limit=5`)).json() as { tn_customer_id: number }[]
      const ids = clientes.map(c => c.tn_customer_id)
      const filtro = ids.length
        ? `or=(telefono_digitos.like.*${suf},customer_tn_id.in.(${ids.join(',')}))`
        : `telefono_digitos=like.*${suf}`
      const rows = await (await sbFetch(`tn_ordenes?${filtro}&select=tn_order_id&order=tn_created_at.desc&limit=1`)).json() as { tn_order_id: number }[]
      tnOrderId = rows[0]?.tn_order_id ?? null
    }
    return tnOrderId ? await fetchPedidoTNEnVivo(tnOrderId) : null
  } catch (err) {
    console.error('No se pudo buscar el pedido del cliente (¿falta la migración 040?):', err)
    return null
  }
}

// Intenta con todos los campos y, si falla (columnas de una migración que
// todavía no se aplicó), reintenta sin los campos opcionales — así un deploy
// antes de correr la migración no deja al CRM sin clasificar.
async function sbWriteConFallback(path: string, method: 'POST' | 'PATCH', body: Record<string, unknown>, opcionales: string[]) {
  try {
    return await sbFetch(path, { method, body: JSON.stringify(body) })
  } catch (err) {
    if (!opcionales.some(k => k in body)) throw err
    console.error(`${method} ${path} falló, reintentando sin ${opcionales.join(', ')} (¿falta una migración?):`, err)
    const sinOpcionales = Object.fromEntries(Object.entries(body).filter(([k]) => !opcionales.includes(k)))
    return await sbFetch(path, { method, body: JSON.stringify(sinOpcionales) })
  }
}

async function classifyWithAI(text: string, conversacionId: string, messageId: string) {
  try {
    // Contexto: últimos mensajes de la charla, lo que ya se sabía que buscaba
    // (select=* para no romper si falta alguna migración de búsqueda) y los
    // nombres del catálogo, para reconocer modelos puntuales ("los f50").
    const [mensajesRes, estadoRes, catalogoRes] = await Promise.all([
      sbFetch(`wsp_mensajes?conversacion_id=eq.${conversacionId}&select=direccion,contenido,transcripcion&order=timestamp.desc&limit=12`),
      sbFetch(`wsp_conversaciones?id=eq.${conversacionId}&select=*&limit=1`)
        .catch(err => { console.error('No se pudo leer la búsqueda guardada:', err); return null }),
      sbFetch('modelos?select=marca,modelo')
        .catch(err => { console.error('No se pudo leer el catálogo para detectar modelos:', err); return null }),
    ])
    const recientes = (await mensajesRes.json() as { direccion: 'in' | 'out'; contenido: string | null; transcripcion: string | null }[])
      .reverse()
      .map(m => ({ direccion: m.direccion, texto: (m.contenido || m.transcripcion || '').trim() }))
      .filter(m => m.texto)
    const estadoRow = estadoRes ? (await estadoRes.json() as Record<string, unknown>[])[0] ?? {} : {}
    const busquedaPrevia = busquedaVigente(estadoRow as Parameters<typeof busquedaVigente>[0])
    const catalogo = catalogoRes ? await catalogoRes.json() as { marca: string; modelo: string }[] : []

    const ultimoMensajeLocal = [...recientes].reverse().find(m => m.direccion === 'out')?.texto ?? null
    const textosCliente = recientes.filter(m => m.direccion === 'in').map(m => m.texto)
    const contexto = recientes.map(m => `${m.direccion === 'in' ? 'Cliente' : 'Local'}: ${m.texto}`).join('\n')

    // 1) Reglas deterministas sobre el mensaje nuevo. 2) La IA con contexto,
    // validada: solo se le cree un talle que el cliente escribió y un tipo si
    // el mensaje habla de canchas/tipos. Si las reglas vieron dos talles o dos
    // tipos distintos, es ambiguo y tampoco se le cree a la IA.
    // El modelo sale solo del catálogo real (nunca de la IA).
    const det = detectarBusqueda(text, { ultimoMensajeLocal })
    const modeloMsg = catalogo.length ? extraerModeloBuscado(text, vocabularioCatalogo(catalogo)) : null

    // Si el mensaje parece hablar de un pedido ya hecho, se busca en paralelo
    // con la IA (para no sumar su demora a la de TiendaNube).
    const telefono = (estadoRow.telefono as string | undefined) || (estadoRow.wa_contact_id as string | undefined) || null
    const numeroPedido = extraerNumeroPedido(text)
    let pedidoPromise: Promise<PedidoTN | null> | null = mencionaPedido(text)
      ? buscarPedidoDelCliente(telefono, numeroPedido)
      : null

    // Las respuestas aprobadas se buscan con lo último que escribió el cliente
    // (hasta 3 mensajes seguidos), igual que se guardan en "Aprendizaje".
    const bloqueCliente: string[] = []
    for (let i = recientes.length - 1; i >= 0 && recientes[i].direccion === 'in'; i--) bloqueCliente.unshift(recientes[i].texto)
    const aprendizajes = await buscarAprendizajes(bloqueCliente.slice(-3).join('\n') || text)
    const ia = await llamarClasificadorIA({
      apiKey: ANTHROPIC_API_KEY, modelo: ANTHROPIC_MODEL, contexto, busquedaGuardada: busquedaPrevia, text, aprendizajes,
    }).catch(err => {
      console.error('classifyWithAI: falló la llamada a Anthropic:', err)
      return null
    })

    // Pregunta por el estado de un pedido: lo decide la IA; sin IA, solo
    // frases inequívocas ("cuándo me llega", "seguimiento").
    const preguntaPorPedido = ia ? ia.intencion === 'estado_pedido' : esConsultaEnvioSegura(text)
    if (preguntaPorPedido && !pedidoPromise) pedidoPromise = buscarPedidoDelCliente(telefono, numeroPedido)
    const pedido = preguntaPorPedido && pedidoPromise ? await pedidoPromise : null
    // Con el pedido real, la respuesta sale de sus datos. Sin pedido, NUNCA
    // la de la IA (podría inventar un estado o un código): se pide el dato.
    const respuestaPedido = preguntaPorPedido
      ? (pedido
        ? respuestaEstadoPedido(pedido)
        : 'Hola buenas! Me pasás el número de pedido, o el nombre o mail con el que compraste? Así te lo busco 🤗')
      : null
    const tipoMsg = det.tipo
      ?? (det.tiposEncontrados.length === 0 && ia ? tipoIaEsConfiable(ia.tipo, text) : null)
    // El talle de la IA tiene que estar en ESTE mensaje: si no, un "gracias!"
    // después de haber dicho "38" volvería a disparar la sugerencia en cada
    // mensaje. Única excepción: el mensaje trae el tipo y no había talle
    // guardado (ej. antes de aplicar la migración) — ahí se acepta el talle
    // que el cliente dijo antes en la charla.
    const textosParaTalle = tipoMsg && !busquedaPrevia.talle ? textosCliente : [text]
    const talleMsg = det.talle
      ?? (det.tallesEncontrados.length === 0 && ia && talleIaEsConfiable(ia.talle_arg, textosParaTalle) ? ia.talle_arg : null)
    // Qué pasa con lo que ya buscaba: se combina (sigue la misma consulta),
    // arranca de cero (búsqueda nueva sin relación) o se borra (pasó a otro
    // tema: mayorista, un pedido ya hecho, un reclamo…).
    const { busqueda, aporto, limpiar } = decidirBusqueda({
      previa: busquedaPrevia,
      nuevo: { talle: talleMsg, tipo: tipoMsg, modelo: modeloMsg },
      intencion: ia?.intencion ?? (preguntaPorPedido ? 'estado_pedido' : null),
      categoria: ia?.categoria ?? null,
      cambioDeTema: ia?.cambio_de_tema === true,
    })

    if (!ia && !aporto && !respuestaPedido) return

    // La respuesta es una lista de mensajes cortos que se mandan uno atrás del
    // otro (como contesta Cami). Lo armado con datos reales (pedido, stock)
    // va en un solo mensaje.
    let mensajes: string[] = respuestaPedido ? [respuestaPedido] : ia?.mensajes_sugeridos ?? []
    if (aporto) {
      const stock = await contarStock(busqueda)
      const armada = respuestaSugeridaBusqueda(busqueda, stock)
      if (armada) mensajes = [armada]
    } else if (ia?.intencion === 'pedido_talle' && !respuestaPedido) {
      // Pregunta por stock sin decir talle/tipo/modelo reconocibles: la
      // respuesta libre de la IA podría afirmar que "hay de todo" sin mirar
      // nada (pasó: "en talle 32 tenemos F11 y F5" sin stock). Se pide el talle.
      mensajes = ['Hola buenas! Qué talle usás? Así me fijo qué tenemos 🤗']
    }

    // Pase lo que pase (IA o texto armado), al cliente no le llega nada con
    // pinta de IA: sin emojis, sin ¿ ¡, sin guiones largos ni viñetas.
    mensajes = mensajes.map(m => humanizar(m)).filter(Boolean)
    const respuesta = mensajes.length ? mensajes.join('\n\n') : null

    const categoria = ia?.categoria ?? (aporto ? 'Pedido de talles' : null)

    await sbWriteConFallback('wsp_ia_sugerencias', 'POST', {
      mensaje_id: messageId,
      conversacion_id: conversacionId,
      categoria_sugerida: categoria,
      // 'estado_pedido' solo si la respuesta es la armada con datos reales
      // (o el pedido del número): el chat ofrece mandarla con un click.
      intencion: respuestaPedido && !aporto ? 'estado_pedido' : ia?.intencion ?? (aporto ? 'pedido_talle' : null),
      // Solo en el mensaje que aportó algo: ahí va el botón de fotos / de
      // respuesta rápida, con lo acumulado de la charla (38 + F11 + F50).
      tipo_detectado: aporto ? busqueda.tipo : null,
      talle_detectado: aporto ? busqueda.talle : null,
      modelo_buscado: aporto ? busqueda.modelo ?? null : null,
      respuesta_sugerida: respuesta,
      mensajes_sugeridos: mensajes.length ? mensajes : null,
    }, ['modelo_buscado', 'mensajes_sugeridos'])

    if (categoria) {
      await sbFetch(`wsp_conversaciones?id=eq.${conversacionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ categoria }),
      })
    }

    if (aporto || limpiar) {
      await sbWriteConFallback(`wsp_conversaciones?id=eq.${conversacionId}`, 'PATCH', {
        busqueda_talle: busqueda.talle,
        busqueda_tipo: busqueda.tipo,
        busqueda_modelo: busqueda.modelo ?? null,
        busqueda_updated_at: limpiar ? null : new Date().toISOString(),
      }, ['busqueda_modelo']).catch(err => console.error('No se pudo guardar la búsqueda (¿falta la migración 038?):', err))
    }
  } catch (err) {
    console.error('AI classification failed:', err)
  }
}

// ── Fotos de clientes ──
//
// El cliente manda la foto del botín que quiere (captura de Instagram, de la
// web, una foto del producto…). La IA la compara con la lista del catálogo y
// dice cuál es; el stock se mira después en la base (la IA nunca opina sobre
// stock) y la respuesta queda como sugerencia para que Cami la revise.
const FOTO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    es_botin: { type: 'boolean' },
    indice: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    seguridad: { type: 'string', enum: ['alta', 'media', 'baja'] },
  },
  required: ['es_botin', 'indice', 'seguridad'],
}

async function identificarModeloEnFoto(
  mediaUrl: string, caption: string | null, catalogo: { marca: string; modelo: string }[],
): Promise<number | null> {
  if (!ANTHROPIC_API_KEY || catalogo.length === 0) return null
  const lista = catalogo.map((m, i) => `${i}: ${m.marca} ${m.modelo}`).join('\n')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 200,
      system: 'Sos el asistente de Right Botines, una tienda de botines de fútbol. Un cliente te manda por WhatsApp la foto de un botín que quiere. Tu trabajo es decir cuál de los modelos de la lista del catálogo es: mirá la marca, la línea (por ejemplo F50, Predator, Mercurial, Phantom, Copa) y el color. Elegí un índice de la lista solo si el botín de la foto coincide con esa línea y ese color; si es de otra marca, de una línea que no está o no se ve bien, devolvé indice null. Si la imagen no es un botín (comprobante, rótulo de envío, captura de chat, persona, etc.) devolvé es_botin false e indice null. Ante la duda, null: es preferible no sugerir nada a sugerir un modelo equivocado.',
      output_config: { format: { type: 'json_schema', schema: FOTO_SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: mediaUrl } },
          { type: 'text', text: `Catálogo:\n${lista}\n\n${caption ? `Texto que mandó el cliente con la foto: ${caption}\n\n` : ''}¿Cuál es el modelo de la foto?` },
        ],
      }],
    }),
  })
  if (!res.ok) {
    console.error('identificarModeloEnFoto: Anthropic respondió', res.status, await res.text().catch(() => ''))
    return null
  }
  const data = await res.json() as { stop_reason?: string; content?: { type: string; text?: string }[] }
  if (data.stop_reason === 'refusal' || data.stop_reason === 'max_tokens') return null
  const raw = data.content?.find(b => b.type === 'text')?.text
  if (!raw) return null
  try {
    const r = JSON.parse(raw) as { es_botin: boolean; indice: number | null; seguridad: string }
    if (!r.es_botin || r.indice == null || r.seguridad === 'baja') return null
    return Number.isInteger(r.indice) && r.indice >= 0 && r.indice < catalogo.length ? r.indice : null
  } catch {
    console.error('identificarModeloEnFoto: JSON inválido:', raw)
    return null
  }
}

// Devuelve true si reconoció el modelo y dejó la sugerencia armada.
async function analizarFotoCliente(
  mediaUrl: string, caption: string | null, conversacionId: string, messageId: string,
): Promise<boolean> {
  try {
    const [catRes, estadoRes] = await Promise.all([
      sbFetch('modelos?select=id,marca,modelo,categoria&order=marca.asc,modelo.asc'),
      sbFetch(`wsp_conversaciones?id=eq.${conversacionId}&select=*&limit=1`).catch(() => null),
    ])
    const catalogo = await catRes.json() as { id: string; marca: string; modelo: string; categoria: string | null }[]
    const indice = await identificarModeloEnFoto(mediaUrl, caption, catalogo)
    if (indice == null) return false
    const elegido = catalogo[indice]

    const estadoRow = estadoRes ? (await estadoRes.json() as Record<string, unknown>[])[0] ?? {} : {}
    const previa = busquedaVigente(estadoRow as Parameters<typeof busquedaVigente>[0])
    const talle = (caption ? detectarBusqueda(caption).talle : null) ?? previa.talle

    const filas = await (await sbFetch(
      `modelo_talles?modelo_id=eq.${encodeURIComponent(elegido.id)}&cantidad=gt.0&select=talle_arg`,
    )).json() as { talle_arg: number }[]
    const nombre = `${elegido.marca} ${elegido.modelo}`.trim()
    const respuesta = humanizar(respuestaPorModeloFoto(nombre, talle, filas.map(f => Number(f.talle_arg))))
    const busqueda = combinarBusqueda(previa, { talle, tipo: tipoDeCategoria(elegido.categoria), modelo: nombre })

    await sbWriteConFallback('wsp_ia_sugerencias', 'POST', {
      mensaje_id: messageId,
      conversacion_id: conversacionId,
      categoria_sugerida: 'Pedido de talles',
      intencion: 'pedido_talle',
      tipo_detectado: busqueda.tipo,
      talle_detectado: busqueda.talle,
      modelo_buscado: nombre,
      respuesta_sugerida: respuesta,
    }, ['modelo_buscado'])

    await sbFetch(`wsp_conversaciones?id=eq.${conversacionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ categoria: 'Pedido de talles' }),
    })
    await sbWriteConFallback(`wsp_conversaciones?id=eq.${conversacionId}`, 'PATCH', {
      busqueda_talle: busqueda.talle,
      busqueda_tipo: busqueda.tipo,
      busqueda_modelo: nombre,
      busqueda_updated_at: new Date().toISOString(),
    }, ['busqueda_modelo']).catch(err => console.error('No se pudo guardar la búsqueda de la foto:', err))
    return true
  } catch (err) {
    console.error('analizarFotoCliente falló:', err)
    return false
  }
}

// Guarda el aviso de entrega de Meta en el mensaje. Los avisos pueden llegar
// desordenados (visto antes que entregado), así que solo se avanza: nunca se
// pisa un "visto" con un "entregado". Si la migración 054 no está aplicada o
// el mensaje todavía no se guardó, se loguea y se sigue: nunca debe romper el
// webhook (Meta reintenta si no recibe 200).
async function registrarEstadoMensaje(st: { id: string; status: string; timestamp: string; errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[] }) {
  try {
    if (!['sent', 'delivered', 'read', 'failed'].includes(st.status)) return
    const filtro: Record<string, string> = {
      sent: '&wa_estado=is.null',
      delivered: '&or=(wa_estado.is.null,wa_estado.eq.sent)',
      read: '',
      failed: '&or=(wa_estado.is.null,wa_estado.neq.read)',
    }
    const err = st.errors?.[0]
    const body: Record<string, unknown> = {
      wa_estado: st.status,
      wa_estado_at: new Date(parseInt(st.timestamp) * 1000).toISOString(),
    }
    if (st.status === 'failed') {
      body.wa_error = `${err?.code ?? ''}: ${err?.error_data?.details || err?.message || err?.title || 'sin detalle'}`.trim()
    }
    await sbFetch(`wsp_mensajes?wa_message_id=eq.${encodeURIComponent(st.id)}${filtro[st.status]}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    console.error('No se pudo guardar el estado del mensaje (¿falta la migración 054?):', err)
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  if (!WA_APP_SECRET) {
    return new Response(JSON.stringify({ error: 'Webhook no configurado (falta WA_APP_SECRET)' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const rawBody = await req.text()

    if (!await verifyMetaSignature(req, rawBody)) {
      return new Response('Invalid signature', { status: 401 })
    }

    const body = JSON.parse(rawBody) as {
      entry?: {
        changes?: {
          value?: {
            messages?: {
              from: string
              id: string
              timestamp: string
              type: string
              // Cuando el cliente desliza para responder un mensaje, WhatsApp manda el id del citado.
              context?: { id?: string }
              text?: { body: string }
              image?: { id: string; mime_type: string; caption?: string }
              document?: { id: string; mime_type: string; caption?: string; filename?: string }
              audio?: { id: string; mime_type: string }
            }[]
            contacts?: { profile?: { name?: string }; wa_id: string }[]
            statuses?: {
              id: string
              status: string
              timestamp: string
              errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[]
            }[]
          }
        }[]
      }[]
    }

    const entries = body.entry || []
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const value = change.value
        // Avisos de entrega de lo que mandamos: enviado → entregado → visto, o
        // fallido (con el motivo). Vienen solos, sin "messages".
        for (const st of value?.statuses ?? []) await registrarEstadoMensaje(st)
        if (!value?.messages) continue

        for (const msg of value.messages) {
          const contactInfo = value.contacts?.find(c => c.wa_id === msg.from)
          const name = contactInfo?.profile?.name || null
          const phone = msg.from

          const { id: conversacionId, noLeidosActual, silenciada, bloqueada } = await getOrCreateConversation(msg.from, name, phone)

          // Se lee ANTES de guardar el mensaje nuevo, para saber cuánto hacía que nadie escribía.
          const previo = await mensajeAnteriorYAusencia(conversacionId)

          let contenido: string | null = null
          let tipo = msg.type || 'text'
          let mediaUrl: string | null = null

          if (msg.type === 'text' && msg.text) {
            contenido = msg.text.body
          } else if (msg.type === 'image' && msg.image) {
            contenido = msg.image.caption || null
            tipo = 'image'
            // De un contacto bloqueado no se baja la foto.
            if (!bloqueada) mediaUrl = await descargarYSubirMedia(msg.image.id, msg.image.mime_type)
          } else if (msg.type === 'document' && msg.document) {
            // Comprobantes en PDF, sobre todo.
            contenido = msg.document.caption || msg.document.filename || null
            tipo = 'document'
            if (!bloqueada) mediaUrl = await descargarYSubirMedia(msg.document.id, msg.document.mime_type)
          } else if (msg.type === 'audio' && msg.audio) {
            tipo = 'audio'
            if (!bloqueada) mediaUrl = await descargarYSubirMedia(msg.audio.id, msg.audio.mime_type)
          }

          const insertRes = await sbFetch('wsp_mensajes', {
            method: 'POST',
            body: JSON.stringify({
              conversacion_id: conversacionId,
              direccion: 'in',
              tipo,
              contenido,
              media_url: mediaUrl,
              wa_message_id: msg.id,
              contexto_wa_id: msg.context?.id ?? null,
            }),
          })
          const inserted = (await insertRes.json() as { id: string }[])[0]

          // Contacto bloqueado desde el menú del chat: queda guardado en el historial,
          // pero no cuenta como sin leer, no avisa, no sugiere ni contesta.
          if (bloqueada) {
            await sbFetch(`wsp_conversaciones?id=eq.${conversacionId}`, {
              method: 'PATCH',
              body: JSON.stringify({
                ultimo_mensaje: contenido?.slice(0, 200) || `[${tipo}]`,
                ultimo_mensaje_at: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
              }),
            })
            continue
          }

          await sbFetch(`wsp_conversaciones?id=eq.${conversacionId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              ultimo_mensaje: contenido?.slice(0, 200) || `[${tipo}]`,
              ultimo_mensaje_at: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
              estado: 'Sin leer',
              // Antes quedaba fijo en 1 sin importar cuántos mensajes seguidos
              // mandara el cliente antes de que alguien abriera el chat —
              // ahora sí acumula.
              no_leidos: noLeidosActual + 1,
              nombre: name || phone,
              // Si estaba archivado, vuelve a la lista: que nadie se pierda un cliente que escribe.
              archivada: false,
            }),
          })

          // Aviso al celular de quien atiende, aunque la app esté cerrada. Se
          // espera (con tope) por el mismo motivo que la IA de más abajo: en las
          // funciones edge lo que queda pendiente al devolver la Response se corta.
          if (!silenciada) await Promise.race([
            enviarPush(
              {
                supabaseUrl: SB_URL,
                supabaseKey: SB_KEY,
                vapidPublic: process.env.VAPID_PUBLIC_KEY ?? '',
                vapidPrivate: process.env.VAPID_PRIVATE_KEY ?? '',
                vapidSubject: process.env.VAPID_SUBJECT ?? 'https://right-botines-stock.vercel.app',
              },
              {
                titulo: name || phone,
                cuerpo: contenido?.slice(0, 140) || (tipo === 'image' ? 'Te mandó una foto' : tipo === 'audio' ? 'Te mandó un audio' : 'Mensaje nuevo'),
                url: '/crm',
                tag: `conv-${conversacionId}`,
              },
            ),
            new Promise<number>(resolve => setTimeout(() => resolve(0), 4000)),
          ]).catch(console.error)

          await Promise.race([
            enviarMensajeAutomatico(conversacionId, msg.from, previo),
            new Promise<void>(resolve => setTimeout(resolve, 5000)),
          ]).catch(console.error)

          await Promise.race([
            detectarVenta({ sbFetch, anthropicKey: ANTHROPIC_API_KEY, modelo: ANTHROPIC_MODEL }, conversacionId, 'cliente'),
            new Promise<boolean>(resolve => setTimeout(() => resolve(false), 9000)),
          ]).catch(console.error)

          if (tipo === 'image' && mediaUrl) {
            // Foto del botín que quiere: se reconoce el modelo y se mira el
            // stock. Si no se reconoce (o no es un botín: comprobante, rótulo…),
            // queda el flujo de siempre sobre el texto que la acompañe.
            await Promise.race([
              analizarFotoCliente(mediaUrl, contenido, conversacionId, inserted.id)
                .then(ok => (!ok && contenido ? classifyWithAI(contenido, conversacionId, inserted.id) : undefined)),
              new Promise<void>(resolve => setTimeout(resolve, 14000)),
            ]).catch(console.error)
          } else if (contenido) {
            // OJO: hay que ESPERARLA antes de responder. En las funciones
            // edge de Vercel, cuando se devuelve la Response el runtime corta
            // cualquier promesa pendiente — lanzada "en segundo plano" la
            // llamada a Anthropic moría a mitad de camino (sin fila en
            // wsp_ia_sugerencias y sin ningún error en los logs), por eso la
            // clasificación y el botón de talle nunca aparecían. El tope de 8s
            // evita que una IA lenta demore de más la respuesta a Meta.
            await Promise.race([
              classifyWithAI(contenido, conversacionId, inserted.id),
              new Promise<void>(resolve => setTimeout(resolve, 8000)),
            ]).catch(console.error)
          }
        }
      }
    }

    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('Webhook error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
