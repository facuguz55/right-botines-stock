import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { Modelo } from '../../types'
import './IngresoPage.css'

const TALLES_ARG = [35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46]
const ARG_TO_US: Record<number, number> = {
  35: 3, 36: 4, 37: 5, 38: 6, 39: 6.5, 40: 7,
  41: 8, 42: 8.5, 43: 9.5, 44: 10, 45: 11, 46: 12,
}

interface TalleChange {
  talleId: string
  talleArg: number
  talleUs: number
  cantidadActual: number
  delta: number
}

interface NuevoTalle {
  talleArg: number
  talleUs: number
  cantidad: number
}

interface IngresoPageProps {
  modelo: Modelo
  onCancel: () => void
  onSave: (changes: TalleChange[], newTalle: NuevoTalle | null, costoTotal: number) => Promise<void>
}

export function IngresoPage({ modelo, onCancel, onSave }: IngresoPageProps) {
  const [deltas, setDeltas] = useState<Record<string, number>>(
    () => Object.fromEntries(modelo.modelo_talles.map(t => [t.id, 0]))
  )
  const [newTalleArg, setNewTalleArg] = useState<number | ''>('')
  const [newTalleUs, setNewTalleUs] = useState<number | ''>('')
  const [newCantidad, setNewCantidad] = useState(0)
  const [costoTotal, setCostoTotal] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setDelta = (id: string, value: number) =>
    setDeltas(prev => ({ ...prev, [id]: Math.max(0, value) }))

  const hasChanges =
    Object.values(deltas).some(d => d > 0) ||
    (newTalleArg !== '' && newCantidad > 0)

  const tallesDisponibles = TALLES_ARG.filter(
    t => !modelo.modelo_talles.some(mt => mt.talle_arg === t)
  )

  const handleSave = async () => {
    if (!hasChanges) return setError('No hay cambios para guardar.')
    setError(null)
    setLoading(true)

    const changes: TalleChange[] = modelo.modelo_talles
      .filter(t => (deltas[t.id] ?? 0) > 0)
      .map(t => ({
        talleId: t.id,
        talleArg: t.talle_arg,
        talleUs: t.talle_us,
        cantidadActual: t.cantidad,
        delta: deltas[t.id],
      }))

    const newTalle: NuevoTalle | null =
      newTalleArg !== '' && newCantidad > 0
        ? { talleArg: newTalleArg, talleUs: newTalleUs as number, cantidad: newCantidad }
        : null

    try {
      await onSave(changes, newTalle, parseFloat(costoTotal) || 0)
    } catch (e) {
      setError((e as Error).message)
      setLoading(false)
    }
  }

  return (
    <div className="ingreso-page">
      <div className="ingreso-page-header">
        <button className="ingreso-back-btn" onClick={onCancel} disabled={loading}>
          <ArrowLeft size={16} />
          Volver al stock
        </button>
        <div className="ingreso-page-meta">
          <h1 className="ingreso-page-nombre">{modelo.marca} — {modelo.modelo}</h1>
          <p className="ingreso-page-sub">{modelo.categoria} · {modelo.gama}</p>
        </div>
      </div>

      <div className="ingreso-page-body">

        {/* Talles existentes */}
        <section className="ingreso-section">
          <h2 className="ingreso-section-title">Talles existentes</h2>
          {modelo.modelo_talles.length === 0 ? (
            <p className="ingreso-empty">No hay talles cargados. Usá la sección de abajo para agregar uno.</p>
          ) : (
            <div className="ingreso-table-wrapper">
              <table className="ingreso-table">
                <thead>
                  <tr>
                    <th>Talle ARG</th>
                    <th>Talle US</th>
                    <th>Stock actual</th>
                    <th>A ingresar</th>
                    <th>Stock resultante</th>
                  </tr>
                </thead>
                <tbody>
                  {modelo.modelo_talles.map(t => {
                    const delta = deltas[t.id] ?? 0
                    return (
                      <tr key={t.id}>
                        <td className="td-center td-bold">{t.talle_arg}</td>
                        <td className="td-center td-muted">{t.talle_us} US</td>
                        <td className="td-center">{t.cantidad}</td>
                        <td className="td-center">
                          <div className="delta-control">
                            <button
                              type="button"
                              className="delta-btn"
                              onClick={() => setDelta(t.id, delta - 1)}
                              disabled={delta <= 0}
                            >–</button>
                            <span className={`delta-value${delta > 0 ? ' delta-value--active' : ''}`}>
                              {delta > 0 ? `+${delta}` : delta}
                            </span>
                            <button
                              type="button"
                              className="delta-btn"
                              onClick={() => setDelta(t.id, delta + 1)}
                            >+</button>
                          </div>
                        </td>
                        <td className={`td-center td-bold${delta > 0 ? ' td-resultante--changed' : ''}`}>
                          {t.cantidad + delta}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Talle nuevo */}
        <section className="ingreso-section">
          <h2 className="ingreso-section-title">+ Agregar talle nuevo</h2>
          {tallesDisponibles.length === 0 ? (
            <p className="ingreso-empty">Todos los talles del rango están cargados para este modelo.</p>
          ) : (
            <div className="ingreso-new-talle">
              <div className="form-group">
                <label>Talle ARG</label>
                <div className="talle-arg-grid">
                  {tallesDisponibles.map(t => (
                    <button
                      key={t}
                      type="button"
                      className={`talle-arg-btn${newTalleArg === t ? ' active' : ''}`}
                      onClick={() => { setNewTalleArg(t); setNewTalleUs(ARG_TO_US[t]) }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ingreso-new-talle-row">
                <div className="form-group">
                  <label>Talle US</label>
                  <input
                    type="text"
                    readOnly
                    value={newTalleUs !== '' ? `${newTalleUs} US` : '—'}
                    className="talle-us-readonly"
                  />
                </div>
                <div className="form-group">
                  <label>Cantidad</label>
                  <input
                    type="number"
                    min="0"
                    value={newCantidad || ''}
                    placeholder="0"
                    onChange={e => setNewCantidad(Math.max(0, parseInt(e.target.value) || 0))}
                    disabled={newTalleArg === ''}
                  />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Costo del lote */}
        <section className="ingreso-section ingreso-section--costo">
          <div className="form-group">
            <label>
              Costo del lote (ARS)
              <span className="label-optional"> — opcional</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              value={costoTotal}
              onChange={e => setCostoTotal(e.target.value)}
              className="costo-input"
            />
          </div>
        </section>

        {error && <p className="form-error">{error}</p>}

        <div className="ingreso-page-actions">
          <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={loading || !hasChanges}
          >
            {loading ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>

      </div>
    </div>
  )
}
