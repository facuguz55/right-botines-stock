import { useState } from 'react'
import { useVentas } from '../../hooks/useVentas'
import './VentasHistory.css'

const MEDIO_ICONS: Record<string, string> = { Efectivo: '💵', Transferencia: '📲', Tarjeta: '💳' }

export function VentasHistory() {
  const today = new Date()
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
  const [startDate, setStartDate] = useState(firstDay.toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0])
  const { ventas, loading, error } = useVentas(startDate, endDate)

  const totalVentas = ventas.reduce((s, v) => s + v.precio_venta, 0)
  const totalGanancia = ventas.reduce((s, v) => s + v.ganancia, 0)

  return (
    <div className="ventas-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Historial de ventas</h1>
          <p className="page-subtitle">{loading ? 'Cargando...' : `${ventas.length} venta${ventas.length !== 1 ? 's' : ''} en el período`}</p>
        </div>
      </div>

      <div className="ventas-filters">
        <div className="form-group date-group"><label>Desde</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
        <div className="form-group date-group"><label>Hasta</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
      </div>

      {!loading && ventas.length > 0 && (
        <div className="ventas-summary">
          <div className="summary-item"><span>Total facturado</span><strong className="accent">${totalVentas.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</strong></div>
          <div className="summary-item"><span>Ganancia estimada</span><strong className="accent">${totalGanancia.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</strong></div>
        </div>
      )}

      {loading ? (
        <div className="ventas-loading"><div className="spinner" /><p>Cargando ventas...</p></div>
      ) : error ? (
        <div className="ventas-error">Error: {error}</div>
      ) : ventas.length === 0 ? (
        <div className="ventas-empty"><span>💰</span><p>No hay ventas en este período.</p></div>
      ) : (
        <div className="ventas-table-wrap">
          <table className="ventas-table">
            <thead>
              <tr><th>Fecha</th><th>Modelo</th><th>Talle</th><th>Pago</th><th>Precio</th><th>Ganancia</th></tr>
            </thead>
            <tbody>
              {ventas.map(v => (
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
