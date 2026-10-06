import { useMemo } from 'react'
import type { Modelo } from '../../types'
import type { AnalisisProductos, ProductoAnalisis } from '../../services/trafico'

// Con menos visitas que esto, la conversión de un producto es puro ruido
// (1 compra sobre 3 vistas daría 33%), así que no se lo clasifica.
const MIN_VISTAS_PARA_CLASIFICAR = 10

function pct(n: number, total: number): string {
  if (!total) return '—'
  const v = (n / total) * 100
  return `${v < 10 ? v.toFixed(1) : Math.round(v)}%`
}

interface Props {
  analisis: AnalisisProductos
  modelos: Modelo[]
}

export function TraficoProductos({ analisis, modelos }: Props) {
  const modeloPorTnId = useMemo(() => {
    const m = new Map<number, Modelo>()
    for (const mo of modelos) if (mo.tn_product_id) m.set(Number(mo.tn_product_id), mo)
    return m
  }, [modelos])

  const producto = (id: number, nombreTn: string | null = null) => {
    const m = modeloPorTnId.get(Number(id))
    const foto = m?.modelo_fotos[0]?.foto_url
    const nombre = m ? `${m.marca} ${m.modelo}` : nombreTn ?? `Producto #${id}`
    return (
      <div className="tp-prod">
        {foto ? <img src={foto} alt="" className="trafico-producto-foto" /> : <div className="trafico-producto-foto ph">⚽</div>}
        <span className="tp-prod-nombre" title={nombre}>{nombre}</span>
      </div>
    )
  }

  const { productos, talles_agotados } = analisis

  // ── 1. Interés vs ventas ──
  // Promedio de la tienda: compras por cada sesión que vio un producto. Se
  // compara cada producto contra ese promedio en vez de contra un número fijo,
  // porque el nivel normal de conversión depende del rubro y del precio.
  const clasificables = productos.filter(p => p.vistas >= MIN_VISTAS_PARA_CLASIFICAR)
  const totalVistas = clasificables.reduce((s, p) => s + p.vistas, 0)
  const totalOrdenes = clasificables.reduce((s, p) => s + p.ordenes, 0)
  const convPromedio = totalVistas ? totalOrdenes / totalVistas : 0

  const muchoInteres = clasificables
    .filter(p => p.ordenes / p.vistas < convPromedio * 0.5 || p.ordenes === 0)
    .sort((a, b) => b.vistas - a.vistas)
    .slice(0, 10)

  const vistasOrdenadas = productos.map(p => p.vistas).sort((a, b) => a - b)
  const medianaVistas = vistasOrdenadas.length ? vistasOrdenadas[Math.floor(vistasOrdenadas.length / 2)] : 0
  const pocaExposicion = productos
    .filter(p => p.ordenes > 0 && p.vistas <= medianaVistas)
    .sort((a, b) => b.ordenes - a.ordenes || a.vistas - b.vistas)
    .slice(0, 10)

  // ── 5. Abandono por producto ──
  const conCarrito = productos
    .filter(p => p.carritos > 0)
    .sort((a, b) => b.carritos - a.carritos)
    .slice(0, 15)

  // Una compra puede venir de alguien que agregó al carrito en otro
  // dispositivo, así que órdenes > carritos es posible: se recorta a 0%.
  const abandono = (p: ProductoAnalisis) => p.carritos ? Math.max(0, 1 - p.ordenes / p.carritos) : 0

  return (
    <>
      {/* ── 1. Interés vs ventas ── */}
      <div className="tn-card">
        <h3 className="tn-card-title">Interés vs ventas</h3>
        <p className="analytics-chart-sub">
          Conversión promedio de la tienda: {pct(totalOrdenes, totalVistas)} de las visitas a un producto terminan en compra.
          Solo se clasifican productos con {MIN_VISTAS_PARA_CLASIFICAR}+ visitas.
        </p>

        <div className="analytics-row">
          <div>
            <h4 className="tp-subtitulo">Mucho interés, pocas ventas</h4>
            <p className="tp-ayuda">Se miran mucho y se compran poco: revisá precio, fotos, descripción o talles disponibles.</p>
            {muchoInteres.length === 0 ? (
              <p className="tn-no-data">Todavía no hay productos con suficientes visitas para clasificar.</p>
            ) : (
              <table className="tp-tabla">
                <thead><tr><th>Producto</th><th>Visitas</th><th>Compras</th><th>Conv.</th></tr></thead>
                <tbody>
                  {muchoInteres.map(p => (
                    <tr key={p.tn_product_id}>
                      <td>{producto(p.tn_product_id, p.nombre)}</td>
                      <td>{p.vistas}</td>
                      <td>{p.ordenes}</td>
                      <td className="tp-malo">{pct(p.ordenes, p.vistas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div>
            <h4 className="tp-subtitulo">Venden con poca exposición</h4>
            <p className="tp-ayuda">Se compran aunque casi no se ven: candidatos para la home, destacados o publicidad.</p>
            {pocaExposicion.length === 0 ? (
              <p className="tn-no-data">Todavía no hay datos suficientes.</p>
            ) : (
              <table className="tp-tabla">
                <thead><tr><th>Producto</th><th>Visitas</th><th>Compras</th><th>Conv.</th></tr></thead>
                <tbody>
                  {pocaExposicion.map(p => (
                    <tr key={p.tn_product_id}>
                      <td>{producto(p.tn_product_id, p.nombre)}</td>
                      <td>{p.vistas}</td>
                      <td>{p.ordenes}</td>
                      <td className="tp-bueno">{pct(p.ordenes, p.vistas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ── 3. Talles agotados que se buscan ── */}
      <div className="tn-card">
        <h3 className="tn-card-title">Talles agotados que la gente busca</h3>
        <p className="analytics-chart-sub">
          Visitas que tocaron un talle sin stock: cada fila es una venta que se pudo perder. Ordenado por demanda, para saber qué reponer primero.
        </p>
        {talles_agotados.length === 0 ? (
          <p className="tn-no-data">Nadie buscó talles agotados en este período (o el registro de talles es nuevo y todavía no juntó datos).</p>
        ) : (
          <table className="tp-tabla">
            <thead><tr><th>Producto</th><th>Talle</th><th>Lo buscaron</th><th>Stock hoy</th></tr></thead>
            <tbody>
              {talles_agotados.map(t => (
                <tr key={`${t.tn_product_id}-${t.talle}`}>
                  <td>{producto(t.tn_product_id)}</td>
                  <td>{t.talle}</td>
                  <td>{t.sesiones} {t.sesiones === 1 ? 'visita' : 'visitas'}</td>
                  <td>
                    {t.stock_actual == null
                      ? <span className="tp-neutro">—</span>
                      : t.stock_actual > 0
                        ? <span className="tp-bueno">Repuesto ({t.stock_actual})</span>
                        : <span className="tp-malo">Sin stock</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── 5. Abandono por producto ── */}
      <div className="tn-card">
        <h3 className="tn-card-title">Abandono de carrito por producto</h3>
        <p className="analytics-chart-sub">
          De las visitas que agregaron el producto al carrito, cuántas siguieron al checkout y cuántas compras hubo.
          Un abandono alto en un producto puntual suele ser precio final, envío o falta de medio de pago.
        </p>
        {conCarrito.length === 0 ? (
          <p className="tn-no-data">Nadie agregó productos al carrito en este período.</p>
        ) : (
          <table className="tp-tabla">
            <thead><tr><th>Producto</th><th>Al carrito</th><th>Al checkout</th><th>Compras</th><th>Abandono</th></tr></thead>
            <tbody>
              {conCarrito.map(p => {
                const a = abandono(p)
                return (
                  <tr key={p.tn_product_id}>
                    <td>{producto(p.tn_product_id, p.nombre)}</td>
                    <td>{p.carritos}</td>
                    <td>{p.checkouts}</td>
                    <td>{p.ordenes}</td>
                    <td className={a >= 0.7 ? 'tp-malo' : a >= 0.4 ? 'tp-medio' : 'tp-bueno'}>{Math.round(a * 100)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
