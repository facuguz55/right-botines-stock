// Runtime Node.js (no Edge): recorrer ~340 productos en serie contra la API
// de TN + Supabase tarda más que el límite corto de Edge Functions (se
// confirmó en vivo: cortaba a mitad de camino). Node.js soporta hasta 300s.
export const maxDuration = 120

// Resync de precio/stock corriendo en el servidor (Vercel Cron), no en el
// navegador de quien tenga la app abierta. Antes el único "resync de
// respaldo" era un setInterval client-side (useTNSync.ts) — si ese
// dispositivo tenía cargada una versión vieja del bundle, el resync corría
// con lógica de precios desactualizada y pisaba los valores correctos en la
// base (pasó dos veces el 2026-08-09). Este cron siempre corre con el
// código actualmente deployado, sin depender de ningún dispositivo.
//
// La lógica de upsert está DUPLICADA de api/tn-webhook.ts a propósito, no
// importada: Vercel no resuelve en runtime un import entre dos archivos de
// api/ que son ambos rutas propias (confirmado en vivo dos veces —
// "Cannot find module" aunque compila bien en local — ni una subcarpeta
// con prefijo "_" lo evita). Si se toca la lógica de precios acá, tocar
// también tn-webhook.ts.
import {
  parseTalleArg, getUsFromArg, detectCategoria, detectGama, extractMarcaModelo, variantLabel,
  computePrecioEfectivo,
} from '../src/lib/tnMapping'

const SB_URL = process.env.SUPABASE_URL ?? ''
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''
const EXPECTED_STORE = process.env.TN_STORE_ID ?? ''
const TN_TOKEN = process.env.TN_TOKEN ?? ''
const CRON_SECRET = process.env.CRON_SECRET

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

interface TNRawProductMinimal {
  id: number
  name: Record<string, string>
  brand: string | null
  categories: { id: number; name: Record<string, string> }[]
  variants: {
    id: number
    sku: string | null
    price: string
    promotional_price: string | null
    stock: number | null
    values: { es?: string; en?: string; [k: string]: string | undefined }[]
  }[]
  images: { src: string }[]
}

async function fetchAllTNProductsServerSide(): Promise<TNRawProductMinimal[]> {
  const perPage = 200
  const all: TNRawProductMinimal[] = []
  let page = 1
  const maxPages = 10 // 2000 productos tope — mismo límite que fetchTNRawProducts client-side

  while (page <= maxPages) {
    const res = await fetch(
      `https://api.tiendanube.com/v1/${EXPECTED_STORE}/products?page=${page}&per_page=${perPage}`,
      { headers: { Authentication: `bearer ${TN_TOKEN}`, 'User-Agent': 'RightBotinesStock (contacto@rightbotines.com)' } },
    )
    if (!res.ok) throw new Error(`TN fetch products page ${page} → ${res.status}`)
    const data = await res.json() as TNRawProductMinimal[]
    all.push(...data)
    const hasMore = (res.headers.get('Link') ?? '').includes('rel="next"')
    if (!hasMore || data.length === 0) break
    page++
  }
  return all
}

async function fetchRecargoCredito3Cuotas(): Promise<number | null> {
  const res = await sbFetch(`recargos_tarjeta?tarjeta=eq.${encodeURIComponent('Crédito')}&cuotas=eq.3&activo=eq.true&select=porcentaje&limit=1`)
  const rows = await res.json() as { porcentaje: number }[]
  return rows[0]?.porcentaje ?? null
}

async function fetchPrecioTiers(): Promise<Record<number, number>> {
  const res = await sbFetch(`precio_tiers_tarjeta?select=precio_tarjeta,precio_efectivo`)
  const rows = await res.json() as { precio_tarjeta: number; precio_efectivo: number }[]
  const tiers: Record<number, number> = {}
  for (const r of rows) tiers[Number(r.precio_tarjeta)] = Number(r.precio_efectivo)
  return tiers
}

async function findExistingModeloByTNProduct(productId: number): Promise<{ id: string } | undefined> {
  const byTnId = await sbFetch(`modelos?tn_product_id=eq.${productId}&select=id&limit=1`)
  const rowsA = await byTnId.json() as { id: string }[]
  if (rowsA[0]) return rowsA[0]
  const byCodigo = await sbFetch(`modelos?codigo_base=eq.tn_${productId}&select=id&limit=1`)
  const rowsB = await byCodigo.json() as { id: string }[]
  return rowsB[0]
}

async function upsertModeloFromTNProductREST(prod: TNRawProductMinimal): Promise<void> {
  const name = prod.name.es ?? prod.name.en ?? Object.values(prod.name)[0] ?? `Producto ${prod.id}`
  const catNames = (prod.categories ?? []).map(c => c.name?.es ?? c.name?.en ?? '')
  const categoria = detectCategoria(name, catNames)
  const gama = detectGama(name, catNames)
  const { marca, modelo } = extractMarcaModelo(prod)
  const precio_venta = parseFloat(prod.variants[0]?.price ?? '0') || 0
  const promoRaw = prod.variants[0]?.promotional_price
  const precio_promocional = promoRaw ? parseFloat(promoRaw) || null : null
  const [recargoPct, tiers] = await Promise.all([fetchRecargoCredito3Cuotas(), fetchPrecioTiers()])
  const precio_efectivo = computePrecioEfectivo(precio_promocional ?? precio_venta, tiers, recargoPct)
  const tn_category_id = prod.categories?.[0]?.id ?? null

  const variantTalles = prod.variants
    .map(v => {
      const talle_arg = parseTalleArg(variantLabel(v))
      return talle_arg !== null
        ? { talle_arg, talle_us: getUsFromArg(talle_arg), stock: v.stock ?? 0, variantId: v.id }
        : null
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  let existing = await findExistingModeloByTNProduct(prod.id)
  for (let i = 0; i < 3 && !existing; i++) {
    await new Promise(resolve => setTimeout(resolve, 1500))
    existing = await findExistingModeloByTNProduct(prod.id)
  }

  let modeloId: string
  if (existing) {
    modeloId = existing.id
    await sbFetch(`modelos?id=eq.${modeloId}`, {
      method: 'PATCH',
      body: JSON.stringify({ marca, modelo, categoria, gama, precio_venta, precio_promocional, precio_efectivo, tn_category_id, tn_product_id: prod.id }),
    })
  } else {
    const insertRes = await fetch(`${SB_URL}/rest/v1/modelos`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=representation',
      },
      body: JSON.stringify({
        marca, modelo, categoria, gama, precio_venta, precio_promocional, precio_efectivo,
        precio_costo: 0,
        codigo_base: `tn_${prod.id}`,
        notas: null,
        tn_product_id: prod.id,
        tn_category_id,
      }),
    })
    if (insertRes.ok) {
      const inserted = await insertRes.json() as { id: string }[]
      modeloId = inserted[0].id
    } else {
      const conflict = await findExistingModeloByTNProduct(prod.id)
      if (!conflict) throw new Error(`insert modelos → ${insertRes.status}: ${await insertRes.text().catch(() => '')}`)
      modeloId = conflict.id
      await sbFetch(`modelos?id=eq.${modeloId}`, {
        method: 'PATCH',
        body: JSON.stringify({ marca, modelo, categoria, gama, precio_venta, precio_promocional, precio_efectivo, tn_category_id, tn_product_id: prod.id }),
      })
    }
  }

  const tallesRes = await sbFetch(`modelo_talles?modelo_id=eq.${modeloId}&select=id,talle_arg,stock_minimo`)
  const existingTalles = await tallesRes.json() as { id: string; talle_arg: number; stock_minimo: number }[]

  const seenTalleArgs = new Set<number>()
  for (const vt of variantTalles) {
    seenTalleArgs.add(vt.talle_arg)
    const existingTalle = existingTalles.find(t => Number(t.talle_arg) === vt.talle_arg)
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

  for (const t of existingTalles) {
    if (!seenTalleArgs.has(Number(t.talle_arg))) await sbFetch(`modelo_talles?id=eq.${t.id}`, { method: 'DELETE' })
  }

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
  // Vercel manda Authorization: Bearer <CRON_SECRET> en las invocaciones
  // reales del cron cuando esa env var está seteada en el proyecto.
  if (CRON_SECRET) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${CRON_SECRET}`) return new Response('Unauthorized', { status: 401 })
  }

  try {
    const productos = await fetchAllTNProductsServerSide()
    let ok = 0
    const errores: string[] = []

    // En paralelo de a lotes (no todo junto, para no saturar la API de TN
    // ni Supabase) — bajó bastante el riesgo de pasarse de maxDuration.
    const BATCH = 8
    for (let i = 0; i < productos.length; i += BATCH) {
      const lote = productos.slice(i, i + BATCH)
      const resultados = await Promise.allSettled(lote.map(prod => upsertModeloFromTNProductREST(prod)))
      resultados.forEach((r, idx) => {
        if (r.status === 'fulfilled') ok++
        else errores.push(`producto ${lote[idx].id}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`)
      })
    }

    return new Response(JSON.stringify({ ok: true, total: productos.length, actualizados: ok, errores }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
