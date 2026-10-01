export const config = { runtime: 'edge' }

import { sbFetch } from '../src/lib/supabaseRest'
import { origenPublico } from '../src/lib/publicUrl'
import { encrypt } from '../src/lib/gmailCrypto'

const NONCE_COOKIE = 'rb_gmail_nonce'
const STATE_MAX_AGE_MS = 10 * 60 * 1000

function leerNonceCookie(req: Request): string | null {
  const raw = req.headers.get('cookie')
  if (!raw) return null
  for (const parte of raw.split(';')) {
    const [k, ...resto] = parte.trim().split('=')
    if (k === NONCE_COOKIE) return resto.join('=') || null
  }
  return null
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const origin = origenPublico()
  const redirectHome = (query: string) =>
    new Response(null, { status: 302, headers: { Location: `${origin}/?${query}` } })

  const code = url.searchParams.get('code') ?? ''
  const state = url.searchParams.get('state') ?? ''
  if (!code || !state) return redirectHome('gmail=error')

  // El state se consume acá, condicionado a que el nonce de la cookie
  // coincida con el guardado en la fila (ver mail-auth-start.ts) — si no
  // coincide o la fila ya se usó, el UPDATE no afecta ninguna fila y
  // "claimed" queda vacío. Atómico: si llegaran dos callbacks con el mismo
  // state, solo el que trae la cookie correcta se queda con la fila.
  const browserNonce = leerNonceCookie(req)
  if (!browserNonce) return redirectHome('gmail=error')

  const claimRes = await sbFetch(
    `gmail_oauth_pending?state=eq.${encodeURIComponent(state)}&used_at=is.null&browser_nonce=eq.${encodeURIComponent(browserNonce)}`,
    { method: 'PATCH', body: JSON.stringify({ used_at: new Date().toISOString() }) },
  )
  const claimed = claimRes.ok ? await claimRes.json() as { created_at: string }[] : []
  const row = claimed[0]

  const expireCookie = `${NONCE_COOKIE}=; Path=/api/mail-auth-callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0`

  if (!row || Date.now() - new Date(row.created_at).getTime() > STATE_MAX_AGE_MS) {
    const resp = redirectHome('gmail=error')
    resp.headers.append('Set-Cookie', expireCookie)
    return resp
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${origin}/api/mail-auth-callback`,
        grant_type: 'authorization_code',
      }),
    })
    if (!tokenRes.ok) {
      const resp = redirectHome('gmail=error')
      resp.headers.append('Set-Cookie', expireCookie)
      return resp
    }
    const tokenData = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in: number }

    // Endpoint estándar de identidad de Google (no users.getProfile de la
    // API de Gmail): gmail.send es un scope solo de escritura, sin garantía
    // de que alcance para leer el perfil de Gmail — se pidió el scope
    // "email" aparte (ver mail-auth-start.ts) justo para esto.
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const profile = profileRes.ok ? await profileRes.json() as { email?: string } : {}

    const secret = process.env.ENCRYPTION_SECRET!
    const upsertRes = await sbFetch('gmail_integration', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id: 1,
        access_token_encrypted: await encrypt(tokenData.access_token, secret),
        refresh_token_encrypted: tokenData.refresh_token ? await encrypt(tokenData.refresh_token, secret) : null,
        expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
        email: profile.email ?? null,
        status: 'active',
        connected_at: new Date().toISOString(),
      }),
    })

    const resp = upsertRes.ok ? redirectHome('gmail=connected') : redirectHome('gmail=error')
    resp.headers.append('Set-Cookie', expireCookie)
    return resp
  } catch {
    const resp = redirectHome('gmail=error')
    resp.headers.append('Set-Cookie', expireCookie)
    return resp
  }
}
