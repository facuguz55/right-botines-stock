const ENDPOINT = import.meta.env.VITE_ERROR_WEBHOOK_URL as string | undefined
const SECRET = import.meta.env.VITE_ERROR_WEBHOOK_SECRET as string | undefined

const APP_NAME = 'right-botines-stock'

let release: string | undefined
try {
  release = import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA as string | undefined
} catch { /* noop */ }

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
  if (!ENDPOINT || !SECRET) return

  const key = `${report.donde}:${report.mensaje ?? ''}`
  if (!dedup(key)) return

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SECRET}`,
      },
      body: JSON.stringify({
        app: APP_NAME,
        asunto: `[${report.donde}] ${report.mensaje?.slice(0, 120) ?? 'Error'}`,
        error: {
          id,
          donde: report.donde,
          mensaje: report.mensaje,
          stack: report.stack,
          release,
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
  if (!ENDPOINT || !SECRET) return

  const id = `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SECRET}`,
      },
      body: JSON.stringify({
        app: APP_NAME,
        asunto: `[Feedback] ${descripcion.slice(0, 120)}`,
        error: {
          id,
          donde,
          mensaje: descripcion,
          release,
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
    reportError({
      donde: 'unhandledrejection',
      mensaje: reason?.message ?? String(reason),
      stack: reason?.stack,
    })
  })
}
