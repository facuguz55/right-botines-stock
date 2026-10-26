// Las fotos del celular (sobre todo las de iPhone: HEIC, 3-8 MB) no entran tal
// cual en WhatsApp, que acepta JPG/PNG de hasta 5 MB. Se pasan a JPG y se
// achican a un tamaño más que suficiente para mirarla en el celular del cliente.
const LADO_MAX = 2048
const MAX_BYTES = 4.5 * 1024 * 1024

function aBlob(canvas: HTMLCanvasElement, calidad: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', calidad))
}

// Devuelve un JPG listo para mandar, o null si el navegador no pudo leer la
// imagen (el llamador la manda como archivo en ese caso).
export async function prepararFoto(file: File): Promise<File | null> {
  try {
    const bmp = await createImageBitmap(file)
    const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * escala)
    canvas.height = Math.round(bmp.height * escala)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#fff' // un PNG con transparencia no puede quedar negro en el JPG
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    bmp.close?.()
    for (const calidad of [0.88, 0.75, 0.6]) {
      const blob = await aBlob(canvas, calidad)
      if (blob && blob.size <= MAX_BYTES) {
        const nombre = file.name.replace(/\.[^.]+$/, '') || 'foto'
        return new File([blob], `${nombre}.jpg`, { type: 'image/jpeg' })
      }
    }
    return null
  } catch {
    return null
  }
}
