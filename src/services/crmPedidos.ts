import { supabase } from '../lib/supabase'
import { sufijoTelefono, type PedidoTN } from '../lib/crmPedidos'
import { fetchTNOrder, getTNCredentials, type TNOrder } from './tiendanubeService'
import { orderRowToTNOrder } from './tnOrdersSync'

// Pedidos de la tienda web de quien escribe por WhatsApp. Se buscan en la
// copia local (tn_ordenes/tn_clientes, rápida) por los últimos dígitos del
// teléfono — del cliente de TN, de contacto de la orden o de la dirección de
// envío (ver migración 040) — y por email si el chat está vinculado a un
// cliente del local con email cargado.
export async function fetchPedidosDeContacto(
  telefono: string | null,
  email: string | null,
): Promise<TNOrder[]> {
  const suf = sufijoTelefono(telefono)
  const filtros: string[] = []

  if (suf) {
    const { data: clientes, error } = await supabase
      .from('tn_clientes')
      .select('tn_customer_id')
      .like('telefono_digitos', `%${suf}`)
      .limit(10)
    if (error) throw error
    const ids = (clientes ?? []).map(c => c.tn_customer_id)
    filtros.push(`telefono_digitos.like.*${suf}`)
    if (ids.length) filtros.push(`customer_tn_id.in.(${ids.join(',')})`)
  }
  if (email && /^[^\s,()]+@[^\s,()]+$/.test(email)) filtros.push(`customer_email.ilike.${email}`)
  if (!filtros.length) return []

  const { data, error } = await supabase
    .from('tn_ordenes')
    .select('*')
    .or(filtros.join(','))
    .order('tn_created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return (data ?? []).map(orderRowToTNOrder)
}

// Búsqueda manual en el panel: número de pedido, o nombre / email.
export async function buscarPedidos(texto: string): Promise<TNOrder[]> {
  const q = texto.trim().replace(/^#/, '')
  if (!q) return []
  let query = supabase.from('tn_ordenes').select('*')
  if (/^\d{1,7}$/.test(q)) {
    query = query.eq('number', Number(q))
  } else {
    // Sin comas ni paréntesis: rompen la sintaxis del filtro "or" de PostgREST.
    const limpio = q.replace(/[,()*%]/g, ' ').trim()
    if (!limpio) return []
    query = query.or(`customer_name.ilike.*${limpio}*,customer_email.ilike.*${limpio}*`)
  }
  const { data, error } = await query.order('tn_created_at', { ascending: false }).limit(20)
  if (error) throw error
  return (data ?? []).map(orderRowToTNOrder)
}

export async function fetchPedidoEnVivo(tnOrderId: number): Promise<PedidoTN> {
  const { storeId, token } = getTNCredentials()
  return await fetchTNOrder(storeId, token, tnOrderId) as PedidoTN
}
