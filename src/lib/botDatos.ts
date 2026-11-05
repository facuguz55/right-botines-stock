// Los datos del negocio que el bot de sugerencias ve en cada mensaje, como los
// ve Cami al atender: el stock real por talle con los precios de tarjeta y
// transferencia, los pedidos web de ESTE cliente y sus compras en el local.
// Nada interno: ni costos, ni ganancias, ni proveedores, ni cantidades exactas
// de pares (a lo sumo "último par"), ni datos de otros clientes.
//
// Lo usan el webhook (producción) y la prueba del bot (scripts/eval-bot), con
// su propia forma de leer la base (`leer`), así la prueba mide lo mismo.
import { ESTADO_PEDIDO_LABEL, formatoFechaCorta, resumenEnvio, resumenProductos, sufijoTelefono, type PedidoTN } from './crmPedidos'
import { TIPO_LABEL, tipoDeCategoria } from './crmBusqueda'

export interface ModeloCatalogo {
  marca: string
  modelo: string
  categoria: string | null
  gama: string | null
  precio_venta: number | null
  precio_promocional: number | null
  precio_efectivo: number | null
  modelo_talles: { talle_arg: number; cantidad: number }[]
}

export interface PedidoWeb {
  number: number
  tn_created_at: string
  status: string
  payment_status: string
  shipping_status: string | null
  total: string | number
  products: { name: string; quantity: number }[] | null
}

export interface CompraLocal {
  fecha: string
  talle_arg: number | null
  modelos: { marca: string; modelo: string } | null
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

// "Mixto-" es un prefijo de la marca en la base: se muestra como "Mixto".
function nombreModelo(m: { marca: string; modelo: string }): string {
  return `${m.marca.replace(/-+\s*$/, '').trim()} ${m.modelo}`.replace(/\s+/g, ' ').trim()
}

// Una línea por modelo con stock: tipo, gama, precios y talles disponibles.
// Precio con tarjeta = promocional de TiendaNube (o el de lista si no hay);
// transferencia/efectivo = precio_efectivo (ver src/utils/precios.ts).
export function formatearCatalogo(modelos: ModeloCatalogo[]): string {
  const lineas: { orden: string; texto: string }[] = []
  for (const m of modelos) {
    const talles = (m.modelo_talles ?? [])
      .filter(t => Number(t.cantidad) > 0)
      .sort((a, b) => Number(a.talle_arg) - Number(b.talle_arg))
    if (talles.length === 0) continue
    const tipo = tipoDeCategoria(m.categoria)
    const tarjeta = m.precio_promocional ?? m.precio_venta
    const transf = m.precio_efectivo ?? tarjeta
    const precios = tarjeta
      ? transf && transf < tarjeta
        ? `transferencia ${pesos(transf)}, tarjeta ${pesos(tarjeta)}`
        : `${pesos(tarjeta)}`
      : 'precio a consultar'
    const tallesTxt = talles.map(t => `${String(t.talle_arg).replace('.', ',')}${Number(t.cantidad) === 1 ? ' (último par)' : ''}`).join(', ')
    const partes = [nombreModelo(m), tipo ? TIPO_LABEL[tipo] : m.categoria, m.gama ? `gama ${m.gama.toLowerCase()}` : null, precios, `talles ${tallesTxt}`]
    lineas.push({ orden: `${tipo ?? 'z'}|${m.gama ?? ''}|${nombreModelo(m).toLowerCase()}`, texto: partes.filter(Boolean).join(' | ') })
  }
  return lineas.sort((a, b) => a.orden.localeCompare(b.orden)).map(l => `- ${l.texto}`).join('\n')
}

export function formatearPedidos(pedidos: PedidoWeb[]): string {
  return pedidos.map(p => {
    const comoTN: PedidoTN = {
      id: 0, number: p.number, status: p.status, payment_status: p.payment_status,
      shipping_status: p.shipping_status, created_at: p.tn_created_at, total: p.total,
      products: p.products ?? [],
    }
    const estado = ESTADO_PEDIDO_LABEL[resumenEnvio(comoTN).estado]
    return `- Pedido #${p.number} del ${formatoFechaCorta(new Date(p.tn_created_at))}: ${resumenProductos(comoTN) || 'sin detalle'} | estado: ${estado} | total ${pesos(Number(p.total))}`
  }).join('\n')
}

export function formatearComprasLocal(compras: CompraLocal[]): string {
  return compras
    .filter(c => c.modelos)
    .map(c => `- ${formatoFechaCorta(new Date(c.fecha))}: ${nombreModelo(c.modelos!)}${c.talle_arg ? ` talle ${c.talle_arg}` : ''}`)
    .join('\n')
}

// Dos partes: el stock (igual para todos los chats: va en la parte fija del
// pedido a la IA, que queda en caché) y lo de ESTE cliente.
export interface DatosNegocio { stock: string; cliente: string }

export function armarDatosNegocio(d: { catalogo: string; pedidos: string; compras: string }): DatosNegocio {
  return {
    stock: `Stock disponible ahora (lo que no figura acá, hoy no lo tenemos en ese talle):\n${d.catalogo || '(no se pudo leer el stock: no afirmes nada de stock)'}`,
    cliente: [
      `Pedidos de este cliente en la web (los más recientes):\n${d.pedidos || '(no encontramos pedidos web con su teléfono)'}`,
      `Compras de este cliente en el local:\n${d.compras || '(no hay compras registradas en el local)'}`,
    ].join('\n\n'),
  }
}

// Lee de la base (PostgREST) todo lo de arriba. `leer(path)` devuelve el JSON
// de `/rest/v1/<path>`. `hasta` (ISO) limita los pedidos y compras a los
// anteriores a ese momento (la prueba lo usa para no ver el futuro).
// Cada parte falla por separado: si una no se puede leer, va vacía.
export async function cargarDatosNegocio(
  leer: (path: string) => Promise<unknown>,
  cliente: { telefono: string | null; crmClienteId: string | null },
  opciones: { hasta?: string; catalogo?: ModeloCatalogo[] } = {},
): Promise<DatosNegocio> {
  const hasta = opciones.hasta ? `&tn_created_at=lte.${encodeURIComponent(opciones.hasta)}` : ''
  const hastaLocal = opciones.hasta ? `&fecha=lte.${encodeURIComponent(opciones.hasta)}` : ''

  const catalogoP = opciones.catalogo
    ? Promise.resolve(opciones.catalogo)
    : (leer('modelos?select=marca,modelo,categoria,gama,precio_venta,precio_promocional,precio_efectivo,modelo_talles(talle_arg,cantidad)') as Promise<ModeloCatalogo[]>)

  const pedidosP = (async () => {
    const suf = sufijoTelefono(cliente.telefono)
    if (!suf) return [] as PedidoWeb[]
    const clientes = await leer(`tn_clientes?telefono_digitos=like.*${suf}&select=tn_customer_id&limit=5`) as { tn_customer_id: number }[]
    const ids = clientes.map(c => c.tn_customer_id)
    const filtro = ids.length
      ? `or=(telefono_digitos.like.*${suf},customer_tn_id.in.(${ids.join(',')}))`
      : `telefono_digitos=like.*${suf}`
    return await leer(`tn_ordenes?${filtro}${hasta}&select=number,tn_created_at,status,payment_status,shipping_status,total,products&order=tn_created_at.desc&limit=3`) as PedidoWeb[]
  })()

  const comprasP = (async () => {
    if (!cliente.crmClienteId) return [] as CompraLocal[]
    const [c] = await leer(`crm_clientes?id=eq.${cliente.crmClienteId}&select=cliente_local_id&limit=1`) as { cliente_local_id: string | null }[]
    if (!c?.cliente_local_id) return [] as CompraLocal[]
    return await leer(`ventas?cliente_id=eq.${c.cliente_local_id}${hastaLocal}&select=fecha,talle_arg,modelos(marca,modelo)&order=fecha.desc&limit=5`) as CompraLocal[]
  })()

  const [catalogo, pedidos, compras] = await Promise.allSettled([catalogoP, pedidosP, comprasP])
  return armarDatosNegocio({
    catalogo: catalogo.status === 'fulfilled' ? formatearCatalogo(catalogo.value) : '',
    pedidos: pedidos.status === 'fulfilled' ? formatearPedidos(pedidos.value) : '',
    compras: compras.status === 'fulfilled' ? formatearComprasLocal(compras.value) : '',
  })
}
