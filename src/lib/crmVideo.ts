// WhatsApp solo reproduce videos MP4 (H.264 + AAC) de hasta 16 MB. Los del
// celular casi siempre pesan más, o vienen como .mov / HEVC. Esto los pasa a
// MP4 y, si hace falta, les baja la calidad lo justo para que entren, todo en
// el navegador (WebCodecs), sin subirlos a ningún lado.
export const TOPE_VIDEO_BYTES = 16 * 1024 * 1024
// Margen para el contenedor y para que el peso real no pase del objetivo.
const OBJETIVO_BYTES = 14 * 1024 * 1024
const AUDIO_BPS = 96_000
// Debajo de esto el video se ve mal: se achica la resolución antes de bajar más.
const MIN_BPS_720 = 1_200_000
const MIN_BPS_480 = 500_000

export interface PlanVideo {
  convertir: boolean
  bitrate: number | null
  ladoMax: number | null
  demasiadoLargo: boolean
}

// Decide cuánto hay que achicar. Pura (sin navegador) para poder probarla.
export function planificarVideo(opts: {
  bytes: number
  duracion: number
  esMp4Compatible: boolean
  anchoMax: number
}): PlanVideo {
  const { bytes, duracion, esMp4Compatible, anchoMax } = opts
  if (esMp4Compatible && bytes <= OBJETIVO_BYTES) {
    return { convertir: false, bitrate: null, ladoMax: null, demasiadoLargo: false }
  }
  if (!(duracion > 0)) {
    return { convertir: true, bitrate: 2_500_000, ladoMax: Math.min(anchoMax, 1280), demasiadoLargo: false }
  }
  const bpsTotal = (OBJETIVO_BYTES * 8) / duracion
  const bpsVideo = Math.max(100_000, Math.floor(bpsTotal - AUDIO_BPS))
  // Nunca más que lo necesario: un .mov chico que solo hay que pasar a MP4 no
  // tiene por qué engordar (H.264 pide ~1,5x el bitrate de HEVC para verse igual).
  const bpsOriginal = (bytes * 8) / duracion
  const bitrate = Math.min(bpsVideo, 8_000_000, Math.max(1_500_000, Math.floor(bpsOriginal * 1.5)))
  let ladoMax: number | null = null
  if (bitrate < MIN_BPS_480) ladoMax = 480
  else if (bitrate < MIN_BPS_720) ladoMax = 720
  else ladoMax = 1280
  return { convertir: true, bitrate, ladoMax, demasiadoLargo: bitrate < MIN_BPS_480 * 0.6 }
}

export async function puedeAchicarVideo(): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') return false
  try {
    const { canEncodeVideo } = await import('mediabunny')
    return await canEncodeVideo('avc')
  } catch {
    return false
  }
}

// Devuelve un MP4 listo para WhatsApp (de ≤ 16 MB). Tira un Error con un
// mensaje para mostrarle a la persona si no se pudo.
export async function prepararVideo(file: File, onProgreso?: (p: number) => void): Promise<File> {
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1)
  if (!(await puedeAchicarVideo())) {
    if (/^video\/(mp4|3gpp)$/.test(file.type) && file.size <= TOPE_VIDEO_BYTES) return file
    throw new Error(`Este video pesa ${mb(file.size)} MB y este navegador no lo puede achicar. Probá desde Chrome, o con uno más corto.`)
  }
  const mb4 = await import('mediabunny')
  const input = new mb4.Input({ source: new mb4.BlobSource(file), formats: mb4.ALL_FORMATS })
  try {
    const video = await input.getPrimaryVideoTrack()
    if (!video) throw new Error('No se pudo leer el video.')
    const audio = await input.getPrimaryAudioTrack()
    const duracion = await input.computeDuration()
    const esMp4Compatible = /^video\/mp4$/.test(file.type) && video.codec === 'avc' && (!audio || audio.codec === 'aac')
    const plan = planificarVideo({ bytes: file.size, duracion, esMp4Compatible, anchoMax: Math.max(video.displayWidth, video.displayHeight) })
    if (!plan.convertir) return file
    if (plan.demasiadoLargo) {
      throw new Error(`El video dura ${Math.round(duracion)} s y pesa ${mb(file.size)} MB: para que entre en 16 MB quedaría con muy mala calidad. Cortalo en partes más cortas.`)
    }

    const largo = Math.max(video.displayWidth, video.displayHeight)
    const escala = plan.ladoMax && largo > plan.ladoMax ? plan.ladoMax / largo : 1
    // Medidas pares: H.264 no acepta impares.
    const par = (n: number) => Math.max(2, Math.round((n * escala) / 2) * 2)
    const ancho = par(video.displayWidth)
    const alto = par(video.displayHeight)

    const output = new mb4.Output({ format: new mb4.Mp4OutputFormat(), target: new mb4.BufferTarget() })
    const conversion = await mb4.Conversion.init({
      input,
      output,
      video: { codec: 'avc', bitrate: plan.bitrate ?? undefined, width: ancho, height: alto, fit: 'fill', frameRate: 30 },
      audio: { codec: 'aac', bitrate: AUDIO_BPS },
    })
    if (!conversion.isValid) throw new Error('Este formato de video no se puede convertir desde el navegador.')
    conversion.onProgress = p => onProgreso?.(Math.min(1, p))
    await conversion.execute()
    const buffer = (output.target as InstanceType<typeof mb4.BufferTarget>).buffer
    if (!buffer) throw new Error('No se pudo achicar el video.')
    if (buffer.byteLength > TOPE_VIDEO_BYTES) {
      throw new Error(`Aun achicado el video pesa ${mb(buffer.byteLength)} MB. Probá con uno más corto.`)
    }
    const nombre = file.name.replace(/\.[^.]+$/, '') || 'video'
    return new File([buffer], `${nombre}.mp4`, { type: 'video/mp4' })
  } finally {
    input.dispose?.()
  }
}
