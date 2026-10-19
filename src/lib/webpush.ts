import { buildPushPayload, type PushSubscription } from '@block65/webcrypto-web-push'

// Notificaciones push del CRM: cuando entra un mensaje de WhatsApp se avisa a
// todos los celulares que activaron las notificaciones (tabla
// push_subscriptions), aunque la app esté cerrada. Corre en las funciones edge
// de Vercel, por eso usa WebCrypto (sin la librería "web-push" de Node).

export interface PushConfig {
  supabaseUrl: string
  supabaseKey: string
  vapidPublic: string
  vapidPrivate: string
  vapidSubject: string
}

export interface PushMensaje {
  titulo: string
  cuerpo: string
  url?: string
  tag?: string
}

interface FilaSuscripcion { id: string; endpoint: string; p256dh: string; auth: string }

// Devuelve a cuántos dispositivos se les mandó. Si falta alguna clave no hace
// nada (así el webhook sigue andando aunque todavía no estén cargadas).
export async function enviarPush(cfg: PushConfig, msg: PushMensaje): Promise<number> {
  if (!cfg.vapidPublic || !cfg.vapidPrivate || !cfg.supabaseUrl || !cfg.supabaseKey) return 0
  const headers = { apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}` }
  const base = cfg.supabaseUrl.replace(/\/$/, '')

  const res = await fetch(`${base}/rest/v1/push_subscriptions?select=id,endpoint,p256dh,auth`, { headers })
  if (!res.ok) return 0
  const subs = (await res.json()) as FilaSuscripcion[]

  let enviados = 0
  await Promise.all(subs.map(async s => {
    try {
      const subscription: PushSubscription = {
        endpoint: s.endpoint,
        expirationTime: null,
        keys: { p256dh: s.p256dh, auth: s.auth },
      }
      const payload = await buildPushPayload(
        {
          data: JSON.stringify({ title: msg.titulo, body: msg.cuerpo, url: msg.url ?? '/crm', tag: msg.tag }),
          options: { ttl: 3600, urgency: 'high' },
        },
        subscription,
        { subject: cfg.vapidSubject, publicKey: cfg.vapidPublic, privateKey: cfg.vapidPrivate },
      )
      const r = await fetch(s.endpoint, payload)
      if (r.status === 404 || r.status === 410) {
        // El celu desinstaló la app o revocó el permiso: se borra para no insistir.
        await fetch(`${base}/rest/v1/push_subscriptions?id=eq.${s.id}`, { method: 'DELETE', headers })
      } else if (r.ok) {
        enviados++
      }
    } catch (err) {
      console.error('push', err)
    }
  }))
  return enviados
}
