import { supabase } from '../lib/supabase'
import type { PedidoLeido } from '../lib/stockBaPdf'

export interface TalleBAFila { id: string; modelo_id: string; talle: string; cantidad: number }
export interface ModeloBA {
  id: string
  codigo: string
  descripcion: string
  foto_url: string | null
  costo: number | null
  precio_venta: number | null
  modelo_local_id: string | null
  created_at: string
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

// ── Funciones del día a día ──

export interface PedidoBAFila { id: string; numero: string; fecha: string | null; proveedor: string | null; unidades: number | null; total: number | null; created_at: string }
export interface MovimientoBAReciente extends MovimientoBA { modelo_id: string; stock_ba_modelos: { codigo: string; descripcion: string } | null }

// Achica la foto antes de subirla (los celulares sacan fotos de 5 MB).
async function fotoAJpeg(file: File, ladoMax = 1200): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, ladoMax / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * k)
  canvas.height = Math.round(bmp.height * k)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo preparar la foto')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('No se pudo preparar la foto'))), 'image/jpeg', 0.88))
}

export async function subirFotoBA(file: File, codigo: string): Promise<string> {
  const blob = await fotoAJpeg(file)
  const path = `stock-ba/${codigo.replace(/[^\w-]/g, '_')}-${Date.now()}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
  if (error) throw error
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

export async function crearModeloBA(
  datos: { codigo: string; descripcion: string; costo: number | null; precioVenta: number | null; fotoUrl: string | null; talles: { talle: string; cantidad: number }[] },
  empleadoId: string | null,
): Promise<string> {
  const { data, error } = await supabase.rpc('crear_modelo_ba', {
    p_codigo: datos.codigo, p_descripcion: datos.descripcion, p_costo: datos.costo, p_precio_venta: datos.precioVenta,
    p_foto_url: datos.fotoUrl, p_talles: datos.talles, p_empleado_id: empleadoId,
  })
  if (error) throw error
  return data as string
}

export async function sumarTalleBA(modeloId: string, talle: string, cantidad: number, motivo: string, empleadoId: string | null): Promise<void> {
  const { error } = await supabase.rpc('sumar_talle_ba', {
    p_modelo_id: modeloId, p_talle: talle, p_cantidad: cantidad, p_motivo: motivo, p_empleado_id: empleadoId,
  })
  if (error) throw error
}

export async function actualizarModeloBA(
  id: string,
  cambios: Partial<{ descripcion: string; costo: number | null; precio_venta: number | null; foto_url: string | null; modelo_local_id: string | null }>,
): Promise<void> {
  const { error } = await supabase.from('stock_ba_modelos').update(cambios).eq('id', id)
  if (error) throw error
}

export async function eliminarModeloBA(id: string): Promise<void> {
  const { error } = await supabase.from('stock_ba_modelos').delete().eq('id', id)
  if (error) throw error
}

export async function fetchPedidosBA(): Promise<PedidoBAFila[]> {
  const { data, error } = await supabase
    .from('stock_ba_pedidos').select('id, numero, fecha, proveedor, unidades, total, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PedidoBAFila[]
}

export async function fetchMovimientosRecientesBA(limite = 60): Promise<MovimientoBAReciente[]> {
  const { data, error } = await supabase
    .from('stock_ba_movimientos')
    .select('id, modelo_id, talle, delta, motivo, created_at, stock_ba_modelos(codigo, descripcion)')
    .order('created_at', { ascending: false }).limit(limite)
  if (error) throw error
  return (data ?? []) as unknown as MovimientoBAReciente[]
}

// Para la pantalla de Stock: por cada modelo del local que tiene su par en
// Buenos Aires, qué talles hay allá (solo los que tienen pares).
export interface TalleBAVista { talle: string; cantidad: number }
export async function fetchStockBAPorModeloLocal(): Promise<Map<string, TalleBAVista[]>> {
  const { data, error } = await supabase
    .from('stock_ba_modelos')
    .select('modelo_local_id, stock_ba_talles(talle, cantidad)')
    .not('modelo_local_id', 'is', null)
  if (error) throw error
  const mapa = new Map<string, TalleBAVista[]>()
  for (const fila of (data ?? []) as unknown as { modelo_local_id: string; stock_ba_talles: TalleBAVista[] }[]) {
    const talles = fila.stock_ba_talles.filter(t => t.cantidad > 0).sort((a, b) => parseFloat(a.talle) - parseFloat(b.talle))
    if (talles.length === 0) continue
    mapa.set(fila.modelo_local_id, [...(mapa.get(fila.modelo_local_id) ?? []), ...talles])
  }
  return mapa
}
