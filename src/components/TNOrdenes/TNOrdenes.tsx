import { useState, useEffect } from 'react'
import { RefreshCw, ChevronDown, ChevronUp, Search } from 'lucide-react'
import { fetchAllTNOrders, paymentStatusLabel, paymentStatusClass, humanizePaymentMethod, formatARS, getTNCredentials, type TNOrder } from '../../services/tiendanubeService'
import { TNSetup } from '../TNSetup/TNSetup'
import './TNOrdenes.css'

type StatusFilter = 'all' | 'paid' | 'pending' | 'cancelled'

export function TNOrdenes() {
  const creds = getTNCredentials()
  const isConfigured = !!creds.storeId && !!creds.token

  const [orders, setOrders]       = useState<TNOrder[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [expanded, setExpanded]   = useState<number | null>(null)
  const [statusFilter, setStatus] = useState<StatusFilter>('all')
  const [search, setSearch]       = useState('')
  const [progress, setProgress]   = useState(0)

  const load = async (force = false) => {
    const { storeId, token } = getTNCredentials()
    if (!storeId || !token) return
    setLoading(true)
    setError('')
    setProgress(0)
    try {
      const data = await fetchAllTNOrders(storeId, token, n => setProgress(n), force)
      setOrders([...data].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar órdenes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (isConfigured) load() }, [isConfigured])

  if (!isConfigured) return <TNSetup onConfigured={() => load()} />
  if (loading) return (
    <div className="tn-loading">
      <div className="spinner" />
      <p>Cargando órdenes{progress > 0 ? ` — ${progress}` : '...'}
      </p>
    </div>
  )
  if (error) return <div className="tn-error"><p>⚠ {error}</p><button className="btn btn-secondary btn-sm" onClick={() => load(true)}>Reintentar</button></div>

  const filtered = orders.filter(o => {
    if (statusFilter === 'paid' && o.payment_status !== 'paid' && o.payment_status !== 'authorized') return false
    if (statusFilter === 'pending' && o.payment_status !== 'pending' && o.payment_status !== 'unpaid') return false
    if (statusFilter === 'cancelled' && o.status !== 'cancelled') return false
    if (search) {
      const q = search.toLowerCase()
      const name = o.customer?.name?.toLowerCase() ?? ''
      const email = o.customer?.email?.toLowerCase() ?? ''
      const num = String(o.number)
      if (!name.includes(q) && !email.includes(q) && !num.includes(q)) return false
    }
    return true
  })

  const tabs: { key: StatusFilter; label: string }[] = [
    { key: 'all',       label: `Todas (${orders.length})` },
    { key: 'paid',      label: `Pagadas (${orders.filter(o => o.payment_status === 'paid' || o.payment_status === 'authorized').length})` },
    { key: 'pending',   label: `Pendientes (${orders.filter(o => o.payment_status === 'pending' || o.payment_status === 'unpaid').length})` },
    { key: 'cancelled', label: `Canceladas (${orders.filter(o => o.status === 'cancelled').length})` },
  ]

  return (
    <div className="tn-ordenes">
      <div className="page-header">
        <div>
          <h1 className="page-title">Órdenes</h1>
          <p className="page-subtitle">{orders.length} órdenes en total</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => load(true)}>
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {/* Tabs */}
      <div className="tn-tabs">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`tn-tab${statusFilter === t.key ? ' active' : ''}`}
            onClick={() => setStatus(t.key)}
          >{t.label}</button>
        ))}
      </div>

      {/* Search */}
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

      {/* Table */}
      <div className="tn-table-wrap">
        <table className="tn-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Total</th>
              <th>Pago</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(order => (
              <>
                <tr
                  key={order.id}
                  className={`tn-order-row${expanded === order.id ? ' expanded' : ''}`}
                  onClick={() => setExpanded(expanded === order.id ? null : order.id)}
                >
                  <td className="tn-order-num">#{order.number}</td>
                  <td className="tn-order-date">
                    {new Date(order.created_at).toLocaleDateString('es-AR', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      timeZone: 'America/Argentina/Buenos_Aires',
                    })}
                  </td>
                  <td className="tn-order-client">
                    <p>{order.customer?.name ?? '—'}</p>
                    <p className="tn-order-email">{order.customer?.email ?? ''}</p>
                  </td>
                  <td className="tn-order-total">${formatARS(parseFloat(order.total))}</td>
                  <td>
                    <span className="tn-method-badge">
                      {humanizePaymentMethod(order.payment_details?.method ?? 'other', order.payment_details?.credit_card_company)}
                    </span>
                  </td>
                  <td>
                    <span className={`tn-status-badge ${paymentStatusClass(order.payment_status)}`}>
                      {paymentStatusLabel(order.payment_status)}
                    </span>
                  </td>
                  <td className="tn-order-chevron">
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

                        {order.note && (
                          <div className="tn-detail-note">
                            <p className="tn-detail-label">Nota</p>
                            <p>{order.note}</p>
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
          <div className="tn-empty">No hay órdenes que coincidan con el filtro.</div>
        )}
      </div>
    </div>
  )
}
