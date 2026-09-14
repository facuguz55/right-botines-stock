export const config = { runtime: 'edge' }

// Proxy server-side hacia el webhook de errores de Nova Agency OS. El
// secreto compartido (ERROR_WEBHOOK_SECRET) vive SOLO acá, sin prefijo
// VITE_, para que nunca termine en el bundle del cliente — un secreto en
// una variable VITE_* queda visible para cualquiera que abra devtools.
const NOVA_ENDPOINT = process.env.ERROR_WEBHOOK_URL ?? ''
const NOVA_SECRET = process.env.ERROR_WEBHOOK_SECRET ?? ''

interface ClientReportBody {
  asunto: string
  error: {
    id: string
    donde: string
    mensaje?: string
    stack?: string
    detalle?: Record<string, unknown>
    url?: string
    navegador?: string
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  if (!NOVA_ENDPOINT || !NOVA_SECRET) {
    return new Response(JSON.stringify({ error: 'Reporte de errores no configurado' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json() as ClientReportBody

    if (!body.error?.id || !body.error?.donde) {
      return new Response(JSON.stringify({ error: 'Faltan error.id o error.donde' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const res = await fetch(NOVA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NOVA_SECRET}`,
      },
      body: JSON.stringify({
        app: 'right-botines-stock',
        asunto: body.asunto,
        error: body.error,
      }),
    })

    return new Response(null, { status: res.ok ? 202 : 502 })
  } catch {
    return new Response(JSON.stringify({ error: 'No se pudo enviar el reporte' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
