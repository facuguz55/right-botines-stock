// @ts-nocheck
import { useState } from 'react'
import type { Producto } from '../../types'
import { Modal } from '../Modal/Modal'
import './IngresoForm.css'

interface IngresoFormProps {
  producto: Producto | null
  onClose: () => void
  onConfirm: (productoId: string, cantidad: number, costoTotal: number) => Promise<void>
}

export function IngresoForm({ producto, onClose, onConfirm }: IngresoFormProps) {
  const [cantidad, setCantidad] = useState('1')
  const [costoTotal, setCostoTotal] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!producto) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const cant = parseInt(cantidad)
    if (!cant || cant < 1) return setError('La cantidad debe ser al menos 1')

    setLoading(true)
    try {
      await onConfirm(producto.id, cant, parseFloat(costoTotal) || 0)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={!!producto}
      onClose={onClose}
      title="Ingresar mercadería"
      maxWidth="420px"
    >
      <div className="ingreso-form-wrap">
        <div className="ingreso-producto-info">
          <p className="ingreso-modelo">{producto.marca} — {producto.modelo}</p>
          <p className="ingreso-talle">
            Talle {producto.talle_us}us / {producto.talle_arg}arg · Stock actual: {producto.cantidad} par{producto.cantidad !== 1 ? 'es' : ''}
          </p>
        </div>

        <form className="ingreso-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Cantidad de pares a ingresar *</label>
            <input
              type="number"
              min="1"
              value={cantidad}
              onChange={e => setCantidad(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Costo total del lote (ARS)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Opcional"
              value={costoTotal}
              onChange={e => setCostoTotal(e.target.value)}
            />
          </div>

          <div className="ingreso-preview">
            <span>Stock después del ingreso:</span>
            <strong>{producto.cantidad + (parseInt(cantidad) || 0)} pares</strong>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Guardando...' : '+ Ingresar stock'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
