import { RefreshCw } from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useTiendaNube } from '../../hooks/useTiendaNube'
import { TNSetup } from '../TNSetup/TNSetup'
import { formatARS } from '../../services/tiendanubeService'
import './TNAnalytics.css'

export function TNAnalytics() {
  const { metrics, loading, error, progress, isConfigured, reload } = useTiendaNube()

  if (!isConfigured) return <TNSetup onConfigured={reload} />

  if (loading) {
    return (
      <div className="tn-loading">
        <div className="spinner" />
        <p>Cargando análisis{progress > 0 ? ` — ${progress} órdenes` : '...'}</p>
      </div>
    )
  }

  if (error) return (
    <div className="tn-error">
      <p>⚠ {error}</p>
      <button className="btn btn-secondary btn-sm" onClick={reload}>Reintentar</button>
    </div>
  )

  if (!metrics) return null

  const { ventasPorDia, ventasPorHora, ventasPorMes } = metrics

  // Últimos 60 días para los gráficos diarios
  const diasRecientes = ventasPorDia.slice(-60)

  // Hora pico
  const horaPico = ventasPorHora.reduce(
    (max, h) => h.value > max.value ? h : max,
    { name: '—', value: 0 }
  )

  // Mes con más ventas
  const mejorMes = [...ventasPorMes].sort((a, b) => b.facturado - a.facturado)[0]

  // Total órdenes en periodo visible
  const totalOrdenesDias = diasRecientes.reduce((s, d) => s + d.value, 0)
  const totalFacturadoDias = diasRecientes.reduce((s, d) => s + d.facturado, 0)

  return (
    <div className="tn-analytics">
      <div className="page-header">
        <div>
          <h1 className="page-title">Análisis</h1>
          <p className="page-subtitle">Gráficos históricos de ventas</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={reload}>
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {/* ── KPIs rápidos ── */}
      <div className="analytics-kpis">
        <div className="analytics-kpi">
          <p className="analytics-kpi-label">Órdenes (últ. 60 días)</p>
          <p className="analytics-kpi-value">{totalOrdenesDias}</p>
        </div>
        <div className="analytics-kpi">
          <p className="analytics-kpi-label">Facturado (últ. 60 días)</p>
          <p className="analytics-kpi-value accent">${formatARS(totalFacturadoDias)}</p>
        </div>
        <div className="analytics-kpi">
          <p className="analytics-kpi-label">Hora pico</p>
          <p className="analytics-kpi-value">{horaPico.name}</p>
          <p className="analytics-kpi-sub">{horaPico.value} ventas</p>
        </div>
        {mejorMes && (
          <div className="analytics-kpi">
            <p className="analytics-kpi-label">Mejor mes</p>
            <p className="analytics-kpi-value">{mejorMes.label}</p>
            <p className="analytics-kpi-sub">${formatARS(mejorMes.facturado)}</p>
          </div>
        )}
      </div>

      {/* ── Ventas por día (line) ── */}
      <div className="tn-card">
        <h3 className="tn-card-title">Ventas por día — últimos 60 días</h3>
        {diasRecientes.length === 0 ? (
          <p className="tn-no-data">Sin datos suficientes.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={diasRecientes} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                axisLine={false} tickLine={false}
                tickCount={8}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-surface-3)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '12px' }}
                formatter={(v: number) => [v, 'Órdenes']}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: 'var(--accent)', strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Facturación por día (bar) ── */}
      <div className="tn-card">
        <h3 className="tn-card-title">Facturación diaria — últimos 60 días</h3>
        {diasRecientes.length === 0 ? (
          <p className="tn-no-data">Sin datos suficientes.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={diasRecientes} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                axisLine={false} tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                axisLine={false} tickLine={false}
                tickFormatter={v => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
              />
              <Tooltip
                contentStyle={{ background: 'var(--bg-surface-3)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '12px' }}
                formatter={(v: number) => [`$${formatARS(v)}`, 'Facturado']}
              />
              <Bar dataKey="facturado" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Ventas por hora ── */}
      <div className="analytics-row">
        <div className="tn-card">
          <h3 className="tn-card-title">Ventas por hora del día</h3>
          <p className="analytics-chart-sub">Distribución horaria de órdenes (hora Argentina)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={ventasPorHora} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: 'var(--text-secondary)', fontSize: 9 }}
                axisLine={false} tickLine={false}
                interval={2}
              />
              <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-surface-3)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '12px' }}
                formatter={(v: number) => [v, 'Órdenes']}
              />
              <Bar
                dataKey="value"
                radius={[3, 3, 0, 0]}
                fill="#8b5cf6"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ── Facturación mensual ── */}
        <div className="tn-card">
          <h3 className="tn-card-title">Facturación por mes</h3>
          <p className="analytics-chart-sub">Últimos 12 meses</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={ventasPorMes} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--text-secondary)', fontSize: 9 }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                axisLine={false} tickLine={false}
                tickFormatter={v => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
              />
              <Tooltip
                contentStyle={{ background: 'var(--bg-surface-3)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '12px' }}
                formatter={(v: number) => [`$${formatARS(v)}`, 'Facturado']}
              />
              <Bar dataKey="facturado" fill="#10b981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
