import { supabase } from '../lib/supabase'
import type { ValorHora } from '../utils/valoresHora'

// Trae el historial completo de valores por hora — devuelve [] tanto si el
// PIN es incorrecto como si todavía no hay ningún valor cargado. Para
// distinguir esos dos casos, verificar el PIN primero con verifyOwnerPin.
export async function fetchValoresHora(pin: string): Promise<ValorHora[]> {
  const { data, error } = await supabase.rpc('fetch_valores_hora', { pin_input: pin })
  if (error) throw error
  return (data ?? []).map((v: { id: string; empleado_id: string | null; valor_hora: number; vigente_desde: string }) => ({
    id: v.id,
    empleado_id: v.empleado_id,
    valor_hora: Number(v.valor_hora),
    vigente_desde: v.vigente_desde,
  }))
}

export async function asignarValorHora(
  pin: string, empleadoId: string | null, valorHora: number, vigenteDesde: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('asignar_valor_hora', {
    pin_input: pin,
    empleado_id_input: empleadoId,
    valor_hora_input: valorHora,
    vigente_desde_input: vigenteDesde,
  })
  if (error) throw error
  return Boolean(data)
}
