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

// Cuenta cuántos fichajes siguen abiertos en todo el sistema — se usa para
// detectar si el que está fichando salida es el último que queda (y por lo
// tanto corresponde ofrecerle cerrar la caja en el mismo paso).
export async function countFichajesAbiertos(): Promise<number> {
  const { count, error } = await supabase
    .from('fichajes')
    .select('id', { count: 'exact', head: true })
    .is('hora_salida', null)
  if (error) throw error
  return count ?? 0
}

export async function cerrarFichajeManual(fichajeId: string, horaSalida: string): Promise<void> {
  const { error } = await supabase
    .from('fichajes')
    .update({ hora_salida: horaSalida })
    .eq('id', fichajeId)
  if (error) throw error
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Cierra automáticamente los fichajes que quedaron abiertos de un día
// anterior (alguien se olvidó de hacer logout) a la hora límite configurada
// — nunca toca el fichaje de HOY, aunque ya esté abierto hace muchas horas.
// Se llama una vez al abrir la app (App.tsx); no depende de ningún cron.
export async function cerrarFichajesVencidos(horaLimiteCierre: string): Promise<number> {
  const { data, error } = await supabase
    .from('fichajes')
    .select('id, hora_entrada')
    .is('hora_salida', null)
  if (error) throw error

  const hoyKey = localDateKey(new Date())
  const [hh, mm] = horaLimiteCierre.split(':').map(Number)
  let cerrados = 0

  for (const f of data ?? []) {
    const entrada = new Date(f.hora_entrada)
    if (localDateKey(entrada) === hoyKey) continue // fichaje de hoy, no tocar

    const limite = new Date(entrada)
    limite.setHours(hh, mm, 0, 0)
    // Si entró después de la hora límite (turno nocturno), no tiene sentido
    // cerrarlo "antes" de que entró — se cierra 15 min después de la entrada.
    const cierre = limite > entrada ? limite : new Date(entrada.getTime() + 15 * 60000)

    const { error: updErr } = await supabase
      .from('fichajes')
      .update({ hora_salida: cierre.toISOString() })
      .eq('id', f.id)
    if (!updErr) cerrados++
  }

  return cerrados
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
