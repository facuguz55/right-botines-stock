// Pedidos de la tienda web (TiendaNube) dentro del CRM: estado del envío,
// seguimiento, fecha estimada y la respuesta para el cliente. Lo usan el
// webhook de WhatsApp (respuesta sugerida automática cuando preguntan "¿cuándo
// me llega?") y el panel de pedidos del chat — sin dependencias de navegador.
//
// Todo sale de datos reales de la orden: si un dato no está (no hay código de
// seguimiento todavía, no hay fecha estimada), la respuesta simplemente no lo
// menciona. Nunca se inventa un estado ni una fecha.

import { normalizar } from './crmBusqueda'

export interface PedidoFulfillment {
  status?: string | null
  tracking_info?: { code?: string | null; url?: string | null } | null
  shipping?: {
    type?: string | null
    carrier?: { name?: string | null } | null
    min_delivery_date?: string | null
    max_delivery_date?: string | null
  } | null
}

// Subconjunto de la orden de la API de TiendaNube (GET /orders/{id}). Los
// campos viejos (shipping_tracking_number, shipping_min_days) y los nuevos
// (fulfillments[]) conviven según la tienda/transportista: se leen los dos.
export interface PedidoTN {
  id: number
  number: number
  status: string
  payment_status: string
  shipping_status?: string | null
  created_at: string
  paid_at?: string | null
  shipped_at?: string | null
  total: string | number
  products: { name: string; quantity: number; price?: string | number }[]
  shipping_option?: string | { name?: string | null } | null
  shipping_pickup_type?: string | null
  shipping_tracking_number?: string | null
  shipping_tracking_url?: string | null
  shipping_min_days?: number | null
  shipping_max_days?: number | null
  fulfillments?: PedidoFulfillment[] | null
}

export type EstadoPedido =
  | 'cancelado' | 'pago_pendiente' | 'en_preparacion' | 'preparado'
  | 'enviado' | 'listo_retirar' | 'entregado'

export const ESTADO_PEDIDO_LABEL: Record<EstadoPedido, string> = {
  cancelado: 'Cancelado',
  pago_pendiente: 'Pago pendiente',
  en_preparacion: 'En preparación',
  preparado: 'Listo para despachar',
  enviado: 'Enviado',
  listo_retirar: 'Listo para retirar',
  entregado: 'Entregado',
}

export interface ResumenEnvio {
  estado: EstadoPedido
  transportista: string | null
  codigo: string | null
  url: string | null
  entregaMin: Date | null
  entregaMax: Date | null
  esRetiro: boolean
}

// Solo dígitos. Para comparar teléfonos se usan los últimos 7: tolera el
// "+54 9", el 0 de la característica y el "15" viejo en el medio, que van
// antes de esos dígitos ("0342 15 463-3285" y "5493424633285" → "4633285").
export function digitosTelefono(tel: string | null | undefined): string {
  return (tel ?? '').replace(/\D/g, '')
}

export function sufijoTelefono(tel: string | null | undefined, n = 7): string | null {
  const d = digitosTelefono(tel)
  return d.length >= n ? d.slice(-n) : null
}

function sumarDiasHabiles(desde: Date, dias: number): Date {
  const d = new Date(desde)
  let sumados = 0
  while (sumados < dias) {
    d.setDate(d.getDate() + 1)
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) sumados++
  }
  return d
}

function fecha(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

export function resumenEnvio(o: PedidoTN): ResumenEnvio {
  const fulfillments = o.fulfillments ?? []
  // El último fulfillment es el más avanzado/actual si hubo más de uno.
  const f = fulfillments[fulfillments.length - 1] ?? null
  const fStatus = (f?.status ?? '').toUpperCase()
  const ship = (o.shipping_status ?? '').toLowerCase()
  const esRetiro = o.shipping_pickup_type === 'pickup' || f?.shipping?.type === 'pickup' || fStatus === 'READY_FOR_PICKUP'

  let estado: EstadoPedido
  if (o.status === 'cancelled') estado = 'cancelado'
  else if (fStatus === 'DELIVERED' || ship === 'delivered') estado = 'entregado'
  else if (fStatus === 'READY_FOR_PICKUP') estado = 'listo_retirar'
  else if (fStatus === 'DISPATCHED' || ship === 'shipped' || ship === 'partially_fulfilled') estado = 'enviado'
  else if (o.payment_status === 'pending' || o.payment_status === 'unpaid' || o.payment_status === 'voided') estado = 'pago_pendiente'
  else if (fStatus === 'PACKED' || ship === 'unshipped') estado = esRetiro ? 'listo_retirar' : 'preparado'
  else estado = 'en_preparacion'

  const opcion = typeof o.shipping_option === 'string' ? o.shipping_option : o.shipping_option?.name ?? null
  const transportista = f?.shipping?.carrier?.name || opcion || null

  let entregaMin = fecha(f?.shipping?.min_delivery_date)
  let entregaMax = fecha(f?.shipping?.max_delivery_date)
  if (!entregaMin && !entregaMax && (o.shipping_min_days || o.shipping_max_days)) {
    const base = fecha(o.paid_at) ?? fecha(o.created_at)
    if (base) {
      if (o.shipping_min_days) entregaMin = sumarDiasHabiles(base, o.shipping_min_days)
      if (o.shipping_max_days) entregaMax = sumarDiasHabiles(base, o.shipping_max_days)
    }
  }

  return {
    estado,
    transportista,
    codigo: f?.tracking_info?.code || o.shipping_tracking_number || null,
    url: f?.tracking_info?.url || o.shipping_tracking_url || null,
    entregaMin,
    entregaMax,
    esRetiro,
  }
}

export function formatoFechaCorta(d: Date): string {
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })
}

// "Te llegaría entre el 3/10 y el 7/10" — o nada si no hay fecha o si la
// fecha ya pasó (decirle al cliente "llega el 20/9" el 28/9 no ayuda).
export function textoEntrega(r: ResumenEnvio, ahora: Date = new Date()): string | null {
  const max = r.entregaMax ?? r.entregaMin
  if (!max || max.getTime() < ahora.getTime() - 86_400_000) return null
  const min = r.entregaMin && r.entregaMin.getTime() > ahora.getTime() ? r.entregaMin : null
  const dMax = formatoFechaCorta(max)
  if (!min || formatoFechaCorta(min) === dMax) return `Te llegaría el ${dMax}`
  return `Te llegaría entre el ${formatoFechaCorta(min)} y el ${dMax}`
}

export function resumenProductos(o: Pick<PedidoTN, 'products'>): string {
  return (o.products ?? []).map(p => `${p.name}${p.quantity > 1 ? ` x${p.quantity}` : ''}`).join(', ')
}

export function diasDesdeCompra(o: Pick<PedidoTN, 'created_at'>, ahora: Date = new Date()): number {
  return Math.floor((ahora.getTime() - new Date(o.created_at).getTime()) / 86_400_000)
}

// Respuesta lista para mandarle al cliente con el estado real del pedido.
// Estilo WhatsApp de persona: sin emojis ni signos de apertura (ver
// humanizar() en crmTexto.ts).
export function respuestaEstadoPedido(o: PedidoTN, ahora: Date = new Date()): string {
  const r = resumenEnvio(o)
  const cual = `Tu pedido #${o.number}${o.products?.length ? ` (${resumenProductos(o)})` : ''}`
  const entrega = textoEntrega(r, ahora)
  switch (r.estado) {
    case 'cancelado':
      return `${cual} figura cancelado. Cualquier duda decime y lo vemos`
    case 'pago_pendiente':
      return `${cual} todavía figura con el pago pendiente. Apenas se acredite lo preparamos y te aviso`
    case 'en_preparacion':
      return r.esRetiro
        ? `Hola! ${cual} ya está confirmado, lo estamos preparando. Te aviso cuando esté listo para retirar`
        : `Hola! ${cual} ya está confirmado, lo estamos preparando.${entrega ? ` ${entrega}` : ''}`
    case 'preparado':
      return `Hola! ${cual} ya está listo, sale en los próximos días.${entrega ? ` ${entrega}` : ''}`
    case 'listo_retirar':
      return `Hola! ${cual} ya está listo para retirar`
    case 'enviado': {
      const partes = [`Hola! ${cual} ya salió${r.transportista ? ` por ${r.transportista}` : ''}.`]
      if (r.codigo) partes.push(`Código de seguimiento: ${r.codigo}`)
      if (r.url) partes.push(`Lo podés seguir acá: ${r.url}`)
      if (entrega) partes.push(entrega)
      return partes.join('\n')
    }
    case 'entregado':
      return `${cual} figura como entregado. Llegó todo bien?`
  }
}

// ── Detección en el mensaje ──

// Palabras que sugieren una consulta por un pedido ya hecho. Solo sirve para
// adelantar la búsqueda del pedido; la decisión de responder con el estado la
// toma la IA (intención consulta_envio) o, si la IA no está, las palabras
// fuertes de abajo.
const PISTAS_PEDIDO = /\b(pedido|pedi|orden|compra|compre|envio|enviaron|enviado|despach\w*|seguimiento|tracking|codigo|llega|llegan|llego|llegaria|llegara|correo|andreani|oca|paquete|entrega|garantia|reclamo)\b/
const PISTAS_PEDIDO_FUERTES = /\b(seguimiento|tracking|cuando (me )?(llega|llegan|sale|salen|viene|vienen)|(mi|el) pedido|(mi|la) orden|ya (lo|los)? ?(enviaron|despacharon)|numero de envio)\b/

export function mencionaPedido(texto: string): boolean {
  return PISTAS_PEDIDO.test(normalizar(texto)) || extraerNumeroPedido(texto) !== null
}

export function esConsultaEnvioSegura(texto: string): boolean {
  return PISTAS_PEDIDO_FUERTES.test(normalizar(texto))
}

// "#1234", "pedido 1234", "orden nro 1234", "compra n° 1234".
export function extraerNumeroPedido(texto: string): number | null {
  const t = normalizar(texto)
  const m = t.match(/#\s*(\d{3,7})\b/) ?? t.match(/\b(?:pedido|orden|compra)\s*(?:n|nro|numero|num)?\.?\s*#?\s*(\d{3,7})\b/)
  return m ? Number(m[1]) : null
}
