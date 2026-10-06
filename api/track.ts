export const config = { runtime: 'edge' }

// Recibe los eventos de tráfico que manda public/track.js desde right.com.ar
// (cargado vía Google Tag Manager) y los guarda con la RPC
// web_registrar_eventos. Acá se agrega lo que el navegador no sabe o en lo
// que no conviene confiar: dispositivo (por user-agent), ciudad/país (headers
// de geo de Vercel) y el filtro de bots.
//
// Autocontenido a propósito, sin imports relativos — mismo motivo que
// tn-webhook.ts / cron-resync.ts.

const SB_URL = process.env.SUPABASE_URL ?? ''

// Elige la primera clave que sea válida para un header HTTP. Ya pasó que una
// env var quedó con el valor enmascarado (••••) pegado por error, y fetch()
// tira un TypeError de ByteString en vez de un error claro.
function claveUsable(): string {
  const candidatas = [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SUPABASE_ANON_KEY]
  for (const k of candidatas) {
    if (k && [...k].every(c => c.charCodeAt(0) <= 255)) return k
  }
  return ''
}

const ORIGENES_PERMITIDOS = [
  /^https:\/\/(www\.)?right\.com\.ar$/,
  /^https:\/\/[a-z0-9-]+\.mitiendanube\.com$/,
]

const BOTS = /bot|crawl|spider|slurp|facebookexternalhit|headless|lighthouse|pingdom|preview|python|curl|wget|axios|node-fetch/i

const TIPOS = new Set(['page_view', 'product_view', 'add_to_cart', 'checkout_start', 'talle_select'])

interface EventoEntrante {
  tipo?: string
  path?: string
  tn_product_id?: number | string | null
  referrer?: string | null
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  talle?: string | null
  sin_stock?: boolean | null
}

interface Payload {
  visitor_id?: string
  session_id?: string
  eventos?: EventoEntrante[]
}

function corsHeaders(origin: string | null): Record<string, string> {
  const ok = origin && ORIGENES_PERMITIDOS.some(r => r.test(origin))
  return ok
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }
    : {}
}

function dispositivo(ua: string): 'mobile' | 'tablet' | 'desktop' {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return 'tablet'
  if (/mobi|iphone|ipod|android/i.test(ua)) return 'mobile'
  return 'desktop'
}

function decodificar(v: string | null): string | null {
  if (!v) return null
  try { return decodeURIComponent(v) } catch { return v }
}

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin')
  const cors = corsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })
  if (!cors['Access-Control-Allow-Origin']) return new Response(null, { status: 403 })

  const ua = req.headers.get('user-agent') ?? ''
  // Bots: respondemos OK para que no reintenten, pero no se guarda nada.
  if (!ua || BOTS.test(ua)) return new Response(null, { status: 204, headers: cors })

  const key = claveUsable()
  if (!SB_URL || !key) return new Response(null, { status: 503, headers: cors })

  let body: Payload
  try {
    // sendBeacon manda text/plain (evita el preflight de CORS), así que se
    // parsea a mano en vez de confiar en el content-type.
    body = JSON.parse(await req.text()) as Payload
  } catch {
    return new Response(null, { status: 400, headers: cors })
  }

  if (!body.visitor_id || !body.session_id || !Array.isArray(body.eventos)) {
    return new Response(null, { status: 400, headers: cors })
  }

  const disp = dispositivo(ua)
  const ciudad = decodificar(req.headers.get('x-vercel-ip-city'))
  const pais = req.headers.get('x-vercel-ip-country')

  const eventos = body.eventos
    .filter(e => e.tipo && TIPOS.has(e.tipo))
    .slice(0, 20)
    .map(e => ({
      visitor_id: body.visitor_id,
      session_id: body.session_id,
      tipo: e.tipo,
      path: e.path ?? null,
      tn_product_id: e.tn_product_id != null ? String(e.tn_product_id) : null,
      referrer: e.referrer ?? null,
      utm_source: e.utm_source ?? null,
      utm_medium: e.utm_medium ?? null,
      utm_campaign: e.utm_campaign ?? null,
      talle: typeof e.talle === 'string' ? e.talle : null,
      sin_stock: typeof e.sin_stock === 'boolean' ? e.sin_stock : null,
      dispositivo: disp,
      ciudad,
      pais,
    }))

  if (eventos.length === 0) return new Response(null, { status: 204, headers: cors })

  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/web_registrar_eventos`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_eventos: eventos }),
    })
    return new Response(null, { status: res.ok ? 204 : 502, headers: cors })
  } catch {
    return new Response(null, { status: 502, headers: cors })
  }
}
