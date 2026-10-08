import { useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useTiendaNube } from '../../hooks/useTiendaNube'
import { formatARS } from '../../services/tiendanubeService'
import {
  fechaAR, rangoDe, resumirRango, tituloRango, cantidadDias,
  type PresetRango, type RangoFechas,
} from '../../lib/tnRango'
import './TNAnalytics.css'

const PRESETS: { id: PresetRango; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'ayer', label: 'Ayer' },
  { id: 'mes', label: 'Este mes' },
  { id: '60d', label: 'Últimos 60 días' },
  { id: 'custom', label: 'Personalizado' },
]

export function TNAnalytics() {
  const { metrics, loading, error, progress, reload } = useTiendaNube()
  const [preset, setPreset] = useState<PresetRango>('mes')
  const [custom, setCustom] = useState<RangoFechas>(() => {
    const hoy = fechaAR(Date.now())
    return { desde: hoy, hasta: hoy }
  })

  const hoy = fechaAR(Date.now())
  const rango = useMemo(() => rangoDe(preset, hoy, custom), [preset, hoy, custom])
  const resumen = useMemo(
    () => (metrics ? resumirRango(metrics.orders, rango) : null),
    [metrics, rango],
  )

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

  const { ventasPorMes } = metrics
  if (!resumen) return null

  const { porDia: diasRango, porHora: ventasPorHora, horaPico } = resumen
  const nombreRango = tituloRango(preset, rango)
  const variosDias = cantidadDias(rango) > 1

  // Mes con más ventas
  const mejorMes = [...ventasPorMes].sort((a, b) => b.facturado - a.facturado)[0]

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

      {/* ── Filtro de fechas ── */}
      <div className="analytics-filtros">
        <div className="analytics-chips">
          {PRESETS.map(p => (
            <button
              key={p.id}
              className={`analytics-chip${preset === p.id ? ' active' : ''}`}
              onClick={() => setPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="analytics-custom">
            <label>
              Desde
              <input
                type="date"
                value={custom.desde}
                max={hoy}
                onChange={e => e.target.value && setCustom(c => ({ ...c, desde: e.target.value }))}
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                value={custom.hasta}
                max={hoy}
                onChange={e => e.target.value && setCustom(c => ({ ...c, hasta: e.target.value }))}
              />
            </label>
          </div>
        )}
      </div>

      {/* ── KPIs rápidos ── */}
      <div className="analytics-kpis">
        <div className="analytics-kpi">
          <p className="analytics-kpi-label">Ventas ({nombreRango})</p>
          <p className="analytics-kpi-value">{resumen.ordenes.toLocaleString('es-AR')}</p>
        </div>
        <div className="analytics-kpi">
          <p className="analytics-kpi-label">Facturación ({nombreRango})</p>
          <p className="analytics-kpi-value accent">${formatARS(resumen.facturado)}</p>
        </div>
        <div className="analytics-kpi">
          <p className="analytics-kpi-label">Ticket promedio</p>
          <p className="analytics-kpi-value">${formatARS(resumen.ticketPromedio)}</p>
        </div>
        <div className="analytics-kpi">
          <p className="analytics-kpi-label">Hora pico</p>
          <p className="analytics-kpi-value">{horaPico.name}</p>
          <p className="analytics-kpi-sub">{horaPico.value} ventas</p>
        </div>
        {mejorMes && (
          <div className="analytics-kpi">
            <p className="analytics-kpi-label">Mejor mes (últ. 12)</p>
            <p className="analytics-kpi-value">{mejorMes.label}</p>
            <p className="analytics-kpi-sub">${formatARS(mejorMes.facturado)}</p>
          </div>
        )}
      </div>

      {/* ── Ventas por día (line) ── */}
      {variosDias && <div className="tn-card">
        <h3 className="tn-card-title">Ventas por día — {nombreRango}</h3>
        {diasRango.length === 0 ? (
          <p className="tn-no-data">Sin datos suficientes.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={diasRango} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
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
      </div>}

      {/* ── Facturación por día (bar) ── */}
      {variosDias && <div className="tn-card">
        <h3 className="tn-card-title">Facturación diaria — {nombreRango}</h3>
        {diasRango.length === 0 ? (
          <p className="tn-no-data">Sin datos suficientes.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={diasRango} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
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
      </div>}

      {/* ── Ventas por hora ── */}
      <div className="analytics-row">
        <div className="tn-card">
          <h3 className="tn-card-title">Ventas por hora del día</h3>
          <p className="analytics-chart-sub">Órdenes de {nombreRango} por hora (hora Argentina)</p>
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
