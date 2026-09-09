import { useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { Download, Loader2, MessageSquare, Clock, TrendingUp, Users } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useCrmStats } from '../../../hooks/useCrmStats'
import { CATEGORIA_COLORS } from '../../../types/crm'
import type { CrmCategoria } from '../../../types/crm'
import './CrmDashboard.css'

export function CrmDashboard() {
  const { stats, loading, range, setRange } = useCrmStats()

  const kpis = useMemo(() => {
    if (!stats) return null
    const totalMensajes = stats.mensajesPorDia.reduce((sum, d) => sum + d.cantidad, 0)
    return {
      totalMensajes,
      tiempoRespuesta: stats.tiempoRespuestaPromedio,
      conversion: stats.conversionAVenta.porcentaje,
      conversacionesActivas: stats.conversionAVenta.total,
    }
  }, [stats])

  function exportExcel() {
    if (!stats) return
    const wb = XLSX.utils.book_new()

    const wsMensajes = XLSX.utils.json_to_sheet(stats.mensajesPorDia)
    XLSX.utils.book_append_sheet(wb, wsMensajes, 'Mensajes por dia')

    const wsCategorias = XLSX.utils.json_to_sheet(stats.mensajesPorCategoria)
    XLSX.utils.book_append_sheet(wb, wsCategorias, 'Por categoria')

    const wsProductos = XLSX.utils.json_to_sheet(stats.productosMasConsultados)
    XLSX.utils.book_append_sheet(wb, wsProductos, 'Productos consultados')

    const wsActividad = XLSX.utils.json_to_sheet(stats.actividadVendedora)
    XLSX.utils.book_append_sheet(wb, wsActividad, 'Actividad vendedora')

    const wsHoras = XLSX.utils.json_to_sheet(stats.horasPico)
    XLSX.utils.book_append_sheet(wb, wsHoras, 'Horas pico')

    const wsKPIs = XLSX.utils.json_to_sheet([{
      'Tiempo respuesta (min)': stats.tiempoRespuestaPromedio,
      'Conversion (%)': stats.conversionAVenta.porcentaje,
      'Total conversaciones': stats.conversionAVenta.total,
      'Ventas concretadas': stats.conversionAVenta.concretadas,
    }])
    XLSX.utils.book_append_sheet(wb, wsKPIs, 'KPIs')

    XLSX.writeFile(wb, `CRM_Stats_${range.start}_${range.end}.xlsx`)
  }

  const horasPicoFormatted = useMemo(() => {
    if (!stats) return []
    return stats.horasPico.map(h => ({
      ...h,
      label: `${h.hora.toString().padStart(2, '0')}hs`,
    }))
  }, [stats])

  return (
    <div className="crm-dash">
      <div className="page-header">
        <div>
          <h1 className="page-title">CRM Dashboard</h1>
          <p className="page-subtitle">Estadisticas de WhatsApp</p>
        </div>
        <button
          className="crm-dash-export"
          onClick={exportExcel}
          disabled={!stats || loading}
        >
          <Download size={16} /> Exportar Excel
        </button>
      </div>

      <div className="crm-dash-range">
        <label>
          Desde
          <input
            type="date"
            value={range.start}
            onChange={e => setRange(r => ({ ...r, start: e.target.value }))}
          />
        </label>
        <label>
          Hasta
          <input
            type="date"
            value={range.end}
            onChange={e => setRange(r => ({ ...r, end: e.target.value }))}
          />
        </label>
      </div>

      {loading ? (
        <div className="crm-dash-loading">
          <Loader2 className="crm-dash-spin" size={28} />
          <span>Cargando estadisticas...</span>
        </div>
      ) : !stats || !kpis ? (
        <div className="crm-dash-loading">
          <span>No hay datos para este rango.</span>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="crm-dash-kpis">
            <KpiCard icon={<MessageSquare size={18} />} label="Total mensajes" value={kpis.totalMensajes.toLocaleString('es-AR')} />
            <KpiCard icon={<Clock size={18} />} label="Tiempo respuesta" value={`${kpis.tiempoRespuesta} min`} />
            <KpiCard icon={<TrendingUp size={18} />} label="Conversion a venta" value={`${kpis.conversion}%`} accent />
            <KpiCard icon={<Users size={18} />} label="Conversaciones" value={kpis.conversacionesActivas.toLocaleString('es-AR')} />
          </div>

          {/* Mensajes por dia */}
          <div className="crm-dash-chart-card">
            <h3>Mensajes por dia</h3>
            <div className="crm-dash-chart">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={stats.mensajesPorDia}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="fecha"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                    tickFormatter={v => v.slice(5)}
                  />
                  <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }}
                    labelStyle={{ color: 'var(--text-secondary)' }}
                  />
                  <Line type="monotone" dataKey="cantidad" stroke="#22D3EE" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Categorias + Horas pico */}
          <div className="crm-dash-row-2">
            <div className="crm-dash-chart-card">
              <h3>Mensajes por categoria</h3>
              <div className="crm-dash-chart">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stats.mensajesPorCategoria} layout="vertical">
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                    <YAxis
                      dataKey="categoria"
                      type="category"
                      width={110}
                      tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }}
                    />
                    <Bar dataKey="cantidad" radius={[0, 4, 4, 0]}>
                      {stats.mensajesPorCategoria.map((entry) => (
                        <Cell
                          key={entry.categoria}
                          fill={CATEGORIA_COLORS[entry.categoria as CrmCategoria] || '#5E7A91'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="crm-dash-chart-card">
              <h3>Horas pico</h3>
              <div className="crm-dash-chart">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={horasPicoFormatted}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} interval={1} />
                    <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }}
                    />
                    <Bar dataKey="cantidad" fill="#F97316" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Productos mas consultados */}
          <div className="crm-dash-chart-card">
            <h3>Productos mas consultados</h3>
            <div className="crm-dash-table-wrap">
              <table className="crm-dash-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Marca</th>
                    <th>Modelo</th>
                    <th>Consultas</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.productosMasConsultados.map((p, i) => (
                    <tr key={p.modelo_id}>
                      <td>{i + 1}</td>
                      <td>{p.marca}</td>
                      <td>{p.modelo}</td>
                      <td className="crm-dash-table-num">{p.consultas}</td>
                    </tr>
                  ))}
                  {stats.productosMasConsultados.length === 0 && (
                    <tr>
                      <td colSpan={4} className="crm-dash-table-empty">
                        Sin datos para este rango
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actividad vendedora */}
          <div className="crm-dash-chart-card">
            <h3>Actividad de la vendedora</h3>
            <div className="crm-dash-chart">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={stats.actividadVendedora}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="fecha"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                    tickFormatter={v => v.slice(5)}
                  />
                  <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }}
                    labelStyle={{ color: 'var(--text-secondary)' }}
                  />
                  <Line type="monotone" dataKey="mensajes_enviados" stroke="#22D3EE" strokeWidth={2} dot={false} name="Mensajes enviados" />
                  <Line type="monotone" dataKey="conversaciones_atendidas" stroke="#F97316" strokeWidth={2} dot={false} name="Conversaciones" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function KpiCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className="crm-dash-kpi">
      <div className="crm-dash-kpi-icon">{icon}</div>
      <div className="crm-dash-kpi-body">
        <span className="crm-dash-kpi-label">{label}</span>
        <span className={`crm-dash-kpi-value ${accent ? 'crm-dash-kpi-value--accent' : ''}`}>
          {value}
        </span>
      </div>
    </div>
  )
}
