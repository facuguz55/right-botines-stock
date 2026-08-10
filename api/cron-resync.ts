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
import { upsertModeloFromTNProductREST, EXPECTED_STORE, TN_TOKEN, type TNRawProductMinimal } from './_shared/tnProductSync'

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
