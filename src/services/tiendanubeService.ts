// ── Types ──────────────────────────────────────────────────────────────────────

export interface TNProduct {
  id: number
  name: string
  quantity: number
  price: string
  sku: string | null
}

export interface TNOrderCoupon {
  id: number
  code: string
  type: 'percentage' | 'absolute' | 'shipping'
  value: string | number
}

export interface TNOrder {
  id: number
  number: number
  status: 'open' | 'closed' | 'cancelled'
  payment_status: 'pending' | 'authorized' | 'paid' | 'voided' | 'refunded' | 'unpaid' | 'partially_paid'
  fulfillment_status: 'unfulfilled' | 'fulfilled' | 'partial' | null
  shipping_status?: string | null // nombre real del campo en la API (fulfillment_status arriba nunca viene)
  total: string
  subtotal: string
  total_shipping: string
  discount: string
  created_at: string
  customer: { id: number; name: string; email: string } | null
  products: TNProduct[]
  payment_details: {
    method: string
    credit_card_company?: string
    installments?: number | null
  } | null
  coupon: TNOrderCoupon[] | null
  note: string | null
  shipping_address: {
    name: string
    address: string
    city: string
    province: string
    zipcode: string
    country: string
  } | null
}

export interface TNRawProduct {
  id: number
  name: Record<string, string>
  brand: string | null
  categories: { id: number; name: Record<string, string> }[]
  variants: {
    id: number
    sku: string | null
    price: string
    stock: number | null
    values: { es?: string; en?: string; [k: string]: string | undefined }[]
    updated_at: string
  }[]
  images: { src: string }[]
  updated_at: string
}

export interface TNCustomer {
  id: number
  name: string
  email: string
  phone: string | null
  total_spent: string
  orders_count: number
  created_at: string
  last_order_id: number | null
}

export interface TNCoupon {
  id: number
  code: string
  type: 'percentage' | 'absolute' | 'shipping'
  value: string | number
  valid: boolean
  used_times: number
  max_uses: number | null
  created_at: string
  valid_from: string | null
  valid_to: string | null
}

export interface TNCategory {
  id: number
  name: Record<string, string>
  parent: number | null // TN devuelve 0 cuando no tiene categoría padre
  handle: Record<string, string>
  created_at: string
}

export interface TNVariantItem {
  productId: number
  variantId: number
  nombre: string
  sku: string
  stock: number
  precio: number
  variantLabel: string
  imagen: string | null
  updatedAt: string
}

export interface TopProducto {
  nombre: string
  cantidad: number
  total: number
}

export interface MonthlyStats {
  month: string
  label: string
  ventas: number
  facturado: number
}

export interface TNMetrics {
  orders: TNOrder[]
  totalFacturado: number
  ventasHoy: number
  ventasSemana: number
  ventasMes: number
  totalOrdenes: number
  ordenesPagadas: number
  ordenesPendientes: number
  ordenesCanceladas: number
  ticketPromedio: number
  topProductos: TopProducto[]
  metodosPago: { name: string; value: number; porcentaje: number }[]
  ventasPorDia: { name: string; value: number; facturado: number }[]
  ventasPorHora: { name: string; value: number }[]
  ventasPorMes: MonthlyStats[]
  clientesNuevos: number
  clientesRecurrentes: number
  ultimaVenta: { monto: number; producto: string; hora: string; cliente: string; fecha: string } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAmount(s: string | null | undefined): number {
  return parseFloat(s ?? '0') || 0
}

function arBoundaries() {
  const AR_OFFSET = -3 * 60 * 60 * 1000
  const nowAR = Date.now() + AR_OFFSET
  const msPerDay = 86_400_000
  const todayStart = Math.floor(nowAR / msPerDay) * msPerDay - AR_OFFSET
  const arDow = new Date(nowAR).getUTCDay()
  const weekStart = todayStart - (arDow === 0 ? 6 : arDow - 1) * msPerDay
  const arDay = new Date(nowAR).getUTCDate()
  const monthStart = todayStart - (arDay - 1) * msPerDay
  return { todayStart, weekStart, monthStart }
}

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

export function humanizePaymentMethod(method: string, brand?: string): string {
  const map: Record<string, string> = {
    credit_card:   brand ? `Crédito ${brand}` : 'Tarjeta crédito',
    debit_card:    'Tarjeta débito',
    mercado_pago:  'Mercado Pago',
    paypal:        'PayPal',
    bank_transfer: 'Transferencia',
    cash:          'Efectivo',
    account_money: 'Dinero en cuenta',
  }
  return map[method] ?? method
}

export function paymentStatusLabel(s: TNOrder['payment_status']): string {
  const map: Record<string, string> = {
    paid:           'Pagado',
    authorized:     'Autorizado',
    pending:        'Pendiente',
    unpaid:         'Sin pagar',
    partially_paid: 'Pago parcial',
    refunded:       'Reembolsado',
    voided:         'Anulado',
  }
  return map[s] ?? s
}

export function paymentStatusClass(s: TNOrder['payment_status']): string {
  if (s === 'paid' || s === 'authorized')  return 'badge-green'
  if (s === 'pending' || s === 'unpaid')   return 'badge-amber'
  if (s === 'partially_paid')              return 'badge-indigo'
  return 'badge-muted'
}

export function formatARS(n: number) {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

// ── Cache ─────────────────────────────────────────────────────────────────────

const CACHE_KEY = 'rb_tn_metrics'
const CACHE_TTL = 20 * 60 * 1000

let memCache: { data: TNMetrics; ts: number } | null = null

function loadCache(): { data: TNMetrics; ts: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as { data: TNMetrics; ts: number }
    if (!p?.data || !p?.ts) return null
    return p
  } catch { return null }
}

function saveCache(entry: { data: TNMetrics; ts: number }) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(entry)) } catch { /* ignore */ }
}

export function clearTNCache() {
  memCache = null
  try { localStorage.removeItem(CACHE_KEY) } catch { /* ignore */ }
}

// ── TN credentials ────────────────────────────────────────────────────────────

export function getTNCredentials(): { storeId: string; token: string } {
  try {
    return {
      storeId: localStorage.getItem('tn_store_id') || '',
      token:   localStorage.getItem('tn_token')    || '',
    }
  } catch { return { storeId: '', token: '' } }
}

export function saveTNCredentials(storeId: string, token: string) {
  try {
    localStorage.setItem('tn_store_id', storeId)
    localStorage.setItem('tn_token', token)
    clearTNCache()
  } catch { /* ignore */ }
}

export function clearTNCredentials() {
  try {
    localStorage.removeItem('tn_store_id')
    localStorage.removeItem('tn_token')
    clearTNCache()
  } catch { /* ignore */ }
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

const TN_BASE = 'https://api.tiendanube.com/v1'
const USER_AGENT = 'RightBotinesStock (contacto@rightbotines.com)'

function tnHeaders(token: string): HeadersInit {
  return { Authentication: `bearer ${token}`, 'User-Agent': USER_AGENT }
}

async function handleResponse(res: Response): Promise<{ data: unknown; hasMore: boolean; total: number | null }> {
  if (!res.ok) {
    let detail = ''
    try { detail = JSON.stringify(await res.json()) } catch { /* ignore */ }
    if (res.status === 401) throw new Error(`TOKEN_INVALID: ${detail}`)
    if (res.status === 404) throw new Error(`STORE_INVALID: ${detail}`)
    throw new Error(`TN_API_${res.status}: ${detail}`)
  }
  const data = await res.json()
  const hasMore = (res.headers.get('Link') ?? '').includes('rel="next"')
  const totalHeader = res.headers.get('X-Total-Count')
  const total = totalHeader ? parseInt(totalHeader, 10) : null
  return { data, hasMore, total: Number.isFinite(total) ? total : null }
}

async function tnFetch(
  storeId: string,
  token: string,
  path: string,
  params: Record<string, string> = {},
): Promise<{ data: unknown; hasMore: boolean; total: number | null }> {
  const qs = new URLSearchParams(params).toString()

  // Intento directo (solo si tenemos credenciales locales)
  if (storeId && token) {
    try {
      const ctrl = new AbortController()
      const tid = setTimeout(() => ctrl.abort(), 12000)
      const res = await fetch(`${TN_BASE}/${storeId}/${path}?${qs}`, {
        headers: tnHeaders(token),
        signal: ctrl.signal,
      })
      clearTimeout(tid)
      return await handleResponse(res)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.startsWith('TOKEN_INVALID') || msg.startsWith('STORE_INVALID') || msg.startsWith('TN_API_')) throw err
      // CORS → usar proxy Vercel
    }
  }

  // Sin credenciales locales o CORS: el proxy Vercel usa las credenciales
  // del servidor si no le mandamos headers. Es más lento que pegarle
  // directo a la API de TN (hop extra + posible cold start), así que le
  // damos más margen que al intento directo.
  const ctrl2 = new AbortController()
  const tid2 = setTimeout(() => ctrl2.abort(), 25000)
  const proxyParams = new URLSearchParams({ path, ...params })
  const proxyRes = await fetch(`/api/tiendanube?${proxyParams}`, {
    signal: ctrl2.signal,
    headers: {
      ...(storeId ? { 'x-tn-store': storeId } : {}),
      ...(token ? { 'x-tn-token': token } : {}),
    },
  })
  clearTimeout(tid2)
  return await handleResponse(proxyRes)
}

// Trae todas las páginas de un recurso paginado. Si la API devuelve el total
// (header X-Total-Count, reenviado por el proxy), pide el resto de las
// páginas EN PARALELO en vez de una por una — cada pedido ya tarda varios
// segundos (más aún si pasa por el proxy sin credenciales locales), ver
// tnFetch), así que hacerlo secuencial multiplica la espera por página.
// Si no hay total (algún endpoint que no lo mande), cae al modo secuencial
// de siempre usando `hasMore`.
async function fetchAllPages<T>(
  storeId: string,
  token: string,
  path: string,
  extraParams: Record<string, string>,
  maxPages: number,
  onProgress?: (n: number) => void,
  perPage = 200,
): Promise<T[]> {
  const first = await tnFetch(storeId, token, path, { ...extraParams, per_page: String(perPage), page: '1' })
  const pages: T[][] = [first.data as T[]]
  onProgress?.(pages[0].length)

  if (first.total != null) {
    const totalPages = Math.min(Math.ceil(first.total / perPage), maxPages)
    if (totalPages > 1) {
      const rest = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, i) => i + 2).map(page =>
          tnFetch(storeId, token, path, { ...extraParams, per_page: String(perPage), page: String(page) })
        )
      )
      for (const r of rest) pages.push(r.data as T[])
      onProgress?.(pages.reduce((s, p) => s + p.length, 0))
    }
    return pages.flat()
  }

  // Fallback secuencial (sin X-Total-Count no sabemos cuántas páginas hay)
  let more = first.hasMore
  let page = 2
  const all = pages[0].slice()
  while (more && page <= maxPages) {
    const res = await tnFetch(storeId, token, path, { ...extraParams, per_page: String(perPage), page: String(page) })
    all.push(...(res.data as T[]))
    onProgress?.(all.length)
    more = res.hasMore
    page++
  }
  return all
}

// ── Orders ────────────────────────────────────────────────────────────────────

const ALL_ORDERS_KEY = 'rb_tn_orders'
const ALL_ORDERS_TTL = 20 * 60 * 1000

export async function fetchAllTNOrders(
  storeId: string,
  token: string,
  onProgress?: (n: number) => void,
  force = false,
): Promise<TNOrder[]> {
  if (!force) {
    try {
      const raw = localStorage.getItem(ALL_ORDERS_KEY)
      if (raw) {
        const p = JSON.parse(raw) as { data: TNOrder[]; ts: number }
        if (Date.now() - p.ts < ALL_ORDERS_TTL && Array.isArray(p.data)) return p.data
      }
    } catch { /* ignore */ }
  }

  const all = await fetchAllPages<TNOrder>(storeId, token, 'orders', {}, 25, onProgress)

  try { localStorage.setItem(ALL_ORDERS_KEY, JSON.stringify({ data: all, ts: Date.now() })) } catch { /* ignore */ }
  return all
}

// ── Products ──────────────────────────────────────────────────────────────────

export async function fetchTNRawProducts(storeId: string, token: string): Promise<TNRawProduct[]> {
  return fetchAllPages<TNRawProduct>(storeId, token, 'products', {}, 10)
}

export async function fetchTNProduct(storeId: string, token: string, productId: number): Promise<TNRawProduct> {
  const { data } = await tnFetch(storeId, token, `products/${productId}`)
  return data as TNRawProduct
}

export async function fetchTNVariants(storeId: string, token: string): Promise<TNVariantItem[]> {
  const raw = await fetchTNRawProducts(storeId, token)
  const items: TNVariantItem[] = []

  for (const prod of raw) {
    const baseName = prod.name.es ?? prod.name.en ?? Object.values(prod.name)[0] ?? String(prod.id)
    const img = prod.images[0]?.src ?? null

    for (const v of prod.variants) {
      const variantLabel = v.values
        .map(val => val.es ?? val.en ?? Object.values(val).find(x => x) ?? '')
        .filter(Boolean)
        .join(' / ')

      items.push({
        productId:   prod.id,
        variantId:   v.id,
        nombre:      baseName,
        sku:         v.sku ?? `${prod.id}-${v.id}`,
        stock:       v.stock ?? 0,
        precio:      parseAmount(v.price),
        variantLabel,
        imagen:      img,
        updatedAt:   v.updated_at,
      })
    }
  }

  return items
}

export async function updateTNVariant(
  storeId: string,
  token: string,
  productId: number,
  variantId: number,
  data: { price?: string; stock?: number; values?: { es: string }[] },
): Promise<void> {
  const path = `products/${productId}/variants/${variantId}`

  if (storeId && token) {
    try {
      const res = await fetch(`${TN_BASE}/${storeId}/${path}`, {
        method: 'PUT',
        headers: { ...tnHeaders(token) as Record<string, string>, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) return
    } catch {
      // CORS o red: probamos el proxy
    }
  }

  // Sin credenciales locales o falló el directo: el proxy Vercel usa las
  // credenciales del servidor si no le mandamos headers.
  const qs = new URLSearchParams({ path })
  const res = await fetch(`/api/tiendanube?${qs}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(storeId ? { 'x-tn-store': storeId } : {}),
      ...(token ? { 'x-tn-token': token } : {}),
    },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

export interface CreateTNProductInput {
  name: string
  categoryId: number | null
  precioVenta: number
  talles: { talleArg: number; talleUs: number; cantidad: number }[]
  fotos: string[]
}

export interface CreateTNProductResult {
  productId: number
  variants: { id: number; values: { es?: string; en?: string; [k: string]: string | undefined }[] }[]
}

export async function createTNProduct(
  storeId: string,
  token: string,
  input: CreateTNProductInput,
): Promise<CreateTNProductResult> {
  const body = JSON.stringify({
    name: { es: input.name },
    categories: input.categoryId ? [input.categoryId] : [],
    attributes: [{ es: 'Talle' }],
    variants: input.talles.map(t => ({
      price: String(input.precioVenta),
      stock: t.cantidad,
      values: [{ es: `${t.talleArg} arg / ${String(t.talleUs).replace('.', ',')} us` }],
    })),
    images: input.fotos.map(src => ({ src })),
  })

  if (storeId && token) {
    try {
      const res = await fetch(`${TN_BASE}/${storeId}/products`, {
        method: 'POST',
        headers: { ...tnHeaders(token) as Record<string, string>, 'Content-Type': 'application/json' },
        body,
      })
      if (res.ok) {
        const data = await res.json()
        return { productId: data.id, variants: data.variants ?? [] }
      }
    } catch {
      // CORS o red: probamos el proxy
    }
  }

  // Sin credenciales locales o falló el directo: el proxy Vercel usa las
  // credenciales del servidor si no le mandamos headers.
  const qs = new URLSearchParams({ path: 'products' })
  const res = await fetch(`/api/tiendanube?${qs}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(storeId ? { 'x-tn-store': storeId } : {}),
      ...(token ? { 'x-tn-token': token } : {}),
    },
    body,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return { productId: data.id, variants: data.variants ?? [] }
}

// ── Escritura de producto (nombre, categoría) ────────────────────────────────

export async function updateTNProduct(
  storeId: string,
  token: string,
  productId: number,
  data: { name?: string; categoryId?: number | null },
): Promise<void> {
  const path = `products/${productId}`
  const body = JSON.stringify({
    ...(data.name !== undefined ? { name: { es: data.name } } : {}),
    ...(data.categoryId !== undefined ? { categories: data.categoryId ? [data.categoryId] : [] } : {}),
  })

  if (storeId && token) {
    try {
      const res = await fetch(`${TN_BASE}/${storeId}/${path}`, {
        method: 'PUT',
        headers: { ...tnHeaders(token) as Record<string, string>, 'Content-Type': 'application/json' },
        body,
      })
      if (res.ok) return
    } catch {
      // CORS o red: probamos el proxy
    }
  }

  const qs = new URLSearchParams({ path })
  const res = await fetch(`/api/tiendanube?${qs}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(storeId ? { 'x-tn-store': storeId } : {}),
      ...(token ? { 'x-tn-token': token } : {}),
    },
    body,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

export async function deleteTNProduct(storeId: string, token: string, productId: number): Promise<void> {
  const path = `products/${productId}`

  if (storeId && token) {
    try {
      const res = await fetch(`${TN_BASE}/${storeId}/${path}`, { method: 'DELETE', headers: tnHeaders(token) })
      if (res.ok || res.status === 404) return
    } catch {
      // CORS o red: probamos el proxy
    }
  }

  const qs = new URLSearchParams({ path })
  const res = await fetch(`/api/tiendanube?${qs}`, {
    method: 'DELETE',
    headers: {
      ...(storeId ? { 'x-tn-store': storeId } : {}),
      ...(token ? { 'x-tn-token': token } : {}),
    },
  })
  if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`)
}

// ── Escritura de variantes (altas/bajas de talle) ────────────────────────────

export interface CreateTNVariantInput {
  price: number
  stock: number
  talleArg: number
  talleUs: number
}

export async function createTNVariant(
  storeId: string,
  token: string,
  productId: number,
  input: CreateTNVariantInput,
): Promise<{ variantId: number }> {
  const path = `products/${productId}/variants`
  const body = JSON.stringify({
    price: String(input.price),
    stock: input.stock,
    values: [{ es: `${input.talleArg} arg / ${String(input.talleUs).replace('.', ',')} us` }],
  })

  if (storeId && token) {
    try {
      const res = await fetch(`${TN_BASE}/${storeId}/${path}`, {
        method: 'POST',
        headers: { ...tnHeaders(token) as Record<string, string>, 'Content-Type': 'application/json' },
        body,
      })
      if (res.ok) {
        const data = await res.json()
        return { variantId: data.id }
      }
    } catch {
      // CORS o red: probamos el proxy
    }
  }

  const qs = new URLSearchParams({ path })
  const res = await fetch(`/api/tiendanube?${qs}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(storeId ? { 'x-tn-store': storeId } : {}),
      ...(token ? { 'x-tn-token': token } : {}),
    },
    body,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return { variantId: data.id }
}

export async function deleteTNVariant(
  storeId: string,
  token: string,
  productId: number,
  variantId: number,
): Promise<void> {
  const path = `products/${productId}/variants/${variantId}`

  if (storeId && token) {
    try {
      const res = await fetch(`${TN_BASE}/${storeId}/${path}`, { method: 'DELETE', headers: tnHeaders(token) })
      if (res.ok || res.status === 404) return
    } catch {
      // CORS o red: probamos el proxy
    }
  }

  const qs = new URLSearchParams({ path })
  const res = await fetch(`/api/tiendanube?${qs}`, {
    method: 'DELETE',
    headers: {
      ...(storeId ? { 'x-tn-store': storeId } : {}),
      ...(token ? { 'x-tn-token': token } : {}),
    },
  })
  if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`)
}

// ── Webhooks ──────────────────────────────────────────────────────────────────

export interface TNWebhook {
  id: number
  event: string
  url: string
}

export async function listTNWebhooks(storeId: string, token: string): Promise<TNWebhook[]> {
  const { data } = await tnFetch(storeId, token, 'webhooks', { per_page: '200' })
  return data as TNWebhook[]
}

export async function createTNWebhook(storeId: string, token: string, event: string, url: string): Promise<TNWebhook> {
  const path = 'webhooks'
  const body = JSON.stringify({ event, url })

  if (storeId && token) {
    try {
      const res = await fetch(`${TN_BASE}/${storeId}/${path}`, {
        method: 'POST',
        headers: { ...tnHeaders(token) as Record<string, string>, 'Content-Type': 'application/json' },
        body,
      })
      if (res.ok) return await res.json()
    } catch {
      // CORS o red: probamos el proxy
    }
  }

  const qs = new URLSearchParams({ path })
  const res = await fetch(`/api/tiendanube?${qs}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(storeId ? { 'x-tn-store': storeId } : {}),
      ...(token ? { 'x-tn-token': token } : {}),
    },
    body,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  return await res.json()
}

// ── Customers ─────────────────────────────────────────────────────────────────

export async function fetchTNCustomers(storeId: string, token: string): Promise<TNCustomer[]> {
  const all = await fetchAllPages<TNCustomer>(storeId, token, 'customers', {}, 10)
  return all.sort((a, b) => parseAmount(b.total_spent) - parseAmount(a.total_spent))
}

export async function fetchTNCustomerOrders(
  storeId: string,
  token: string,
  customerId: number,
): Promise<TNOrder[]> {
  const all = await fetchAllPages<TNOrder>(
    storeId, token, 'orders', { customer_id: String(customerId) }, 5, undefined, 50
  )
  return all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

// ── Coupons ───────────────────────────────────────────────────────────────────

export async function fetchTNCoupons(storeId: string, token: string): Promise<TNCoupon[]> {
  const all = await fetchAllPages<TNCoupon>(storeId, token, 'coupons', {}, 5)
  return all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function fetchTNCategories(storeId: string, token: string): Promise<TNCategory[]> {
  const { data } = await tnFetch(storeId, token, 'categories', { per_page: '200' })
  return data as TNCategory[]
}

// ── Metrics computation ───────────────────────────────────────────────────────

function computeMonthlyStats(orders: TNOrder[]): MonthlyStats[] {
  const months: Record<string, MonthlyStats> = {}

  // Inicializar últimos 12 meses
  for (let i = 11; i >= 0; i--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' })
    months[key] = { month: key, label, ventas: 0, facturado: 0 }
  }

  for (const order of orders) {
    const isPaid = order.payment_status === 'paid' || order.payment_status === 'authorized'
    if (!isPaid || order.status === 'cancelled') continue
    const d = new Date(order.created_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!months[key]) continue
    months[key].ventas++
    months[key].facturado += parseAmount(order.total)
  }

  return Object.values(months)
}

export function buildTNMetrics(allOrders: TNOrder[]): TNMetrics {
  const { todayStart, weekStart, monthStart } = arBoundaries()

  let totalFacturado = 0
  let ventasHoy      = 0
  let ventasSemana   = 0
  let ventasMes      = 0
  let ordenesPagadas = 0
  let ordenesPend    = 0
  let ordenesCan     = 0

  const productoMap:  Record<string, TopProducto>    = {}
  const compradorMap: Record<string, number>         = {}
  const metodoMap:    Record<string, number>         = {}
  const diaMap:       Record<string, { count: number; total: number }> = {}
  const horaMap:      Record<number, number>         = {}

  let ultimaVentaTs = -1
  let ultimaVenta: TNMetrics['ultimaVenta'] = null

  for (const order of allOrders) {
    const ts    = new Date(order.created_at).getTime()
    const total = parseAmount(order.total)

    if (order.status === 'cancelled') { ordenesCan++; continue }

    const isPaid = order.payment_status === 'paid' || order.payment_status === 'authorized'
    if (isPaid) ordenesPagadas++
    else { ordenesPend++; continue }

    totalFacturado += total
    if (ts >= todayStart) ventasHoy    += total
    if (ts >= weekStart)  ventasSemana += total
    if (ts >= monthStart) ventasMes    += total

    // Día
    const dl = dayLabel(order.created_at)
    if (!diaMap[dl]) diaMap[dl] = { count: 0, total: 0 }
    diaMap[dl].count++
    diaMap[dl].total += total

    // Hora AR
    const horaAR = new Date(
      new Date(order.created_at).toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' })
    ).getHours()
    horaMap[horaAR] = (horaMap[horaAR] ?? 0) + 1

    // Método pago
    const method = humanizePaymentMethod(
      order.payment_details?.method ?? 'other',
      order.payment_details?.credit_card_company,
    )
    metodoMap[method] = (metodoMap[method] ?? 0) + 1

    // Productos
    for (const p of order.products) {
      if (!productoMap[p.name]) productoMap[p.name] = { nombre: p.name, cantidad: 0, total: 0 }
      productoMap[p.name].cantidad += p.quantity
      productoMap[p.name].total   += parseAmount(p.price) * p.quantity
    }

    // Compradores
    const email = order.customer?.email ?? ''
    if (email) {
      compradorMap[email] = (compradorMap[email] ?? 0) + 1
    }

    // Última venta
    if (ts > ultimaVentaTs) {
      ultimaVentaTs = ts
      ultimaVenta = {
        monto:    total,
        producto: order.products[0]?.name ?? '',
        hora:     new Date(order.created_at).toLocaleTimeString('es-AR', {
          hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires',
        }),
        cliente:  order.customer?.name ?? '',
        fecha:    dayLabel(order.created_at),
      }
    }
  }

  const topProductos = Object.values(productoMap)
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 6)

  const totalMetodos = Object.values(metodoMap).reduce((s, v) => s + v, 0)
  const metodosPago = Object.entries(metodoMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({
      name, value,
      porcentaje: totalMetodos > 0 ? Math.round((value / totalMetodos) * 100) : 0,
    }))

  const ventasPorDia = Object.entries(diaMap)
    .map(([name, v]) => ({ name, value: v.count, facturado: v.total }))
    .reverse()

  const ventasPorHora = Array.from({ length: 24 }, (_, h) => ({
    name: `${String(h).padStart(2, '0')}:00`,
    value: horaMap[h] ?? 0,
  }))

  const clientesArr = Object.values(compradorMap)
  const clientesNuevos     = clientesArr.filter(n => n === 1).length
  const clientesRecurrentes = clientesArr.filter(n => n > 1).length

  const ticketPromedio = ordenesPagadas > 0 ? totalFacturado / ordenesPagadas : 0

  const ventasPorMes = computeMonthlyStats(allOrders)

  return {
    orders: allOrders,
    totalFacturado,
    ventasHoy,
    ventasSemana,
    ventasMes,
    totalOrdenes: allOrders.length,
    ordenesPagadas,
    ordenesPendientes: ordenesPend,
    ordenesCanceladas: ordenesCan,
    ticketPromedio,
    topProductos,
    metodosPago,
    ventasPorDia,
    ventasPorHora,
    ventasPorMes,
    clientesNuevos,
    clientesRecurrentes,
    ultimaVenta,
  }
}

export async function fetchTNMetrics(
  storeId: string,
  token: string,
  onProgress?: (n: number) => void,
  force = false,
): Promise<TNMetrics> {
  if (!force && memCache && Date.now() - memCache.ts < CACHE_TTL) return memCache.data

  if (!force && !memCache) {
    const p = loadCache()
    if (p && Date.now() - p.ts < CACHE_TTL) {
      memCache = p
      return p.data
    }
  }

  const allOrders = await fetchAllTNOrders(storeId, token, onProgress, force)
  const metrics = buildTNMetrics(allOrders)

  memCache = { data: metrics, ts: Date.now() }
  saveCache(memCache)
  return metrics
}
