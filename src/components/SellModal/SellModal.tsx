import { useState } from 'react'
import type { Modelo, ModeloTalle } from '../../types'
import { Modal } from '../Modal/Modal'
import './SellModal.css'

interface SellModalProps {
  modelo: Modelo | null
  onClose: () => void
  onAdd: (modelo: Modelo, talle: ModeloTalle, cantidad: number) => void
}

export function SellModal({ modelo, onClose, onAdd }: SellModalProps) {
  const [selectedTalleId, setSelectedTalleId] = useState<string>('')
  const [cantidad, setCantidad] = useState(1)
  const [error, setError] = useState<string | null>(null)

  if (!modelo) return null

  const disponibles = modelo.modelo_talles
  const selectedTalle = modelo.modelo_talles.find(t => t.id === selectedTalleId)
  const mainFoto = modelo.modelo_fotos[0]?.foto_url ?? null

  const handleSelectTalle = (id: string) => {
    setSelectedTalleId(id)
    setCantidad(1)
    setError(null)
  }

  const handleAdd = () => {
    if (!selectedTalle) return setError('Elegí un talle')
    if (cantidad > selectedTalle.cantidad) return setError('No hay stock suficiente')
    onAdd(modelo, selectedTalle, cantidad)
    setSelectedTalleId('')
    setCantidad(1)
    setError(null)
    onClose()
  }

  return (
    <Modal isOpen={!!modelo} onClose={onClose} title="Agregar al carrito" maxWidth="460px">
      <div className="sell-modal">
        <div className="sell-product-info">
          {mainFoto && <img src={mainFoto} alt={modelo.modelo} className="sell-thumb" />}
          <div>
            <p className="sell-marca">{modelo.marca}</p>
            <p className="sell-modelo">{modelo.modelo}</p>
            <p className="sell-sub">{modelo.categoria} · {modelo.gama}</p>
          </div>
        </div>

        {/* Selector de talle */}
        <div className="sell-section">
          <p className="sell-label">Elegí el talle</p>
          <div className="talle-selector">
            {disponibles.map(t => (
              <button
                key={t.id}
                type="button"
                className={`talle-btn${selectedTalleId === t.id ? ' active' : ''}`}
                onClick={() => handleSelectTalle(t.id)}
                disabled={t.cantidad <= 0}
              >
                <span className="talle-btn-arg">{t.talle_arg}</span>
                <span className="talle-btn-us">{t.talle_us} us</span>
                <span className="talle-btn-stock">×{t.cantidad}</span>
              </button>
            ))}
          </div>
        </div>

        {selectedTalle && (
          <div className="sell-section">
            <p className="sell-label">Cantidad</p>
            <div className="cantidad-stepper">
              <button type="button" className="cantidad-btn" onClick={() => setCantidad(c => Math.max(1, c - 1))}>−</button>
              <span className="cantidad-val">{cantidad}</span>
              <button
                type="button"
                className="cantidad-btn"
                onClick={() => setCantidad(c => Math.min(selectedTalle.cantidad, c + 1))}
              >
                +
              </button>
            </div>
          </div>
        )}

        {selectedTalle && (
          <div className="sell-stats">
            <div className="sell-stat">
              <span>Precio unitario</span>
              <span className="sell-stat-val">${modelo.precio_venta.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="sell-stat">
              <span>Subtotal</span>
              <span className="sell-stat-val accent">${(modelo.precio_venta * cantidad).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="sell-stat">
              <span>Stock talle {selectedTalle.talle_arg} después</span>
              <span className={`sell-stat-val ${selectedTalle.cantidad - cantidad <= 0 ? 'danger' : ''}`}>
                {selectedTalle.cantidad - cantidad} pares
              </span>
            </div>
          </div>
        )}

        {error && <p className="sell-error">{error}</p>}

        <div className="sell-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleAdd} disabled={!selectedTalleId}>
            + Agregar al carrito
          </button>
        </div>
      </div>
    </Modal>
  )
}
