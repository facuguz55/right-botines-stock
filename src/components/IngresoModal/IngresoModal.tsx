import { useState } from 'react'
import type { Modelo } from '../../types'
import { Modal } from '../Modal/Modal'
import './IngresoModal.css'

interface IngresoModalProps {
  modelo: Modelo | null
  onClose: () => void
  onConfirm: (
    modeloId: string,
    talleArg: number,
    talleUs: number,
    cantidadActual: number,
    cantidad: number,
    costoTotal: number,
    talleId?: string
  ) => Promise<void>
}

export function IngresoModal({ modelo, onClose, onConfirm }: IngresoModalProps) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [selectedTalleId, setSelectedTalleId] = useState<string>('')
  const [newTalleArg, setNewTalleArg] = useState<number | ''>('')
  const [newTalleUs, setNewTalleUs] = useState<number | ''>('')
  const [cantidad, setCantidad] = useState('1')
  const [costoTotal, setCostoTotal] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const TALLES_ARG = [35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46]
  const ARG_TO_US: Record<number, number> = {
    35: 3, 36: 4, 37: 5, 38: 6, 39: 6.5, 40: 7,
    41: 8, 42: 8.5, 43: 9.5, 44: 10, 45: 11, 46: 12,
  }

  if (!modelo) return null

  const selectedTalle = modelo.modelo_talles.find(t => t.id === selectedTalleId)

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const cant = parseInt(cantidad)
    if (!cant || cant < 1) return setError('La cantidad debe ser al menos 1')

    if (mode === 'existing' && !selectedTalleId) return setError('Elegí un talle')
    if (mode === 'new' && newTalleArg === '') return setError('Elegí un talle ARG')

    setLoading(true)
    try {
      if (mode === 'existing' && selectedTalle) {
        await onConfirm(
          modelo.id, selectedTalle.talle_arg, selectedTalle.talle_us,
          selectedTalle.cantidad, cant, parseFloat(costoTotal) || 0, selectedTalle.id
        )
      } else {
        await onConfirm(
          modelo.id, newTalleArg as number, newTalleUs as number,
          0, cant, parseFloat(costoTotal) || 0
        )
      }
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const stockDespues = mode === 'existing' && selectedTalle
    ? selectedTalle.cantidad + (parseInt(cantidad) || 0)
    : parseInt(cantidad) || 0

  return (
    <Modal isOpen={!!modelo} onClose={onClose} title="Ingresar mercadería" maxWidth="440px">
      <form className="ingreso-modal" onSubmit={handleConfirm}>
        <div className="ingreso-modelo-info">
          <p className="ingreso-nombre">{modelo.marca} — {modelo.modelo}</p>
          <p className="ingreso-sub">{modelo.categoria} · {modelo.gama}</p>
        </div>

        <div className="ingreso-mode-tabs">
          <button type="button" className={`mode-tab${mode === 'existing' ? ' active' : ''}`} onClick={() => setMode('existing')}>
            Talle existente
          </button>
          <button type="button" className={`mode-tab${mode === 'new' ? ' active' : ''}`} onClick={() => setMode('new')}>
            Talle nuevo
          </button>
        </div>

        {mode === 'existing' ? (
          <div className="form-group">
            <label>Talle</label>
            {modelo.modelo_talles.length === 0 ? (
              <p className="no-talles">No hay talles cargados. Usá "Talle nuevo".</p>
            ) : (
              <div className="talle-selector-grid">
                {modelo.modelo_talles.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    className={`talle-sel-btn${selectedTalleId === t.id ? ' active' : ''}`}
                    onClick={() => setSelectedTalleId(t.id)}
                  >
                    <strong>{t.talle_arg}</strong>
                    <span>{t.talle_us}us · {t.cantidad}p</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="form-row">
            <div className="form-group">
              <label>Talle ARG *</label>
              <div className="talle-arg-grid">
                {TALLES_ARG.map(t => (
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
            <div className="form-group form-group--talle-us">
              <label>Talle US</label>
              <input
                type="text"
                readOnly
                value={newTalleUs !== '' ? `${newTalleUs} US` : '—'}
                className="talle-us-readonly"
              />
            </div>
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label>Cantidad a ingresar *</label>
            <input type="number" min="1" value={cantidad} onChange={e => setCantidad(e.target.value)} autoFocus />
          </div>
          <div className="form-group">
            <label>Costo del lote (ARS)</label>
            <input type="number" min="0" step="0.01" placeholder="Opcional" value={costoTotal} onChange={e => setCostoTotal(e.target.value)} />
          </div>
        </div>

        <div className="ingreso-preview">
          <span>Stock después del ingreso:</span>
          <strong>{stockDespues} pares</strong>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Guardando...' : '+ Ingresar stock'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
