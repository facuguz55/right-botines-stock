export const config = { runtime: 'edge' }

import { sbFetch } from '../src/lib/supabaseRest'
import { enviarPush } from '../src/lib/webpush'

// Notificación al celu (solo los que la activaron en Depósito CABA) cuando la logística de Buenos Aires despacha un pedido.
// La llama la Edge Function logistica-ba con el id de la acción recién
// guardada. No hace falta clave: solo avisa por un despacho real, de los
// últimos 2 minutos, y una sola vez (se marca "notificado").
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const { id } = await req.json().catch(() => ({})) as { id?: string }
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'id inválido' }, { status: 400 })

  const desde = new Date(Date.now() - 2 * 60_000).toISOString()
  // Se marca y se lee en un solo paso: si dos llamadas llegan juntas, solo una avisa.
  const res = await sbFetch(
    `logistica_acciones?id=eq.${id}&accion=eq.despachado&ok=eq.true&origen=eq.logistica&notificado=eq.false&created_at=gte.${encodeURIComponent(desde)}`,
    { method: 'PATCH', body: JSON.stringify({ notificado: true }) },
  )
  const filas = res.ok ? await res.json() as { orden_numero: number }[] : []
  if (!filas.length) return Response.json({ ok: true, enviados: 0 })

  const enviados = await enviarPush(
    {
      supabaseUrl: process.env.SUPABASE_URL ?? '',
      supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      vapidPublic: process.env.VAPID_PUBLIC_KEY ?? '',
      vapidPrivate: process.env.VAPID_PRIVATE_KEY ?? '',
      vapidSubject: process.env.VAPID_SUBJECT ?? 'https://right-botines-stock.vercel.app',
    },
    {
      titulo: '📦 Pedido despachado desde Buenos Aires',
      cuerpo: `La logística despachó el pedido #${filas[0].orden_numero}. Al cliente le llegó el aviso con el seguimiento.`,
      url: '/',
      tag: `despacho-${filas[0].orden_numero}`,
    },
    '&avisos_despacho=eq.true',
  )
  return Response.json({ ok: true, enviados })
}
