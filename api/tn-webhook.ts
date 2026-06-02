export const config = { runtime: 'edge' }

// Usa service role key (nunca el anon key) para escrituras privilegiadas server-side
const SB_URL = process.env.SUPABASE_URL ?? ''
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''
const EXPECTED_STORE = process.env.TN_STORE_ID ?? ''

async function sbFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers as Record<string, string> | undefined),
    },
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`sbFetch ${path} → ${res.status}: ${txt}`)
  }
  return res
}

async function verifyHmac(req: Request, rawBody: string): Promise<boolean> {
  const secret = process.env.TN_WEBHOOK_SECRET
  if (!secret) return true
  const sig = req.headers.get('x-linkedstore-hmac-sha256') ?? ''
  if (!sig) return false
  try {
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    const sigBytes = Uint8Array.from(atob(sig), c => c.charCodeAt(0))
    return await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(rawBody))
  } catch { return false }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const rawBody = await req.text()

    if (!await verifyHmac(req, rawBody)) {
      return new Response('Invalid signature', { status: 401 })
    }

    const payload = JSON.parse(rawBody) as {
      event: string
      store_id: number
      id?: number
      payment_status?: string
      products?: {
        id: number
        name: string
        quantity: number
        price: string
        sku: string | null
        variant?: { values?: { es?: string; en?: string }[] }
      }[]
    }

    // Validar que el evento viene de nuestra tienda
    if (EXPECTED_STORE && String(payload.store_id) !== EXPECTED_STORE) {
      return new Response('Store mismatch', { status: 403 })
    }

    // Solo procesar órdenes pagadas
    if (payload.event !== 'order/paid' && payload.event !== 'order/updated') {
      return new Response('OK', { status: 200 })
    }
    if (payload.payment_status !== 'paid' && payload.payment_status !== 'authorized') {
      return new Response('OK', { status: 200 })
    }

    const orderId = payload.id
    if (!orderId) return new Response('OK', { status: 200 })

    // Idempotencia: no procesar la misma orden dos veces
    const dupCheck = await sbFetch(`ventas?tn_order_id=eq.${orderId}&select=id&limit=1`)
    const existing = await dupCheck.json() as unknown[]
    if (existing.length > 0) {
      return new Response(JSON.stringify({ ok: true, skipped: 'duplicate' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const products = payload.products ?? []

    for (const item of products) {
      if (!item.sku) continue

      const modelRes = await sbFetch(
        `modelos?codigo_base=eq.${encodeURIComponent(item.sku)}&select=id,precio_costo&limit=1`
      )
      const models = await modelRes.json() as { id: string; precio_costo: number }[]
      if (!models.length) continue

      const modelo = models[0]
      const variantLabel = item.variant?.values?.[0]?.es ?? item.variant?.values?.[0]?.en ?? ''
      const talleArg = parseFloat(variantLabel) || null

      let talleRes: Response
      if (talleArg) {
        talleRes = await sbFetch(
          `modelo_talles?modelo_id=eq.${modelo.id}&talle_arg=eq.${talleArg}&select=id,cantidad&limit=1`
        )
      } else {
        talleRes = await sbFetch(
          `modelo_talles?modelo_id=eq.${modelo.id}&cantidad=gt.0&select=id,cantidad&order=cantidad.asc&limit=1`
        )
      }

      const talles = await talleRes.json() as { id: string; cantidad: number }[]
      if (!talles.length) continue

      const talle = talles[0]
      const nuevaCantidad = Math.max(0, talle.cantidad - item.quantity)

      await sbFetch(`modelo_talles?id=eq.${talle.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ cantidad: nuevaCantidad }),
      })

      // Precio tomado del payload (ya verificado por HMAC)
      const precioVenta = parseFloat(item.price) * item.quantity
      const ganancia = precioVenta - (modelo.precio_costo * item.quantity)

      await sbFetch('ventas', {
        method: 'POST',
        body: JSON.stringify({
          modelo_id: modelo.id,
          talle_arg: talleArg ?? 0,
          fecha: new Date().toISOString(),
          precio_venta: precioVenta,
          medio_pago: 'TiendaNube',
          ganancia: Math.max(0, ganancia),
          tn_order_id: orderId,
        }),
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
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
