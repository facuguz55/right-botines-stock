export const config = { runtime: 'edge' }

import { sbFetch, verifyOwnerPin } from '../src/lib/supabaseRest'
import { decrypt, encrypt } from '../src/lib/gmailCrypto'
import { buildRawGmailMessage } from '../src/lib/gmailMime'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HAS_CRLF = /[\r\n]/

function isValidRecipient(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 200 && EMAIL_REGEX.test(v) && !HAS_CRLF.test(v)
}
function isValidSubject(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 200 && !HAS_CRLF.test(v)
}
function isValidBody(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 50_000
}

interface IntegrationRow {
  access_token_encrypted: string | null
  refresh_token_encrypted: string | null
  expires_at: string | null
  status: string
  email: string | null
}

// Devuelve un access token válido, refrescándolo si está por vencer. null si
// Gmail no está conectado o el refresh falló — nunca tira, para que el
// caller lo trate como "no conectado" en vez de 500.
async function getGmailToken(): Promise<{ accessToken: string; email: string } | null> {
  const res = await sbFetch('gmail_integration?id=eq.1&select=access_token_encrypted,refresh_token_encrypted,expires_at,status,email')
  const rows = res.ok ? await res.json() as IntegrationRow[] : []
  const row = rows[0]
  if (!row || row.status !== 'active' || !row.access_token_encrypted) return null

  const secret = process.env.ENCRYPTION_SECRET!
  let accessToken: string
  try {
    accessToken = await decrypt(row.access_token_encrypted, secret)
  } catch {
    return null
  }

  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0
  const isExpiringSoon = expiresAt < Date.now() + 5 * 60 * 1000

  if (isExpiringSoon && row.refresh_token_encrypted) {
    try {
      const refreshToken = await decrypt(row.refresh_token_encrypted, secret)
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      })
      if (refreshRes.ok) {
        const data = await refreshRes.json() as { access_token: string; expires_in: number }
        accessToken = data.access_token
        await sbFetch('gmail_integration?id=eq.1', {
          method: 'PATCH',
          body: JSON.stringify({
            access_token_encrypted: await encrypt(accessToken, secret),
            expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
          }),
        })
      }
    } catch {
      // Falla transitoria del refresh: se sigue con el token viejo — si de
      // verdad venció, el envío va a fallar con 401 más abajo.
    }
  }

  return { accessToken, email: row.email ?? '' }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let payload: { pin?: unknown; to?: unknown; subject?: unknown; body?: unknown }
  try {
    payload = await req.json()
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (typeof payload.pin !== 'string' || !payload.pin) return Response.json({ error: 'Falta el PIN' }, { status: 400 })
  const pinValido = await verifyOwnerPin(payload.pin)
  if (!pinValido) return Response.json({ error: 'PIN incorrecto' }, { status: 401 })

  if (!isValidRecipient(payload.to)) return Response.json({ error: 'Destinatario inválido' }, { status: 400 })
  if (!isValidSubject(payload.subject)) return Response.json({ error: 'Asunto inválido' }, { status: 400 })
  if (!isValidBody(payload.body)) return Response.json({ error: 'El mensaje no puede estar vacío ni superar 50.000 caracteres' }, { status: 400 })

  const gmail = await getGmailToken()
  if (!gmail) return Response.json({ error: 'Gmail no está conectado' }, { status: 409 })

  const raw = buildRawGmailMessage({ fromEmail: gmail.email, to: payload.to, subject: payload.subject, body: payload.body })

  const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${gmail.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  })

  if (!sendRes.ok) {
    const text = await sendRes.text().catch(() => '')
    console.error('mail-send: Gmail API error', sendRes.status, text)
    return Response.json({ error: `No se pudo enviar el mail (${sendRes.status})` }, { status: 502 })
  }

  return Response.json({ ok: true })
}
