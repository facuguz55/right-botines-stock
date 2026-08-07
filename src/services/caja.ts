import { supabase } from '../lib/supabase'
import type { CajaDia, TotalesEfectivoDia } from '../types'

const SELECT_CON_EMPLEADOS =
  '*, empleado_apertura:empleados!caja_dias_abierta_por_fkey(nombre), empleado_cierre:empleados!caja_dias_cerrada_por_fkey(nombre)'

export async function fetchCajaAbierta(): Promise<CajaDia | null> {
  const { data, error } = await supabase
    .from('caja_dias')
    .select(SELECT_CON_EMPLEADOS)
    .eq('estado', 'abierta')
    .maybeSingle()
  if (error) throw error
  return data as CajaDia | null
}

export async function abrirCaja(montoApertura: number, empleadoId: string | null): Promise<CajaDia> {
  const abierta = await fetchCajaAbierta()
  if (abierta) throw new Error('Ya hay una caja abierta. Cerrala antes de abrir una nueva.')

  const hoy = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('caja_dias')
    .insert([{
      fecha: hoy,
      monto_apertura: montoApertura,
      abierta_por: empleadoId,
      abierta_at: new Date().toISOString(),
      estado: 'abierta',
    }])
    .select(SELECT_CON_EMPLEADOS)
    .single()
  if (error) throw error
  return data as CajaDia
}

export async function fetchTotalesEfectivoDia(fecha: string): Promise<TotalesEfectivoDia> {
  const { data, error } = await supabase
    .from('ventas')
    .select('precio_venta, medio_pago')
    .gte('fecha', fecha)
    .lte('fecha', fecha + 'T23:59:59')
  if (error) throw error

  const totales: TotalesEfectivoDia = { efectivo: 0, transferencia: 0, tarjeta: 0 }
  for (const v of data || []) {
    const monto = Number(v.precio_venta)
    if (v.medio_pago === 'Efectivo') totales.efectivo += monto
    else if (v.medio_pago === 'Transferencia') totales.transferencia += monto
    else if (v.medio_pago === 'Tarjeta') totales.tarjeta += monto
  }
  return totales
}

export async function cerrarCaja(
  cajaId: string,
  fecha: string,
  montoApertura: number,
  montoContado: number,
  empleadoId: string | null,
  notas: string | null
): Promise<CajaDia> {
  const totales = await fetchTotalesEfectivoDia(fecha)
  const esperado = montoApertura + totales.efectivo
  const diferencia = montoContado - esperado

  const { data, error } = await supabase
    .from('caja_dias')
    .update({
      estado: 'cerrada',
      monto_cierre_contado: montoContado,
      monto_esperado_snapshot: esperado,
      diferencia,
      cerrada_por: empleadoId,
      cerrada_at: new Date().toISOString(),
      notas,
    })
    .eq('id', cajaId)
    .select(SELECT_CON_EMPLEADOS)
    .single()
  if (error) throw error
  return data as CajaDia
}

export async function fetchCajasCerradas(startDate?: string, endDate?: string): Promise<CajaDia[]> {
  let query = supabase
    .from('caja_dias')
    .select(SELECT_CON_EMPLEADOS)
    .eq('estado', 'cerrada')
    .order('fecha', { ascending: false })

  if (startDate) query = query.gte('fecha', startDate)
  if (endDate) query = query.lte('fecha', endDate)

  const { data, error } = await query
  if (error) throw error
  return (data || []) as CajaDia[]
}
