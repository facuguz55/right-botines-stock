export const config = { runtime: 'edge' }

import { sbFetch, verifyOwnerPin } from '../src/lib/supabaseRest'
import { decrypt } from '../src/lib/gmailCrypto'

interface Payload { pin?: unknown; action?: unknown }

async function handleDisconnect(): Promise<Response> {
  const res = await sbFetch('gmail_integration?id=eq.1&select=access_token_encrypted')
  const rows = res.ok ? await res.json() as { access_token_encrypted: string | null }[] : []
  const row = rows[0]

  // Le avisamos a Google que revoque el token — best-effort: si falla,
  // igual se borra la conexión local para que la app deje de usarla.
  if (row?.access_token_encrypted) {
    try {
      const accessToken = await decrypt(row.access_token_encrypted, process.env.ENCRYPTION_SECRET!)
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, { method: 'POST' })
    } catch { /* noop */ }
  }

  const delRes = await sbFetch('gmail_integration?id=eq.1', {
    method: 'PATCH',
    body: JSON.stringify({
      access_token_encrypted: null, refresh_token_encrypted: null, expires_at: null,
      email: null, status: 'inactive', connected_at: null,
    }),
  })
  if (!delRes.ok) return Response.json({ error: 'No se pudo desconectar Gmail' }, { status: 502 })
  return Response.json({ ok: true })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }
  if (typeof payload.pin !== 'string' || !payload.pin) return Response.json({ error: 'Falta el PIN' }, { status: 400 })
  const pinValido = await verifyOwnerPin(payload.pin)
  if (!pinValido) return Response.json({ error: 'PIN incorrecto' }, { status: 401 })

  if (payload.action === 'disconnect') return handleDisconnect()

  const res = await sbFetch('gmail_integration?id=eq.1&select=status,email')
  const rows = res.ok ? await res.json() as { status: string; email: string | null }[] : []
  const row = rows[0]
  const connected = !!row && row.status === 'active'
  return Response.json({ connected, email: connected ? row.email : undefined })
}
