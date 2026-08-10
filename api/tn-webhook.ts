export const config = { runtime: 'edge' }

import { sbFetch, upsertModeloFromTNProductREST, EXPECTED_STORE, TN_TOKEN, type TNRawProductMinimal } from './_shared/tnProductSync'

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

// ── Producto TN (fetch server-side, los webhooks de TN mandan payload mínimo) ─

async function fetchTNProductServerSide(productId: number): Promise<TNRawProductMinimal> {
  const res = await fetch(`https://api.tiendanube.com/v1/${EXPECTED_STORE}/products/${productId}`, {
    headers: { Authentication: `bearer ${TN_TOKEN}`, 'User-Agent': 'RightBotinesStock (contacto@rightbotines.com)' },
  })
  if (!res.ok) throw new Error(`TN fetch product ${productId} → ${res.status}`)
  return await res.json()
}

// ── Órdenes (fetch server-side + upsert a tn_ordenes) ────────────────────────
// Los webhooks de orden mandan payload mínimo, igual que los de producto —
// hay que pedir la orden completa. Cada línea de producto SÍ trae
// product_id/variant_id reales (confirmado contra la doc oficial), a
// diferencia del payload del webhook que nunca los tuvo.

interface TNRawOrderProduct {
  id: number
  product_id: number
  variant_id: number
  name: string
  price: string
  quantity: number
  sku: string | null
}

interface TNRawOrder {
  id: number
  number: number
  status: string
  payment_status: string
  shipping_status?: string
  total: string
  subtotal: string
  total_shipping: string
  discount: string
  customer: { id: number; name: string; email: string } | null
  products: TNRawOrderProduct[]
  payment_details: { method: string } | null
  coupon: unknown
  note: string | null
  shipping_address: unknown
  created_at: string
}

interface TNRawCustomer {
  id: number
  name: string
  email: string
  phone: string | null
  total_spent: string
  orders_count: number
  created_at: string
}

async function fetchTNOrderServerSide(orderId: number): Promise<TNRawOrder> {
  const res = await fetch(`https://api.tiendanube.com/v1/${EXPECTED_STORE}/orders/${orderId}`, {
    headers: { Authentication: `bearer ${TN_TOKEN}`, 'User-Agent': 'RightBotinesStock (contacto@rightbotines.com)' },
  })
  if (!res.ok) throw new Error(`TN fetch order ${orderId} → ${res.status}`)
  return await res.json()
}

async function fetchTNCustomerServerSide(customerId: number): Promise<TNRawCustomer> {
  const res = await fetch(`https://api.tiendanube.com/v1/${EXPECTED_STORE}/customers/${customerId}`, {
    headers: { Authentication: `bearer ${TN_TOKEN}`, 'User-Agent': 'RightBotinesStock (contacto@rightbotines.com)' },
  })
  if (!res.ok) throw new Error(`TN fetch customer ${customerId} → ${res.status}`)
  return await res.json()
}

// Upsert real de Postgrest (registro plano, no necesita el patrón buscar-
// existing/PATCH-o-POST que usa upsertModeloFromTNProductREST).
async function upsertOrdenServerSide(o: TNRawOrder): Promise<void> {
  const row = {
    tn_order_id: o.id,
    number: o.number,
    status: o.status,
    payment_status: o.payment_status,
    shipping_status: o.shipping_status ?? null,
    total: parseFloat(o.total) || 0,
    subtotal: parseFloat(o.subtotal) || 0,
    total_shipping: parseFloat(o.total_shipping) || 0,
    discount: parseFloat(o.discount) || 0,
    customer_tn_id: o.customer?.id ?? null,
    customer_name: o.customer?.name ?? null,
    customer_email: o.customer?.email ?? null,
    payment_method: o.payment_details?.method ?? null,
    payment_detail: o.payment_details ?? null,
    coupon: o.coupon ?? null,
    note: o.note ?? null,
    shipping_address: o.shipping_address ?? null,
    products: o.products ?? [],
    tn_created_at: o.created_at,
  }
  await sbFetch('tn_ordenes?on_conflict=tn_order_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row),
  })
}

async function upsertClienteServerSide(c: TNRawCustomer): Promise<void> {
  const row = {
    tn_customer_id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    total_spent: parseFloat(c.total_spent) || 0,
    orders_count: c.orders_count,
    tn_created_at: c.created_at,
  }
  await sbFetch('tn_clientes?on_conflict=tn_customer_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row),
  })
}

// Descuento de stock por venta pagada en TN. Antes leía payload.products
// (que nunca vino poblado en un webhook real — el descuento nunca funcionó).
// Ahora recibe la orden ya fetcheada, con product_id/variant_id reales por
// línea, y matchea contra modelo_talles.tn_variant_id (fuente de verdad del
// talle, no hace falta parsear ningún label).
async function descontarStockPorOrden(order: TNRawOrder): Promise<void> {
  const dupCheck = await sbFetch(`ventas?tn_order_id=eq.${order.id}&select=id&limit=1`)
  const existing = await dupCheck.json() as unknown[]
  if (existing.length > 0) return // idempotencia: ya procesada

  for (const item of order.products) {
    let talleRow: { id: string; cantidad: number; talle_arg: number } | undefined
    let modeloRow: { id: string; precio_costo: number } | undefined

    if (item.variant_id) {
      const r = await sbFetch(`modelo_talles?tn_variant_id=eq.${item.variant_id}&select=id,cantidad,talle_arg,modelo_id&limit=1`)
      const rows = await r.json() as { id: string; cantidad: number; talle_arg: number; modelo_id: string }[]
      if (rows.length) {
        talleRow = { id: rows[0].id, cantidad: rows[0].cantidad, talle_arg: rows[0].talle_arg }
        const mr = await sbFetch(`modelos?id=eq.${rows[0].modelo_id}&select=id,precio_costo&limit=1`)
        const mrows = await mr.json() as { id: string; precio_costo: number }[]
        modeloRow = mrows[0]
      }
    }

    if (!modeloRow && item.product_id) {
      const mr = await sbFetch(`modelos?tn_product_id=eq.${item.product_id}&select=id,precio_costo&limit=1`)
      const mrows = await mr.json() as { id: string; precio_costo: number }[]
      modeloRow = mrows[0]
    }

    if (!modeloRow && item.sku) {
      const modelRes = await sbFetch(`modelos?codigo_base=eq.${encodeURIComponent(item.sku)}&select=id,precio_costo&limit=1`)
      const models = await modelRes.json() as { id: string; precio_costo: number }[]
      modeloRow = models[0]
    }

    if (!modeloRow) continue

    if (!talleRow) {
      // Sin variant_id resuelto: heurística de respaldo, el talle con menos stock disponible
      const talleRes = await sbFetch(
        `modelo_talles?modelo_id=eq.${modeloRow.id}&cantidad=gt.0&select=id,cantidad,talle_arg&order=cantidad.asc&limit=1`
      )
      const talles = await talleRes.json() as { id: string; cantidad: number; talle_arg: number }[]
      talleRow = talles[0]
    }

    if (!talleRow) continue

    const nuevaCantidad = Math.max(0, talleRow.cantidad - item.quantity)
    await sbFetch(`modelo_talles?id=eq.${talleRow.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ cantidad: nuevaCantidad }),
    })

    const precioVenta = parseFloat(item.price) * item.quantity
    const ganancia = precioVenta - (modeloRow.precio_costo * item.quantity)

    await sbFetch('ventas', {
      method: 'POST',
      body: JSON.stringify({
        modelo_id: modeloRow.id,
        talle_arg: talleRow.talle_arg,
        fecha: new Date().toISOString(),
        precio_venta: precioVenta,
        medio_pago: 'TiendaNube',
        ganancia: Math.max(0, ganancia),
        tn_order_id: order.id,
      }),
    })
  }
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
    }

    // Validar que el evento viene de nuestra tienda
    if (EXPECTED_STORE && String(payload.store_id) !== EXPECTED_STORE) {
      return new Response('Store mismatch', { status: 403 })
    }

    // ── Eventos de producto (alta/edición) ──────────────────────────────────
    if (payload.event === 'product/created' || payload.event === 'product/updated') {
      const productId = payload.id
      if (!productId) return new Response('OK', { status: 200 })
      const prod = await fetchTNProductServerSide(productId)
      await upsertModeloFromTNProductREST(prod)
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── Producto borrado ──────────────────────────────────────────────────
    if (payload.event === 'product/deleted') {
      const productId = payload.id
      if (!productId) return new Response('OK', { status: 200 })
      const res = await sbFetch(`modelos?tn_product_id=eq.${productId}&select=id&limit=1`)
      const found = await res.json() as { id: string }[]
      if (found.length) {
        const modeloId = found[0].id
        await sbFetch(`modelo_fotos?modelo_id=eq.${modeloId}`, { method: 'DELETE' })
        await sbFetch(`modelo_talles?modelo_id=eq.${modeloId}`, { method: 'DELETE' })
        await sbFetch(`modelos?id=eq.${modeloId}`, { method: 'DELETE' })
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── Eventos de orden (alta/edición/pago/cancelación/etc.) ───────────────
    // El webhook manda payload mínimo (igual que producto) — se fetchea la
    // orden completa y se guarda en tn_ordenes sin importar el sub-tipo de
    // evento (mismo criterio que product/created|updated).
    if (payload.event.startsWith('order/')) {
      const orderId = payload.id
      if (!orderId) return new Response('OK', { status: 200 })
      const order = await fetchTNOrderServerSide(orderId)
      await upsertOrdenServerSide(order)

      if (order.payment_status === 'paid' || order.payment_status === 'authorized') {
        await descontarStockPorOrden(order)
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── Eventos de cliente ───────────────────────────────────────────────
    if (payload.event === 'customer/created' || payload.event === 'customer/updated') {
      const customerId = payload.id
      if (!customerId) return new Response('OK', { status: 200 })
      const customer = await fetchTNCustomerServerSide(customerId)
      await upsertClienteServerSide(customer)
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (payload.event === 'customer/deleted') {
      const customerId = payload.id
      if (customerId) await sbFetch(`tn_clientes?tn_customer_id=eq.${customerId}`, { method: 'DELETE' })
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response('OK', { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
