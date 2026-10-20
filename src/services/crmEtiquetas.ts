import { supabase } from '../lib/supabase'
import type { CrmEtiqueta } from '../types/crm'

export async function fetchEtiquetas(): Promise<CrmEtiqueta[]> {
  const { data, error } = await supabase
    .from('wsp_etiquetas')
    .select('id, nombre, color')
    .order('nombre', { ascending: true })
  if (error) throw error
  return (data || []) as CrmEtiqueta[]
}

// Pares chat ↔ etiqueta de todos los chats (se cruzan en el cliente con la
// lista de conversaciones, así la lista no depende de que exista esta tabla).
export async function fetchAsignaciones(): Promise<{ conversacion_id: string; etiqueta_id: string }[]> {
  const { data, error } = await supabase
    .from('wsp_conversacion_etiquetas')
    .select('conversacion_id, etiqueta_id')
  if (error) throw error
  return data || []
}

export async function crearEtiqueta(nombre: string, color: string): Promise<CrmEtiqueta> {
  const { data, error } = await supabase
    .from('wsp_etiquetas')
    .insert([{ nombre: nombre.trim(), color }])
    .select('id, nombre, color')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('Ya hay una etiqueta con ese nombre.')
    throw error
  }
  return data as CrmEtiqueta
}

export async function eliminarEtiqueta(etiquetaId: string): Promise<void> {
  const { error } = await supabase.from('wsp_etiquetas').delete().eq('id', etiquetaId)
  if (error) throw error
}

export async function asignarEtiqueta(conversacionId: string, etiquetaId: string): Promise<void> {
  const { error } = await supabase
    .from('wsp_conversacion_etiquetas')
    .upsert([{ conversacion_id: conversacionId, etiqueta_id: etiquetaId }], { onConflict: 'conversacion_id,etiqueta_id' })
  if (error) throw error
}

export async function quitarEtiqueta(conversacionId: string, etiquetaId: string): Promise<void> {
  const { error } = await supabase
    .from('wsp_conversacion_etiquetas')
    .delete()
    .eq('conversacion_id', conversacionId)
    .eq('etiqueta_id', etiquetaId)
  if (error) throw error
}
