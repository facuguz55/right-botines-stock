export const config = { runtime: 'edge' }

const SB_URL = process.env.SUPABASE_URL ?? ''
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''
const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN ?? ''
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID ?? ''
const AI_API_KEY = process.env.AI_API_KEY ?? ''
const AI_API_URL = process.env.AI_API_URL ?? ''
const AI_MODEL = process.env.AI_MODEL ?? ''

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

async function getOrCreateConversation(waContactId: string, name: string | null, phone: string | null) {
  const existing = await sbFetch(`wsp_conversaciones?wa_contact_id=eq.${encodeURIComponent(waContactId)}&select=id&limit=1`)
  const rows = await existing.json() as { id: string }[]
  if (rows[0]) return rows[0].id

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
  return conv.id
}

async function classifyWithAI(text: string, conversacionId: string, messageId: string) {
  if (!AI_API_URL || !AI_API_KEY || !AI_MODEL) return

  try {
    const res = await fetch(AI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_API_KEY}` },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          {
            role: 'system',
            content: `Sos un clasificador de mensajes de WhatsApp para una tienda de botines de fútbol (Right Botines). Categorías: Urgente, Pedido de talles, Normal, Spam, Postventa/Reclamos, Mayorista.
Respondé SOLO en JSON con este formato:
{"categoria":"...","intencion":"...","tipo_detectado":"f11|f5|futsal|null","talle_detectado":number|null,"respuesta_sugerida":"..."}
- intencion: "pedido_talle", "consulta_precio", "consulta_envio", "reclamo", "saludo", "spam", "otro"
- tipo_detectado: si pide un tipo de botín específico (f11, f5, futsal)
- talle_detectado: si menciona un talle específico (número)
- respuesta_sugerida: una respuesta corta y amigable en español argentino informal`,
          },
          { role: 'user', content: text },
        ],
        max_tokens: 300,
        temperature: 0.3,
      }),
    })

    if (!res.ok) return

    const data = await res.json() as { choices?: { message?: { content?: string } }[] }
    const raw = data.choices?.[0]?.message?.content?.trim()
    if (!raw) return

    const parsed = JSON.parse(raw)

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

  try {
    const body = await req.json() as {
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

          const conversacionId = await getOrCreateConversation(msg.from, name, phone)

          let contenido: string | null = null
          let tipo = msg.type || 'text'
          let mediaUrl: string | null = null

          if (msg.type === 'text' && msg.text) {
            contenido = msg.text.body
          } else if (msg.type === 'image' && msg.image) {
            contenido = msg.image.caption || null
            tipo = 'image'
          } else if (msg.type === 'audio' && msg.audio) {
            tipo = 'audio'
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
              no_leidos: 1, // simplified; ideally increment
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
