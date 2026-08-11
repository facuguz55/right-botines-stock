import { supabase } from '../lib/supabase'
import type { ConfiguracionFichajes } from '../types'

export async function fetchConfiguracionFichajes(): Promise<ConfiguracionFichajes> {
  const { data, error } = await supabase
    .from('configuracion_fichajes')
    .select('*')
    .eq('id', 1)
    .single()
  if (error) throw error
  return data
}

export async function updateHoraLimiteCierre(horaLimiteCierre: string): Promise<void> {
  const { error } = await supabase
    .from('configuracion_fichajes')
    .update({ hora_limite_cierre: horaLimiteCierre, updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) throw error
}

export async function updateHorasMaximasTurno(horasMaximasTurno: number): Promise<void> {
  const { error } = await supabase
    .from('configuracion_fichajes')
    .update({ horas_maximas_turno: horasMaximasTurno, updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) throw error
}
