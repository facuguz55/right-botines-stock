import { supabase } from '../lib/supabase'
import type { ModeloFoto, PhotoSlot } from '../types'
import { uploadFoto, deleteFoto } from './storage'

export async function saveFotos(
  modeloId: string,
  codigoBase: string,
  slots: PhotoSlot[],
  toDelete: string[]
): Promise<ModeloFoto[]> {
  if (toDelete.length > 0) {
    const { data: existing } = await supabase
      .from('modelo_fotos')
      .select('id, foto_url')
      .in('id', toDelete)
    for (const foto of existing || []) {
      await deleteFoto(foto.foto_url).catch(() => null)
    }
    await supabase.from('modelo_fotos').delete().in('id', toDelete)
  }

  const toInsert: { modelo_id: string; foto_url: string; orden: number }[] = []
  for (const slot of slots) {
    if (slot.file) {
      const url = await uploadFoto(slot.file, codigoBase)
      toInsert.push({ modelo_id: modeloId, foto_url: url, orden: slot.orden })
    }
  }
  if (toInsert.length > 0) {
    const { error } = await supabase.from('modelo_fotos').insert(toInsert)
    if (error) throw error
  }

  const { data, error } = await supabase
    .from('modelo_fotos')
    .select('*')
    .eq('modelo_id', modeloId)
    .order('orden', { ascending: true })
  if (error) throw error
  return data || []
}

export async function deleteFotosForModelo(modeloId: string): Promise<void> {
  const { data } = await supabase.from('modelo_fotos').select('foto_url').eq('modelo_id', modeloId)
  for (const f of data || []) {
    await deleteFoto(f.foto_url).catch(() => null)
  }
}
