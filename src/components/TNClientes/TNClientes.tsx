import { useState, useEffect } from 'react'
import { RefreshCw, ChevronDown, ChevronUp, Search } from 'lucide-react'
import {
  fetchTNCustomers, fetchTNCustomerOrders, getTNCredentials,
  formatARS, paymentStatusLabel, paymentStatusClass,
  type TNCustomer, type TNOrder,
} from '../../services/tiendanubeService'
import './TNClientes.css'

export function TNClientes() {
  const [customers, setCustomers]   = useState<TNCustomer[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [expanded, setExpanded]     = useState<number | null>(null)
  const [expandedOrders, setExpandedOrders] = useState<TNOrder[]>([])
  const [loadingOrders, setLoadingOrders]   = useState(false)
  const [search, setSearch]         = useState('')

  const load = async () => {
    const { storeId, token } = getTNCredentials()
    setLoading(true)
    setError('')
    try {
      const data = await fetchTNCustomers(storeId, token)
      setCustomers(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar clientes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const toggleCustomer = async (id: number) => {
    if (expanded === id) { setExpanded(null); setExpandedOrders([]); return }
    setExpanded(id)
    setLoadingOrders(true)
    const { storeId, token } = getTNCredentials()
    try {
      const orders = await fetchTNCustomerOrders(storeId, token, id)
      setExpandedOrders(orders)
    } catch { setExpandedOrders([]) }
    setLoadingOrders(false)
  }

  if (loading) return <div className="tn-loading"><div className="spinner" /><p>Cargando clientes...</p></div>
  if (error) return <div className="tn-error"><p>⚠ {error}</p><button className="btn btn-secondary btn-sm" onClick={load}>Reintentar</button></div>

  const filtered = customers.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
  })

  return (
    <div className="tn-clientes">
      <div className="page-header">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-subtitle">{customers.length} clientes registrados</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load}>
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {/* Top stat */}
      <div className="tn-clientes-stats">
        <div className="tn-card">
          <p className="tn-metric-label">Mayor comprador</p>
          {customers[0] && (
            <>
              <p className="tn-metric-value">{customers[0].name}</p>
              <p className="tn-metric-sub">${formatARS(parseFloat(customers[0].total_spent))} · {customers[0].orders_count} órdenes</p>
            </>
          )}
        </div>
        <div className="tn-card">
          <p className="tn-metric-label">Total clientes</p>
          <p className="tn-metric-value">{customers.length}</p>
        </div>
        <div className="tn-card">
          <p className="tn-metric-label">Recurrentes</p>
          <p className="tn-metric-value">{customers.filter(c => c.orders_count > 1).length}</p>
          <p className="tn-metric-sub">con más de 1 compra</p>
        </div>
        <div className="tn-card">
          <p className="tn-metric-label">Gasto promedio</p>
          <p className="tn-metric-value accent">
            ${customers.length > 0 ? formatARS(customers.reduce((s, c) => s + parseFloat(c.total_spent), 0) / customers.length) : '0'}
          </p>
        </div>
      </div>

      <div className="tn-search-row">
        <div className="tn-search-wrap">
          <Search size={14} />
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="tn-table-wrap">
        <table className="tn-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Email</th>
              <th>Órdenes</th>
              <th>Total gastado</th>
              <th>Miembro desde</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <>
                <tr
                  key={c.id}
                  className={`tn-order-row${expanded === c.id ? ' expanded' : ''}`}
                  onClick={() => toggleCustomer(c.id)}
                >
                  <td className="tn-client-name">
                    <div className="tn-client-avatar">{c.name.charAt(0).toUpperCase()}</div>
                    {c.name}
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '.8rem' }}>{c.email}</td>
                  <td>
                    <span className={`tn-order-count${c.orders_count > 1 ? ' recurring' : ''}`}>
                      {c.orders_count}
                    </span>
                  </td>
                  <td className="tn-order-total">${formatARS(parseFloat(c.total_spent))}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>
                    {new Date(c.created_at).toLocaleDateString('es-AR', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                    })}
                  </td>
                  <td className="tn-order-chevron">
                    {expanded === c.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </td>
                </tr>
                {expanded === c.id && (
                  <tr key={`${c.id}-detail`} className="tn-order-detail-row">
                    <td colSpan={6}>
                      {loadingOrders ? (
                        <div style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '.875rem' }}>Cargando órdenes...</div>
                      ) : expandedOrders.length === 0 ? (
                        <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '.875rem' }}>Sin órdenes registradas.</div>
                      ) : (
                        <div className="tn-client-orders">
                          {expandedOrders.map(o => (
                            <div key={o.id} className="tn-client-order-row">
                              <span className="tn-order-num">#{o.number}</span>
                              <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                                {new Date(o.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                              </span>
                              <span style={{ fontSize: '.8rem', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {o.products.map(p => p.name).join(', ')}
                              </span>
                              <span className="tn-order-total">${formatARS(parseFloat(o.total))}</span>
                              <span className={`tn-status-badge ${paymentStatusClass(o.payment_status)}`}>
                                {paymentStatusLabel(o.payment_status)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="tn-empty">No se encontraron clientes.</div>}
      </div>
    </div>
  )
}
