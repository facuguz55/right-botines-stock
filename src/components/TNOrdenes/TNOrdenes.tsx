import { useState, useEffect } from 'react'
import { RefreshCw, ChevronDown, ChevronUp, Search, Check } from 'lucide-react'
import { paymentStatusLabel, paymentStatusClass, humanizePaymentMethod, formatARS, type TNOrder } from '../../services/tiendanubeService'
import { fetchLocalTNOrdenes, syncTNOrdenes, marcarOrdenPreparada } from '../../services/tnOrdersSync'
import './TNOrdenes.css'

type StatusFilter = 'all' | 'paid' | 'pending' | 'cancelled'

function toISO(d: Date) { return d.toISOString().split('T')[0] }

function getPreset(preset: string): { start: string; end: string } {
  const now = new Date()
  const today = toISO(now)
  switch (preset) {
    case 'hoy': return { start: today, end: today }
    case 'ayer': {
      const d = new Date(now); d.setDate(d.getDate() - 1); const s = toISO(d)
      return { start: s, end: s }
    }
    case 'semana': {
      const d = new Date(now); d.setDate(d.getDate() - 6)
      return { start: toISO(d), end: today }
    }
    case 'todo': return { start: '2020-01-01', end: today }
    default: return { start: today, end: today }
  }
}

const PRESETS = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'ayer', label: 'Ayer' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'todo', label: 'Todo' },
]

interface TNOrdenesProps {
  empleadoId: string | null
}

export function TNOrdenes({ empleadoId }: TNOrdenesProps) {
  const [orders, setOrders]       = useState<TNOrder[]>([])
  const [loading, setLoading]     = useState(true)
  const [syncing, setSyncing]     = useState(false)
  const [error, setError]         = useState('')
  const [expanded, setExpanded]   = useState<number | null>(null)
  const [statusFilter, setStatus] = useState<StatusFilter>('all')
  const [search, setSearch]       = useState('')
  const [ocultarPreparadas, setOcultarPreparadas] = useState(true)
  const [preparandoId, setPreparandoId] = useState<number | null>(null)

  const initial = getPreset('hoy')
  const [startDate, setStartDate] = useState(initial.start)
  const [endDate, setEndDate] = useState(initial.end)
  const [activePreset, setActivePreset] = useState('hoy')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchLocalTNOrdenes()
      setOrders(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar órdenes')
    } finally {
      setLoading(false)
    }
  }

  const refresh = async () => {
    setSyncing(true)
    try {
      await syncTNOrdenes()
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al sincronizar órdenes')
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => { load() }, [])

  const applyPreset = (key: string) => {
    const { start, end } = getPreset(key)
    setStartDate(start)
    setEndDate(end)
    setActivePreset(key)
  }

  const handleTogglePreparada = async (order: TNOrder) => {
    const nuevoValor = !order.preparada
    setPreparandoId(order.id)
    // Optimista: actualizamos el estado local antes de esperar la respuesta.
    setOrders(prev => prev.map(o => o.id === order.id
      ? { ...o, preparada: nuevoValor, preparada_por: nuevoValor ? empleadoId : null }
      : o))
    try {
      await marcarOrdenPreparada(order.id, nuevoValor, empleadoId)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al marcar la orden')
      await load()
    } finally {
      setPreparandoId(null)
    }
  }

  if (loading) return (
    <div className="tn-loading">
      <div className="spinner" />
      <p>Cargando órdenes...</p>
    </div>
  )
  if (error) return <div className="tn-error"><p>⚠ {error}</p><button className="btn btn-secondary btn-sm" onClick={() => load()}>Reintentar</button></div>

  const filtered = orders.filter(o => {
    if (statusFilter === 'paid' && o.payment_status !== 'paid' && o.payment_status !== 'authorized') return false
    if (statusFilter === 'pending' && o.payment_status !== 'pending' && o.payment_status !== 'unpaid') return false
    if (statusFilter === 'cancelled' && o.status !== 'cancelled') return false
    if (ocultarPreparadas && o.preparada) return false
    const fecha = o.created_at.split('T')[0]
    if (fecha < startDate || fecha > endDate) return false
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
        <button className="btn btn-secondary btn-sm" onClick={refresh} disabled={syncing}>
          <RefreshCw size={13} /> {syncing ? 'Sincronizando...' : 'Actualizar'}
        </button>
      </div>

      {/* Presets de fecha */}
      <div className="ventas-presets">
        {PRESETS.map(p => (
          <button
            key={p.key}
            className={`preset-btn${activePreset === p.key ? ' active' : ''}`}
            onClick={() => applyPreset(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="ventas-filters">
        <div className="form-group date-group">
          <label>Desde</label>
          <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setActivePreset('') }} />
        </div>
        <div className="form-group date-group">
          <label>Hasta</label>
          <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setActivePreset('') }} />
        </div>
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

      {/* Search + ocultar preparadas */}
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
        <label className="tn-ocultar-preparadas">
          <input type="checkbox" checked={ocultarPreparadas} onChange={e => setOcultarPreparadas(e.target.checked)} />
          Ocultar preparadas
        </label>
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
              <th>Preparada</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(order => (
              <>
                <tr
                  key={order.id}
                  className={`tn-order-row${expanded === order.id ? ' expanded' : ''}${order.preparada ? ' preparada' : ''}`}
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
                    <span className="tn-method-badge">
                      {humanizePaymentMethod(order.payment_details?.method ?? 'other', order.payment_details?.credit_card_company)}
                    </span>
                  </td>
                  <td onClick={() => setExpanded(expanded === order.id ? null : order.id)}>
                    <span className={`tn-status-badge ${paymentStatusClass(order.payment_status)}`}>
                      {paymentStatusLabel(order.payment_status)}
                    </span>
                  </td>
                  <td className="tn-order-preparada">
                    <button
                      type="button"
                      className={`tn-preparada-btn${order.preparada ? ' active' : ''}`}
                      disabled={preparandoId === order.id}
                      onClick={() => handleTogglePreparada(order)}
                      title={order.preparada ? `Preparada${order.preparada_por_nombre ? ` por ${order.preparada_por_nombre}` : ''}` : 'Marcar como preparada'}
                    >
                      <Check size={14} />
                    </button>
                  </td>
                  <td className="tn-order-chevron" onClick={() => setExpanded(expanded === order.id ? null : order.id)}>
                    {expanded === order.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </td>
                </tr>
                {expanded === order.id && (
                  <tr key={`${order.id}-detail`} className="tn-order-detail-row">
                    <td colSpan={8}>
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

                        {order.preparada && (
                          <div className="tn-detail-note">
                            <p className="tn-detail-label">Preparada</p>
                            <p>
                              {order.preparada_por_nombre ?? 'Dueño'}
                              {order.preparada_at && ` · ${new Date(order.preparada_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`}
                            </p>
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
            No hay órdenes que coincidan con el filtro.
            {orders.length > 0 && activePreset === 'hoy' && (
              <> Tenés {orders.length} en total — probá el preset "Todo" para verlas.</>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
