export const config = { runtime: 'edge' }

const WA_TOKEN = process.env.WA_TOKEN ?? ''
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID ?? ''

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
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
