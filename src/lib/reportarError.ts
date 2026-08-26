// Reenvía errores del cliente al endpoint interno /api/report-error, que
// a su vez los reenvía a nova-agency-os con el secreto del webhook — el
// secreto nunca viaja al navegador (ver api/report-error.ts).
export async function reportarError(
  donde: string,
  error: unknown,
  detalle?: Record<string, unknown>
) {
  try {
    const err = error instanceof Error ? error : new Error(String(error))
    await fetch('/api/report-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app: 'right-botines-stock',
        asunto: err.message.slice(0, 120),
        error: {
          id: crypto.randomUUID(),
          donde,
          mensaje: err.message,
          stack: err.stack,
          url: window.location.href,
          navegador: navigator.userAgent,
          detalle,
        },
      }),
    })
  } catch {
    // No propagar errores del reporter
  }
}
