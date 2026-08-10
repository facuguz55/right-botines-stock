import { supabase } from '../lib/supabase'
import type { Compra } from '../types'

const SELECT = '*, proveedores(nombre), empleados(nombre), compra_items(*, modelos(modelo, marca)), compra_pagos(*, empleados(nombre))'

function conSaldo(c: Compra): Compra {
  const pagado = (c.compra_pagos ?? []).reduce((s, p) => s + Number(p.monto), 0)
  return { ...c, saldo: Number(c.total) - pagado }
}

export async function fetchCompras(startDate?: string, endDate?: string): Promise<Compra[]> {
  let query = supabase.from('compras').select(SELECT).order('fecha', { ascending: false })
  if (startDate) query = query.gte('fecha', startDate)
  if (endDate) query = query.lte('fecha', endDate)
  const { data, error } = await query
  if (error) throw error
  return ((data ?? []) as Compra[]).map(conSaldo)
}

export interface CompraItemInput {
  modeloId: string | null
  descripcion: string
  talleArg: number | null
  cantidad: number
  costoUnitario: number
}

export async function registrarCompra(
  proveedorId: string,
  fecha: string,
  numeroRemito: string | null,
  items: CompraItemInput[],
  notas: string | null,
  empleadoId: string | null,
): Promise<Compra> {
  const total = items.reduce((s, i) => s + i.cantidad * i.costoUnitario, 0)

  const { data: compra, error: compraErr } = await supabase
    .from('compras')
    .insert([{ proveedor_id: proveedorId, fecha, numero_remito: numeroRemito, total, notas, empleado_id: empleadoId }])
    .select()
    .single()
  if (compraErr) throw compraErr

  const filas = items.map(i => ({
    compra_id: compra.id,
    modelo_id: i.modeloId,
    descripcion: i.descripcion,
    talle_arg: i.talleArg,
    cantidad: i.cantidad,
    costo_unitario: i.costoUnitario,
    subtotal: i.cantidad * i.costoUnitario,
  }))
  const { error: itemsErr } = await supabase.from('compra_items').insert(filas)
  if (itemsErr) throw itemsErr

  return compra
}

export async function registrarPago(
  compraId: string, monto: number, fecha: string, notas: string | null, empleadoId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('compra_pagos')
    .insert([{ compra_id: compraId, monto, fecha, notas, empleado_id: empleadoId }])
  if (error) throw error
}

export interface SaldoProveedor {
  proveedorId: string
  totalComprado: number
  totalPagado: number
  saldo: number
}

export async function fetchSaldosPorProveedor(): Promise<SaldoProveedor[]> {
  const { data, error } = await supabase
    .from('compras')
    .select('id, proveedor_id, total, compra_pagos(monto)')
  if (error) throw error

  const porProveedor = new Map<string, SaldoProveedor>()
  for (const c of data ?? []) {
    const pagado = (c.compra_pagos as { monto: number }[] ?? []).reduce((s, p) => s + Number(p.monto), 0)
    const actual = porProveedor.get(c.proveedor_id) ?? { proveedorId: c.proveedor_id, totalComprado: 0, totalPagado: 0, saldo: 0 }
    actual.totalComprado += Number(c.total)
    actual.totalPagado += pagado
    actual.saldo = actual.totalComprado - actual.totalPagado
    porProveedor.set(c.proveedor_id, actual)
  }
  return Array.from(porProveedor.values())
}
