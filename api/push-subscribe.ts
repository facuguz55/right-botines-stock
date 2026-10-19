export const config = { runtime: 'edge' }

const SB_URL = process.env.SUPABASE_URL ?? ''
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

// Mismo criterio que whatsapp-send.ts: la app no tiene sesión de servidor, así
// que al menos se exige que el POST venga del propio front. Lo único que puede
// hacer alguien que falsifique el origen es registrar un celu para recibir
// avisos (el texto de los mensajes), por eso conviene sumar sesiones reales más
// adelante.
const ALLOWED_ORIGINS = [
  'https://right-botines-stock.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const origin = req.headers.get('origin')
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return json({ error: 'Origen no permitido' }, 403)
  if (!SB_URL || !SB_KEY) return json({ error: 'Falta configuración' }, 503)

  let body: { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; nombre?: string }
  try { body = await req.json() } catch { return json({ error: 'JSON inválido' }, 400) }

  const sub = body.subscription
  const endpoint = sub?.endpoint
  const p256dh = sub?.keys?.p256dh
  const auth = sub?.keys?.auth
  if (!endpoint || !p256dh || !auth || !endpoint.startsWith('https://')) return json({ error: 'Suscripción inválida' }, 400)

  const res = await fetch(`${SB_URL.replace(/\/$/, '')}/rest/v1/push_subscriptions?on_conflict=endpoint`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      endpoint, p256dh, auth,
      nombre: body.nombre?.slice(0, 60) ?? null,
      user_agent: req.headers.get('user-agent')?.slice(0, 200) ?? null,
    }),
  })
  if (!res.ok) return json({ error: 'No se pudo guardar' }, 502)
  return json({ ok: true })
}
