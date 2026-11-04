// Ubicaciones de TiendaNube (multi-inventario): "Showroom" es el local; el
// resto (hoy "Deposito CABA", la proveedora de Buenos Aires) es solo envío.
// Lo usan el webhook y el resync de TiendaNube (api/) para guardar en cada
// talle cuántos pares están fuera del local (modelo_talles.cantidad_ba).

const NOMBRE_LOCAL = /showroom/i

export interface NivelInventario { location_id?: string; stock?: number | null }

let cache: { id: string | null; ts: number } | null = null

// Id de la ubicación del local. Se guarda 10 minutos (cambia casi nunca).
export async function idUbicacionLocal(storeId: string, token: string): Promise<string | null> {
  if (cache && Date.now() - cache.ts < 10 * 60 * 1000) return cache.id
  try {
    const res = await fetch(`https://api.tiendanube.com/v1/${storeId}/locations`, {
      headers: { Authentication: `bearer ${token}`, 'User-Agent': 'RightBotinesStock (contacto@rightbotines.com)' },
    })
    if (!res.ok) return cache?.id ?? null
    const ubicaciones = await res.json() as { id: string; name?: Record<string, string> }[]
    const id = ubicaciones.find(u => Object.values(u.name ?? {}).some(n => NOMBRE_LOCAL.test(n)))?.id ?? null
    cache = { id, ts: Date.now() }
    return id
  } catch {
    return cache?.id ?? null
  }
}

// Pares del talle fuera del local. Sin ubicaciones (o sin saber cuál es el
// local) se considera todo del local.
export function stockFueraDelLocal(niveles: NivelInventario[] | undefined, idLocal: string | null): number {
  if (!niveles?.length || !idLocal) return 0
  return niveles
    .filter(n => n.location_id && n.location_id !== idLocal)
    .reduce((s, n) => s + Math.max(0, n.stock ?? 0), 0)
}
