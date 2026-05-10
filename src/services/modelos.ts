import { supabase } from '../lib/supabase'
import type { Modelo, ModeloTalle, MedioPago } from '../types'

type ModeloInput = Omit<Modelo, 'id' | 'created_at' | 'modelo_talles' | 'modelo_fotos'>

const SELECT = '*, modelo_talles(*), modelo_fotos(id, modelo_id, foto_url, orden, created_at)'

export async function fetchModelos(): Promise<Modelo[]> {
  const { data, error } = await supabase
    .from('modelos')
    .select(SELECT)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(normalizeModelo)
}

export async function createModelo(input: ModeloInput): Promise<Modelo> {
  const { data, error } = await supabase
    .from('modelos')
    .insert([input])
    .select(SELECT)
    .single()
  if (error) throw error
  return normalizeModelo(data)
}

export async function updateModelo(id: string, updates: Partial<ModeloInput>): Promise<Modelo> {
  const { data, error } = await supabase
    .from('modelos')
    .update(updates)
    .eq('id', id)
    .select(SELECT)
    .single()
  if (error) throw error
  return normalizeModelo(data)
}

export async function deleteModelo(id: string): Promise<void> {
  const { error } = await supabase.from('modelos').delete().eq('id', id)
  if (error) throw error
}

export async function upsertTalle(
  talle: Omit<ModeloTalle, 'id'> & { id?: string }
): Promise<ModeloTalle> {
  if (talle.id) {
    const { data, error } = await supabase
      .from('modelo_talles')
      .update({ cantidad: talle.cantidad, stock_minimo: talle.stock_minimo })
      .eq('id', talle.id)
      .select()
      .single()
    if (error) throw error
    return data
  }
  const { data, error } = await supabase
    .from('modelo_talles')
    .insert([{
      modelo_id: talle.modelo_id,
      talle_us: talle.talle_us,
      talle_arg: talle.talle_arg,
      cantidad: talle.cantidad,
      stock_minimo: talle.stock_minimo,
    }])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTalle(id: string): Promise<void> {
  const { error } = await supabase.from('modelo_talles').delete().eq('id', id)
  if (error) throw error
}

export async function sellTalle(
  modelo: Modelo,
  talleId: string,
  medioPago: MedioPago
): Promise<void> {
  const talle = modelo.modelo_talles.find(t => t.id === talleId)
  if (!talle) throw new Error('Talle no encontrado')

  const { error: upErr } = await supabase
    .from('modelo_talles')
    .update({ cantidad: talle.cantidad - 1 })
    .eq('id', talleId)
  if (upErr) throw upErr

  const recargo = medioPago === 'Tarjeta' ? modelo.precio_venta * 0.1 : null
  const precioFinal = medioPago === 'Tarjeta' ? modelo.precio_venta * 1.1 : modelo.precio_venta

  const { error: ventaErr } = await supabase.from('ventas').insert([{
    modelo_id: modelo.id,
    talle_arg: talle.talle_arg,
    precio_venta: precioFinal,
    medio_pago: medioPago,
    recargo_tarjeta: recargo,
    ganancia: precioFinal - modelo.precio_costo,
  }])
  if (ventaErr) throw ventaErr
}

export async function addIngreso(
  modeloId: string,
  talleArg: number,
  talleUs: number,
  cantidadActual: number,
  cantidad: number,
  costoTotal: number,
  talleId?: string
): Promise<void> {
  if (talleId) {
    const { error } = await supabase
      .from('modelo_talles')
      .update({ cantidad: cantidadActual + cantidad })
      .eq('id', talleId)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('modelo_talles')
      .insert([{ modelo_id: modeloId, talle_us: talleUs, talle_arg: talleArg, cantidad, stock_minimo: 1 }])
    if (error) throw error
  }

  const { error: ingErr } = await supabase.from('ingresos').insert([{
    modelo_id: modeloId, talle_arg: talleArg, cantidad, costo_total: costoTotal,
  }])
  if (ingErr) throw ingErr
}

export async function addIngresoBatch(
  modeloId: string,
  changes: { talleId: string; talleArg: number; talleUs: number; cantidadActual: number; delta: number }[],
  newTalle: { talleArg: number; talleUs: number; cantidad: number } | null,
  costoTotal: number
): Promise<void> {
  for (const c of changes) {
    const { error } = await supabase
      .from('modelo_talles')
      .update({ cantidad: c.cantidadActual + c.delta })
      .eq('id', c.talleId)
    if (error) throw error
  }

  if (newTalle) {
    const { error } = await supabase
      .from('modelo_talles')
      .insert([{ modelo_id: modeloId, talle_us: newTalle.talleUs, talle_arg: newTalle.talleArg, cantidad: newTalle.cantidad, stock_minimo: 1 }])
    if (error) throw error
  }

  const totalCantidad = changes.reduce((s, c) => s + c.delta, 0) + (newTalle?.cantidad ?? 0)
  const refTalleArg = changes[0]?.talleArg ?? newTalle?.talleArg ?? 0

  if (totalCantidad > 0) {
    const { error } = await supabase.from('ingresos').insert([{
      modelo_id: modeloId,
      talle_arg: refTalleArg,
      cantidad: totalCantidad,
      costo_total: costoTotal,
    }])
    if (error) throw error
  }
}

export async function getUniqueCodigoBase(base: string): Promise<string> {
  const { data } = await supabase
    .from('modelos')
    .select('codigo_base')
    .like('codigo_base', `${base}%`)
  const existing = (data || []).map(r => r.codigo_base as string)
  if (!existing.includes(base)) return base
  let suffix = 2
  while (existing.includes(`${base}-${suffix}`)) suffix++
  return `${base}-${suffix}`
}

export async function bulkUpdatePrecio(
  items: { id: string; precioActual: number; precioNuevo: number }[],
  campo: 'precio_venta' | 'precio_costo'
): Promise<void> {
  const BATCH = 20
  for (let i = 0; i < items.length; i += BATCH) {
    await Promise.all(
      items.slice(i, i + BATCH).map(async ({ id, precioActual, precioNuevo }) => {
        const { error } = await supabase.from('modelos').update({ [campo]: precioNuevo }).eq('id', id)
        if (error) throw error
        if (campo === 'precio_venta') {
          await supabase.from('historial_precios').insert([{
            modelo_id: id,
            precio_venta_anterior: precioActual,
            precio_venta_nuevo: precioNuevo,
          }])
        }
      })
    )
  }
}

export async function bulkDeleteModelos(ids: string[]): Promise<void> {
  const { data: fotos } = await supabase.from('modelo_fotos').select('foto_url').in('modelo_id', ids)
  if (fotos?.length) {
    const paths = fotos
      .map(f => { const p = f.foto_url.split('/fotos-botines/'); return p.length > 1 ? p[1] : null })
      .filter(Boolean) as string[]
    if (paths.length) await supabase.storage.from('fotos-botines').remove(paths)
  }
  const { error } = await supabase.from('modelos').delete().in('id', ids)
  if (error) throw error
}

export async function clearAllModelos(): Promise<void> {
  const { data: fotos } = await supabase.from('modelo_fotos').select('foto_url')
  if (fotos?.length) {
    const paths = fotos
      .map(f => { const p = f.foto_url.split('/fotos-botines/'); return p.length > 1 ? p[1] : null })
      .filter(Boolean) as string[]
    if (paths.length) await supabase.storage.from('fotos-botines').remove(paths)
  }
  const { error } = await supabase.from('modelos').delete().not('id', 'is', null)
  if (error) throw error
}

function normalizeModelo(raw: any): Modelo {
  return {
    ...raw,
    modelo_talles: (raw.modelo_talles || []).sort((a: ModeloTalle, b: ModeloTalle) => a.talle_arg - b.talle_arg),
    modelo_fotos: (raw.modelo_fotos || []).sort((a: any, b: any) => a.orden - b.orden),
  }
}
