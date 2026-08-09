export const config = { runtime: 'edge' }

// Resync de precio/stock corriendo en el servidor (Vercel Cron), no en el
// navegador de quien tenga la app abierta. Antes el único "resync de
// respaldo" era un setInterval client-side (useTNSync.ts) — si ese
// dispositivo tenía cargada una versión vieja del bundle, el resync corría
// con lógica de precios desactualizada y pisaba los valores correctos en la
// base (pasó dos veces el 2026-08-09). Este cron siempre corre con el
// código actualmente deployado, sin depender de ningún dispositivo.
import { upsertModeloFromTNProductREST, EXPECTED_STORE, TN_TOKEN, SB_URL, SB_KEY, type TNRawProductMinimal } from './tn-webhook'

const CRON_SECRET = process.env.CRON_SECRET

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

export default async function handler(req: Request): Promise<Response> {
  if (new URL(req.url).searchParams.get('debug') === '1') {
    return new Response(JSON.stringify({
      SB_URL: SB_URL ? `set (${SB_URL.length} chars)` : 'EMPTY',
      SB_KEY: SB_KEY ? `set (${SB_KEY.length} chars)` : 'EMPTY',
      EXPECTED_STORE: EXPECTED_STORE ? `set (${EXPECTED_STORE})` : 'EMPTY',
      TN_TOKEN: TN_TOKEN ? `set (${TN_TOKEN.length} chars)` : 'EMPTY',
      CRON_SECRET: CRON_SECRET ? 'set' : 'EMPTY',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

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

    for (const prod of productos) {
      try {
        await upsertModeloFromTNProductREST(prod)
        ok++
      } catch (err) {
        errores.push(`producto ${prod.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
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
