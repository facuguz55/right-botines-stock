// @ts-nocheck
import { supabase } from '../lib/supabase'
import type { Producto, MedioPago } from '../types'

type ProductoInput = Omit<Producto, 'id' | 'created_at' | 'producto_fotos'>

const FOTOS_SELECT = 'producto_fotos(id, producto_id, foto_url, orden, created_at)'

export async function fetchProductos(): Promise<Producto[]> {
  const { data, error } = await supabase
    .from('productos')
    .select(`*, ${FOTOS_SELECT}`)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map(normalizeProducto)
}

export async function createProducto(producto: ProductoInput): Promise<Producto> {
  const { data, error } = await supabase
    .from('productos')
    .insert([producto])
    .select(`*, ${FOTOS_SELECT}`)
    .single()

  if (error) throw error
  return normalizeProducto(data)
}

export async function updateProducto(
  id: string,
  updates: Partial<ProductoInput>
): Promise<Producto> {
  const { data, error } = await supabase
    .from('productos')
    .update(updates)
    .eq('id', id)
    .select(`*, ${FOTOS_SELECT}`)
    .single()

  if (error) throw error
  return normalizeProducto(data)
}

export async function deleteProducto(id: string): Promise<void> {
  const { error } = await supabase.from('productos').delete().eq('id', id)
  if (error) throw error
}

export async function sellProducto(producto: Producto, medioPago: MedioPago): Promise<void> {
  if (producto.cantidad <= 0) throw new Error('No hay stock disponible para este producto')

  const { error: updateError } = await supabase
    .from('productos')
    .update({ cantidad: producto.cantidad - 1 })
    .eq('id', producto.id)

  if (updateError) throw updateError

  const recargo = medioPago === 'Tarjeta' ? producto.precio_venta * 0.1 : null
  const precioFinal = medioPago === 'Tarjeta'
    ? producto.precio_venta * 1.1
    : producto.precio_venta

  const { error: ventaError } = await supabase.from('ventas').insert([{
    producto_id: producto.id,
    precio_venta: precioFinal,
    medio_pago: medioPago,
    recargo_tarjeta: recargo,
    ganancia: precioFinal - producto.precio_costo,
  }])

  if (ventaError) throw ventaError
}

export async function addStockIngreso(
  productoId: string,
  cantidadActual: number,
  cantidad: number,
  costoTotal: number
): Promise<void> {
  const { error: updateError } = await supabase
    .from('productos')
    .update({ cantidad: cantidadActual + cantidad })
    .eq('id', productoId)

  if (updateError) throw updateError

  const { error: ingresoError } = await supabase
    .from('ingresos')
    .insert([{ producto_id: productoId, cantidad, costo_total: costoTotal }])

  if (ingresoError) throw ingresoError
}

export async function clearAllProductos(): Promise<void> {
  // Eliminar archivos de Storage primero
  const { data: fotos } = await supabase.from('producto_fotos').select('foto_url')
  if (fotos && fotos.length > 0) {
    const paths = fotos
      .map(f => { const p = f.foto_url.split('/fotos-botines/'); return p.length > 1 ? p[1] : null })
      .filter(Boolean) as string[]
    if (paths.length > 0) {
      await supabase.storage.from('fotos-botines').remove(paths)
    }
  }

  // Eliminar todos los productos (CASCADE borra producto_fotos en la DB)
  const { error } = await supabase.from('productos').delete().not('id', 'is', null)
  if (error) throw error
}

export async function getUniqueCodigoRef(base: string): Promise<string> {
  const { data } = await supabase
    .from('productos')
    .select('codigo_ref')
    .like('codigo_ref', `${base}%`)

  const existing = (data || []).map(r => r.codigo_ref as string)
  if (!existing.includes(base)) return base

  let suffix = 2
  while (existing.includes(`${base}-${suffix}`)) suffix++
  return `${base}-${suffix}`
}

function normalizeProducto(raw: any): Producto {
  return {
    ...raw,
    producto_fotos: (raw.producto_fotos || []).sort((a: any, b: any) => a.orden - b.orden),
  }
}
