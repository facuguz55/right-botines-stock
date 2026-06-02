export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-tn-store, x-tn-token',
    'Access-Control-Expose-Headers': 'Link, X-Total-Count',
  }

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const url = new URL(req.url)
  const path = url.searchParams.get('path') ?? 'orders'

  // Token y storeId llegan por headers (nunca en la URL)
  const storeId = req.headers.get('x-tn-store')
  const token   = req.headers.get('x-tn-token')

  url.searchParams.delete('path')

  if (!storeId || !token) {
    return new Response(JSON.stringify({ error: 'Missing x-tn-store or x-tn-token headers' }), {
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
    return new Response(JSON.stringify({ error: 'Proxy error', detail: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }
}
