// El cliente nunca ve el secreto del webhook de Nova Agency OS: llama a
// nuestro propio endpoint server-side (/api/report-error), que reenvía con
// el secreto guardado como variable de entorno sin prefijo VITE_.
const PROXY_ENDPOINT = '/api/report-error'

interface ErrorReport {
  donde: string
  mensaje?: string
  stack?: string
  detalle?: Record<string, unknown>
}

const sent = new Set<string>()

function dedup(key: string): boolean {
  if (sent.has(key)) return false
  sent.add(key)
  if (sent.size > 200) sent.clear()
  return true
}

export async function reportError(report: ErrorReport): Promise<void> {
  const key = `${report.donde}:${report.mensaje ?? ''}`
  if (!dedup(key)) return

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  try {
    await fetch(PROXY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asunto: `[${report.donde}] ${report.mensaje?.slice(0, 120) ?? 'Error'}`,
        error: {
          id,
          donde: report.donde,
          mensaje: report.mensaje,
          stack: report.stack,
          detalle: report.detalle,
          url: window.location.href,
          navegador: navigator.userAgent,
        },
      }),
    })
  } catch {
    // No bloquea la app si el reporte falla
  }
}

export async function reportFeedback(descripcion: string, donde: string): Promise<void> {
  const id = `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  try {
    await fetch(PROXY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asunto: `[Feedback] ${descripcion.slice(0, 120)}`,
        error: {
          id,
          donde,
          mensaje: descripcion,
          detalle: { tipo: 'feedback_manual' },
          url: window.location.href,
          navegador: navigator.userAgent,
        },
      }),
    })
  } catch {
    // No bloquea la app
  }
}

export function setupGlobalErrorHandler(): void {
  window.addEventListener('error', (e) => {
    reportError({
      donde: 'window.onerror',
      mensaje: e.message,
      stack: e.error?.stack,
      detalle: { filename: e.filename, lineno: e.lineno, colno: e.colno },
    })
  })

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    // Ruido del navegador, no un bug de la app: no pudo bajar sw.js para
    // chequear actualizaciones (corte de red momentáneo). Ver pwaUpdate.ts.
    if (String(reason?.message ?? reason).includes('Failed to update a ServiceWorker')) return
    reportError({
      donde: 'unhandledrejection',
      mensaje: reason?.message ?? String(reason),
      stack: reason?.stack,
    })
  })
}
