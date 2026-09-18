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
      .update({
        talle_us: talle.talle_us,
        talle_arg: talle.talle_arg,
        cantidad: talle.cantidad,
        stock_minimo: talle.stock_minimo,
        ...(talle.tn_variant_id !== undefined ? { tn_variant_id: talle.tn_variant_id } : {}),
      })
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
      ...(talle.tn_variant_id !== undefined ? { tn_variant_id: talle.tn_variant_id } : {}),
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

// Mueve pares del depósito al local ("reponer el mostrador"). Nunca deja
// mover más de lo que hay en depósito — ver reponer_stock_local en
// supabase/migrations/029_stock_local_vs_deposito.sql.
export async function reponerStockLocal(talleId: string, cantidad: number): Promise<number> {
  const { data, error } = await supabase.rpc('reponer_stock_local', {
    p_talle_id: talleId,
    p_cantidad: cantidad,
  })
  if (error) throw error
  return data as number
}

// El descuento de stock y el chequeo de caja/fichaje viven en la función
// registrar_venta_carrito (supabase/migrations/028_venta_y_devolucion_atomicas.sql):
// hacerlo en la base evita la condición de carrera de restar stock leído en
// el cliente, y evita que el chequeo de caja se pueda saltear llamando a la
// API directo. Acá solo se arma el payload.
export async function sellCarrito(
  items: { modelo: Modelo; talleId: string; cantidad: number; precioManual?: number | null }[],
  medioPago: MedioPago,
  clienteId: string,
  tarjeta: string | null,
  cuotas: number | null,
  recargoPct: number,
  empleadoId: string | null,
  montoEfectivo: number | null = null,
  montoTransferencia: number | null = null,
  montoRecibidoEfectivo: number | null = null,
  vueltoEfectivo: number | null = null,
): Promise<void> {
  const { error } = await supabase.rpc('registrar_venta_carrito', {
    p_items: items.map(({ talleId, cantidad, precioManual }) => ({
      talle_id: talleId,
      cantidad,
      precio_manual: precioManual ?? null,
    })),
    p_medio_pago: medioPago,
    p_cliente_id: clienteId,
    p_tarjeta: tarjeta,
    p_cuotas: cuotas,
    p_recargo_pct: recargoPct,
    p_empleado_id: empleadoId,
    p_monto_efectivo: montoEfectivo,
    p_monto_transferencia: montoTransferencia,
    p_monto_recibido_efectivo: montoRecibidoEfectivo,
    p_vuelto_efectivo: vueltoEfectivo,
  })
  if (error) throw error
}

// El ajuste de stock y el registro en `ingresos` viven en la función
// registrar_ingreso_stock (supabase/migrations/032_ingreso_y_venta_tn_atomicos.sql):
// antes esto leía `cantidad` del talle en el navegador y mandaba el total ya
// sumado — dos ingresos del mismo talle casi al mismo tiempo (o un ingreso
// mientras se vende ese talle) podían pisarse y perder stock. Ahora la suma
// se hace en la base sobre el valor que haya en ese momento, no sobre uno
// leído antes acá. `cantidadActual` ya no se usa para calcular nada (queda
// en la firma para no tener que tocar los dos lugares que llaman a esto).
export async function addIngreso(
  modeloId: string,
  talleArg: number,
  talleUs: number,
  _cantidadActual: number,
  cantidad: number,
  costoTotal: number,
  talleId?: string
): Promise<void> {
  const { error } = await supabase.rpc('registrar_ingreso_stock', {
    p_modelo_id: modeloId,
    p_items: [{ talle_id: talleId ?? null, talle_arg: talleArg, talle_us: talleUs, cantidad_delta: cantidad, stock_minimo: 1 }],
    p_costo_total: costoTotal,
  })
  if (error) throw error
}

export async function addIngresoBatch(
  modeloId: string,
  changes: { talleId: string; talleArg: number; talleUs: number; cantidadActual: number; delta: number }[],
  newTalle: { talleArg: number; talleUs: number; cantidad: number } | null,
  costoTotal: number
): Promise<{ newTalleId: string | null }> {
  const items = [
    ...changes.map(c => ({ talle_id: c.talleId, talle_arg: c.talleArg, talle_us: c.talleUs, cantidad_delta: c.delta, stock_minimo: 1 })),
    ...(newTalle ? [{ talle_id: null, talle_arg: newTalle.talleArg, talle_us: newTalle.talleUs, cantidad_delta: newTalle.cantidad, stock_minimo: 1 }] : []),
  ]

  const { data, error } = await supabase.rpc('registrar_ingreso_stock', {
    p_modelo_id: modeloId,
    p_items: items,
    p_costo_total: costoTotal,
  })
  if (error) throw error

  // newTalle siempre va último en `items` — tomar el último resultado en vez
  // de buscar por talle_arg evita ambigüedad si algún talle existente
  // coincidiera casualmente con el mismo talle_arg del nuevo.
  const resultado = (data ?? []) as { talle_arg: number; talle_id: string }[]
  const newTalleId = newTalle ? resultado[resultado.length - 1]?.talle_id ?? null : null

  return { newTalleId }
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
  // Promise.allSettled, no Promise.all: antes, si un ítem del lote fallaba
  // (constraint, RLS, timeout), Promise.all rechazaba entero pero los demás
  // ítems del MISMO lote que ya habían resuelto bien quedaban aplicados en
  // la base igual — sin ninguna forma de saber cuáles. Ahora se sigue
  // procesando todo, se cuentan los que fallaron, y se avisa con el detalle
  // en vez de un error genérico que deja la duda de qué se aplicó.
  const BATCH = 20
  const fallidos: { id: string; error: string }[] = []
  for (let i = 0; i < items.length; i += BATCH) {
    const lote = items.slice(i, i + BATCH)
    const resultados = await Promise.allSettled(
      lote.map(async ({ id, precioActual, precioNuevo }) => {
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
    resultados.forEach((r, idx) => {
      if (r.status === 'rejected') {
        fallidos.push({ id: lote[idx].id, error: r.reason instanceof Error ? r.reason.message : String(r.reason) })
      }
    })
  }
  if (fallidos.length > 0) {
    throw new Error(
      `Se actualizaron ${items.length - fallidos.length} de ${items.length} — ${fallidos.length} no se pudieron cambiar (reintentá solo esos, no todo de nuevo, para no duplicar el ajuste).`
    )
  }
}

export async function bulkUpdateStockTalles(
  items: { modeloId: string; talles: { id: string; cantidadActual: number }[] }[],
  op: 'sumar' | 'restar' | 'exacto' | 'fijar',
  valor: number
): Promise<void> {
  const updates = items.flatMap(({ talles }) =>
    talles.map(t => {
      let nueva: number
      if (op === 'exacto' || op === 'fijar') nueva = Math.max(0, valor)
      else if (op === 'sumar') nueva = t.cantidadActual + valor
      else nueva = Math.max(0, t.cantidadActual - valor)
      return { id: t.id, cantidad: nueva }
    })
  )
  // Ver el comentario de bulkUpdatePrecio: mismo cambio de Promise.all a
  // Promise.allSettled, para no dejar un fallo parcial silencioso — acá es
  // más delicado todavía, porque con "sumar"/"restar" reintentar ciegamente
  // todo el lote duplicaría el ajuste de los que sí se aplicaron.
  const BATCH = 20
  const fallidos: { id: string; error: string }[] = []
  for (let i = 0; i < updates.length; i += BATCH) {
    const lote = updates.slice(i, i + BATCH)
    const resultados = await Promise.allSettled(
      lote.map(({ id, cantidad }) =>
        supabase.from('modelo_talles').update({ cantidad }).eq('id', id).then(({ error }) => { if (error) throw error })
      )
    )
    resultados.forEach((r, idx) => {
      if (r.status === 'rejected') {
        fallidos.push({ id: lote[idx].id, error: r.reason instanceof Error ? r.reason.message : String(r.reason) })
      }
    })
  }
  if (fallidos.length > 0) {
    throw new Error(
      `Se actualizaron ${updates.length - fallidos.length} de ${updates.length} talles — ${fallidos.length} no se pudieron cambiar (reintentá solo esos, no todo de nuevo, para no duplicar el ajuste si era "sumar" o "restar").`
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
