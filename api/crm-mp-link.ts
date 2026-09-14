export const config = { runtime: 'edge' }

const MP_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN ?? ''

// Ver el comentario equivalente en api/whatsapp-send.ts: la app no tiene
// sesión de servidor, así que esto es solo defensa en profundidad contra un
// curl externo, no autenticación real. Sin wildcard '.vercel.app' — permitía
// pasar el chequeo a cualquier deploy ajeno alojado en ese dominio.
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

  if (!MP_ACCESS_TOKEN) {
    return new Response(JSON.stringify({ error: 'MercadoPago not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json() as {
      title: string
      price: number
      quantity?: number
      description?: string
    }

    const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          {
            title: body.title,
            unit_price: body.price,
            quantity: body.quantity || 1,
            description: body.description || '',
            currency_id: 'ARS',
          },
        ],
        auto_return: 'approved',
      }),
    })

    const data = await res.json() as { init_point?: string; id?: string }

    if (!res.ok) {
      return new Response(JSON.stringify({ error: data }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      ok: true,
      link: data.init_point,
      preferenceId: data.id,
    }), {
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
