export const config = { runtime: 'edge' }

import {
  parseTalleArg, getUsFromArg, detectCategoria, detectGama, extractMarcaModelo, variantLabel,
} from '../src/lib/tnMapping'

// Usa service role key (nunca el anon key) para escrituras privilegiadas server-side
const SB_URL = process.env.SUPABASE_URL ?? ''
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''
const EXPECTED_STORE = process.env.TN_STORE_ID ?? ''
const TN_TOKEN = process.env.TN_TOKEN ?? ''

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

// ── Producto TN (fetch server-side, los webhooks de TN mandan payload mínimo) ─

interface TNRawProductMinimal {
  id: number
  name: Record<string, string>
  brand: string | null
  categories: { id: number; name: Record<string, string> }[]
  variants: {
    id: number
    sku: string | null
    price: string
    stock: number | null
    values: { es?: string; en?: string; [k: string]: string | undefined }[]
  }[]
  images: { src: string }[]
}

async function fetchTNProductServerSide(productId: number): Promise<TNRawProductMinimal> {
  const res = await fetch(`https://api.tiendanube.com/v1/${EXPECTED_STORE}/products/${productId}`, {
    headers: { Authentication: `bearer ${TN_TOKEN}`, 'User-Agent': 'RightBotinesStock (contacto@rightbotines.com)' },
  })
  if (!res.ok) throw new Error(`TN fetch product ${productId} → ${res.status}`)
  return await res.json()
}

// ── Upsert de un modelo a partir de un producto TN completo (versión REST) ──
// Misma lógica que upsertModeloFromTNProduct en src/services/tnSync.ts, pero
// vía sbFetch (Edge runtime no puede usar el cliente supabase-js del browser).

async function upsertModeloFromTNProductREST(prod: TNRawProductMinimal): Promise<void> {
  const name = prod.name.es ?? prod.name.en ?? Object.values(prod.name)[0] ?? `Producto ${prod.id}`
  const catNames = (prod.categories ?? []).map(c => c.name?.es ?? c.name?.en ?? '')
  const categoria = detectCategoria(name, catNames)
  const gama = detectGama(name, catNames)
  const { marca, modelo } = extractMarcaModelo(prod)
  const precio_venta = parseFloat(prod.variants[0]?.price ?? '0') || 0
  const tn_category_id = prod.categories?.[0]?.id ?? null

  const variantTalles = prod.variants
    .map(v => {
      const talle_arg = parseTalleArg(variantLabel(v))
      return talle_arg !== null
        ? { talle_arg, talle_us: getUsFromArg(talle_arg), stock: v.stock ?? 0, variantId: v.id }
        : null
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const existingRes = await sbFetch(`modelos?tn_product_id=eq.${prod.id}&select=id&limit=1`)
  const existingRows = await existingRes.json() as { id: string }[]
  const existing = existingRows[0]

  let modeloId: string
  if (existing) {
    modeloId = existing.id
    await sbFetch(`modelos?id=eq.${modeloId}`, {
      method: 'PATCH',
      body: JSON.stringify({ marca, modelo, categoria, gama, precio_venta, tn_category_id }),
    })
  } else {
    const insertRes = await sbFetch('modelos', {
      method: 'POST',
      body: JSON.stringify({
        marca, modelo, categoria, gama, precio_venta,
        precio_costo: 0,
        codigo_base: `tn_${prod.id}`,
        notas: null,
        tn_product_id: prod.id,
        tn_category_id,
      }),
    })
    const inserted = await insertRes.json() as { id: string }[]
    modeloId = inserted[0].id
  }

  const tallesRes = await sbFetch(`modelo_talles?modelo_id=eq.${modeloId}&select=id,talle_arg,stock_minimo`)
  const existingTalles = await tallesRes.json() as { id: string; talle_arg: number; stock_minimo: number }[]

  const seenTalleArgs = new Set<number>()
  for (const vt of variantTalles) {
    seenTalleArgs.add(vt.talle_arg)
    const existingTalle = existingTalles.find(t => t.talle_arg === vt.talle_arg)
    if (existingTalle) {
      await sbFetch(`modelo_talles?id=eq.${existingTalle.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ talle_us: vt.talle_us, talle_arg: vt.talle_arg, cantidad: vt.stock, tn_variant_id: vt.variantId }),
      })
    } else {
      await sbFetch('modelo_talles', {
        method: 'POST',
        body: JSON.stringify({
          modelo_id: modeloId, talle_us: vt.talle_us, talle_arg: vt.talle_arg,
          cantidad: vt.stock, stock_minimo: 1, tn_variant_id: vt.variantId,
        }),
      })
    }
  }

  // Bidireccional: un talle local que ya no está en TN se borra acá.
  for (const t of existingTalles) {
    if (!seenTalleArgs.has(t.talle_arg)) await sbFetch(`modelo_talles?id=eq.${t.id}`, { method: 'DELETE' })
  }

  // Fotos solo si el modelo no tiene ninguna todavía (no se resuelve sync de fotos en esta iteración)
  if (prod.images.length > 0) {
    const fotosRes = await sbFetch(`modelo_fotos?modelo_id=eq.${modeloId}&select=id&limit=1`)
    const fotos = await fotosRes.json() as unknown[]
    if (fotos.length === 0) {
      const rows = prod.images.slice(0, 5).map((img, idx) => ({ modelo_id: modeloId, foto_url: img.src, orden: idx }))
      await sbFetch('modelo_fotos', { method: 'POST', body: JSON.stringify(rows) })
    }
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
      payment_status?: string
      products?: {
        id: number
        name: string
        quantity: number
        price: string
        sku: string | null
        product_id?: number
        variant_id?: number
        variant?: { values?: { es?: string; en?: string }[] }
      }[]
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

    // ── Órdenes pagadas ──────────────────────────────────────────────────
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
      let talleRow: { id: string; cantidad: number } | undefined
      let modeloRow: { id: string; precio_costo: number } | undefined

      // Matching preferido: por tn_variant_id / tn_product_id (si el payload los trae)
      if (item.variant_id) {
        const r = await sbFetch(`modelo_talles?tn_variant_id=eq.${item.variant_id}&select=id,cantidad,modelo_id&limit=1`)
        const rows = await r.json() as { id: string; cantidad: number; modelo_id: string }[]
        if (rows.length) {
          talleRow = { id: rows[0].id, cantidad: rows[0].cantidad }
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

      // Fallback viejo: por codigo_base = sku (rara vez matchea, se mantiene como red de contención)
      if (!modeloRow && item.sku) {
        const modelRes = await sbFetch(
          `modelos?codigo_base=eq.${encodeURIComponent(item.sku)}&select=id,precio_costo&limit=1`
        )
        const models = await modelRes.json() as { id: string; precio_costo: number }[]
        modeloRow = models[0]
      }

      if (!modeloRow) continue

      const variantLabelStr = item.variant?.values?.[0]?.es ?? item.variant?.values?.[0]?.en ?? ''
      const talleArg = parseFloat(variantLabelStr) || null

      if (!talleRow) {
        let talleRes: Response
        if (talleArg) {
          talleRes = await sbFetch(
            `modelo_talles?modelo_id=eq.${modeloRow.id}&talle_arg=eq.${talleArg}&select=id,cantidad&limit=1`
          )
        } else {
          talleRes = await sbFetch(
            `modelo_talles?modelo_id=eq.${modeloRow.id}&cantidad=gt.0&select=id,cantidad&order=cantidad.asc&limit=1`
          )
        }
        const talles = await talleRes.json() as { id: string; cantidad: number }[]
        talleRow = talles[0]
      }

      if (!talleRow) continue

      const nuevaCantidad = Math.max(0, talleRow.cantidad - item.quantity)

      await sbFetch(`modelo_talles?id=eq.${talleRow.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ cantidad: nuevaCantidad }),
      })

      // Precio tomado del payload (ya verificado por HMAC)
      const precioVenta = parseFloat(item.price) * item.quantity
      const ganancia = precioVenta - (modeloRow.precio_costo * item.quantity)

      await sbFetch('ventas', {
        method: 'POST',
        body: JSON.stringify({
          modelo_id: modeloRow.id,
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
