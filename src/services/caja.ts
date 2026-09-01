import { supabase } from '../lib/supabase'
import type { CajaDia, CajaGasto, CajaVerificacion, TotalesEfectivoDia } from '../types'

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

export async function fetchGastosCaja(cajaDiaId: string): Promise<CajaGasto[]> {
  const { data, error } = await supabase
    .from('caja_gastos')
    .select('*, empleados(nombre)')
    .eq('caja_dia_id', cajaDiaId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as CajaGasto[]
}

export async function registrarGastoCaja(
  cajaDiaId: string, monto: number, motivo: string, empleadoId: string | null,
): Promise<CajaGasto> {
  const { data, error } = await supabase
    .from('caja_gastos')
    .insert([{ caja_dia_id: cajaDiaId, monto, motivo, empleado_id: empleadoId }])
    .select('*, empleados(nombre)')
    .single()
  if (error) throw error
  return data as CajaGasto
}

async function fetchTotalGastos(cajaDiaId: string): Promise<number> {
  const { data, error } = await supabase
    .from('caja_gastos')
    .select('monto')
    .eq('caja_dia_id', cajaDiaId)
  if (error) throw error
  return (data || []).reduce((s, g) => s + Number(g.monto), 0)
}

export async function fetchTotalesEfectivoDia(fecha: string): Promise<TotalesEfectivoDia> {
  const { data, error } = await supabase
    .from('ventas')
    .select('precio_venta, medio_pago, venta_grupo_id, monto_efectivo, monto_transferencia')
    .gte('fecha', fecha)
    .lte('fecha', fecha + 'T23:59:59')
  if (error) throw error

  const totales: TotalesEfectivoDia = { efectivo: 0, transferencia: 0, tarjeta: 0 }
  // Un pago mixto guarda el mismo split en cada fila del grupo (una fila por
  // unidad vendida) — se dedupea por venta_grupo_id para no contarlo N veces.
  const mixtoGruposVistos = new Set<string>()
  for (const v of data || []) {
    const monto = Number(v.precio_venta)
    if (v.medio_pago === 'Efectivo') totales.efectivo += monto
    else if (v.medio_pago === 'Transferencia') totales.transferencia += monto
    else if (v.medio_pago === 'Tarjeta') totales.tarjeta += monto
    else if (v.medio_pago === 'Mixto' && v.venta_grupo_id && !mixtoGruposVistos.has(v.venta_grupo_id)) {
      mixtoGruposVistos.add(v.venta_grupo_id)
      totales.efectivo += Number(v.monto_efectivo ?? 0)
      totales.transferencia += Number(v.monto_transferencia ?? 0)
    }
  }
  return totales
}

// Vuelto entregado en efectivo durante el día — solo informativo para el
// cajero: ya está descontado implícitamente porque `ventas.precio_venta`
// registra el neto que quedó en el cajón, no lo que entregó el cliente.
export async function fetchTotalVueltoEntregado(fecha: string): Promise<number> {
  const { data, error } = await supabase
    .from('ventas')
    .select('vuelto_efectivo, venta_grupo_id')
    .gte('fecha', fecha)
    .lte('fecha', fecha + 'T23:59:59')
    .not('vuelto_efectivo', 'is', null)
  if (error) throw error

  // Igual que el split de pago mixto: el vuelto se guarda repetido en cada
  // fila del mismo venta_grupo_id, hay que dedupear.
  const gruposVistos = new Set<string>()
  let total = 0
  for (const v of data || []) {
    if (!v.venta_grupo_id || gruposVistos.has(v.venta_grupo_id)) continue
    gruposVistos.add(v.venta_grupo_id)
    total += Number(v.vuelto_efectivo ?? 0)
  }
  return total
}

// Neto en efectivo de devoluciones/cambios del día: positivo si el cliente
// pagó una diferencia en efectivo (entra plata), negativo si se le devolvió
// (sale plata). Se suma tal cual al efectivo esperado de la caja.
export async function fetchNetoDevolucionesEfectivo(fecha: string): Promise<number> {
  const { data, error } = await supabase
    .from('devoluciones_cambios')
    .select('monto_diferencia')
    .eq('medio_pago_diferencia', 'Efectivo')
    .gte('fecha', fecha)
    .lte('fecha', fecha + 'T23:59:59')
  if (error) throw error
  return (data || []).reduce((s, d) => s + Number(d.monto_diferencia), 0)
}

// Efectivo esperado de una caja en este momento (misma fórmula que usa
// cerrarCaja) — se usa para mostrar la referencia antes de fichar salida,
// tanto al que cierra de verdad como al que solo deja una verificación.
export async function calcularEfectivoEsperado(caja: CajaDia): Promise<number> {
  const [totales, totalGastos, netoDevoluciones] = await Promise.all([
    fetchTotalesEfectivoDia(caja.fecha),
    fetchTotalGastos(caja.id),
    fetchNetoDevolucionesEfectivo(caja.fecha),
  ])
  return caja.monto_apertura + totales.efectivo + netoDevoluciones - totalGastos
}

export async function registrarVerificacionCaja(
  cajaDiaId: string, empleadoId: string | null, montoDeclarado: number, montoEsperado: number,
): Promise<CajaVerificacion> {
  const { data, error } = await supabase
    .from('caja_verificaciones')
    .insert([{
      caja_dia_id: cajaDiaId,
      empleado_id: empleadoId,
      monto_declarado: montoDeclarado,
      monto_esperado_en_momento: montoEsperado,
      diferencia: montoDeclarado - montoEsperado,
    }])
    .select('*, empleados(nombre)')
    .single()
  if (error) throw error
  return data as CajaVerificacion
}

export async function fetchVerificacionesCaja(cajaDiaId: string): Promise<CajaVerificacion[]> {
  const { data, error } = await supabase
    .from('caja_verificaciones')
    .select('*, empleados(nombre)')
    .eq('caja_dia_id', cajaDiaId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as CajaVerificacion[]
}

// Corta la caja de hoy sola apenas se pasa la hora de corte de turno
// configurada (ej. mediodía), sin pedirle a nadie que cuente efectivo: usa
// el monto calculado como "contado", así que la diferencia queda en 0 — no
// es un arqueo real, es solo el límite entre un turno y el siguiente. El
// próximo que fiche entrada se encuentra sin caja abierta y AperturaCajaGate
// le pide el efectivo real que hay en ese momento, en vez de heredar el
// cálculo acumulado del turno anterior (ver services/fichajes.ts).
// Se llama junto con cerrarFichajesVencidos (App.tsx); no depende de cron.
export async function cerrarCajaPorCorteDeTurno(horaCorteTurno: string | null): Promise<boolean> {
  if (!horaCorteTurno) return false

  const caja = await fetchCajaAbierta()
  if (!caja) return false

  const hoy = new Date().toISOString().slice(0, 10)
  if (caja.fecha !== hoy) return false // cajas colgadas de días anteriores son otro problema, no se tocan acá

  const [hh, mm] = horaCorteTurno.split(':').map(Number)
  const corte = new Date()
  corte.setHours(hh, mm, 0, 0)
  if (corte > new Date()) return false // todavía no llegó la hora de corte

  // Si se abrió después de la hora de corte de hoy (ej. turno tarde que ya
  // arrancó pasado el mediodía), no corresponde volver a cortarla.
  if (caja.abierta_at && new Date(caja.abierta_at) >= corte) return false

  const esperado = await calcularEfectivoEsperado(caja)
  await cerrarCaja(
    caja.id, caja.fecha, caja.monto_apertura, esperado, null,
    'Cierre automático de turno — nadie contó el efectivo, este monto es el calculado.',
  )
  return true
}

export async function cerrarCaja(
  cajaId: string,
  fecha: string,
  montoApertura: number,
  montoContado: number,
  empleadoId: string | null,
  notas: string | null
): Promise<CajaDia> {
  const [totales, totalGastos, netoDevoluciones] = await Promise.all([
    fetchTotalesEfectivoDia(fecha),
    fetchTotalGastos(cajaId),
    fetchNetoDevolucionesEfectivo(fecha),
  ])
  const esperado = montoApertura + totales.efectivo + netoDevoluciones - totalGastos
  const diferencia = montoContado - esperado

  const { data, error } = await supabase
    .from('caja_dias')
    .update({
      estado: 'cerrada',
      monto_cierre_contado: montoContado,
      monto_esperado_snapshot: esperado,
      total_gastos_snapshot: totalGastos,
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
