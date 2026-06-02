import { useState, useEffect } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useDashboard } from '../../hooks/useDashboard'
import { fetchTNMetrics, getTNCredentials, formatARS, type MonthlyStats } from '../../services/tiendanubeService'
import './Rentabilidad.css'

interface CanalData {
  local: number
  web: number
  total: number
}

interface MesComparado {
  label: string
  local: number
  web: number
  total: number
}

export function Rentabilidad() {
  const { data: localData, loading: localLoading } = useDashboard()

  const [tnMonthly, setTnMonthly]   = useState<MonthlyStats[]>([])
  const [tnMes, setTnMes]           = useState(0)
  const [tnTotal, setTnTotal]       = useState(0)
  const [tnLoading, setTnLoading]   = useState(false)
  const [tnError, setTnError]       = useState('')

  const creds = getTNCredentials()
  const tnConfigured = !!creds.storeId && !!creds.token

  useEffect(() => {
    if (!tnConfigured) return
    setTnLoading(true)
    const { storeId, token } = getTNCredentials()
    fetchTNMetrics(storeId, token)
      .then(m => {
        setTnMes(m.ventasMes)
        setTnTotal(m.totalFacturado)
        setTnMonthly(m.ventasPorMes)
      })
      .catch(e => setTnError(e.message))
      .finally(() => setTnLoading(false))
  }, [tnConfigured])

  const loading = localLoading || tnLoading

  if (loading) {
    return <div className="tn-loading"><div className="spinner" /><p>Calculando rentabilidad...</p></div>
  }

  const localMes   = localData?.totalFacturadoMes ?? 0
  const gananciaMes = localData?.gananciaMes ?? 0
  const totalMes: CanalData = { local: localMes, web: tnMes, total: localMes + tnMes }

  // Margen estimado local (ganancia / facturado)
  const margenLocal = localMes > 0 ? (gananciaMes / localMes) * 100 : 0

  // Combinado últimos 6 meses
  const ultimosMeses = tnMonthly.slice(-6)
  const mesComparado: MesComparado[] = ultimosMeses.map(m => ({
    label:  m.label,
    web:    m.facturado,
    local:  0, // no tenemos datos históricos locales por mes
    total:  m.facturado,
  }))

  // Pie chart canales
  const pieData = [
    { name: 'Local', value: localMes, color: 'var(--accent)' },
    { name: 'Tienda Web', value: tnMes, color: '#3b82f6' },
  ].filter(d => d.value > 0)

  const pct = (v: number, total: number) => total > 0 ? Math.round(v / total * 100) : 0

  // Tendencia: comparar mes actual con el anterior
  const mesActual    = tnMonthly[tnMonthly.length - 1]?.facturado ?? 0
  const mesAnterior  = tnMonthly[tnMonthly.length - 2]?.facturado ?? 0
  const tendenciaPct = mesAnterior > 0 ? ((mesActual - mesAnterior) / mesAnterior) * 100 : 0
  const TendIcon     = tendenciaPct > 0 ? TrendingUp : tendenciaPct < 0 ? TrendingDown : Minus
  const tendColor    = tendenciaPct > 0 ? '#10b981' : tendenciaPct < 0 ? 'var(--danger)' : 'var(--text-secondary)'

  return (
    <div className="rentabilidad">
      <div className="page-header">
        <div>
          <h1 className="page-title">Rentabilidad</h1>
          <p className="page-subtitle">Visión combinada — Local + Tienda Online</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => window.location.reload()}>
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {!tnConfigured && (
        <div className="rent-banner">
          ⚠ Conectá TiendaNube en Ajustes para ver los datos combinados. Por ahora mostramos solo el canal local.
        </div>
      )}

      {tnError && (
        <div className="rent-banner">{tnError}</div>
      )}

      {/* ── Métricas del mes ── */}
      <div className="rent-metrics">
        <div className="rent-metric-card total">
          <p className="rent-label">Facturado este mes — Total</p>
          <p className="rent-value">${formatARS(totalMes.total)}</p>
          <div className="rent-canales">
            <span style={{ color: 'var(--accent)' }}>Local ${formatARS(totalMes.local)}</span>
            <span className="rent-sep">·</span>
            <span style={{ color: '#3b82f6' }}>Web ${formatARS(totalMes.web)}</span>
          </div>
        </div>

        <div className="rent-metric-card">
          <p className="rent-label">Canal local — este mes</p>
          <p className="rent-value accent">${formatARS(localMes)}</p>
          <p className="rent-sub">{pct(localMes, totalMes.total)}% del total</p>
        </div>

        <div className="rent-metric-card">
          <p className="rent-label">Ganancia estimada local</p>
          <p className="rent-value" style={{ color: '#10b981' }}>${formatARS(gananciaMes)}</p>
          <p className="rent-sub">Margen {margenLocal.toFixed(1)}%</p>
        </div>

        <div className="rent-metric-card">
          <p className="rent-label">Canal web — este mes</p>
          <p className="rent-value" style={{ color: '#3b82f6' }}>${formatARS(tnMes)}</p>
          <p className="rent-sub">{pct(tnMes, totalMes.total)}% del total</p>
        </div>

        <div className="rent-metric-card">
          <p className="rent-label">Tendencia web (vs mes ant.)</p>
          <p className="rent-value" style={{ color: tendColor, display: 'flex', alignItems: 'center', gap: 6 }}>
            <TendIcon size={20} />
            {tendenciaPct > 0 ? '+' : ''}{tendenciaPct.toFixed(1)}%
          </p>
          <p className="rent-sub">
            {mesAnterior > 0 ? `Mes ant. $${formatARS(mesAnterior)}` : 'Sin datos anteriores'}
          </p>
        </div>

        <div className="rent-metric-card">
          <p className="rent-label">Histórico web acumulado</p>
          <p className="rent-value" style={{ color: '#3b82f6' }}>${formatARS(tnTotal)}</p>
          <p className="rent-sub">total registrado</p>
        </div>
      </div>

      {/* ── Charts row ── */}
      <div className="rent-charts-row">
        {/* Pie canal */}
        {pieData.length > 0 && (
          <div className="tn-card">
            <h3 className="tn-card-title">Mix de canales — este mes</h3>
            <div className="rent-pie-wrap">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={4}
                  >
                    {pieData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-surface-3)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '12px' }}
                    formatter={(v: number) => [`$${formatARS(v)}`, '']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="rent-pie-legend">
                {pieData.map(d => (
                  <div key={d.name} className="rent-pie-item">
                    <span className="rent-pie-dot" style={{ background: d.color }} />
                    <span>{d.name}</span>
                    <strong>${formatARS(d.value)}</strong>
                    <span className="rent-pie-pct">{pct(d.value, totalMes.total)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Bar combinado por mes */}
        {mesComparado.length > 0 && (
          <div className="tn-card" style={{ flex: 2 }}>
            <h3 className="tn-card-title">Facturación web por mes — últimos 6 meses</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={mesComparado} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                  axisLine={false} tickLine={false}
                  tickFormatter={v => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-surface-3)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '12px' }}
                  formatter={(v: number) => [`$${formatARS(v)}`, 'Facturado web']}
                />
                <Bar dataKey="web" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Web" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Tabla resumen ── */}
      <div className="tn-card">
        <h3 className="tn-card-title">Resumen mensual web — últimos 12 meses</h3>
        <div className="rent-table-wrap">
          <table className="tn-table">
            <thead>
              <tr>
                <th>Mes</th>
                <th>Órdenes web</th>
                <th>Facturado web</th>
                <th>vs mes ant.</th>
              </tr>
            </thead>
            <tbody>
              {[...tnMonthly].reverse().map((m, i, arr) => {
                const prev = arr[i + 1]?.facturado ?? 0
                const diff = prev > 0 ? ((m.facturado - prev) / prev) * 100 : null
                return (
                  <tr key={m.month}>
                    <td style={{ fontWeight: 600 }}>{m.label}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{m.ventas}</td>
                    <td style={{ fontWeight: 700, color: '#3b82f6' }}>${formatARS(m.facturado)}</td>
                    <td>
                      {diff !== null ? (
                        <span style={{ color: diff >= 0 ? '#10b981' : 'var(--danger)', fontSize: '.8rem', fontWeight: 700 }}>
                          {diff >= 0 ? '▲' : '▼'} {Math.abs(diff).toFixed(1)}%
                        </span>
                      ) : <span style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Nota de margen web ── */}
      <div className="rent-note">
        💡 <strong>Margen web:</strong> Para calcular la ganancia neta de TiendaNube necesitás restar el costo de los productos vendidos.
        Podés hacerlo linkeando los productos de TN con los modelos locales desde la sección <strong>Productos TN</strong>.
      </div>
    </div>
  )
}
