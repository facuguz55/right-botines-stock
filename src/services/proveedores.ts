import { supabase } from '../lib/supabase'
import type { Proveedor } from '../types'

export async function fetchProveedores(soloActivos = false): Promise<Proveedor[]> {
  let query = supabase.from('proveedores').select('*').order('nombre', { ascending: true })
  if (soloActivos) query = query.eq('activo', true)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function createProveedor(
  nombre: string, contacto: string | null, telefono: string | null, notas: string | null,
): Promise<Proveedor> {
  const { data, error } = await supabase
    .from('proveedores')
    .insert([{ nombre, contacto, telefono, notas }])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateProveedor(
  id: string, updates: Partial<Pick<Proveedor, 'nombre' | 'contacto' | 'telefono' | 'notas' | 'activo'>>,
): Promise<void> {
  const { error } = await supabase.from('proveedores').update(updates).eq('id', id)
  if (error) throw error
}
