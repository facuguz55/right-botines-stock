import { useState, useMemo } from 'react'
import { Clock } from 'lucide-react'
import { useFichajes } from '../../hooks/useFichajes'
import './MisHoras.css'

function toISO(d: Date) { return d.toISOString().split('T')[0] }

function getPreset(preset: string): { start: string; end: string } {
  const now = new Date()
  const today = toISO(now)
  switch (preset) {
    case 'hoy': return { start: today, end: today }
    case 'semana': { const d = new Date(now); d.setDate(d.getDate() - 6); return { start: toISO(d), end: today } }
    case 'mes': return { start: toISO(new Date(now.getFullYear(), now.getMonth(), 1)), end: today }
    case 'mes_ant': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      return { start: toISO(start), end: toISO(end) }
    }
    default: return { start: toISO(new Date(now.getFullYear(), now.getMonth(), 1)), end: today }
  }
}

const PRESETS = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes', label: 'Este mes' },
  { key: 'mes_ant', label: 'Mes anterior' },
]

function fmtHoras(mins: number): string {
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

interface MisHorasProps {
  empleadoId: string | null
}

// Reporte de horas propio del empleado — a diferencia de la versión del
// dueño en Empleados.tsx, nunca muestra importes: eso queda detrás del PIN,
// y este reporte no lo pide. Solo las horas de esta persona, de nadie más.
export function MisHoras({ empleadoId }: MisHorasProps) {
  const initial = getPreset('mes')
  const [startDate, setStartDate] = useState(initial.start)
  const [endDate, setEndDate] = useState(initial.end)
  const [activePreset, setActivePreset] = useState('mes')
  const { fichajes, loading } = useFichajes(startDate, endDate)

  const misFichajes = useMemo(
    () => fichajes.filter(f => f.empleado_id === empleadoId),
    [fichajes, empleadoId]
  )

  const totalMins = misFichajes.reduce((s, f) => {
    const entrada = new Date(f.hora_entrada).getTime()
    const salida = f.hora_salida ? new Date(f.hora_salida).getTime() : Date.now()
    return s + Math.max(0, Math.round((salida - entrada) / 60000))
  }, 0)

  function applyPreset(key: string) {
    const { start, end } = getPreset(key)
    setStartDate(start); setEndDate(end); setActivePreset(key)
  }

  return (
    <div className="mis-horas-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Mis horas</h1>
          <p className="page-subtitle">{loading ? 'Cargando...' : `${fmtHoras(totalMins)} en el período`}</p>
        </div>
      </div>

      <section className="config-section">
        <div className="config-section-header">
          <Clock size={16} />
          <h2 className="config-section-title">Fichajes</h2>
        </div>

        <div className="ventas-presets">
          {PRESETS.map(p => (
            <button key={p.key} className={`preset-btn${activePreset === p.key ? ' active' : ''}`} onClick={() => applyPreset(p.key)}>
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

        {loading ? (
          <div className="ventas-loading"><div className="spinner" /><p>Cargando...</p></div>
        ) : misFichajes.length === 0 ? (
          <div className="ventas-empty"><span>🕐</span><p>No hay fichajes tuyos en ese rango.</p></div>
        ) : (
          <div className="ventas-table-wrap">
            <table className="ventas-table">
              <thead><tr><th>Entrada</th><th>Salida</th><th>Horas</th></tr></thead>
              <tbody>
                {misFichajes.map(f => {
                  const entrada = new Date(f.hora_entrada).getTime()
                  const salida = f.hora_salida ? new Date(f.hora_salida).getTime() : Date.now()
                  const mins = Math.max(0, Math.round((salida - entrada) / 60000))
                  return (
                    <tr key={f.id}>
                      <td className="date-cell">
                        {new Date(f.hora_entrada).toLocaleDateString('es-AR')}
                        <span className="time-cell">{new Date(f.hora_entrada).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td>
                        {f.hora_salida ? (
                          <span className="date-cell">
                            {new Date(f.hora_salida).toLocaleDateString('es-AR')}
                            <span className="time-cell">{new Date(f.hora_salida).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                          </span>
                        ) : (
                          <span className="empleado-badge en-curso">En curso</span>
                        )}
                      </td>
                      <td>{fmtHoras(mins)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
