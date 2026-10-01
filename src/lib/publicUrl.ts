// Origen público real de la app, para armar el redirect_uri de Google.
// No se puede usar `https://${req.headers.host}`: ese header lo manda quien
// hace el request, y con un Host falseado el redirect_uri (y por lo tanto
// a dónde vuelve el código de autorización) quedaría bajo control de quien
// armó el request. VERCEL_URL la pone la plataforma según el deploy real,
// nunca quien hace el request — mismo criterio que nova-local
// (api/_lib/public-url.ts).
export function origenPublico(): string {
  if (!process.env.VERCEL_ENV) return 'http://localhost:5173'
  if (process.env.VERCEL_ENV !== 'production' && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return 'https://right-botines-stock.vercel.app'
}
