export const config = { runtime: 'edge' }

const ALLOWED_ORIGINS = [
  'https://right-botines-stock.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]

const ALLOWED_PATHS = new Set([
  'orders', 'products', 'customers', 'coupons', 'shipping_carriers',
  'payment_providers', 'store', 'webhooks',
])

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.some(o => origin === o || origin.endsWith('.vercel.app'))
    ? origin
    : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-tn-store, x-tn-token',
    'Access-Control-Expose-Headers': 'Link, X-Total-Count',
    'Vary': 'Origin',
  }
}

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin')
  const CORS = corsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const url = new URL(req.url)
  const path = url.searchParams.get('path') ?? 'orders'

  // Token y storeId en headers, nunca en la URL
  const storeId = req.headers.get('x-tn-store')
  const token   = req.headers.get('x-tn-token')

  url.searchParams.delete('path')

  if (!storeId || !token) {
    return new Response(JSON.stringify({ error: 'Missing x-tn-store or x-tn-token headers' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  // Allowlist de paths para evitar SSRF / proxy abierto
  const basePath = path.split('/')[0]
  if (!ALLOWED_PATHS.has(basePath)) {
    return new Response(JSON.stringify({ error: 'Path not allowed' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  const tnUrl = `https://api.tiendanube.com/v1/${storeId}/${path}?${url.searchParams}`

  const tnHeaders: Record<string, string> = {
    Authentication: `bearer ${token}`,
    'User-Agent': 'RightBotinesStock (contacto@rightbotines.com)',
  }

  const fetchOptions: RequestInit = { method: req.method, headers: tnHeaders }

  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const body = await req.text()
    if (body) {
      tnHeaders['Content-Type'] = 'application/json'
      fetchOptions.body = body
    }
  }

  try {
    const tnRes = await fetch(tnUrl, fetchOptions)
    const body  = await tnRes.text()
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...CORS }
    const link  = tnRes.headers.get('Link')
    const count = tnRes.headers.get('X-Total-Count')
    if (link)  headers['Link']          = link
    if (count) headers['X-Total-Count'] = count
    return new Response(body, { status: tnRes.status, headers })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Proxy error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }
}
