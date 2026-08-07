import { supabase } from '../lib/supabase'
import type { Fichaje } from '../types'

export async function fetchFichajeAbierto(empleadoId: string): Promise<Fichaje | null> {
  const { data, error } = await supabase
    .from('fichajes')
    .select('*')
    .eq('empleado_id', empleadoId)
    .is('hora_salida', null)
    .maybeSingle()
  if (error) throw error
  return data
}

// Idempotente: si el empleado ya tiene un fichaje abierto, lo devuelve en vez de crear otro
// (cubre el caso de que el navegador se haya cerrado sin hacer logout).
export async function abrirFichaje(empleadoId: string): Promise<Fichaje> {
  const abierto = await fetchFichajeAbierto(empleadoId)
  if (abierto) return abierto

  const { data, error } = await supabase
    .from('fichajes')
    .insert([{ empleado_id: empleadoId }])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function cerrarFichajeAbiertoDeEmpleado(empleadoId: string): Promise<void> {
  const abierto = await fetchFichajeAbierto(empleadoId)
  if (!abierto) return
  const { error } = await supabase
    .from('fichajes')
    .update({ hora_salida: new Date().toISOString() })
    .eq('id', abierto.id)
  if (error) throw error
}

export async function cerrarFichajeManual(fichajeId: string, horaSalida: string): Promise<void> {
  const { error } = await supabase
    .from('fichajes')
    .update({ hora_salida: horaSalida })
    .eq('id', fichajeId)
  if (error) throw error
}

export async function fetchFichajes(startDate?: string, endDate?: string): Promise<Fichaje[]> {
  let query = supabase
    .from('fichajes')
    .select('*, empleados(nombre)')
    .order('hora_entrada', { ascending: false })

  if (startDate) query = query.gte('hora_entrada', startDate)
  if (endDate) query = query.lte('hora_entrada', endDate + 'T23:59:59')

  const { data, error } = await query
  if (error) throw error
  return (data || []) as Fichaje[]
}
