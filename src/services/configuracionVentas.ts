import { supabase } from '../lib/supabase'

export interface ConfigVentas {
  descuento_transferencia_pct: number | null
}

export async function fetchConfigVentas(): Promise<ConfigVentas> {
  const { data, error } = await supabase
    .from('configuracion_ventas')
    .select('descuento_transferencia_pct')
    .eq('id', 1)
    .single()
  if (error) throw error
  return data
}

export async function updateDescuentoTransferenciaPct(pct: number | null): Promise<void> {
  const { error } = await supabase
    .from('configuracion_ventas')
    .update({ descuento_transferencia_pct: pct, updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) throw error
}

// Lee la última orden pagada con el método que trae descuento (payment_method
// 'custom' = Transferencia configurada en TiendaNube) ya sincronizada en
// tn_ordenes, y calcula el % real que aplicó TN — evita copiar el número a
// mano desde el panel de TiendaNube.
export async function detectarDescuentoDesdeTN(): Promise<number | null> {
  const { data, error } = await supabase
    .from('tn_ordenes')
    .select('subtotal, discount')
    .eq('payment_method', 'custom')
    .gt('discount', 0)
    .order('tn_created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data || !Number(data.subtotal)) return null
  return Math.round((Number(data.discount) / Number(data.subtotal)) * 10000) / 100
}
