import { useState, useMemo } from 'react'
import { useVentas } from '../../hooks/useVentas'
import type { Venta } from '../../types'
import './VentasHistory.css'

const MEDIO_ICONS: Record<string, string> = { Efectivo: '💵', Transferencia: '📲', Tarjeta: '💳' }
const MEDIOS: Venta['medio_pago'][] = ['Efectivo', 'Transferencia', 'Tarjeta']

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
    case 'mes': return { start: toISO(new Date(now.getFullYear(), now.getMonth(), 1)), end: today }
    case 'mes_ant': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      return { start: toISO(start), end: toISO(end) }
    }
    case 'todo': {
      return { start: '2020-01-01', end: today }
    }
    default: return { start: toISO(new Date(now.getFullYear(), now.getMonth(), 1)), end: today }
  }
}

const PRESETS = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'ayer', label: 'Ayer' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes', label: 'Este mes' },
  { key: 'mes_ant', label: 'Mes anterior' },
  { key: 'todo', label: 'Todo' },
]

export function VentasHistory() {
  const initial = getPreset('mes')
  const [startDate, setStartDate] = useState(initial.start)
  const [endDate, setEndDate] = useState(initial.end)
  const [activePreset, setActivePreset] = useState('mes')

  const [filterModelo, setFilterModelo] = useState('')
  const [filterTalle, setFilterTalle] = useState('')
  const [filterPago, setFilterPago] = useState('')
  const [filterPrecioMin, setFilterPrecioMin] = useState('')
  const [filterPrecioMax, setFilterPrecioMax] = useState('')
  const [filterGananciaMin, setFilterGananciaMin] = useState('')
  const [filterGananciaMax, setFilterGananciaMax] = useState('')

  const { ventas, loading, error } = useVentas(startDate, endDate)

  const tallesDisponibles = useMemo(
    () => [...new Set(ventas.map(v => v.talle_arg))].sort((a, b) => a - b),
    [ventas]
  )

  const filtered = useMemo(() => ventas.filter(v => {
    if (filterModelo) {
      const texto = `${v.modelos?.marca ?? ''} ${v.modelos?.modelo ?? ''}`.toLowerCase()
      if (!texto.includes(filterModelo.toLowerCase())) return false
    }
    if (filterTalle && String(v.talle_arg) !== filterTalle) return false
    if (filterPago && v.medio_pago !== filterPago) return false
    if (filterPrecioMin && v.precio_venta < parseFloat(filterPrecioMin)) return false
    if (filterPrecioMax && v.precio_venta > parseFloat(filterPrecioMax)) return false
    if (filterGananciaMin && v.ganancia < parseFloat(filterGananciaMin)) return false
    if (filterGananciaMax && v.ganancia > parseFloat(filterGananciaMax)) return false
    return true
  }), [ventas, filterModelo, filterTalle, filterPago, filterPrecioMin, filterPrecioMax, filterGananciaMin, filterGananciaMax])

  const totalVentas = filtered.reduce((s, v) => s + v.precio_venta, 0)
  const totalGanancia = filtered.reduce((s, v) => s + v.ganancia, 0)

  const hasExtraFilters = filterModelo || filterTalle || filterPago || filterPrecioMin || filterPrecioMax || filterGananciaMin || filterGananciaMax

  function applyPreset(key: string) {
    const { start, end } = getPreset(key)
    setStartDate(start)
    setEndDate(end)
    setActivePreset(key)
  }

  function clearExtraFilters() {
    setFilterModelo(''); setFilterTalle(''); setFilterPago('')
    setFilterPrecioMin(''); setFilterPrecioMax('')
    setFilterGananciaMin(''); setFilterGananciaMax('')
  }

  return (
    <div className="ventas-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Historial de ventas</h1>
          <p className="page-subtitle">
            {loading ? 'Cargando...' : `${filtered.length}${filtered.length !== ventas.length ? ` de ${ventas.length}` : ''} venta${ventas.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* Presets */}
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

      {/* Fecha */}
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

      {/* Filtros adicionales */}
      <div className="ventas-extra-filters">
        <input
          className="vf-input"
          type="text"
          placeholder="Buscar modelo..."
          value={filterModelo}
          onChange={e => setFilterModelo(e.target.value)}
        />

        <select className="vf-select" value={filterTalle} onChange={e => setFilterTalle(e.target.value)}>
          <option value="">Talle ARG</option>
          {tallesDisponibles.map(t => <option key={t} value={String(t)}>{t}</option>)}
        </select>

        <select className="vf-select" value={filterPago} onChange={e => setFilterPago(e.target.value)}>
          <option value="">Medio de pago</option>
          {MEDIOS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <div className="vf-range">
          <input className="vf-input vf-number" type="number" placeholder="Precio mín" value={filterPrecioMin} onChange={e => setFilterPrecioMin(e.target.value)} />
          <span className="vf-sep">–</span>
          <input className="vf-input vf-number" type="number" placeholder="Precio máx" value={filterPrecioMax} onChange={e => setFilterPrecioMax(e.target.value)} />
        </div>

        <div className="vf-range">
          <input className="vf-input vf-number" type="number" placeholder="Gan. mín" value={filterGananciaMin} onChange={e => setFilterGananciaMin(e.target.value)} />
          <span className="vf-sep">–</span>
          <input className="vf-input vf-number" type="number" placeholder="Gan. máx" value={filterGananciaMax} onChange={e => setFilterGananciaMax(e.target.value)} />
        </div>

        {hasExtraFilters && (
          <button className="btn btn-secondary btn-sm" onClick={clearExtraFilters}>Limpiar</button>
        )}
      </div>

      {/* Summary */}
      {!loading && filtered.length > 0 && (
        <div className="ventas-summary">
          <div className="summary-item"><span>Total facturado</span><strong className="accent">${totalVentas.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</strong></div>
          <div className="summary-item"><span>Ganancia estimada</span><strong className="accent">${totalGanancia.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</strong></div>
          <div className="summary-item"><span>Ticket promedio</span><strong>${filtered.length ? Math.round(totalVentas / filtered.length).toLocaleString('es-AR') : 0}</strong></div>
        </div>
      )}

      {loading ? (
        <div className="ventas-loading"><div className="spinner" /><p>Cargando ventas...</p></div>
      ) : error ? (
        <div className="ventas-error">Error: {error}</div>
      ) : filtered.length === 0 ? (
        <div className="ventas-empty"><span>💰</span><p>No hay ventas con esos filtros.</p></div>
      ) : (
        <div className="ventas-table-wrap">
          <table className="ventas-table">
            <thead>
              <tr><th>Fecha</th><th>Modelo</th><th>Talle</th><th>Pago</th><th>Precio</th><th>Ganancia</th></tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id}>
                  <td className="date-cell">
                    {new Date(v.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    <span className="time-cell">{new Date(v.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </td>
                  <td>{v.modelos ? <span><strong>{v.modelos.marca}</strong> {v.modelos.modelo}</span> : <span className="deleted-product">Eliminado</span>}</td>
                  <td>{v.talle_arg} arg</td>
                  <td>
                    <span className="medio-pago-badge">
                      {MEDIO_ICONS[v.medio_pago] ?? ''} {v.medio_pago}
                      {v.recargo_tarjeta != null && v.recargo_tarjeta > 0 && <span className="recargo-tag">+10%</span>}
                    </span>
                  </td>
                  <td className="price-cell">${v.precio_venta.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</td>
                  <td className={`ganancia-cell ${v.ganancia >= 0 ? 'positive' : 'negative'}`}>${v.ganancia.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
