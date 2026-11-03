import { supabase } from '../lib/supabase'
import type { PedidoLeido } from '../lib/stockBaPdf'
import { parseTalleArg, variantLabel } from '../lib/tnMapping'
import { fetchTNProduct, updateTNVariant } from './tiendanubeService'
import { getTNCredentials } from './tiendanubeService'

export interface TalleBAFila { id: string; modelo_id: string; talle: string; cantidad: number; tn_variant_id: number | null }
export interface ModeloBA {
  id: string
  codigo: string
  descripcion: string
  foto_url: string | null
  costo: number | null
  tn_product_id: number | null
  stock_ba_talles: TalleBAFila[]
}
export interface MovimientoBA { id: string; talle: string; delta: number; motivo: string; created_at: string }

const BUCKET = 'fotos-botines'

export async function fetchStockBA(): Promise<ModeloBA[]> {
  const { data, error } = await supabase
    .from('stock_ba_modelos')
    .select('*, stock_ba_talles(*)')
    .order('descripcion', { ascending: true })
  if (error) throw error
  return (data ?? []) as ModeloBA[]
}

export async function pedidoBAYaCargado(numero: string): Promise<boolean> {
  const { data, error } = await supabase.from('stock_ba_pedidos').select('id').eq('numero', numero).maybeSingle()
  if (error) throw error
  return !!data
}

export interface ResultadoImportBA { ya_estaba: boolean; numero: string; modelos_nuevos?: number; modelos_existentes?: number; pares?: number }

// Sube las fotos del PDF (solo las de modelos que todavía no tienen) y carga el pedido.
export async function importarPedidoBA(
  pedido: PedidoLeido, archivo: string, empleadoId: string | null,
  onProgreso?: (hecho: number, total: number) => void,
): Promise<ResultadoImportBA> {
  if (await pedidoBAYaCargado(pedido.numero)) return { ya_estaba: true, numero: pedido.numero }

  const { data: existentes, error: errEx } = await supabase
    .from('stock_ba_modelos').select('codigo, foto_url').in('codigo', pedido.items.map(i => i.codigo))
  if (errEx) throw errEx
  const conFoto = new Set((existentes ?? []).filter(m => m.foto_url).map(m => m.codigo))

  const fotoUrls: Record<string, string> = {}
  const aSubir = pedido.items.filter(i => i.fotoNombre && pedido.fotos[i.fotoNombre] && !conFoto.has(i.codigo))
  let hechas = 0
  for (const item of aSubir) {
    const path = `stock-ba/${item.codigo}-${Date.now()}.jpg`
    const { error } = await supabase.storage.from(BUCKET).upload(path, pedido.fotos[item.fotoNombre!], {
      contentType: 'image/jpeg', cacheControl: '31536000',
    })
    // Si una foto no sube, el modelo se carga igual sin foto.
    if (!error) fotoUrls[item.codigo] = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
    onProgreso?.(++hechas, aSubir.length)
  }

  const payload = {
    numero: pedido.numero,
    fecha: pedido.fecha,
    proveedor: pedido.proveedor,
    unidades: pedido.unidades,
    total: pedido.total,
    archivo,
    items: pedido.items.map(i => ({
      codigo: i.codigo, descripcion: i.descripcion, costo: i.costo,
      foto_url: fotoUrls[i.codigo] ?? null, talles: i.talles,
    })),
  }
  const { data, error } = await supabase.rpc('importar_pedido_ba', { p_pedido: payload, p_empleado_id: empleadoId })
  if (error) throw error
  // Los modelos vinculados con Tienda Nube: la tienda se actualiza con lo que entró.
  await empujarVinculadosATN(pedido.items.map(i => i.codigo)).catch(() => undefined)
  return data as ResultadoImportBA
}

export async function ajustarStockBA(talleId: string, delta: number, motivo: string, empleadoId: string | null): Promise<number> {
  const { data, error } = await supabase.rpc('ajustar_stock_ba', {
    p_talle_id: talleId, p_delta: delta, p_motivo: motivo, p_empleado_id: empleadoId,
  })
  if (error) throw error
  return data as number
}

export async function renombrarModeloBA(id: string, descripcion: string): Promise<void> {
  const { error } = await supabase.from('stock_ba_modelos').update({ descripcion }).eq('id', id)
  if (error) throw error
}

export async function fetchMovimientosBA(modeloId: string): Promise<MovimientoBA[]> {
  const { data, error } = await supabase
    .from('stock_ba_movimientos').select('id, talle, delta, motivo, created_at')
    .eq('modelo_id', modeloId).order('created_at', { ascending: false }).limit(30)
  if (error) throw error
  return (data ?? []) as MovimientoBA[]
}

// ── Conexión con Tienda Nube ────────────────────────────────────────────────

export interface ProductoTN { id: string; marca: string; modelo: string; tn_product_id: number; paresLocal: number }

// Productos de la tienda que ya llegaron a la app (por el webhook), para elegir
// con cuál se vincula un modelo de Buenos Aires.
export async function buscarProductosTN(texto: string): Promise<ProductoTN[]> {
  const q = texto.trim().replace(/[%,()]/g, ' ')
  let query = supabase
    .from('modelos')
    .select('id, marca, modelo, tn_product_id, modelo_talles(cantidad)')
    .not('tn_product_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(12)
  if (q) query = query.or(`marca.ilike.%${q}%,modelo.ilike.%${q}%`)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((m: { id: string; marca: string; modelo: string; tn_product_id: number; modelo_talles: { cantidad: number }[] }) => ({
    id: m.id, marca: m.marca, modelo: m.modelo, tn_product_id: m.tn_product_id,
    paresLocal: (m.modelo_talles ?? []).reduce((a, t) => a + t.cantidad, 0),
  }))
}

function tallesDeProductoTN(prod: Awaited<ReturnType<typeof fetchTNProduct>>) {
  return prod.variants
    .map(v => {
      const t = parseTalleArg(variantLabel(v))
      return t !== null ? { talle: String(t), cantidad: v.stock ?? 0, variant_id: v.id } : null
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
}

// Vincula el modelo con el producto de la tienda. Desde ahí el producto deja de
// contar en el stock del local (si ya estaba, se pone en cero) y sus cantidades
// son las de Buenos Aires: lo que se vende en la tienda baja acá.
export async function vincularConTN(modeloBaId: string, tnProductId: number): Promise<{ sincronizado: boolean }> {
  const { error } = await supabase.from('stock_ba_modelos').update({ tn_product_id: tnProductId }).eq('id', modeloBaId)
  if (error) {
    if (error.code === '23505') throw new Error('Ese producto ya está vinculado a otro modelo de Buenos Aires.')
    throw error
  }

  const { data: locales } = await supabase.from('modelos').select('id').eq('tn_product_id', tnProductId)
  const ids = (locales ?? []).map(m => m.id)
  if (ids.length) {
    const { error: errZero } = await supabase.from('modelo_talles').update({ cantidad: 0, cantidad_local: 0 }).in('modelo_id', ids)
    if (errZero) throw errZero
  }

  try {
    const { storeId, token } = getTNCredentials()
    const prod = await fetchTNProduct(storeId, token, tnProductId)
    await supabase.rpc('sincronizar_stock_ba_tn', { p_tn_product_id: tnProductId, p_talles: tallesDeProductoTN(prod) })
    return { sincronizado: true }
  } catch {
    // Sin conexión a la tienda ahora: se sincroniza con el próximo cambio del producto.
    return { sincronizado: false }
  }
}

export async function desvincularDeTN(modeloBaId: string): Promise<void> {
  const { error } = await supabase.from('stock_ba_modelos').update({ tn_product_id: null }).eq('id', modeloBaId)
  if (error) throw error
}

// Manda a la tienda la cantidad de un talle (cuando se descuenta o suma acá).
export async function empujarTalleATN(tnProductId: number, tnVariantId: number, cantidad: number): Promise<void> {
  const { storeId, token } = getTNCredentials()
  await updateTNVariant(storeId, token, tnProductId, tnVariantId, { stock: Math.max(0, cantidad) })
}

async function empujarVinculadosATN(codigos: string[]): Promise<void> {
  const { data } = await supabase
    .from('stock_ba_modelos').select('tn_product_id, stock_ba_talles(cantidad, tn_variant_id)')
    .in('codigo', codigos).not('tn_product_id', 'is', null)
  for (const m of (data ?? []) as { tn_product_id: number; stock_ba_talles: { cantidad: number; tn_variant_id: number | null }[] }[]) {
    for (const t of m.stock_ba_talles) {
      if (t.tn_variant_id) await empujarTalleATN(m.tn_product_id, t.tn_variant_id, t.cantidad)
    }
  }
}
