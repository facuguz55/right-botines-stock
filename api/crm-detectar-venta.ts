import { detectarVenta, evaluarVenta, pagosDelHistorial, traerMensajes, type MensajeVenta } from '../src/lib/crmVenta'

export const config = { runtime: 'edge' }

// Detector de ventas del CRM llamado desde la app:
// - { conversacionId }: después de que el local contesta (por ejemplo "recibido,
//   gracias" tras un comprobante), vuelve a mirar ese chat.
// - { revisarDias }: revisa los chats con movimiento de los últimos días que todavía
//   no tienen venta marcada (para no perder las que pasaron antes de este cambio).
// - { evaluar: [{ conversacionId, hasta? }] }: solo dice qué opina la IA, sin guardar
//   nada (para controlar el detector contra charlas reales).
// - { auditarReglas: true }: pasa las reglas (sin IA) por el historial completo de
//   todos los chats y devuelve cada pago que encuentran. No guarda nada.
// El webhook de WhatsApp hace lo mismo cuando escribe el cliente.

const SB_URL = process.env.SUPABASE_URL ?? ''
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? process.env.VITE_ANTHROPIC_API_KEY ?? ''

// Mismo criterio que api/whatsapp-send.ts: solo desde el propio front.
const ALLOWED_ORIGINS = [
  'https://right-botines-stock.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]

// Una revisión entra en el tiempo de una función edge: pocos chats, de a varios a la vez.
const TOPE_REVISION = 40
const EN_PARALELO = 8

function sbFetch(path: string, options: RequestInit = {}) {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
      ...(options.headers ?? {}),
    },
  })
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const origin = req.headers.get('origin')
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return json({ error: 'Origen no permitido' }, 403)
  if (!SB_URL || !SB_KEY || !ANTHROPIC_API_KEY) return json({ error: 'Falta configuración' }, 503)

  const deps = { sbFetch, anthropicKey: ANTHROPIC_API_KEY }
  try {
    const body = await req.json() as { conversacionId?: string; revisarDias?: number; evaluar?: { conversacionId: string; hasta?: string }[]; auditarReglas?: boolean }

    if (body.auditarReglas) {
      const convs = await sbFetch('wsp_conversaciones?select=id,nombre&limit=1000').then(r => r.json()) as { id: string; nombre: string | null }[]
      const pagos: unknown[] = []
      for (let i = 0; i < convs.length; i += 10) {
        await Promise.all(convs.slice(i, i + 10).map(async c => {
          const msgs = await sbFetch(`wsp_mensajes?conversacion_id=eq.${c.id}&select=direccion,tipo,contenido,transcripcion,media_url,timestamp&order=timestamp.asc&limit=2000`).then(r => r.json()) as MensajeVenta[]
          for (const p of pagosDelHistorial(msgs)) pagos.push({ conversacionId: c.id, nombre: c.nombre, ...p })
        }))
      }
      return json({ ok: true, chats: convs.length, pagos })
    }

    if (Array.isArray(body.evaluar)) {
      const casos = body.evaluar.filter(c => /^[0-9a-f-]{36}$/i.test(c.conversacionId)).slice(0, 12)
      const resultados = await Promise.all(casos.map(async c => {
        const r = await evaluarVenta(deps, await traerMensajes(deps, c.conversacionId, c.hasta)).catch(e => ({ error: String(e) }))
        return { conversacionId: c.conversacionId, ...r }
      }))
      return json({ ok: true, resultados })
    }

    if (body.conversacionId && /^[0-9a-f-]{36}$/i.test(body.conversacionId)) {
      const marcada = await detectarVenta(deps, body.conversacionId, 'local')
      return json({ ok: true, marcadas: marcada ? 1 : 0 })
    }

    if (body.revisarDias) {
      const dias = Math.min(Math.max(1, Math.round(body.revisarDias)), 30)
      const desde = new Date(Date.now() - dias * 86400_000).toISOString()
      const convs = await sbFetch(
        `wsp_conversaciones?select=id&venta_detectada_at=is.null&ultimo_mensaje_at=gte.${desde}&categoria=neq.Spam&order=ultimo_mensaje_at.desc&limit=${TOPE_REVISION}`,
      ).then(r => r.json()) as { id: string }[]
      let marcadas = 0
      for (let i = 0; i < convs.length; i += EN_PARALELO) {
        const tanda = await Promise.all(convs.slice(i, i + EN_PARALELO).map(c => detectarVenta(deps, c.id, 'revision')))
        marcadas += tanda.filter(Boolean).length
      }
      return json({ ok: true, revisadas: convs.length, marcadas })
    }

    return json({ error: 'Falta conversacionId o revisarDias' }, 400)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
}
