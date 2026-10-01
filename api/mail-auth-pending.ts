export const config = { runtime: 'edge' }

import { sbFetch, verifyOwnerPin } from '../src/lib/supabaseRest'

// Primer paso para conectar Gmail: verifica el PIN del dueño y devuelve un
// "state" de un solo uso (nunca el PIN ni ningún secreto real) que el
// cliente pega en la URL de mail-auth-start para arrancar el consentimiento
// de Google. Separar esto de mail-auth-start es lo que permite no mandar
// el PIN nunca por query string — viaja una sola vez, acá, por POST.
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let pin: unknown
  try {
    const body = await req.json()
    pin = (body as { pin?: unknown }).pin
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }
  if (typeof pin !== 'string' || !pin) return Response.json({ error: 'Falta el PIN' }, { status: 400 })

  const valido = await verifyOwnerPin(pin)
  if (!valido) return Response.json({ error: 'PIN incorrecto' }, { status: 401 })

  const state = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')

  const res = await sbFetch('gmail_oauth_pending', {
    method: 'POST',
    body: JSON.stringify({ state }),
  })
  if (!res.ok) return Response.json({ error: 'No se pudo iniciar la conexión con Gmail' }, { status: 502 })

  return Response.json({ state })
}
