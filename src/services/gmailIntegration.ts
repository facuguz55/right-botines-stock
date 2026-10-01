// El PIN viaja una sola vez por llamada (nunca en una URL ni guardado en la
// base) — mismo criterio que fetchValoresHora/registrar_devolucion_cambio:
// se re-verifica server-side en cada request, no alcanza con estar en esta
// pantalla.

export async function fetchMailStatus(pin: string): Promise<{ connected: boolean; email?: string }> {
  const res = await fetch('/api/mail-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'No se pudo consultar el estado de Gmail')
  return res.json()
}

export async function disconnectGmail(pin: string): Promise<void> {
  const res = await fetch('/api/mail-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin, action: 'disconnect' }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'No se pudo desconectar Gmail')
}

// Pide el "state" de un solo uso (ver api/mail-auth-pending.ts) y devuelve
// la URL a la que hay que navegar (no fetch — es una redirección real a
// Google) para arrancar el consentimiento.
export async function getGmailConnectUrl(pin: string): Promise<string> {
  const res = await fetch('/api/mail-auth-pending', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'No se pudo iniciar la conexión con Gmail')
  const { state } = await res.json() as { state: string }
  return `/api/mail-auth-start?state=${encodeURIComponent(state)}`
}

export interface EnviarMailResultado {
  email: string
  status: 'ok' | 'error'
  error?: string
}

// Secuencial — un email real por destinatario (no CC ni grupo), para que si
// alguno falla (ej. dirección inválida) no afecte a los demás y se pueda
// mostrar qué pasó con cada uno.
export async function enviarMailAVarios(
  pin: string, destinatarios: string[], subject: string, body: string,
): Promise<EnviarMailResultado[]> {
  const resultados: EnviarMailResultado[] = []
  for (const to of destinatarios) {
    try {
      const res = await fetch('/api/mail-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, to, subject, body }),
      })
      if (res.ok) {
        resultados.push({ email: to, status: 'ok' })
      } else {
        const err = await res.json().catch(() => null)
        resultados.push({ email: to, status: 'error', error: err?.error })
      }
    } catch {
      resultados.push({ email: to, status: 'error' })
    }
  }
  return resultados
}
