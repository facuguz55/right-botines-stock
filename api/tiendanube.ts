export const config = { runtime: 'edge' }

const ALLOWED_ORIGINS = [
  'https://right-botines-stock.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]

const ALLOWED_PATHS = new Set([
  'orders', 'products', 'customers', 'coupons', 'shipping_carriers',
  'payment_providers', 'store', 'webhooks', 'categories',
])

// Las credenciales de TiendaNube del servidor solo se usan para dispositivos
// habilitados por el dueño (migración 046_dispositivos_habilitados.sql).
// Antes el proxy las usaba para cualquiera que lo llamara: desde afuera se
// podían leer órdenes y clientes y crear/editar/borrar productos.
const SB_URL = process.env.SUPABASE_URL ?? ''

// Primera clave válida para un header HTTP (ya pasó que una env var quedó
// con el valor enmascarado "••••" pegado por error).
function claveSupabase(): string {
  for (const k of [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SUPABASE_ANON_KEY]) {
    if (k && [...k].every(c => c.charCodeAt(0) <= 255)) return k
  }
  return ''
}

// Cache corta en memoria de la función: evita consultar la base en cada
// pedido (una sincronización hace decenas seguidos). Un dispositivo quitado
// deja de funcionar a lo sumo en este tiempo.
const CACHE_MS = 5 * 60 * 1000
const tokensValidos = new Map<string, number>()

async function dispositivoHabilitado(token: string | null): Promise<boolean> {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return false
  const vence = tokensValidos.get(token)
  if (vence && vence > Date.now()) return true

  const key = claveSupabase()
  if (!SB_URL || !key) return false
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/dispositivo_valido`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: token }),
    })
    if (!res.ok) return false
    const valido = (await res.json()) === true
    if (valido) tokensValidos.set(token, Date.now() + CACHE_MS)
    return valido
  } catch {
    return false
  }
}

// Despliegue sin cortar el servicio: el permiso se exige recién cuando hay al
// menos un dispositivo habilitado (ver proxy_exige_dispositivo). Se cachea
// corto: "sí" 5 minutos, "no" 30 segundos (para que empiece a exigir enseguida
// después de habilitar el primero). Si la base no responde, se exige.
let exigeCache: { valor: boolean; vence: number } | null = null

async function proxyExigeDispositivo(): Promise<boolean> {
  if (exigeCache && exigeCache.vence > Date.now()) return exigeCache.valor
  const key = claveSupabase()
  if (!SB_URL || !key) return true
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/proxy_exige_dispositivo`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!res.ok) return true
    const valor = (await res.json()) === true
    exigeCache = { valor, vence: Date.now() + (valor ? CACHE_MS : 30_000) }
    return valor
  } catch {
    return true
  }
}

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.some(o => origin === o || origin.endsWith('.vercel.app'))
    ? origin
    : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-tn-store, x-tn-token, x-device-token',
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

  // Token y storeId en headers, nunca en la URL. Si el cliente manda sus
  // propias credenciales (las cargadas en Ajustes), se usan esas: no da acceso
  // a nada que no tenga ya. Si no, se usan las del servidor, pero solo para
  // un dispositivo habilitado con el PIN del dueño.
  const storeCliente = req.headers.get('x-tn-store')
  const tokenCliente = req.headers.get('x-tn-token')
  const usaServidor = !(storeCliente && tokenCliente)

  if (usaServidor && !(await dispositivoHabilitado(req.headers.get('x-device-token'))) && await proxyExigeDispositivo()) {
    return new Response(JSON.stringify({ error: 'DISPOSITIVO_NO_HABILITADO' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  const storeId = usaServidor ? (process.env.TN_STORE_ID || null) : storeCliente
  const token   = usaServidor ? (process.env.TN_TOKEN || null) : tokenCliente

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
