export const config = { runtime: 'edge' }

import { sbFetch } from '../src/lib/supabaseRest'
import { origenPublico } from '../src/lib/publicUrl'

const NONCE_COOKIE = 'rb_gmail_nonce'
const STATE_MAX_AGE_MS = 10 * 60 * 1000

// Mínimo indispensable: solo hace falta poder mandar mails (gmail.send).
// No se pide gmail.readonly/modify/compose: esta app nunca lee la bandeja
// ni guarda borradores, solo manda avisos a clientes de preventa.
// "email" aparte: no hay garantía de que gmail.send alcance para
// users.getProfile de la API de Gmail (ese scope es solo de escritura) —
// se pide el email por el endpoint estándar de identidad de Google en vez
// de arriesgar que la cuenta quede conectada sin poder mostrar qué cuenta
// es. Alcance mínimo también: no abre nada de Gmail, solo da el email.
const SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'email'].join(' ')

// Se navega acá pegando el link completo en el navegador (para pasar por el
// consentimiento de Google), así que el "state" viaja en la URL — por eso
// mail-auth-pending.ts lo emite de un solo uso y con 10 minutos de vida.
export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const state = url.searchParams.get('state') ?? ''
  if (!state) return new Response('Falta el parámetro state.', { status: 400 })

  const checkRes = await sbFetch(
    `gmail_oauth_pending?state=eq.${encodeURIComponent(state)}&used_at=is.null&select=created_at`,
  )
  const rows = checkRes.ok ? await checkRes.json() as { created_at: string }[] : []
  const row = rows[0]
  if (!row || Date.now() - new Date(row.created_at).getTime() > STATE_MAX_AGE_MS) {
    return new Response('El link para conectar Gmail venció — volvé a tocar "Conectar Gmail".', { status: 401 })
  }

  // HYP-002 (ver gmail-oauth-state.ts de nova-local): el state por sí solo
  // prueba "de un solo uso y no venció", pero no prueba que lo esté
  // completando el mismo navegador que lo pidió. Si este link se filtra o se
  // comparte antes de usarse, cualquiera que lo abra dentro de los 10
  // minutos conectaría SU propia cuenta de Google a la tienda. Se liga el
  // state a un nonce random guardado tanto en la fila como en una cookie
  // propia del navegador; mail-auth-callback exige que coincidan.
  const nonce = crypto.randomUUID().replace(/-/g, '')
  const bindRes = await sbFetch(`gmail_oauth_pending?state=eq.${encodeURIComponent(state)}&used_at=is.null`, {
    method: 'PATCH',
    body: JSON.stringify({ browser_nonce: nonce }),
  })
  // PostgREST devuelve 200 con un array vacío si el PATCH no afectó ninguna
  // fila (ej. alguien más ya la usó entre el check de arriba y este PATCH)
  // — bindRes.ok por sí solo no alcanza para confirmar que de verdad se
  // ató el nonce a la fila.
  const bindRows = bindRes.ok ? await bindRes.json() as unknown[] : []
  if (bindRows.length === 0) return new Response('No se pudo iniciar la conexión con Gmail.', { status: 502 })

  const origin = origenPublico()
  const redirectUri = `${origin}/api/mail-auth-callback`

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  })

  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      'Set-Cookie': `${NONCE_COOKIE}=${nonce}; Path=/api/mail-auth-callback; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  })
}
