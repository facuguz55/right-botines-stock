import { supabase } from '../lib/supabase'

const BUCKET = 'fotos-botines'

export async function uploadFoto(file: File, codigoRef: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg'
  const filePath = `${codigoRef}-${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file, { upsert: true })

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
