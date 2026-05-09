import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useDashboard } from '../../hooks/useDashboard'
import './Dashboard.css'

export function Dashboard() {
  const { data, loading, error } = useDashboard()
  const [alertasOpen, setAlertasOpen] = useState(false)

  if (loading) return <div className="dash-loading"><div className="spinner" /><p>Cargando dashboard...</p></div>
  if (error) return <div className="dash-error">Error: {error}</div>
  if (!data) return null

  const totalAlertas = data.alertasStock.reduce((s, a) => s + a.tallesAlerta.length, 0)

  return (
    <div className="dashboard">
      <div className="page-header"><h1 className="page-title">Dashboard</h1></div>

      {/* ── Métricas ── */}
      <div className="metrics-grid">
        <div className="metric-card">
          <p className="metric-label">Modelos en stock</p>
          <p className="metric-value">{data.totalModelos ?? 0}</p>
          <p className="metric-sub">modelos distintos</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Pares disponibles</p>
          <p className="metric-value">{(data.totalPares ?? 0).toLocaleString('es-AR')}</p>
          <p className="metric-sub">unidades en total</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Ventas del mes</p>
          <p className="metric-value accent">{data.ventasMes ?? 0}</p>
          <p className="metric-sub">pares vendidos</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Facturado del mes</p>
          <p className="metric-value accent">
            ${(data.totalFacturadoMes ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </p>
          <p className="metric-sub">ARS cobrados</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Ganancia del mes</p>
          <p className="metric-value accent">
            ${(data.gananciaMes ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </p>
          <p className="metric-sub">ARS estimados</p>
        </div>
      </div>

      {/* ── Gráfico + Top modelos ── */}
      <div className="dash-main-grid">
        <div className="dash-card">
          <h3 className="dash-card-title">Ventas por semana</h3>
          {data.ventasPorSemana.length === 0 ? (
            <p className="dash-no-data">Sin ventas registradas todavía.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.ventasPorSemana} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis dataKey="semana" tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '13px' }}
                  cursor={{ fill: 'rgba(0,212,106,.07)' }}
                  formatter={(v: number) => [v, 'Ventas']}
                />
                <Bar dataKey="ventas" fill="#00d46a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="dash-card">
          <h3 className="dash-card-title">Top 5 modelos del mes</h3>
          {data.topModelos.length === 0 ? (
            <p className="dash-no-data">Sin ventas este mes.</p>
          ) : (
            <div className="top-modelos">
              {data.topModelos.map((m, i) => (
                <div key={m.modelo_id} className="top-modelo-row">
                  <span className="top-rank">{i + 1}</span>
                  {m.foto_url ? (
                    <img src={m.foto_url} alt={m.nombre} className="top-thumb" />
                  ) : (
                    <div className="top-thumb-placeholder">⚽</div>
                  )}
                  <div className="top-info">
                    <p className="top-nombre"><span className="top-marca">{m.marca}</span> {m.nombre}</p>
                    <p className="top-codigo">{m.codigo_base}</p>
                  </div>
                  <span className="top-count">{m.cantidadVendida} par{m.cantidadVendida !== 1 ? 'es' : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Alertas colapsables ── */}
      <div className="alertas-section">
        <button
          className="alertas-toggle"
          onClick={() => setAlertasOpen(o => !o)}
          disabled={totalAlertas === 0}
        >
          <span className="alertas-toggle-label">
            <AlertTriangle size={15} color="var(--warning)" /> Alertas de stock mínimo
            {totalAlertas > 0 ? (
              <span className="alertas-badge">{totalAlertas}</span>
            ) : (
              <span className="alertas-badge-ok">✓ Sin alertas</span>
            )}
          </span>
          {totalAlertas > 0 && (
            <span className="alertas-chevron">{alertasOpen ? '▲' : '▼'}</span>
          )}
        </button>

        {alertasOpen && totalAlertas > 0 && (
          <div className="alertas-body">
            {data.alertasStock.map(({ modelo, tallesAlerta }) => (
              <div key={modelo.id} className="alerta-item">
                {modelo.modelo_fotos[0] && (
                  <img src={modelo.modelo_fotos[0].foto_url} alt={modelo.modelo} className="alerta-thumb" />
                )}
                <div className="alerta-info">
                  <p className="alerta-nombre">{modelo.marca} {modelo.modelo}</p>
                  <div className="alerta-talles">
                    {tallesAlerta.map(t => (
                      <span key={t.id} className="alerta-talle-chip">
                        {t.talle_arg}arg: {t.cantidad}/{t.stock_minimo}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
