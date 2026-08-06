// ── Sync local de Órdenes / Clientes / Cupones de TiendaNube ────────────────
// A diferencia de modelos/modelo_talles (que necesitan upsert fila por fila
// por los talles anidados), estos tres recursos son registros planos:
// se hace upsert en bloque directo contra Supabase.

import { supabase } from '../lib/supabase'
import {
  fetchAllTNOrders, fetchTNCustomers, fetchTNCoupons, getTNCredentials,
  type TNOrder, type TNCustomer, type TNCoupon,
} from './tiendanubeService'

// ── Lectura local (Supabase) ─────────────────────────────────────────────────
// Las páginas de Tienda Online leen de acá en vez de pedirle en vivo a la API
// de TN. Se mapea la fila de Supabase de vuelta al shape TNOrder/TNCustomer/
// TNCoupon para poder reusar toda la UI y los helpers ya existentes
// (paymentStatusLabel, formatARS, etc.) sin cambios.

export async function fetchLocalTNOrdenes(): Promise<TNOrder[]> {
  const { data, error } = await supabase
    .from('tn_ordenes')
    .select('*')
    .order('tn_created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(orderRowToTNOrder)
}

export async function fetchLocalTNClientes(): Promise<TNCustomer[]> {
  const { data, error } = await supabase
    .from('tn_clientes')
    .select('*')
    .order('total_spent', { ascending: false })
  if (error) throw error
  return (data ?? []).map(clienteRowToTNCustomer)
}

export async function fetchLocalTNCupones(): Promise<TNCoupon[]> {
  const { data, error } = await supabase
    .from('tn_cupones')
    .select('*')
    .order('tn_created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(cuponRowToTNCoupon)
}

function orderRowToTNOrder(r: Record<string, unknown>): TNOrder {
  return {
    id: Number(r.tn_order_id),
    number: Number(r.number) || 0,
    status: (r.status as TNOrder['status']) ?? 'open',
    payment_status: (r.payment_status as TNOrder['payment_status']) ?? 'pending',
    fulfillment_status: null,
    shipping_status: (r.shipping_status as string | null) ?? null,
    total: String(r.total ?? '0'),
    subtotal: String(r.subtotal ?? '0'),
    total_shipping: String(r.total_shipping ?? '0'),
    discount: String(r.discount ?? '0'),
    created_at: String(r.tn_created_at),
    customer: r.customer_tn_id
      ? { id: Number(r.customer_tn_id), name: String(r.customer_name ?? ''), email: String(r.customer_email ?? '') }
      : null,
    products: (r.products as TNOrder['products']) ?? [],
    payment_details: r.payment_detail as TNOrder['payment_details'],
    coupon: r.coupon as TNOrder['coupon'],
    note: (r.note as string | null) ?? null,
    shipping_address: r.shipping_address as TNOrder['shipping_address'],
  }
}

function clienteRowToTNCustomer(r: Record<string, unknown>): TNCustomer {
  return {
    id: Number(r.tn_customer_id),
    name: String(r.name ?? ''),
    email: String(r.email ?? ''),
    phone: (r.phone as string | null) ?? null,
    total_spent: String(r.total_spent ?? '0'),
    orders_count: Number(r.orders_count) || 0,
    created_at: String(r.tn_created_at),
    last_order_id: null,
  }
}

function cuponRowToTNCoupon(r: Record<string, unknown>): TNCoupon {
  return {
    id: Number(r.tn_coupon_id),
    code: String(r.code ?? ''),
    type: (r.type as TNCoupon['type']) ?? 'absolute',
    value: r.value as string | number,
    valid: Boolean(r.valid),
    used_times: Number(r.used_times) || 0,
    max_uses: r.max_uses == null ? null : Number(r.max_uses),
    created_at: String(r.tn_created_at),
    valid_from: (r.valid_from as string | null) ?? null,
    valid_to: (r.valid_to as string | null) ?? null,
  }
}

// ── Sync remoto → local ──────────────────────────────────────────────────────

function ordenRow(o: TNOrder) {
  return {
    tn_order_id: o.id,
    number: o.number,
    status: o.status,
    payment_status: o.payment_status,
    shipping_status: o.shipping_status ?? o.fulfillment_status ?? null,
    total: parseFloat(o.total) || 0,
    subtotal: parseFloat(o.subtotal) || 0,
    total_shipping: parseFloat(o.total_shipping) || 0,
    discount: parseFloat(o.discount) || 0,
    customer_tn_id: o.customer?.id ?? null,
    customer_name: o.customer?.name ?? null,
    customer_email: o.customer?.email ?? null,
    payment_method: o.payment_details?.method ?? null,
    payment_detail: o.payment_details ?? null,
    coupon: o.coupon ?? null,
    note: o.note ?? null,
    shipping_address: o.shipping_address ?? null,
    products: o.products ?? [],
    tn_created_at: o.created_at,
  }
}

function clienteRow(c: TNCustomer) {
  return {
    tn_customer_id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    total_spent: parseFloat(c.total_spent) || 0,
    orders_count: c.orders_count,
    tn_created_at: c.created_at,
  }
}

function cuponRow(c: TNCoupon) {
  return {
    tn_coupon_id: c.id,
    code: c.code,
    type: c.type,
    value: String(c.value),
    valid: c.valid,
    used_times: c.used_times,
    max_uses: c.max_uses,
    valid_from: c.valid_from,
    valid_to: c.valid_to,
    tn_created_at: c.created_at,
  }
}

async function upsertBatch(
  table: string, rows: Record<string, unknown>[], onConflict: string, batchSize = 200,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    if (batch.length === 0) continue
    const { error } = await supabase.from(table).upsert(batch as never[], { onConflict })
    if (error) throw error
  }
}

export async function syncTNOrdenes(onProgress?: (n: number) => void): Promise<{ synced: number }> {
  const { storeId, token } = getTNCredentials()
  const orders = await fetchAllTNOrders(storeId, token, onProgress, true)
  const rows = orders.map(ordenRow)
  await upsertBatch('tn_ordenes', rows, 'tn_order_id')
  return { synced: rows.length }
}

export async function syncTNClientes(): Promise<{ synced: number }> {
  const { storeId, token } = getTNCredentials()
  const customers = await fetchTNCustomers(storeId, token)
  const rows = customers.map(clienteRow)
  await upsertBatch('tn_clientes', rows, 'tn_customer_id')
  return { synced: rows.length }
}

export async function syncTNCupones(): Promise<{ synced: number }> {
  const { storeId, token } = getTNCredentials()
  const coupons = await fetchTNCoupons(storeId, token)
  const rows = coupons.map(cuponRow)
  await upsertBatch('tn_cupones', rows, 'tn_coupon_id')
  return { synced: rows.length }
}
