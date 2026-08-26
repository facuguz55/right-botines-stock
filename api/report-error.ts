export const config = { runtime: 'edge' }

const ALLOWED_ORIGINS = [
  'https://right-botines-stock.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.some(o => origin === o || origin.endsWith('.vercel.app'))
    ? origin
    : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  }
}

// Reenvía el reporte de error a nova-agency-os. El secreto vive solo acá
// (variables de entorno de servidor), nunca en el bundle del cliente.
export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin')
  const CORS = corsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  const webhookUrl = process.env.ERROR_WEBHOOK_URL
  const webhookSecret = process.env.ERROR_WEBHOOK_SECRET
  if (!webhookUrl || !webhookSecret) {
    return new Response(JSON.stringify({ error: 'Webhook not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  try {
    const body = await req.text()
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${webhookSecret}`,
      },
      body,
    })
  } catch {
    // El reporte de errores nunca debe romper la app que lo dispara.
  }

  return new Response(null, { status: 204, headers: CORS })
}
