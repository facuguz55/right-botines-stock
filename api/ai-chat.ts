export const config = { runtime: 'edge' }

// Proxy del asistente de la app (src/services/aiChat.ts): la clave de
// Anthropic queda en el servidor (ANTHROPIC_API_KEY de Vercel) y no viaja al
// navegador. El navegador manda la conversación y las herramientas; acá se
// fija el modelo y el tope de tokens. Las herramientas las ejecuta la app.

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? ''
const MODEL = 'claude-haiku-4-5-20251001'

// Mismo criterio que api/bot-probar.ts: solo desde la propia app.
const ALLOWED_ORIGINS = [
  'https://right-botines-stock.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const origin = req.headers.get('origin')
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return json({ error: 'Origen no permitido' }, 403)
  if (!ANTHROPIC_API_KEY) return json({ error: 'Falta la clave de Anthropic en el servidor' }, 503)

  let body: { system?: unknown; tools?: unknown; messages?: unknown }
  try { body = await req.json() } catch { return json({ error: 'Pedido inválido' }, 400) }
  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 80) {
    return json({ error: 'Conversación inválida' }, 400)
  }
  if (typeof body.system !== 'string' || body.system.length > 8000) return json({ error: 'Pedido inválido' }, 400)
  if (body.tools !== undefined && (!Array.isArray(body.tools) || body.tools.length > 30)) return json({ error: 'Pedido inválido' }, 400)

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: body.system, tools: body.tools, messages: body.messages }),
  })
  return new Response(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json' } })
}
