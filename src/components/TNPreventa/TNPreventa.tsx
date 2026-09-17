import { useState, useEffect } from 'react'
import { RefreshCw, ChevronDown, ChevronUp, Search, MessageCircle, Mail } from 'lucide-react'
import { paymentStatusLabel, paymentStatusClass, formatARS } from '../../services/tiendanubeService'
import { fetchPreventaOrders, syncTNOrdenes, syncTNClientes, type PreventaOrder } from '../../services/tnOrdersSync'
import './TNPreventa.css'

// Ver el mismo comentario en ClientesLocales.tsx: WhatsApp necesita el
// número con código de país, si no ya lo trae.
const numeroWhatsApp = (s: string) => {
  const digitos = s.replace(/\D/g, '')
  return digitos.startsWith('54') ? digitos : `549${digitos}`
}

export function TNPreventa() {
  const [orders, setOrders]     = useState<PreventaOrder[]>([])
  const [loading, setLoading]   = useState(true)
  const [syncing, setSyncing]   = useState(false)
  const [error, setError]       = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [search, setSearch]     = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setOrders(await fetchPreventaOrders())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar las preventas')
    } finally {
      setLoading(false)
    }
  }

  const refresh = async () => {
    setSyncing(true)
    try {
      await Promise.all([syncTNOrdenes(), syncTNClientes()])
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) return (
    <div className="tn-loading">
      <div className="spinner" />
      <p>Cargando preventas...</p>
    </div>
  )
  if (error) return <div className="tn-error"><p>⚠ {error}</p><button className="btn btn-secondary btn-sm" onClick={() => load()}>Reintentar</button></div>

  const filtered = orders.filter(o => {
    if (!search) return true
    const q = search.toLowerCase()
    const name = o.customer?.name?.toLowerCase() ?? ''
    const email = o.customer?.email?.toLowerCase() ?? ''
    const num = String(o.number)
    return name.includes(q) || email.includes(q) || num.includes(q)
  })

  return (
    <div className="tn-preventa">
      <div className="page-header">
        <div>
          <h1 className="page-title">Preventas</h1>
          <p className="page-subtitle">{orders.length} venta{orders.length !== 1 ? 's' : ''} de la categoría Pre-venta</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={refresh} disabled={syncing}>
          <RefreshCw size={13} /> {syncing ? 'Sincronizando...' : 'Actualizar'}
        </button>
      </div>

      <div className="tn-search-row">
        <div className="tn-search-wrap">
          <Search size={14} />
          <input
            type="text"
            placeholder="Buscar por número, cliente o email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="tn-page-table-wrap">
        <table className="tn-page-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Total</th>
              <th>Estado</th>
              <th>Contacto</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(order => (
              <>
                <tr
                  key={order.id}
                  className={`tn-order-row${expanded === order.id ? ' expanded' : ''}`}
                >
                  <td className="tn-order-num" onClick={() => setExpanded(expanded === order.id ? null : order.id)}>#{order.number}</td>
                  <td className="tn-order-date" onClick={() => setExpanded(expanded === order.id ? null : order.id)}>
                    {new Date(order.created_at).toLocaleDateString('es-AR', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      timeZone: 'America/Argentina/Buenos_Aires',
                    })}
                  </td>
                  <td className="tn-order-client" onClick={() => setExpanded(expanded === order.id ? null : order.id)}>
                    <p>{order.customer?.name ?? '—'}</p>
                    <p className="tn-order-email">{order.customer?.email ?? ''}</p>
                  </td>
                  <td className="tn-order-total" onClick={() => setExpanded(expanded === order.id ? null : order.id)}>${formatARS(parseFloat(order.total))}</td>
                  <td onClick={() => setExpanded(expanded === order.id ? null : order.id)}>
                    <span className={`tn-status-badge ${paymentStatusClass(order.payment_status)}`}>
                      {paymentStatusLabel(order.payment_status)}
                    </span>
                  </td>
                  <td>
                    <div className="tn-preventa-contacto">
                      <a
                        className="tn-contacto-btn tn-contacto-btn--whatsapp"
                        href={order.clienteTelefono ? `https://wa.me/${numeroWhatsApp(order.clienteTelefono)}` : undefined}
                        target="_blank" rel="noreferrer"
                        aria-disabled={!order.clienteTelefono}
                        onClick={e => { e.stopPropagation(); if (!order.clienteTelefono) e.preventDefault() }}
                        title={order.clienteTelefono ? `WhatsApp: ${order.clienteTelefono}` : 'Sin teléfono cargado'}
                      >
                        <MessageCircle size={14} />
                      </a>
                      <a
                        className="tn-contacto-btn tn-contacto-btn--email"
                        href={order.customer?.email ? `mailto:${order.customer.email}?subject=${encodeURIComponent(`Right Botines — Pedido #${order.number} (preventa)`)}` : undefined}
                        aria-disabled={!order.customer?.email}
                        onClick={e => { e.stopPropagation(); if (!order.customer?.email) e.preventDefault() }}
                        title={order.customer?.email ? `Email: ${order.customer.email}` : 'Sin email cargado'}
                      >
                        <Mail size={14} />
                      </a>
                    </div>
                  </td>
                  <td className="tn-order-chevron" onClick={() => setExpanded(expanded === order.id ? null : order.id)}>
                    {expanded === order.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </td>
                </tr>
                {expanded === order.id && (
                  <tr key={`${order.id}-detail`} className="tn-order-detail-row">
                    <td colSpan={7}>
                      <div className="tn-order-detail">
                        <div className="tn-detail-products">
                          <p className="tn-detail-label">Productos</p>
                          {order.products.map((p, i) => (
                            <div key={i} className="tn-detail-product">
                              <span className="tn-detail-product-name">{p.name}</span>
                              <span className="tn-detail-product-info">
                                x{p.quantity} · ${formatARS(parseFloat(p.price) * p.quantity)}
                              </span>
                              {p.sku && <span className="tn-detail-sku">SKU: {p.sku}</span>}
                            </div>
                          ))}
                        </div>

                        <div className="tn-detail-totals">
                          <div className="tn-detail-row">
                            <span>Subtotal</span>
                            <span>${formatARS(parseFloat(order.subtotal))}</span>
                          </div>
                          {parseFloat(order.total_shipping) > 0 && (
                            <div className="tn-detail-row">
                              <span>Envío</span>
                              <span>${formatARS(parseFloat(order.total_shipping))}</span>
                            </div>
                          )}
                          {parseFloat(order.discount) > 0 && (
                            <div className="tn-detail-row discount">
                              <span>Descuento</span>
                              <span>-${formatARS(parseFloat(order.discount))}</span>
                            </div>
                          )}
                          <div className="tn-detail-row total">
                            <span>Total</span>
                            <span>${formatARS(parseFloat(order.total))}</span>
                          </div>
                        </div>

                        {order.shipping_address && (
                          <div className="tn-detail-shipping">
                            <p className="tn-detail-label">Envío a</p>
                            <p>{order.shipping_address.name}</p>
                            <p>{order.shipping_address.address}, {order.shipping_address.city}</p>
                            <p>{order.shipping_address.province} {order.shipping_address.zipcode}</p>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="tn-empty">
            {orders.length === 0
              ? 'No hay ventas de la categoría Pre-venta todavía.'
              : 'No hay preventas que coincidan con la búsqueda.'}
          </div>
        )}
      </div>
    </div>
  )
}
