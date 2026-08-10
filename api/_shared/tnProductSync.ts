// Lógica compartida de upsert de producto TN → modelo local, usada tanto por
// api/tn-webhook.ts (un producto por webhook) como por api/cron-resync.ts
// (todo el catálogo, cron diario). Vive en api/_shared/ (prefijo "_") para
// que Vercel NO la trate como una ruta propia — si viviera en un archivo
// que también es una función (como antes, importada directo desde
// tn-webhook.ts), el bundler de Node.js no logra resolver el import en
// runtime ("Cannot find module") aunque compile bien en local.
import {
  parseTalleArg, getUsFromArg, detectCategoria, detectGama, extractMarcaModelo, variantLabel,
  computePrecioEfectivo,
} from '../../src/lib/tnMapping'

// SUPABASE_URL/SUPABASE_ANON_KEY (o SUPABASE_SERVICE_ROLE_KEY si se agrega
// más adelante) para escrituras server-side — no confundir con las VITE_*
// que usa el cliente. Cargadas en Vercel el 2026-08-09.
const SB_URL = process.env.SUPABASE_URL ?? ''
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''
export const EXPECTED_STORE = process.env.TN_STORE_ID ?? ''
export const TN_TOKEN = process.env.TN_TOKEN ?? ''

export async function sbFetch(path: string, options: RequestInit = {}) {
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

export interface TNRawProductMinimal {
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
  // Fallback defensivo: por si algún modelo quedó con el codigo_base viejo
  // (tn_<id>) sin tn_product_id seteado, para no crear otro duplicado.
  const byCodigo = await sbFetch(`modelos?codigo_base=eq.tn_${productId}&select=id&limit=1`)
  const rowsB = await byCodigo.json() as { id: string }[]
  return rowsB[0]
}

// ── Upsert de un modelo a partir de un producto TN completo (versión REST) ──
// Misma lógica que upsertModeloFromTNProduct en src/services/tnSync.ts, pero
// vía sbFetch (Edge/Node server-side no puede usar el cliente supabase-js del browser).

export async function upsertModeloFromTNProductREST(prod: TNRawProductMinimal): Promise<void> {
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
  // El push local (creación/edición) puede tardar en persistir tn_product_id
  // y el webhook puede llegar antes de que termine — reintentamos un par de
  // veces antes de asumir que el producto es realmente nuevo, para no crear
  // un modelo local duplicado por una carrera.
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
    // Insert directo (no sbFetch) para poder detectar un choque de unique
    // constraint (23505) contra tn_product_id — última red de contención
    // ante una carrera real de dos webhooks concurrentes — y autocorregir
    // cayendo a un update en vez de fallar o duplicar.
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

  // Comparación con Number(): talle_arg es `numeric` en Postgres y puede
  // volver como string vía PostgREST — evita un mismatch de tipo silencioso.
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

  // Bidireccional: un talle local que ya no está en TN se borra acá.
  for (const t of existingTalles) {
    if (!seenTalleArgs.has(Number(t.talle_arg))) await sbFetch(`modelo_talles?id=eq.${t.id}`, { method: 'DELETE' })
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
