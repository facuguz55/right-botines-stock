export const config = { runtime: 'edge' }

const WA_TOKEN = process.env.WA_TOKEN ?? ''
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID ?? ''

// La app no tiene sesión de servidor (el "login" es un PIN verificado una
// sola vez contra Supabase, sin token de sesión reutilizable) — no hay JWT
// que pedirle a este endpoint. Como mitigación de defensa en profundidad,
// al menos exigimos que el POST venga del propio front (no de un curl
// externo que descubrió la URL). Esto NO es autenticación real: un origen
// se puede falsificar fuera del navegador. Cerrar esto del todo requiere
// agregar sesiones de usuario reales al proyecto.
// Sin wildcard '.vercel.app': cualquier deploy ajeno alojado en ese dominio
// (ej. "cualquier-cosa.vercel.app") mandaría ese mismo Origin y pasaría el
// chequeo — no es "nuestros previews", es "cualquiera en Vercel". Si hace
// falta permitir previews de este proyecto, agregar acá la URL exacta o un
// sufijo específico del proyecto, nunca el dominio completo de Vercel.
const ALLOWED_ORIGINS = [
  'https://right-botines-stock.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]

function isAllowedOrigin(origin: string | null): boolean {
  return !!origin && ALLOWED_ORIGINS.includes(origin)
}

const MIMES_IMAGEN_OK = ['image/jpeg', 'image/png', 'image/webp']

// Tienda Nube sirve algunas fotos (las subidas "originales", sin el sufijo
// -1024-1024) como application/octet-stream, y Meta las rechaza (error 131053)
// aunque sean JPG de verdad. Se detecta el formato real por los primeros bytes
// y, si el servidor no lo declara bien, se sube la foto a Meta con su mime
// correcto y se manda por id en vez de por link.
function mimeDeImagen(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}

async function idDeImagenSiHaceFalta(url: string): Promise<string | null> {
  try {
    const head = await fetch(url, { method: 'HEAD' })
    const tipo = (head.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (head.ok && MIMES_IMAGEN_OK.includes(tipo)) return null
    const img = await fetch(url)
    if (!img.ok) return null
    const bytes = new Uint8Array(await img.arrayBuffer())
    const mime = mimeDeImagen(bytes)
    if (!mime || bytes.byteLength > 5 * 1024 * 1024) return null
    const form = new FormData()
    form.append('messaging_product', 'whatsapp')
    form.append('type', mime)
    form.append('file', new Blob([bytes], { type: mime }), mime === 'image/png' ? 'foto.png' : mime === 'image/webp' ? 'foto.webp' : 'foto.jpg')
    const up = await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_NUMBER_ID}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}` },
      body: form,
    })
    const data = await up.json() as { id?: string }
    return up.ok && data.id ? data.id : null
  } catch {
    return null
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  if (!isAllowedOrigin(req.headers.get('origin'))) {
    return new Response(JSON.stringify({ error: 'Origen no permitido' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json() as {
      to: string
      type: 'text' | 'image' | 'document' | 'video'
      videoUrl?: string
      text?: string
      imageUrl?: string
      documentUrl?: string
      filename?: string
      caption?: string
      // Mensaje al que se responde (cita de WhatsApp): wa_message_id.
      contextId?: string
    }

    if (!WA_TOKEN || !WA_PHONE_NUMBER_ID) {
      return new Response(JSON.stringify({ error: 'WhatsApp not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    let waBody: Record<string, unknown>

    if (body.type === 'image' && body.imageUrl) {
      const mediaId = await idDeImagenSiHaceFalta(body.imageUrl)
      waBody = {
        messaging_product: 'whatsapp',
        to: body.to,
        type: 'image',
        image: {
          ...(mediaId ? { id: mediaId } : { link: body.imageUrl }),
          caption: body.caption || undefined,
        },
      }
    } else if (body.type === 'video' && body.videoUrl) {
      waBody = {
        messaging_product: 'whatsapp',
        to: body.to,
        type: 'video',
        video: {
          link: body.videoUrl,
          caption: body.caption || undefined,
        },
      }
    } else if (body.type === 'document' && body.documentUrl) {
      waBody = {
        messaging_product: 'whatsapp',
        to: body.to,
        type: 'document',
        document: {
          link: body.documentUrl,
          filename: body.filename || undefined,
          caption: body.caption || undefined,
        },
      }
    } else {
      waBody = {
        messaging_product: 'whatsapp',
        to: body.to,
        type: 'text',
        text: { body: body.text || '' },
      }
    }

    if (body.contextId && body.contextId.startsWith('wamid.')) waBody.context = { message_id: body.contextId }

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${WA_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${WA_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(waBody),
      }
    )

    const data = await res.json()

    if (!res.ok) {
      return new Response(JSON.stringify({ error: data }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
