export const config = { runtime: 'edge' }

const SB_URL = process.env.SUPABASE_URL ?? ''
const SB_KEY = process.env.SUPABASE_ANON_KEY ?? ''

async function sbFetch(path: string, options: RequestInit = {}) {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers as Record<string, string> | undefined),
    },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const payload = await req.json() as {
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

    // Solo procesar órdenes pagadas
    if (payload.event !== 'order/paid' && payload.event !== 'order/updated') {
      return new Response('OK', { status: 200 })
    }
    if (payload.payment_status !== 'paid' && payload.payment_status !== 'authorized') {
      return new Response('OK', { status: 200 })
    }

    const products = payload.products ?? []

    for (const item of products) {
      if (!item.sku) continue

      // Buscar el modelo por codigo_base = SKU del producto
      const modelRes = await sbFetch(
        `modelos?codigo_base=eq.${encodeURIComponent(item.sku)}&select=id,precio_costo&limit=1`
      )
      if (!modelRes.ok) continue
      const models = await modelRes.json() as { id: string; precio_costo: number }[]
      if (!models.length) continue

      const modelo = models[0]

      // Intentar extraer el talle del nombre de variante
      const variantLabel = item.variant?.values?.[0]?.es ?? item.variant?.values?.[0]?.en ?? ''
      const talleArg = parseFloat(variantLabel) || null

      // Buscar el talle correspondiente
      let talleRes: Response
      if (talleArg) {
        talleRes = await sbFetch(
          `modelo_talles?modelo_id=eq.${modelo.id}&talle_arg=eq.${talleArg}&select=id,cantidad&limit=1`
        )
      } else {
        // Sin talle específico, tomar el primero con stock
        talleRes = await sbFetch(
          `modelo_talles?modelo_id=eq.${modelo.id}&cantidad=gt.0&select=id,cantidad&order=cantidad.asc&limit=1`
        )
      }

      if (!talleRes.ok) continue
      const talles = await talleRes.json() as { id: string; cantidad: number }[]
      if (!talles.length) continue

      const talle = talles[0]
      const nuevaCantidad = Math.max(0, talle.cantidad - item.quantity)

      // Decrementar stock
      await sbFetch(`modelo_talles?id=eq.${talle.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ cantidad: nuevaCantidad }),
      })

      // Registrar la venta web
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
          tn_order_id: payload.id ?? null,
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
