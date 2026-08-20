import { supabase } from '../lib/supabase'

const BUCKET = 'fotos-botines'
const MAX_DIM = 1600
const JPEG_QUALITY = 0.82

// Redimensiona/comprime en el navegador antes de subir. Las fotos que se
// cargan desde el celular suelen venir en varios MB a resolución completa;
// eso hace que la grilla de productos tarde en cargar y trabe la UI para
// todos los que usan la app (se descargan/decodifican todas casi juntas).
// Si algo falla, sube el archivo original tal cual.
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
    if (scale >= 1 && file.size < 500_000) { bitmap.close(); return file }

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close(); return file }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    if (!blob || blob.size >= file.size) return file

    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' })
  } catch {
    return file
  }
}

export async function uploadFoto(file: File, codigoRef: string): Promise<string> {
  const optimized = await compressImage(file)
  const ext = optimized.name.split('.').pop() || 'jpg'
  const filePath = `${codigoRef}-${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, optimized, { upsert: true })

  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath)
  return data.publicUrl
}

export async function deleteFoto(fotoUrl: string): Promise<void> {
  const parts = fotoUrl.split(`/${BUCKET}/`)
  if (parts.length < 2) return

  const { error } = await supabase.storage.from(BUCKET).remove([parts[1]])
  if (error) throw error
}
