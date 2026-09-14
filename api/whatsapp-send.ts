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
      type: 'text' | 'image'
      text?: string
      imageUrl?: string
      caption?: string
    }

    if (!WA_TOKEN || !WA_PHONE_NUMBER_ID) {
      return new Response(JSON.stringify({ error: 'WhatsApp not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    let waBody: Record<string, unknown>

    if (body.type === 'image' && body.imageUrl) {
      waBody = {
        messaging_product: 'whatsapp',
        to: body.to,
        type: 'image',
        image: {
          link: body.imageUrl,
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
