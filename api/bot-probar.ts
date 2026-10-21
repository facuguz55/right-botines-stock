import { elegirAprendizajes, formatearAprendizaje, llamarClasificadorIA, type FilaAprendizaje } from '../src/lib/botIa'

export const config = { runtime: 'edge' }

// "Probar el bot" de la pantalla Aprendizaje: dado lo que diría un cliente,
// devuelve lo que contestaría el bot AHORA (con lo que los dueños ya aprobaron),
// en los mensajes cortos que mandaría. No manda nada por WhatsApp ni guarda nada.
// Con `leccion` prueba "como si ya estuviera aprobada" esa respuesta.

const SB_URL = process.env.SUPABASE_URL ?? ''
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? process.env.VITE_ANTHROPIC_API_KEY ?? ''
const ANTHROPIC_MODEL = 'claude-haiku-4-5'

// Mismo criterio que api/whatsapp-send.ts: solo desde la propia app.
const ALLOWED_ORIGINS = [
  'https://right-botines-stock.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]

const MAX_MENSAJES_CLIENTE = 5
const MAX_LARGO = 600

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function listaDeTextos(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string').map(x => x.trim()).filter(Boolean).slice(0, max)
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const origin = req.headers.get('origin')
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return json({ error: 'Origen no permitido' }, 403)

  let body: { cliente?: unknown; leccion?: { mensajes?: unknown } | null }
  try { body = await req.json() } catch { return json({ error: 'Pedido inválido' }, 400) }

  const cliente = listaDeTextos(body.cliente, MAX_MENSAJES_CLIENTE)
  if (cliente.length === 0) return json({ error: 'Escribí lo que diría el cliente' }, 400)
  if (cliente.join('\n').length > MAX_LARGO) return json({ error: 'El mensaje es demasiado largo' }, 400)
  const leccionMensajes = listaDeTextos(body.leccion?.mensajes, 6)

  try {
    // Lo que ya aprobaron los dueños.
    const res = await fetch(
      `${SB_URL}/rest/v1/crm_aprendizajes?estado=eq.aprobado&select=pregunta,respuesta_aprobada,mensajes_aprobados,origen&order=revisado_en.desc&limit=120`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } },
    )
    const filas = res.ok ? await res.json() as FilaAprendizaje[] : []
    const textoCliente = cliente.join('\n')
    const elegidas = elegirAprendizajes(textoCliente, filas)

    // Probar "como si ya estuviera aprobada": va primera, sin importar el parecido.
    const hipotetica: FilaAprendizaje | null = leccionMensajes.length
      ? { pregunta: textoCliente, respuesta_aprobada: leccionMensajes.join('\n\n'), mensajes_aprobados: leccionMensajes, origen: 'distinta' }
      : null
    const aprendizajes = [...(hipotetica ? [hipotetica] : []), ...elegidas].map(formatearAprendizaje).join('\n')

    const ultimo = cliente[cliente.length - 1]
    const contexto = cliente.slice(0, -1).map(t => `Cliente: ${t}`).join('\n')
    const ia = await llamarClasificadorIA({
      apiKey: ANTHROPIC_API_KEY, modelo: ANTHROPIC_MODEL, contexto,
      busquedaGuardada: { talle: null, tipo: null, modelo: null },
      text: ultimo, aprendizajes,
    })
    if (!ia || ia.mensajes_sugeridos.length === 0) return json({ error: 'El bot no quiso o no pudo contestar ese mensaje. Probá con otra frase.' }, 502)

    return json({
      mensajes: ia.mensajes_sugeridos,
      usadas: elegidas.map(f => f.pregunta.slice(0, 120)),
      // Para talles y pedidos, en un chat real la respuesta sale del stock o del
      // pedido real: acá se prueba solo cómo lo redacta el bot.
      nota: ia.intencion === 'pedido_talle' || ia.intencion === 'estado_pedido'
        ? 'En un chat real, acá el sistema usa el stock o el pedido de verdad.'
        : null,
    })
  } catch (err) {
    console.error('bot-probar:', err)
    return json({ error: 'No se pudo probar el bot. Probá de nuevo.' }, 500)
  }
}
