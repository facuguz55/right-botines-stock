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
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'

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

async function classifyWithAI(text: string, conversacionId: string, messageId: string) {
  if (!ANTHROPIC_API_KEY) return

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 300,
        system: `Sos un clasificador de mensajes de WhatsApp para una tienda de botines de fútbol (Right Botines). Categorías: Urgente, Pedido de talles, Normal, Spam, Postventa/Reclamos, Mayorista.
Respondé SOLO en JSON con este formato, sin texto extra antes ni después:
{"categoria":"...","intencion":"...","tipo_detectado":"f11|f5|futsal|null","talle_detectado":number|null,"respuesta_sugerida":"..."}
- intencion: "pedido_talle", "consulta_precio", "consulta_envio", "reclamo", "saludo", "spam", "otro"
- tipo_detectado: si pide un tipo de botín específico (f11, f5, futsal)
- talle_detectado: si menciona un talle específico (número, en talle argentino)
- respuesta_sugerida: una respuesta corta y amigable en español argentino informal`,
        messages: [{ role: 'user', content: text }],
      }),
    })

    if (!res.ok) return

    const data = await res.json() as { content?: { type: string; text?: string }[] }
    const raw = data.content?.find(b => b.type === 'text')?.text?.trim()
    if (!raw) return

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return
    const parsed = JSON.parse(jsonMatch[0])

    await sbFetch('wsp_ia_sugerencias', {
      method: 'POST',
      body: JSON.stringify({
        mensaje_id: messageId,
        conversacion_id: conversacionId,
        categoria_sugerida: parsed.categoria || null,
        intencion: parsed.intencion || null,
        tipo_detectado: parsed.tipo_detectado || null,
        talle_detectado: parsed.talle_detectado || null,
        respuesta_sugerida: parsed.respuesta_sugerida || null,
      }),
    })

    if (parsed.categoria) {
      await sbFetch(`wsp_conversaciones?id=eq.${conversacionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ categoria: parsed.categoria }),
      })
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
            classifyWithAI(contenido, conversacionId, inserted.id).catch(console.error)
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
