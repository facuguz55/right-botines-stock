// Fetch directo a la REST API de Supabase desde funciones Edge — mismo
// patrón que sbFetch en api/tn-webhook.ts. No se usa @supabase/supabase-js
// acá porque estas funciones son autocontenidas a propósito (ver el
// comentario largo sobre imports en api/cron-resync.ts): esta sí puede
// importar de src/lib (Edge resuelve imports relativos, a diferencia del
// runtime Node de este proyecto), pero se evita sumar una dependencia más
// pesada que un fetch directo no necesita.
export async function sbFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = process.env.SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers as Record<string, string> | undefined),
    },
  })
  return res
}

export async function verifyOwnerPin(pin: string): Promise<boolean> {
  const res = await sbFetch('rpc/verify_owner_pin', {
    method: 'POST',
    body: JSON.stringify({ pin_input: pin }),
  })
  if (!res.ok) return false
  const data = await res.json()
  return data === true
}
