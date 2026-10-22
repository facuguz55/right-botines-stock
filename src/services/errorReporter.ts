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

// Errores que el navegador reporta sin ningún dato y que no vienen del código de
// la app: "Script error." sin archivo ni línea lo manda el navegador cuando falla
// un script de OTRO origen (una extensión, el navegador embebido de otra app, un
// traductor...) y esconde los detalles. No hay nada que arreglar, y llenaban el
// reporte de bugs. Lo mismo con el portapapeles bloqueado o diálogos (prompt)
// que un navegador no soporta: son del entorno, no de la app.
export function esRuidoDelNavegador(mensaje: string | undefined, filename?: string, lineno?: number): boolean {
  const m = (mensaje ?? '').trim()
  if (/^script error\.?$/i.test(m) && !filename && !lineno) return true
  if (m.includes('Failed to update a ServiceWorker')) return true
  if (/Failed to execute 'writeText' on 'Clipboard'/.test(m)) return true
  if (/\b(prompt|alert|confirm)\(\) is not supported/.test(m)) return true
  return false
}

export function setupGlobalErrorHandler(): void {
  window.addEventListener('error', (e) => {
    if (esRuidoDelNavegador(e.message, e.filename, e.lineno)) return
    reportError({
      donde: 'window.onerror',
      mensaje: e.message,
      stack: e.error?.stack,
      detalle: { filename: e.filename, lineno: e.lineno, colno: e.colno },
    })
  })

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    // Ruido del navegador, no un bug de la app (ej. no pudo bajar sw.js para
    // chequear actualizaciones por un corte de red, ver pwaUpdate.ts).
    if (esRuidoDelNavegador(String(reason?.message ?? reason))) return
    reportError({
      donde: 'unhandledrejection',
      mensaje: reason?.message ?? String(reason),
      stack: reason?.stack,
    })
  })
}
