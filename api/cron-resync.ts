// Runtime Node.js (no Edge): recorrer ~340 productos en serie contra la API
// de TN + Supabase tarda más que el límite corto de Edge Functions (se
// confirmó en vivo: cortaba a mitad de camino). 300s es el techo real de
// este plan — confirmado en vivo por "Vercel Runtime Timeout Error: Task
// timed out after 300 seconds" en los runtime logs, pese a haber declarado
// 120 acá (este handler estilo Request→Response no parece respetar este
// valor — mismo patrón que el problema de imports relativos documentado
// más abajo). El fix real fue bajar el trabajo por producto, no subir esto.
export const maxDuration = 300

// Resync de precio/stock corriendo en el servidor (Vercel Cron), no en el
// navegador de quien tenga la app abierta. Antes el único "resync de
// respaldo" era un setInterval client-side (useTNSync.ts) — si ese
// dispositivo tenía cargada una versión vieja del bundle, el resync corría
// con lógica de precios desactualizada y pisaba los valores correctos en la
// base (pasó dos veces el 2026-08-09). Este cron siempre corre con el
// código actualmente deployado, sin depender de ningún dispositivo.
//
// TODO el archivo es autocontenido a propósito, sin NINGÚN import relativo
// (ni de otro archivo de api/, ni de src/lib/tnMapping): confirmado en vivo
// tres veces que el runtime Node.js de Vercel para esta función (handler
// Request→Response) NO resuelve imports relativos — ni entre rutas de api/,
// ni hacia src/ — aunque compile perfecto en local y con esbuild --bundle.
// "Cannot find module" en runtime siempre. Si se toca la lógica de precios
// acá, tocar también tn-webhook.ts (que si puede importar de src/lib, corre
// en runtime Edge, con otro bundler que sí resuelve imports relativos).
const ARG_TO_US: Record<number, number> = {
  34: 2, 34.5: 2.5, 35: 3, 35.5: 3.5, 36: 4, 36.5: 4.5, 37: 5, 37.5: 5.5,
  38: 6, 38.5: 6.5, 39: 7, 39.5: 7.5, 40: 8, 40.5: 8.5, 41: 9, 41.5: 9.5,
  42: 10, 42.5: 10.5, 43: 11, 43.5: 11.5, 44: 12, 44.5: 12.5, 45: 13, 45.5: 13.5,
  46: 14, 46.5: 14.5, 47: 15,
}
function getUsFromArg(arg: number): number {
  return ARG_TO_US[arg] ?? Math.round((arg - 30.5) * 2) / 2
}
function variantLabel(v: { values?: { es?: string; en?: string; [k: string]: string | undefined }[] }): string {
  return (v.values ?? []).map(val => val.es ?? val.en ?? Object.values(val).find(x => x) ?? '').join(' ')
}
function parseTalleArg(label: string): number | null {
  const cleaned = label.replace(/talle|t\.?\s*/gi, '').trim()
  const match = cleaned.match(/^(\d{2,3}(?:[.,]\d)?)/)
  if (!match) return null
  const n = parseFloat(match[1].replace(',', '.'))
  if (n < 30 || n > 60) return null
  return n
}
function detectCategoria(name: string, catNames: string[]): string {
  const all = [name, ...catNames].join(' ').toLowerCase()
  if (/futsal|f\.?sala|sala/.test(all)) return 'Futsal'
  if (/hockey/.test(all)) return 'Hockey'
  if (/\bf5\b|fútbol\s*5|futbol\s*5|cinco/.test(all)) return 'F5'
  if (/\bf11\b|fútbol\s*11|futbol\s*11|once|eleven/.test(all)) return 'F11'
  return 'F11'
}
function detectGama(name: string, catNames: string[]): string {
  const all = [name, ...catNames].join(' ').toLowerCase()
  if (/económica|economica|low|entry|baja/.test(all)) return 'Económica'
  if (/mixto|mix|dual|campo/.test(all)) return 'Mixto'
  if (/\bmedia\b|mid\b|intermedia/.test(all)) return 'Media'
  if (/\balta\b|high|premium|pro\b|top\b|elite/.test(all)) return 'Alta'
  return 'Alta'
}
function computePrecioEfectivo(
  precioTarjeta: number | null, tiers: Record<number, number>, recargoCredito3CuotasPct: number | null,
): number | null {
  if (precioTarjeta == null) return null
  const tier = tiers[precioTarjeta]
  if (tier != null) return tier
  if (recargoCredito3CuotasPct == null || recargoCredito3CuotasPct <= 0) return null
  return Math.round(precioTarjeta / (1 + recargoCredito3CuotasPct / 100))
}
function extractMarcaModelo(prod: { brand?: string | null; name: Record<string, string>; id: number }): { marca: string; modelo: string } {
  const name = prod.name.es ?? prod.name.en ?? Object.values(prod.name)[0] ?? `Producto ${prod.id}`
  const brand = (prod.brand ?? '').trim()
  if (brand) {
    const modelo = name.toLowerCase().startsWith(brand.toLowerCase())
      ? name.slice(brand.length).trim().replace(/^[-–—·]\s*/, '')
      : name
    return { marca: brand, modelo: modelo || name }
  }
  const parts = name.split(' ')
  return { marca: parts[0] || 'Sin marca', modelo: parts.slice(1).join(' ') || name }
}

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

async function upsertModeloFromTNProductREST(
  prod: TNRawProductMinimal,
  recargoPct: number | null,
  tiers: Record<number, number>,
): Promise<void> {
  const name = prod.name.es ?? prod.name.en ?? Object.values(prod.name)[0] ?? `Producto ${prod.id}`
  const catNames = (prod.categories ?? []).map(c => c.name?.es ?? c.name?.en ?? '')
  const categoria = detectCategoria(name, catNames)
  const gama = detectGama(name, catNames)
  const { marca, modelo } = extractMarcaModelo(prod)
  const precio_venta = parseFloat(prod.variants[0]?.price ?? '0') || 0
  const promoRaw = prod.variants[0]?.promotional_price
  const precio_promocional = promoRaw ? parseFloat(promoRaw) || null : null
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

  // Sin retry-with-delay acá a propósito: eso solo tiene sentido para el
  // race condition de un webhook de un solo producto disparado antes de que
  // termine de indexarse — en un resync completo del catálogo no hay nada
  // que esperar, si no aparece es simplemente un producto nuevo.
  const existing = await findExistingModeloByTNProduct(prod.id)

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

  // Talles de un mismo producto en paralelo (son independientes entre sí) —
  // antes iban de a uno secuencial y era el principal cuello de botella:
  // con ~340 productos × varios talles cada uno, sumaba minutos enteros.
  const seenTalleArgs = new Set<number>()
  const talleWrites: Promise<unknown>[] = []
  for (const vt of variantTalles) {
    seenTalleArgs.add(vt.talle_arg)
    const existingTalle = existingTalles.find(t => Number(t.talle_arg) === vt.talle_arg)
    if (existingTalle) {
      talleWrites.push(sbFetch(`modelo_talles?id=eq.${existingTalle.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ talle_us: vt.talle_us, talle_arg: vt.talle_arg, cantidad: vt.stock, tn_variant_id: vt.variantId }),
      }))
    } else {
      talleWrites.push(sbFetch('modelo_talles', {
        method: 'POST',
        body: JSON.stringify({
          modelo_id: modeloId, talle_us: vt.talle_us, talle_arg: vt.talle_arg,
          cantidad: vt.stock, stock_minimo: 1, tn_variant_id: vt.variantId,
        }),
      }))
    }
  }
  for (const t of existingTalles) {
    if (!seenTalleArgs.has(Number(t.talle_arg))) {
      talleWrites.push(sbFetch(`modelo_talles?id=eq.${t.id}`, { method: 'DELETE' }))
    }
  }
  await Promise.all(talleWrites)

  if (prod.images.length > 0) {
    const fotosRes = await sbFetch(`modelo_fotos?modelo_id=eq.${modeloId}&select=id&limit=1`)
    const fotos = await fotosRes.json() as unknown[]
    if (fotos.length === 0) {
      const rows = prod.images.slice(0, 5).map((img, idx) => ({ modelo_id: modeloId, foto_url: img.src, orden: idx }))
      await sbFetch('modelo_fotos', { method: 'POST', body: JSON.stringify(rows) })
    }
  }
}

// Firma clásica de Node.js (req, res) — NO Request→Response. Confirmado en
// vivo vía runtime logs el motivo real de todos los colgados anteriores:
// "default export returned a `Response`. The default-export signature is
// `(req, res) => void` — returns are ignored." Este es un proyecto Vite (no
// Next.js), así que las funciones de api/*.ts usan la convención Node
// clásica de Vercel — el estilo Request→Response solo aplica con
// `runtime: 'edge'` (como en tn-webhook.ts) o dentro de Next.js App Router.
// La función corría bien entera y nunca mandaba la respuesta: quedaba
// colgada hasta que Vercel mataba la conexión por su cuenta.
interface VercelReq { headers: Record<string, string | string[] | undefined> }
interface VercelRes {
  status(code: number): VercelRes
  json(body: unknown): void
  end(body?: string): void
}

// Detecta env vars corruptas (p.ej. se pegó el valor enmascarado "••••••"
// del dashboard de Vercel en vez del valor real) antes de usarlas en un
// header, donde fetch() tira un TypeError de ByteString poco claro. No se
// loguea el valor, solo el nombre de la variable y la posición del carácter
// inválido, para poder diagnosticar sin exponer el secreto.
function checkHeaderSafe(name: string, value: string): string | null {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 255) {
      return `${name} contiene un carácter inválido para un header (posición ${i}, código ${value.charCodeAt(i)}) — revisar en Vercel que no se haya pegado el valor enmascarado en vez del real`
    }
  }
  return null
}

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  // Vercel manda Authorization: Bearer <CRON_SECRET> en las invocaciones
  // reales del cron cuando esa env var está seteada en el proyecto.
  if (CRON_SECRET) {
    const auth = req.headers['authorization']
    if (auth !== `Bearer ${CRON_SECRET}`) { res.status(401).end('Unauthorized'); return }
  }

  const envErrors = [
    checkHeaderSafe('SUPABASE_URL', SB_URL),
    checkHeaderSafe('SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY', SB_KEY),
    checkHeaderSafe('TN_TOKEN', TN_TOKEN),
    checkHeaderSafe('TN_STORE_ID', EXPECTED_STORE),
  ].filter((e): e is string => e != null)
  if (envErrors.length > 0) {
    res.status(500).json({ ok: false, error: 'Variables de entorno inválidas', detalle: envErrors })
    return
  }

  try {
    // recargoPct/tiers son globales (misma config para los ~340 productos) —
    // se levantan UNA sola vez acá. Antes se pedían de nuevo por cada
    // producto dentro de upsertModeloFromTNProductREST: 340 productos × 2
    // llamadas = 680 round-trips a Supabase desperdiciados, la causa
    // principal de que esto terminara pasándose del límite de tiempo
    // (confirmado en los runtime logs: "Task timed out after 300 seconds").
    const [productos, recargoPct, tiers] = await Promise.all([
      fetchAllTNProductsServerSide(),
      fetchRecargoCredito3Cuotas(),
      fetchPrecioTiers(),
    ])
    let ok = 0
    const errores: string[] = []

    // En paralelo de a lotes (no todo junto, para no saturar Supabase).
    // Subido de 8 a 16 ahora que cada producto pesa mucho menos (talles en
    // paralelo, sin fetches repetidos ni retries innecesarios).
    const BATCH = 16
    for (let i = 0; i < productos.length; i += BATCH) {
      const lote = productos.slice(i, i + BATCH)
      const resultados = await Promise.allSettled(lote.map(prod => upsertModeloFromTNProductREST(prod, recargoPct, tiers)))
      resultados.forEach((r, idx) => {
        if (r.status === 'fulfilled') ok++
        else errores.push(`producto ${lote[idx].id}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`)
      })
    }

    res.status(200).json({ ok: true, total: productos.length, actualizados: ok, errores })
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) })
  }
}
