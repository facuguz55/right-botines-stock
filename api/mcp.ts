import { atenderRpc, claveValida, type AccesoDb, type FilaDb } from '../src/lib/mcpRight'

export const config = { runtime: 'edge' }

// Conector MCP (solo lectura) del dashboard de Right Botines Stock, para
// agregarlo como conector personalizado en el Claude del dueño.
//   URL: https://right-botines-stock.vercel.app/api/mcp?key=<MCP_RIGHT_KEY>
// La clave se carga en Vercel como MCP_RIGHT_KEY (varias separadas por coma
// para poder rotar sin cortar el acceso). Claude.ai no deja mandar headers en
// los conectores personalizados, por eso también se acepta en la URL; también
// funciona "Authorization: Bearer <clave>". Para revocar: cambiar la variable.
// Toda la lógica está en src/lib/mcpRight.ts.

const SB_URL = process.env.SUPABASE_URL ?? ''
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }

const db: AccesoDb = {
  async leer(path, opciones) {
    const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
      method: 'GET',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        ...(opciones?.contar ? { Prefer: 'count=exact' } : {}),
      },
    })
    if (!res.ok) throw new Error(`Supabase ${res.status}`)
    const filas = (await res.json()) as FilaDb[]
    const rango = res.headers.get('content-range') // "0-49/1234"
    const total = rango && /\/(\d+)$/.test(rango) ? Number(rango.split('/')[1]) : null
    return { filas, total }
  },
}

function respuestaJson(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: JSON_HEADERS })
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null
  const clave = bearer ?? url.searchParams.get('key')

  if (!claveValida(clave, process.env.MCP_RIGHT_KEY)) {
    return respuestaJson({ error: 'No autorizado' }, 401)
  }
  if (!SB_URL || !SB_KEY) return respuestaJson({ error: 'Servidor sin configurar' }, 500)

  // Sin canal de notificaciones del servidor hacia el cliente.
  if (req.method === 'GET') return new Response(null, { status: 405, headers: { Allow: 'POST' } })
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } })

  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return respuestaJson({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } }, 400)
  }

  if (Array.isArray(cuerpo)) {
    if (cuerpo.length > 20) return respuestaJson({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Demasiados mensajes juntos' } }, 400)
    const respuestas = (await Promise.all(cuerpo.map(p => atenderRpc(db, p)))).filter(Boolean)
    return respuestas.length ? respuestaJson(respuestas) : new Response(null, { status: 202 })
  }

  const r = await atenderRpc(db, cuerpo as Parameters<typeof atenderRpc>[1])
  return r ? respuestaJson(r) : new Response(null, { status: 202 })
}
