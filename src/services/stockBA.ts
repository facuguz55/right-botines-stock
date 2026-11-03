import { supabase } from '../lib/supabase'
import type { PedidoLeido } from '../lib/stockBaPdf'

export interface TalleBAFila { id: string; modelo_id: string; talle: string; cantidad: number }
export interface ModeloBA {
  id: string
  codigo: string
  descripcion: string
  foto_url: string | null
  costo: number | null
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
