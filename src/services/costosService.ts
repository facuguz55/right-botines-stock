import { supabase } from '../lib/supabase'
import type { CostoConfig, CostoUnico } from '../types'

type CostoConfigInput = Omit<CostoConfig, 'id' | 'created_at' | 'updated_at'>
type CostoUnicoInput = Omit<CostoUnico, 'id' | 'created_at'>

// ── Costos config (fijos mensuales / variables por venta) ───────────────────

export async function fetchCostosConfig(): Promise<CostoConfig[]> {
  const { data, error } = await supabase
    .from('costos_config')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createCostoConfig(input: CostoConfigInput): Promise<CostoConfig> {
  const { data, error } = await supabase
    .from('costos_config')
    .insert([input])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCostoConfig(id: string, updates: Partial<CostoConfigInput>): Promise<CostoConfig> {
  const { data, error } = await supabase
    .from('costos_config')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function toggleCostoConfig(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase
    .from('costos_config')
    .update({ activo, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteCostoConfig(id: string): Promise<void> {
  const { error } = await supabase.from('costos_config').delete().eq('id', id)
  if (error) throw error
}

// ── Costos únicos / eventuales ───────────────────────────────────────────────

export async function fetchCostosUnicos(desde?: string, hasta?: string): Promise<CostoUnico[]> {
  let query = supabase.from('costos_unicos').select('*').order('fecha', { ascending: false })
  if (desde) query = query.gte('fecha', desde)
  if (hasta) query = query.lte('fecha', hasta)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function createCostoUnico(input: CostoUnicoInput): Promise<CostoUnico> {
  const { data, error } = await supabase
    .from('costos_unicos')
    .insert([input])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteCostoUnico(id: string): Promise<void> {
  const { error } = await supabase.from('costos_unicos').delete().eq('id', id)
  if (error) throw error
}
