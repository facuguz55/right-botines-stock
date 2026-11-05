import {
  TIPOS_BOTIN,
  type TipoBotin,
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
  coincidirTitulo,
  hablaDeLaFoto,
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
import {
  descripcionFoto,
  esSaludoOMedia,
  marcadorAdjunto,
  preguntaPorPedidoConfiable,
  sugerenciaDeRescate,
  usarRespuestaArmadaDeStock,
} from '../src/lib/crmSugerencia'

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
// Solo para reconocer qué botín hay en la foto del cliente: con el modelo
// barato se confundía colores parecidos (un Phantom "celeste rosita" por uno
// "rosa blanco"). Son pocas fotos por día, así que acá conviene el más preciso.
// Si falla, se reintenta con ANTHROPIC_MODEL (ver identificarModeloEnFoto).
const ANTHROPIC_MODEL_FOTOS = 'claude-sonnet-5-5'
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
// Lo mismo usa la lista de chats (src/lib/crmVistaPrevia.ts) para mostrarlo con ícono.
const MENSAJE_NO_DISPONIBLE = 'Mensaje que WhatsApp no deja ver en la app (foto de ver una vez, encuesta o similar). Abrilo en el celular.'

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

// Lo que se sabe de la foto que se está sugiriendo, cuando no alcanza con armar
// la respuesta de stock (el cliente preguntó otra cosa antes de mandarla).
interface AdjuntoFoto { modelo: string | null; tipo: TipoBotin | null }

// ── Estado de la IA (aviso en el CRM) ──
// Una fila en crm_estado_ia (migración 072). Se escribe el error cada vez que
// falla, y el "volvió a andar" solo cuando esta instancia no sabía que andaba,
// para no escribir en la base con cada mensaje.
let estadoIaConocido: 'ok' | 'error' | null = null

function tipoErrorIa(status: number, cuerpo: string): string {
  if (/credit balance/i.test(cuerpo)) return 'sin_credito'
  if (status === 401 || status === 403) return 'clave'
  if (status === 429) return 'limite'
  if (status >= 500) return 'caida'
  return `http_${status}`
}

async function registrarEstadoIa(error: string | null) {
  try {
    if (!error && estadoIaConocido === 'ok') return
    estadoIaConocido = error ? 'error' : 'ok'
    const ahora = new Date().toISOString()
    await sbFetch('crm_estado_ia?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(error ? { id: 1, ultimo_error: error, error_at: ahora } : { id: 1, ok_at: ahora }),
    })
  } catch (err) {
    console.error('No se pudo guardar el estado de la IA (¿falta la migración 072?):', err)
  }
}

async function classifyWithAI(text: string, conversacionId: string, messageId: string, adjunto?: AdjuntoFoto) {
  try {
    // Contexto: últimos mensajes de la charla, lo que ya se sabía que buscaba
    // (select=* para no romper si falta alguna migración de búsqueda) y los
    // nombres del catálogo, para reconocer modelos puntuales ("los f50").
    const [mensajesRes, estadoRes, catalogoRes] = await Promise.all([
      // Con tipo y descripción de las fotos (migración 064); si esa columna
      // todavía no existe, se pide como antes.
      sbFetch(`wsp_mensajes?conversacion_id=eq.${conversacionId}&select=id,direccion,tipo,contenido,transcripcion,imagen_descripcion&order=timestamp.desc&limit=12`)
        .catch(() => sbFetch(`wsp_mensajes?conversacion_id=eq.${conversacionId}&select=id,direccion,tipo,contenido,transcripcion&order=timestamp.desc&limit=12`)),
      sbFetch(`wsp_conversaciones?id=eq.${conversacionId}&select=*&limit=1`)
        .catch(err => { console.error('No se pudo leer la búsqueda guardada:', err); return null }),
      sbFetch('modelos?select=marca,modelo')
        .catch(err => { console.error('No se pudo leer el catálogo para detectar modelos:', err); return null }),
    ])
    const filasMsgs = (await mensajesRes.json() as { id?: string; direccion: 'in' | 'out'; tipo?: string; contenido: string | null; transcripcion: string | null; imagen_descripcion?: string | null }[])
      .reverse()
    const recientes = filasMsgs
      .map(m => ({ direccion: m.direccion, texto: (m.contenido || m.transcripcion || '').trim() }))
      .filter(m => m.texto)
    const estadoRow = estadoRes ? (await estadoRes.json() as Record<string, unknown>[])[0] ?? {} : {}
    const busquedaPrevia = busquedaVigente(estadoRow as Parameters<typeof busquedaVigente>[0])
    const catalogo = catalogoRes ? await catalogoRes.json() as { marca: string; modelo: string }[] : []

    const ultimoMensajeLocal = [...recientes].reverse().find(m => m.direccion === 'out')?.texto ?? null
    const textosCliente = recientes.filter(m => m.direccion === 'in').map(m => m.texto)
    // Para la IA, las fotos cuentan: aparecen como [foto del cliente: lo que muestra].
    const contexto = filasMsgs
      .map(m => {
        const texto = (m.contenido || m.transcripcion || '').trim()
        if (m.tipo === 'image') {
          const marca = m.direccion === 'in'
            ? `[foto del cliente: ${m.imagen_descripcion?.trim() || 'no se vio qué muestra'}]`
            : '[foto que mandó el local]'
          return `${m.direccion === 'in' ? 'Cliente' : 'Local'}: ${[texto, marca].filter(Boolean).join(' ')}`
        }
        return texto ? `${m.direccion === 'in' ? 'Cliente' : 'Local'}: ${texto}` : ''
      })
      .filter(Boolean)
      .join('\n')

    // 1) Reglas deterministas sobre el mensaje nuevo. 2) La IA con contexto,
    // validada: solo se le cree un talle que el cliente escribió y un tipo si
    // el mensaje habla de canchas/tipos. Si las reglas vieron dos talles o dos
    // tipos distintos, es ambiguo y tampoco se le cree a la IA.
    // El modelo sale solo del catálogo real (nunca de la IA).
    const det = detectarBusqueda(text, { ultimoMensajeLocal })
    const modeloMsg = adjunto?.modelo ?? (catalogo.length ? extraerModeloBuscado(text, vocabularioCatalogo(catalogo)) : null)

    // Si lo último que mandó el cliente antes de este mensaje fue una foto, el
    // modelo de esa foto cuenta para "quiero ese", "esos", "en 42"... Solo en ese
    // caso: si siguió hablando de otra cosa, la foto ya no condiciona nada.
    let modeloDeFoto: string | null = null
    const idxActual = filasMsgs.findIndex(m => m.id === messageId)
    const ultimoDelCliente = [...(idxActual >= 0 ? filasMsgs.slice(0, idxActual) : filasMsgs)].reverse().find(m => m.direccion === 'in')
    if (ultimoDelCliente?.tipo === 'image' && ultimoDelCliente.id) {
      const filaFoto = await sbFetch(`wsp_ia_sugerencias?mensaje_id=eq.${ultimoDelCliente.id}&select=modelo_buscado&limit=1`)
        .then(r => r.json() as Promise<{ modelo_buscado: string | null }[]>)
        .catch(() => [] as { modelo_buscado: string | null }[])
      modeloDeFoto = filaFoto[0]?.modelo_buscado || null
    }

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
    // El mismo bloque, pero con las fotos y audios (no tienen texto): la
    // sugerencia contesta todo lo que mandó seguido, sobre todo lo último.
    const bloqueConAdjuntos: string[] = []
    for (let i = filasMsgs.length - 1; i >= 0 && filasMsgs[i].direccion === 'in'; i--) {
      const m = filasMsgs[i]
      const t = (m.contenido || m.transcripcion || '').trim()
      const adj = m.tipo === 'image'
        ? `[foto del cliente: ${m.imagen_descripcion?.trim() || 'no se vio qué muestra'}]`
        : marcadorAdjunto(m.tipo ?? '')
      bloqueConAdjuntos.unshift([t, adj].filter(Boolean).join(' '))
    }
    // Si la IA no responde (sin saldo, caída…) se anota para el aviso del CRM
    // y NO se inventa una sugerencia genérica (ver más abajo).
    let errorIa: string | null = null
    const ia = await llamarClasificadorIA({
      apiKey: ANTHROPIC_API_KEY, modelo: ANTHROPIC_MODEL, contexto, busquedaGuardada: busquedaPrevia, text, aprendizajes,
      bloque: bloqueConAdjuntos.length > 1 ? bloqueConAdjuntos : undefined,
      onErrorApi: (status, cuerpo) => { errorIa = tipoErrorIa(status, cuerpo) },
    }).catch(err => {
      console.error('classifyWithAI: falló la llamada a Anthropic:', err)
      errorIa = 'red'
      return null
    })
    await registrarEstadoIa(ia ? null : errorIa)

    // Pregunta por el estado de un pedido: lo decide la IA; sin IA, solo
    // frases inequívocas ("cuándo me llega", "seguimiento").
    // La IA a veces ve "pedido" en un "Dale" o un "Bien" a mitad de una compra:
    // solo se contesta con el estado de un pedido si el mensaje habla de uno.
    const preguntaPorPedido = ia
      ? preguntaPorPedidoConfiable(ia.intencion === 'estado_pedido', mencionaPedido(text))
      : esConsultaEnvioSegura(text)
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
      ?? (adjunto?.tipo ?? null)
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
      nuevo: { talle: talleMsg, tipo: tipoMsg, modelo: modeloMsg ?? (modeloDeFoto && (talleMsg || tipoMsg || hablaDeLaFoto(text)) ? modeloDeFoto : null) },
      intencion: ia?.intencion ?? (preguntaPorPedido ? 'estado_pedido' : null),
      categoria: ia?.categoria ?? null,
      cambioDeTema: ia?.cambio_de_tema === true,
    })

    // Sin IA ni nada armado igual se sugiere algo: nunca queda un mensaje sin sugerencia.

    // La respuesta es una lista de mensajes cortos que se mandan uno atrás del
    // otro (como contesta Cami). Lo armado con datos reales (pedido, stock)
    // va en un solo mensaje.
    let mensajes: string[] = respuestaPedido ? [respuestaPedido] : ia?.mensajes_sugeridos ?? []
    if (aporto && usarRespuestaArmadaDeStock(ia?.intencion, mensajes.length > 0)) {
      // Con el stock real. Si el cliente preguntó otra cosa (la horma, un envío)
      // se contesta eso y el talle/modelo igual queda anotado para los botones.
      const stock = await contarStock(busqueda)
      const armada = respuestaSugeridaBusqueda(busqueda, stock)
      if (armada) mensajes = [armada]
    } else if (ia?.intencion === 'pedido_talle' && !respuestaPedido && !aporto) {
      // Pregunta por stock sin decir talle/tipo/modelo reconocibles: la
      // respuesta libre de la IA podría afirmar que "hay de todo" sin mirar
      // nada (pasó: "en talle 32 tenemos F11 y F5" sin stock). Se pide el talle.
      mensajes = ['Hola buenas! Qué talle usás? Así me fijo qué tenemos 🤗']
    }

    // Pase lo que pase (IA o texto armado), al cliente no le llega nada con
    // pinta de IA: sin emojis, sin ¿ ¡, sin guiones largos ni viñetas.
    mensajes = mensajes.map(m => humanizar(m)).filter(Boolean)
    // El rescate genérico es solo para cuando la IA contestó pero vacío. Si la
    // IA está caída (sin saldo, etc.) no se sugiere nada: antes salía "Contame
    // en qué te puedo ayudar" en todos los chats y parecía que el bot se había
    // vuelto loco. El CRM muestra un aviso con el motivo.
    if (mensajes.length === 0 && !errorIa) mensajes = sugerenciaDeRescate(text).map(m => humanizar(m)).filter(Boolean)
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
    descripcion: { type: 'string' },
    titulo_visible: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
  required: ['es_botin', 'indice', 'seguridad', 'descripcion', 'titulo_visible'],
}

async function identificarModeloEnFoto(
  mediaUrl: string, caption: string | null, catalogo: { marca: string; modelo: string }[],
): Promise<{ indice: number | null; descripcion: string; titulo: string | null } | null> {
  if (!ANTHROPIC_API_KEY || catalogo.length === 0) return null
  const lista = catalogo.map((m, i) => `${i}: ${m.marca} ${m.modelo}`).join('\n')
  const pedido = {
    system: 'Sos el asistente de Right Botines, una tienda de botines de fútbol. Un cliente te manda por WhatsApp la foto de un botín que quiere. Tu trabajo es decir cuál de los modelos de la lista del catálogo es: mirá la marca, la línea (por ejemplo F50, Predator, Mercurial, Phantom, Copa) y el color. Elegí un índice de la lista solo si el botín de la foto coincide con esa línea y ese color; si es de otra marca, de una línea que no está o no se ve bien, devolvé indice null. Si la imagen no es un botín (comprobante, rótulo de envío, captura de chat, persona, etc.) devolvé es_botin false e indice null. Si en la imagen está escrito el nombre del producto (típico de una captura de la web de Right o de Instagram, donde se lee algo como "NIKE PHANTOM GX6 CELESTE ROSITA"), copialo tal cual en titulo_visible; si no hay un nombre escrito, null. El nombre escrito vale más que el color que creas ver. Si la captura muestra varios productos (un listado o un catálogo) y no uno solo, devolvé indice null y titulo_visible null. Ante la duda, null: es preferible no sugerir nada a sugerir un modelo equivocado. Además, en descripcion poné en una frase corta (máximo 100 caracteres) qué muestra la imagen, para que otra persona sepa de qué foto se habla sin verla: por ejemplo "botín Nike Mercurial naranja, taco de fútbol 11", "comprobante de transferencia", "captura de un chat", "rótulo de envío".',
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'url', url: mediaUrl } },
        { type: 'text', text: `Catálogo:\n${lista}\n\n${caption ? `Texto que mandó el cliente con la foto: ${caption}\n\n` : ''}¿Cuál es el modelo de la foto?` },
      ],
    }],
  }
  const llamar = (extra: Record<string, unknown>, betas?: string) => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      ...(betas ? { 'anthropic-beta': betas } : {}),
    },
    body: JSON.stringify({ ...pedido, ...extra }),
  })
  // Sonnet piensa antes de contestar (no se puede apagar): esfuerzo bajo para
  // que sea rápido, y margen de tokens para que el pensamiento no corte la
  // respuesta. "fallbacks": si se niega por seguridad, la API reintenta sola
  // con otro modelo dentro del mismo pedido.
  let res = await llamar({
    model: ANTHROPIC_MODEL_FOTOS,
    max_tokens: 4000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: FOTO_SCHEMA } },
    fallbacks: 'default',
  }, 'server-side-fallback-2026-07-01')
  if (!res.ok) {
    console.error('identificarModeloEnFoto: el modelo de fotos respondió', res.status, await res.text().catch(() => ''), '— reintento con', ANTHROPIC_MODEL)
    res = await llamar({
      model: ANTHROPIC_MODEL,
      max_tokens: 300,
      output_config: { format: { type: 'json_schema', schema: FOTO_SCHEMA } },
    })
  }
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => '')
    console.error('identificarModeloEnFoto: Anthropic respondió', res.status, cuerpo)
    await registrarEstadoIa(tipoErrorIa(res.status, cuerpo))
    return null
  }
  const data = await res.json() as { stop_reason?: string; content?: { type: string; text?: string }[] }
  if (data.stop_reason === 'refusal' || data.stop_reason === 'max_tokens') return null
  const raw = data.content?.find(b => b.type === 'text')?.text
  if (!raw) return null
  try {
    const r = JSON.parse(raw) as { es_botin: boolean; indice: number | null; seguridad: string; descripcion?: string; titulo_visible?: string | null }
    const descripcion = (r.descripcion ?? '').trim().slice(0, 200)
    const titulo = (r.titulo_visible ?? '').trim().slice(0, 200) || null
    // Solo se acepta el modelo que la IA eligió mirando la foto si está segura
    // ("alta"): con "media" adivinaba por colores y se equivocaba de modelo.
    if (!r.es_botin || r.indice == null || r.seguridad !== 'alta') return { indice: null, descripcion, titulo }
    return { indice: Number.isInteger(r.indice) && r.indice >= 0 && r.indice < catalogo.length ? r.indice : null, descripcion, titulo }
  } catch {
    console.error('identificarModeloEnFoto: JSON inválido:', raw)
    return null
  }
}

interface ResultadoFoto {
  // Dejó la sugerencia de stock armada (reconoció el modelo y se pidió armarla).
  sugerida: boolean
  descripcion: string | null
  adjunto: AdjuntoFoto | null
}

// Lee la foto, guarda qué muestra y, si reconoció el modelo y `armar` es true,
// deja la sugerencia de stock armada. Con `armar` false (el cliente preguntó
// otra cosa antes de mandarla) no escribe la sugerencia: la hace classifyWithAI
// contestando el bloque completo.
async function analizarFotoCliente(
  mediaUrl: string, caption: string | null, conversacionId: string, messageId: string, armar: boolean,
): Promise<ResultadoFoto> {
  const vacio: ResultadoFoto = { sugerida: false, descripcion: null, adjunto: null }
  try {
    const [catRes, estadoRes] = await Promise.all([
      sbFetch('modelos?select=id,marca,modelo,categoria&order=marca.asc,modelo.asc'),
      sbFetch(`wsp_conversaciones?id=eq.${conversacionId}&select=*&limit=1`).catch(() => null),
    ])
    const catalogo = await catRes.json() as { id: string; marca: string; modelo: string; categoria: string | null }[]
    const vista = await identificarModeloEnFoto(mediaUrl, caption, catalogo)
    if (!vista) return vacio
    // Qué muestra la foto queda guardado: así, cuando después el cliente dice
    // "ese modelo" o "quiero esos", el bot sabe de qué foto habla (aunque no se
    // haya reconocido el modelo exacto, o sea un comprobante).
    if (vista.descripcion) {
      await sbFetch(`wsp_mensajes?id=eq.${messageId}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ imagen_descripcion: vista.descripcion }),
      }).catch(err => console.error('No se pudo guardar la descripción de la foto (¿falta la migración 064?):', err))
    }
    // 1º el nombre escrito en la imagen (captura de la web), que es exacto;
    // 2º lo que la IA reconoció mirando la foto, solo si estaba segura.
    const porTitulo = coincidirTitulo(vista.titulo, catalogo)
    const candidatos = porTitulo.length ? porTitulo : (vista.indice != null ? [vista.indice] : [])
    if (candidatos.length === 0) return { ...vacio, descripcion: vista.descripcion || null }
    const elegido = catalogo[candidatos[0]]
    const nombre = `${elegido.marca} ${elegido.modelo}`.trim()
    if (!armar) {
      return { sugerida: false, descripcion: vista.descripcion || null, adjunto: { modelo: nombre, tipo: tipoDeCategoria(elegido.categoria) } }
    }

    const estadoRow = estadoRes ? (await estadoRes.json() as Record<string, unknown>[])[0] ?? {} : {}
    const previa = busquedaVigente(estadoRow as Parameters<typeof busquedaVigente>[0])
    const talleCaption = caption ? detectarBusqueda(caption).talle : null
    const talle = talleCaption ?? previa.talle

    // Si el mismo nombre está cargado más de una vez, el stock es la suma de todos.
    const ids = candidatos.map(i => catalogo[i].id)
    const filas = await (await sbFetch(
      `modelo_talles?modelo_id=in.(${ids.map(encodeURIComponent).join(',')})&cantidad=gt.0&select=talle_arg`,
    )).json() as { talle_arg: number }[]
    const respuesta = humanizar(respuestaPorModeloFoto(nombre, talle, filas.map(f => Number(f.talle_arg))))

    await sbWriteConFallback('wsp_ia_sugerencias', 'POST', {
      mensaje_id: messageId,
      conversacion_id: conversacionId,
      categoria_sugerida: 'Pedido de talles',
      intencion: 'pedido_talle',
      tipo_detectado: tipoDeCategoria(elegido.categoria),
      talle_detectado: talle,
      modelo_buscado: nombre,
      respuesta_sugerida: respuesta,
    }, ['modelo_buscado'])

    await sbFetch(`wsp_conversaciones?id=eq.${conversacionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ categoria: 'Pedido de talles' }),
    })
    // El modelo y el tipo de la foto NO quedan guardados como "lo que busca":
    // se pegaban a todo lo que el cliente dijera después, aunque hablara de
    // otra cosa. Para los mensajes que vienen enseguida se vuelve a leer de la
    // sugerencia de esta foto (ver classifyWithAI). Solo se guarda el talle si
    // lo escribió junto con la foto.
    if (talleCaption) {
      const nueva = combinarBusqueda(previa, { talle: talleCaption, tipo: null, modelo: null })
      await sbWriteConFallback(`wsp_conversaciones?id=eq.${conversacionId}`, 'PATCH', {
        busqueda_talle: nueva.talle,
        busqueda_tipo: nueva.tipo,
        busqueda_modelo: nueva.modelo ?? null,
        busqueda_updated_at: new Date().toISOString(),
      }, ['busqueda_modelo']).catch(err => console.error('No se pudo guardar el talle de la foto:', err))
    }
    return { sugerida: true, descripcion: vista.descripcion || null, adjunto: null }
  } catch (err) {
    console.error('analizarFotoCliente falló:', err)
    return vacio
  }
}

// Texto del cliente que venía seguido (sin que nadie le contestara) antes de esta foto.
async function textosPreviosDelBloque(conversacionId: string, messageId: string): Promise<string[]> {
  try {
    const filas = await (await sbFetch(
      `wsp_mensajes?conversacion_id=eq.${conversacionId}&select=id,direccion,tipo,contenido,transcripcion&order=timestamp.desc&limit=12`,
    )).json() as { id: string; direccion: 'in' | 'out'; tipo: string; contenido: string | null; transcripcion: string | null }[]
    const desde = filas.findIndex(f => f.id === messageId)
    const out: string[] = []
    for (let i = desde < 0 ? 0 : desde + 1; i < filas.length && filas[i].direccion === 'in'; i++) {
      out.unshift((filas[i].contenido || filas[i].transcripcion || marcadorAdjunto(filas[i].tipo)).trim())
    }
    return out.filter(Boolean)
  } catch {
    return []
  }
}

// Una foto de cliente. Si es la foto de un botín que quiere y antes no preguntó
// nada más que saludar, se arma la respuesta de stock. Si preguntó algo (la
// horma, un envío) o la foto es otra cosa (un comprobante, datos de envío…), la
// sugerencia sale del bloque completo: siempre se contesta lo último que dijo.
async function manejarFotoCliente(
  mediaUrl: string, caption: string | null, conversacionId: string, messageId: string,
): Promise<void> {
  const previos = await textosPreviosDelBloque(conversacionId, messageId)
  const soloSaludo = [...previos, caption ?? ''].every(esSaludoOMedia)
  const r = await analizarFotoCliente(mediaUrl, caption, conversacionId, messageId, soloSaludo)
  if (r.sugerida) return
  await classifyWithAI(descripcionFoto(r.descripcion, caption), conversacionId, messageId, r.adjunto ?? undefined)
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
              video?: { id: string; mime_type: string; caption?: string }
              sticker?: { id: string; mime_type: string }
              reaction?: { emoji?: string; message_id?: string }
              location?: { latitude?: number; longitude?: number; name?: string; address?: string }
              contacts?: { name?: { formatted_name?: string }; phones?: { phone?: string }[] }[]
              button?: { text?: string }
              interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }
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
          } else if (msg.type === 'video' && msg.video) {
            // Antes se guardaba el video sin bajarlo y en el chat no aparecía nada.
            contenido = msg.video.caption || null
            tipo = 'video'
            if (!bloqueada) mediaUrl = await descargarYSubirMedia(msg.video.id, msg.video.mime_type)
          } else if (msg.type === 'sticker' && msg.sticker) {
            tipo = 'sticker'
            if (!bloqueada) mediaUrl = await descargarYSubirMedia(msg.sticker.id, msg.sticker.mime_type)
          }

          // La base solo acepta estos tipos (wsp_mensajes_tipo_check). Lo
          // demás (reacciones, ubicaciones, contactos, botones…) se guardaba
          // con el tipo crudo de WhatsApp, la base lo rechazaba y el error
          // cortaba el lote entero: no se guardaba, no avisaba y Meta lo
          // reintentaba sin fin. Se guarda como texto que lo describe.
          const esReaccion = msg.type === 'reaction'
          if (!['text', 'image', 'audio', 'video', 'document', 'sticker'].includes(tipo)) {
            const c = msg.contacts?.[0]
            contenido =
              esReaccion ? `Reaccionó ${msg.reaction?.emoji || '(quitó la reacción)'} a un mensaje`
              : msg.type === 'location' && msg.location
                ? `📍 Ubicación: ${[msg.location.name, msg.location.address].filter(Boolean).join(' — ') || ''} https://maps.google.com/?q=${msg.location.latitude},${msg.location.longitude}`.replace(':  https', ': https')
              : msg.type === 'contacts' && c ? `Contacto: ${c.name?.formatted_name ?? ''} ${c.phones?.map(p => p.phone).filter(Boolean).join(', ') ?? ''}`.trim()
              : msg.type === 'button' && msg.button?.text ? msg.button.text
              : msg.type === 'interactive' ? (msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '[respuesta]')
              // "unsupported": WhatsApp no le pasa el contenido a ninguna app
              // conectada (fotos o videos de ver una sola vez, encuestas,
              // eventos…). No hay forma de traerlo: solo se ve en el celular.
              : msg.type === 'unsupported' ? MENSAJE_NO_DISPONIBLE
              : `${MENSAJE_NO_DISPONIBLE} (${msg.type || 'mensaje'})`
            tipo = 'text'
          }

          const insertRes = await fetch(`${SB_URL}/rest/v1/wsp_mensajes`, {
            method: 'POST',
            headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
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
          // Ya guardado en un intento anterior (Meta reintenta el lote si algo
          // falló): se saltea en vez de cortar todo con error.
          if (insertRes.status === 409) continue
          if (!insertRes.ok) throw new Error(`insert wsp_mensajes → ${insertRes.status}: ${await insertRes.text().catch(() => '')}`)
          const inserted = (await insertRes.json() as { id: string }[])[0]

          // Una reacción queda en el historial, pero no es un mensaje nuevo:
          // no suma sin leer, no avisa ni pasa por la IA.
          if (esReaccion) continue

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

          // Todo lo que sigue corre A LA VEZ (cada cosa con su propio tope) y se
          // espera junto antes de responderle a Meta: en las funciones edge lo que
          // queda pendiente al devolver la Response se corta. Antes iba en fila
          // (aviso → mensaje automático → detección de ventas → IA), y la sugerencia
          // quedaba última: en los chats con fotos la detección de ventas mira las
          // imágenes con IA y tarda, y a la sugerencia no le quedaba tiempo.
          const tareas: Promise<unknown>[] = []

          // Aviso al celular de quien atiende, aunque la app esté cerrada.
          if (!silenciada) tareas.push(Promise.race([
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
                cuerpo: contenido?.slice(0, 140) || (tipo === 'image' ? '📷 Foto' : tipo === 'audio' ? '🎤 Mensaje de voz' : tipo === 'video' ? '🎥 Video' : tipo === 'sticker' ? 'Sticker' : 'Mensaje nuevo'),
                url: '/crm',
                tag: `conv-${conversacionId}`,
              },
            ),
            new Promise<number>(resolve => setTimeout(() => resolve(0), 4000)),
          ]).catch(console.error))

          tareas.push(Promise.race([
            enviarMensajeAutomatico(conversacionId, msg.from, previo),
            new Promise<void>(resolve => setTimeout(resolve, 5000)),
          ]).catch(console.error))

          tareas.push(Promise.race([
            detectarVenta({ sbFetch, anthropicKey: ANTHROPIC_API_KEY, modelo: ANTHROPIC_MODEL }, conversacionId, 'cliente'),
            new Promise<boolean>(resolve => setTimeout(() => resolve(false), 9000)),
          ]).catch(console.error))

          if (tipo === 'image' && mediaUrl) {
            // Foto del botín que quiere: se reconoce el modelo y se mira el
            // stock. Si no se reconoce (o no es un botín: comprobante, rótulo…),
            // queda el flujo de siempre sobre el texto que la acompañe.
            tareas.push(Promise.race([
              manejarFotoCliente(mediaUrl, contenido, conversacionId, inserted.id),
              new Promise<void>(resolve => setTimeout(resolve, 14000)),
            ]).catch(console.error))
          } else if (contenido) {
            // OJO: hay que ESPERARLA antes de responder. En las funciones
            // edge de Vercel, cuando se devuelve la Response el runtime corta
            // cualquier promesa pendiente — lanzada "en segundo plano" la
            // llamada a Anthropic moría a mitad de camino (sin fila en
            // wsp_ia_sugerencias y sin ningún error en los logs), por eso la
            // clasificación y el botón de talle nunca aparecían. El tope de 8s
            // evita que una IA lenta demore de más la respuesta a Meta.
            tareas.push(Promise.race([
              classifyWithAI(contenido, conversacionId, inserted.id),
              new Promise<void>(resolve => setTimeout(resolve, 8000)),
            ]).catch(console.error))
          } else if (marcadorAdjunto(tipo)) {
            // Audio, sticker, video o foto que no se pudo bajar, sin texto:
            // igual se sugiere algo, mirando lo que venía diciendo el cliente.
            tareas.push(Promise.race([
              classifyWithAI(marcadorAdjunto(tipo), conversacionId, inserted.id),
              new Promise<void>(resolve => setTimeout(resolve, 8000)),
            ]).catch(console.error))
          }

          await Promise.all(tareas)
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
