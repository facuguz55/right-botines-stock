import { RefreshCw, TrendingUp, ShoppingCart, Users, Clock, DollarSign } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { useTiendaNube } from '../../hooks/useTiendaNube'
import { formatARS } from '../../services/tiendanubeService'
import './TNDashboard.css'

const PIE_COLORS = ['var(--accent)', '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899']

export function TNDashboard() {
  const { metrics, loading, error, progress, reload } = useTiendaNube()

  if (loading) {
    return (
      <div className="tn-loading">
        <div className="spinner" />
        <p>Cargando datos de TiendaNube{progress > 0 ? ` — ${progress} órdenes` : '...'}</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="tn-error">
        <p>⚠ {error}</p>
        <button className="btn btn-secondary btn-sm" onClick={reload}>Reintentar</button>
      </div>
    )
  }

  if (!metrics) return null

  const {
    ventasHoy, ventasSemana, ventasMes, totalFacturado,
    ordenesPagadas, ticketPromedio,
    clientesNuevos, clientesRecurrentes,
    topProductos, metodosPago, ventasPorMes, ultimaVenta,
  } = metrics

  const ultimosMeses = ventasPorMes.slice(-6)

  return (
    <div className="tn-dashboard">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tienda Online</h1>
          <p className="page-subtitle">Métricas en tiempo real de TiendaNube</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={reload}>
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {/* ── Métricas rápidas ── */}
      <div className="tn-metrics-grid">
        <div className="tn-metric-card">
          <div className="tn-metric-icon" style={{ background: 'rgba(16,185,129,.12)', color: '#10b981' }}>
            <TrendingUp size={16} />
          </div>
          <div className="tn-metric-content">
            <p className="tn-metric-label">Hoy</p>
            <p className="tn-metric-value">${formatARS(ventasHoy)}</p>
          </div>
        </div>
        <div className="tn-metric-card">
          <div className="tn-metric-icon" style={{ background: 'rgba(59,130,246,.12)', color: '#3b82f6' }}>
            <TrendingUp size={16} />
          </div>
          <div className="tn-metric-content">
            <p className="tn-metric-label">Esta semana</p>
            <p className="tn-metric-value">${formatARS(ventasSemana)}</p>
          </div>
        </div>
        <div className="tn-metric-card">
          <div className="tn-metric-icon" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
            <DollarSign size={16} />
          </div>
          <div className="tn-metric-content">
            <p className="tn-metric-label">Este mes</p>
            <p className="tn-metric-value accent">${formatARS(ventasMes)}</p>
          </div>
        </div>
        <div className="tn-metric-card">
          <div className="tn-metric-icon" style={{ background: 'rgba(245,158,11,.12)', color: '#f59e0b' }}>
            <ShoppingCart size={16} />
          </div>
          <div className="tn-metric-content">
            <p className="tn-metric-label">Órdenes pagadas</p>
            <p className="tn-metric-value">{ordenesPagadas.toLocaleString('es-AR')}</p>
          </div>
        </div>
        <div className="tn-metric-card">
          <div className="tn-metric-icon" style={{ background: 'rgba(139,92,246,.12)', color: '#8b5cf6' }}>
            <Clock size={16} />
          </div>
          <div className="tn-metric-content">
            <p className="tn-metric-label">Ticket promedio</p>
            <p className="tn-metric-value">${formatARS(ticketPromedio)}</p>
          </div>
        </div>
        <div className="tn-metric-card">
          <div className="tn-metric-icon" style={{ background: 'rgba(16,185,129,.12)', color: '#10b981' }}>
            <Users size={16} />
          </div>
          <div className="tn-metric-content">
            <p className="tn-metric-label">Recurrentes</p>
            <p className="tn-metric-value">{clientesRecurrentes}</p>
          </div>
        </div>
        <div className="tn-metric-card">
          <div className="tn-metric-icon" style={{ background: 'rgba(236,72,153,.12)', color: '#ec4899' }}>
            <Users size={16} />
          </div>
          <div className="tn-metric-content">
            <p className="tn-metric-label">Nuevos clientes</p>
            <p className="tn-metric-value">{clientesNuevos}</p>
          </div>
        </div>
        <div className="tn-metric-card">
          <div className="tn-metric-icon" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
            <DollarSign size={16} />
          </div>
          <div className="tn-metric-content">
            <p className="tn-metric-label">Total histórico</p>
            <p className="tn-metric-value accent">${formatARS(totalFacturado)}</p>
          </div>
        </div>
      </div>

      {/* ── Ventas por mes ── */}
      <div className="tn-section">
        <h2 className="tn-section-title">Ventas por mes</h2>
        <div className="tn-monthly-grid">
          {ultimosMeses.map(m => (
            <div key={m.month} className="tn-month-card">
              <p className="tn-month-label">{m.label.toUpperCase()}</p>
              <p className="tn-month-facturado">${formatARS(m.facturado)}</p>
              <p className="tn-month-ventas">{m.ventas} {m.ventas === 1 ? 'orden' : 'órdenes'}</p>
              <div className="tn-month-bar">
                <div
                  className="tn-month-bar-fill"
                  style={{
                    width: `${ultimosMeses.length ? Math.round((m.facturado / Math.max(...ultimosMeses.map(x => x.facturado), 1)) * 100) : 0}%`
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Charts row ── */}
      <div className="tn-charts-row">
        {/* Top productos */}
        <div className="tn-card">
          <h3 className="tn-card-title">Top productos</h3>
          {topProductos.length === 0 ? (
            <p className="tn-no-data">Sin ventas registradas.</p>
          ) : (
            <div className="tn-top-productos">
              {topProductos.map((p, i) => (
                <div key={p.nombre} className="tn-top-row">
                  <span className="tn-top-rank">{i + 1}</span>
                  <div className="tn-top-info">
                    <p className="tn-top-nombre">{p.nombre}</p>
                    <p className="tn-top-total">${formatARS(p.total)}</p>
                  </div>
                  <span className="tn-top-count">{p.cantidad} u.</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Métodos de pago */}
        <div className="tn-card">
          <h3 className="tn-card-title">Métodos de pago</h3>
          {metodosPago.length === 0 ? (
            <p className="tn-no-data">Sin datos.</p>
          ) : (
            <div className="tn-metodos">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={metodosPago}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                  >
                    {metodosPago.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-surface-3)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '12px' }}
                    formatter={(v: number, name: string) => [v, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="tn-metodos-legend">
                {metodosPago.map((m, i) => (
                  <div key={m.name} className="tn-metodo-item">
                    <span className="tn-metodo-dot" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="tn-metodo-name">{m.name}</span>
                    <span className="tn-metodo-pct">{m.porcentaje}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Última venta */}
        {ultimaVenta && (
          <div className="tn-card tn-ultima-venta">
            <h3 className="tn-card-title">Última venta</h3>
            <div className="tn-ultima-content">
              <p className="tn-ultima-monto">${formatARS(ultimaVenta.monto)}</p>
              <p className="tn-ultima-producto">{ultimaVenta.producto}</p>
              {ultimaVenta.cliente && (
                <p className="tn-ultima-cliente">👤 {ultimaVenta.cliente}</p>
              )}
              <p className="tn-ultima-fecha">📅 {ultimaVenta.fecha} · {ultimaVenta.hora}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Clientes nuevos vs recurrentes ── */}
      <div className="tn-card tn-clientes-ratio">
        <h3 className="tn-card-title">Tipos de clientes</h3>
        <div className="tn-ratio-bars">
          <div className="tn-ratio-item">
            <div className="tn-ratio-info">
              <span className="tn-ratio-label">Nuevos</span>
              <span className="tn-ratio-value">{clientesNuevos}</span>
            </div>
            <div className="tn-ratio-bar">
              <div
                className="tn-ratio-fill"
                style={{
                  width: `${clientesNuevos + clientesRecurrentes > 0 ? Math.round(clientesNuevos / (clientesNuevos + clientesRecurrentes) * 100) : 0}%`,
                  background: '#3b82f6',
                }}
              />
            </div>
            <span className="tn-ratio-pct">
              {clientesNuevos + clientesRecurrentes > 0
                ? Math.round(clientesNuevos / (clientesNuevos + clientesRecurrentes) * 100)
                : 0}%
            </span>
          </div>
          <div className="tn-ratio-item">
            <div className="tn-ratio-info">
              <span className="tn-ratio-label">Recurrentes</span>
              <span className="tn-ratio-value">{clientesRecurrentes}</span>
            </div>
            <div className="tn-ratio-bar">
              <div
                className="tn-ratio-fill"
                style={{
                  width: `${clientesNuevos + clientesRecurrentes > 0 ? Math.round(clientesRecurrentes / (clientesNuevos + clientesRecurrentes) * 100) : 0}%`,
                  background: '#10b981',
                }}
              />
            </div>
            <span className="tn-ratio-pct">
              {clientesNuevos + clientesRecurrentes > 0
                ? Math.round(clientesRecurrentes / (clientesNuevos + clientesRecurrentes) * 100)
                : 0}%
            </span>
          </div>
        </div>
      </div>

      {/* ── Mini gráfico ventas por mes ── */}
      <div className="tn-card">
        <h3 className="tn-card-title">Facturación histórica por mes</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={ventasPorMes} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false}
              tickFormatter={v => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            />
            <Tooltip
              contentStyle={{ background: 'var(--bg-surface-3)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '12px' }}
              formatter={(v: number) => [`$${formatARS(v)}`, 'Facturado']}
            />
            <Bar dataKey="facturado" fill="var(--accent)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
