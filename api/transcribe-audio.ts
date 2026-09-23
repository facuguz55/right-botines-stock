export const config = { runtime: 'edge' }

const SB_URL = process.env.SUPABASE_URL ?? ''
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''
// Claude no transcribe audio — para esto hace falta un servicio de
// speech-to-text de verdad. Whisper de OpenAI es el más simple/barato para
// audios cortos de WhatsApp (mensajes de voz de unos segundos).
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? ''

// Mismo patrón que api/whatsapp-send.ts: no hay sesión de servidor real en
// esta app, así que esto no es autenticación de verdad, solo evita que
// cualquiera que encuentre la URL la use desde afuera del navegador.
const ALLOWED_ORIGINS = [
  'https://right-botines-stock.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]

function isAllowedOrigin(origin: string | null): boolean {
  return !!origin && ALLOWED_ORIGINS.includes(origin)
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  if (!isAllowedOrigin(req.headers.get('origin'))) {
    return new Response(JSON.stringify({ error: 'Origen no permitido' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: 'Transcripción no configurada (falta OPENAI_API_KEY)' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const { mensajeId, mediaUrl } = await req.json() as { mensajeId: string; mediaUrl: string }
    if (!mensajeId || !mediaUrl) {
      return new Response(JSON.stringify({ error: 'Falta mensajeId o mediaUrl' }), { status: 400 })
    }

    const audioRes = await fetch(mediaUrl)
    if (!audioRes.ok) throw new Error('No se pudo descargar el audio')
    const audioBlob = await audioRes.blob()

    const form = new FormData()
    form.append('file', audioBlob, 'audio.ogg')
    form.append('model', 'whisper-1')
    form.append('language', 'es')

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form,
    })

    if (!whisperRes.ok) {
      const errTxt = await whisperRes.text().catch(() => '')
      throw new Error(`Whisper ${whisperRes.status}: ${errTxt}`)
    }

    const data = await whisperRes.json() as { text?: string }
    const texto = data.text?.trim() || '(no se detectó texto en el audio)'

    // Se guarda en la base para no tener que retranscribir si se vuelve a
    // abrir la conversación más tarde.
    await fetch(`${SB_URL}/rest/v1/wsp_mensajes?id=eq.${mensajeId}`, {
      method: 'PATCH',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ transcripcion: texto }),
    })

    return new Response(JSON.stringify({ ok: true, texto }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
