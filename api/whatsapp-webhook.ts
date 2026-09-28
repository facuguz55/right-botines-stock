import {
  TIPOS_BOTIN,
  busquedaVigente,
  combinarBusqueda,
  detectarBusqueda,
  respuestaSugeridaBusqueda,
  talleIaEsConfiable,
  tipoIaEsConfiable,
  coincidenciaModelo,
  extraerModeloBuscado,
  parseModeloQuery,
  vocabularioCatalogo,
  type EstadoBusqueda,
} from '../src/lib/crmBusqueda'

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
): Promise<{ id: string; noLeidosActual: number }> {
  const existing = await sbFetch(`wsp_conversaciones?wa_contact_id=eq.${encodeURIComponent(waContactId)}&select=id,no_leidos&limit=1`)
  const rows = await existing.json() as { id: string; no_leidos: number | null }[]
  if (rows[0]) return { id: rows[0].id, noLeidosActual: rows[0].no_leidos ?? 0 }

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
  return { id: conv.id, noLeidosActual: 0 }
}

const CATEGORIAS_CRM = ['Urgente', 'Pedido de talles', 'Normal', 'Spam', 'Postventa/Reclamos', 'Mayorista'] as const
const INTENCIONES = ['pedido_talle', 'consulta_precio', 'consulta_envio', 'reclamo', 'saludo', 'spam', 'otro'] as const

interface ClasificacionIA {
  categoria: string
  intencion: string
  talle_arg: number | null
  tipo: string | null
  respuesta_sugerida: string
}

// Structured outputs: la API garantiza que la respuesta respete este schema
// (antes se le pedía "respondé solo JSON" y se rescataba con una regex, que
// fallaba cada tanto y se perdía la clasificación entera).
const CLASIFICACION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    categoria: { type: 'string', enum: [...CATEGORIAS_CRM] },
    intencion: { type: 'string', enum: [...INTENCIONES] },
    talle_arg: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    tipo: { anyOf: [{ type: 'string', enum: [...TIPOS_BOTIN] }, { type: 'null' }] },
    respuesta_sugerida: { type: 'string' },
  },
  required: ['categoria', 'intencion', 'talle_arg', 'tipo', 'respuesta_sugerida'],
}

const SYSTEM_CLASIFICADOR = `Sos el asistente que clasifica los mensajes de WhatsApp que recibe Right Botines, una tienda de botines de fútbol de Santa Fe, Argentina. Te paso la conversación reciente y el último mensaje del cliente; clasificás ESE último mensaje usando el resto como contexto.

Campos:
- categoria: Urgente, Pedido de talles, Normal, Spam, Postventa/Reclamos o Mayorista.
- intencion: pedido_talle, consulta_precio, consulta_envio, reclamo, saludo, spam u otro.
- talle_arg: el talle ARGENTINO que el CLIENTE dijo que busca (en este mensaje o antes en la conversación). Si lo dio en talle US convertilo así: 5→34, 5.5→35, 6→36, 7→37, 7.5→38, 8→39, 9→40, 9.5→41, 10→42, 11→43, 11.5→44. Si pidió más de un talle, si no está claro, o si el número no es un talle (precio, edad, hora, cantidad), devolvé null. Nunca uses un talle que solo mencionó el local.
- tipo: F11 (fútbol 11, cancha de 11, pasto natural, tapones), F5 (fútbol 5, sintético, papi, multitapón; también cancha de 7 u 8), Futsal (futsal, sala, piso, indoor) o Hockey. Solo si el CLIENTE lo dijo o lo dejó claro; si mencionó más de uno o no dijo nada, null.
- respuesta_sugerida: una respuesta corta y amable en español argentino informal (voseo), como la escribiría la vendedora. No inventes stock, precios ni promociones.

Ante la duda en talle o tipo, null: es preferible no sugerir nada a mandarle al cliente fotos del talle o tipo equivocado.`

async function llamarClasificadorIA(contexto: string, busquedaGuardada: EstadoBusqueda, text: string): Promise<ClasificacionIA | null> {
  if (!ANTHROPIC_API_KEY) {
    console.error('classifyWithAI: falta ANTHROPIC_API_KEY / VITE_ANTHROPIC_API_KEY')
    return null
  }
  const guardada = busquedaGuardada.talle || busquedaGuardada.tipo || busquedaGuardada.modelo
    ? `talle ${busquedaGuardada.talle ?? 'sin definir'}, tipo ${busquedaGuardada.tipo ?? 'sin definir'}`
      + (busquedaGuardada.modelo ? `, modelo "${busquedaGuardada.modelo}"` : '')
    : 'nada todavía'

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: SYSTEM_CLASIFICADOR,
      output_config: { format: { type: 'json_schema', schema: CLASIFICACION_SCHEMA } },
      messages: [{
        role: 'user',
        content: `Conversación reciente (de la más vieja a la más nueva):\n${contexto || '(sin mensajes previos)'}\n\nLo que ya sabemos que busca: ${guardada}\n\nÚltimo mensaje del cliente, el que hay que clasificar:\n${text}`,
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
    return JSON.parse(raw) as ClasificacionIA
  } catch {
    console.error('classifyWithAI: JSON inválido de Anthropic:', raw)
    return null
  }
}

// Cuántos modelos con foto hay en stock para lo buscado — mismo criterio que
// el modal de fotos (searchModelosByTalleDisponible + filtro por modelo) para
// que la respuesta sugerida no diga "tenemos" y después el modal aparezca vacío.
async function contarModelosDisponibles(estado: EstadoBusqueda): Promise<number | null> {
  if (!estado.talle) return null
  try {
    let path = `modelos?select=marca,modelo,modelo_talles!inner(cantidad),modelo_fotos!inner(id)`
      + `&modelo_talles.talle_arg=eq.${estado.talle}&modelo_talles.cantidad=gt.0&modelo_fotos.limit=1`
    if (estado.tipo) path += `&categoria=ilike.*${encodeURIComponent(estado.tipo)}*`
    const rows = await (await sbFetch(path)).json() as { marca: string; modelo: string }[]
    if (!estado.modelo) return rows.length
    const q = parseModeloQuery(estado.modelo)
    return rows.filter(r => coincidenciaModelo(r, q).pasa).length
  } catch (err) {
    console.error('No se pudo contar el stock para la respuesta sugerida:', err)
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
    const ia = await llamarClasificadorIA(contexto, busquedaPrevia, text).catch(err => {
      console.error('classifyWithAI: falló la llamada a Anthropic:', err)
      return null
    })
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
    const aporto = talleMsg !== null || tipoMsg !== null || modeloMsg !== null
    const busqueda = combinarBusqueda(busquedaPrevia, { talle: talleMsg, tipo: tipoMsg, modelo: modeloMsg })

    if (!ia && !aporto) return

    let respuesta = ia?.respuesta_sugerida?.trim() || null
    if (aporto) {
      const stock = await contarModelosDisponibles(busqueda)
      respuesta = respuestaSugeridaBusqueda(busqueda, stock) ?? respuesta
    }

    const categoria = ia?.categoria ?? (aporto ? 'Pedido de talles' : null)

    await sbWriteConFallback('wsp_ia_sugerencias', 'POST', {
      mensaje_id: messageId,
      conversacion_id: conversacionId,
      categoria_sugerida: categoria,
      intencion: ia?.intencion ?? (aporto ? 'pedido_talle' : null),
      // Solo en el mensaje que aportó algo: ahí va el botón de fotos / de
      // respuesta rápida, con lo acumulado de la charla (38 + F11 + F50).
      tipo_detectado: aporto ? busqueda.tipo : null,
      talle_detectado: aporto ? busqueda.talle : null,
      modelo_buscado: aporto ? busqueda.modelo ?? null : null,
      respuesta_sugerida: respuesta,
    }, ['modelo_buscado'])

    if (categoria) {
      await sbFetch(`wsp_conversaciones?id=eq.${conversacionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ categoria }),
      })
    }

    if (aporto) {
      await sbWriteConFallback(`wsp_conversaciones?id=eq.${conversacionId}`, 'PATCH', {
        busqueda_talle: busqueda.talle,
        busqueda_tipo: busqueda.tipo,
        busqueda_modelo: busqueda.modelo ?? null,
        busqueda_updated_at: new Date().toISOString(),
      }, ['busqueda_modelo']).catch(err => console.error('No se pudo guardar la búsqueda (¿falta la migración 038?):', err))
    }
  } catch (err) {
    console.error('AI classification failed:', err)
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
              text?: { body: string }
              image?: { id: string; mime_type: string; caption?: string }
              audio?: { id: string; mime_type: string }
            }[]
            contacts?: { profile?: { name?: string }; wa_id: string }[]
          }
        }[]
      }[]
    }

    const entries = body.entry || []
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const value = change.value
        if (!value?.messages) continue

        for (const msg of value.messages) {
          const contactInfo = value.contacts?.find(c => c.wa_id === msg.from)
          const name = contactInfo?.profile?.name || null
          const phone = msg.from

          const { id: conversacionId, noLeidosActual } = await getOrCreateConversation(msg.from, name, phone)

          let contenido: string | null = null
          let tipo = msg.type || 'text'
          let mediaUrl: string | null = null

          if (msg.type === 'text' && msg.text) {
            contenido = msg.text.body
          } else if (msg.type === 'image' && msg.image) {
            contenido = msg.image.caption || null
            tipo = 'image'
            mediaUrl = await descargarYSubirMedia(msg.image.id, msg.image.mime_type)
          } else if (msg.type === 'audio' && msg.audio) {
            tipo = 'audio'
            mediaUrl = await descargarYSubirMedia(msg.audio.id, msg.audio.mime_type)
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
            }),
          })
          const inserted = (await insertRes.json() as { id: string }[])[0]

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
            }),
          })

          if (contenido) {
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
