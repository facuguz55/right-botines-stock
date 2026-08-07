import { supabase } from '../lib/supabase'
import type { Empleado } from '../types'

export async function fetchEmpleados(soloActivos = false): Promise<Empleado[]> {
  let query = supabase.from('empleados').select('*').order('nombre', { ascending: true })
  if (soloActivos) query = query.eq('activo', true)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function createEmpleado(nombre: string): Promise<Empleado> {
  const { data, error } = await supabase
    .from('empleados')
    .insert([{ nombre }])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateEmpleado(id: string, updates: Partial<Pick<Empleado, 'nombre' | 'activo'>>): Promise<void> {
  const { error } = await supabase.from('empleados').update(updates).eq('id', id)
  if (error) throw error
}
