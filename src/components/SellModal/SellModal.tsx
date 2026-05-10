import { useState } from 'react'
import type { Modelo, MedioPago } from '../../types'
import { Modal } from '../Modal/Modal'
import './SellModal.css'

interface SellModalProps {
  modelo: Modelo | null
  onClose: () => void
  onConfirm: (modelo: Modelo, talleId: string, medioPago: MedioPago) => Promise<void>
}

const MEDIOS: MedioPago[] = ['Efectivo', 'Transferencia', 'Tarjeta']

export function SellModal({ modelo, onClose, onConfirm }: SellModalProps) {
  const [selectedTalleId, setSelectedTalleId] = useState<string>('')
  const [medioPago, setMedioPago] = useState<MedioPago>('Efectivo')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!modelo) return null

  const disponibles = modelo.modelo_talles
  const selectedTalle = modelo.modelo_talles.find(t => t.id === selectedTalleId)
  const mainFoto = modelo.modelo_fotos[0]?.foto_url ?? null
  const esTarjeta = medioPago === 'Tarjeta'
  const recargo = esTarjeta ? modelo.precio_venta * 0.1 : 0
  const precioFinal = modelo.precio_venta + recargo
  const ganancia = precioFinal - modelo.precio_costo

  const handleConfirm = async () => {
    if (!selectedTalleId) return setError('Elegí un talle')
    setLoading(true)
    setError(null)
    try {
      await onConfirm(modelo, selectedTalleId, medioPago)
      setSelectedTalleId('')
      setMedioPago('Efectivo')
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={!!modelo} onClose={onClose} title="Registrar venta" maxWidth="460px">
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
                  onClick={() => setSelectedTalleId(t.id)}
                >
                  <span className="talle-btn-arg">{t.talle_arg}</span>
                  <span className="talle-btn-us">{t.talle_us} us</span>
                  <span className="talle-btn-stock">×{t.cantidad}</span>
                </button>
              ))}
            </div>
        </div>

        {/* Medio de pago */}
        <div className="sell-section">
          <p className="sell-label">Medio de pago</p>
          <div className="medio-pago-options">
            {MEDIOS.map(m => (
              <button key={m} type="button" className={`medio-btn${medioPago === m ? ' active' : ''}`} onClick={() => setMedioPago(m)}>
                {m === 'Efectivo' ? '💵 ' : m === 'Transferencia' ? '📲 ' : '💳 '}{m}
              </button>
            ))}
          </div>
        </div>

        {esTarjeta && (
          <div className="sell-recargo-notice">
            <span>+10% recargo tarjeta</span>
            <span className="recargo-amount">+${recargo.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
          </div>
        )}

        <div className="sell-stats">
          <div className="sell-stat">
            <span>Precio {esTarjeta ? 'con recargo' : 'de venta'}</span>
            <span className="sell-stat-val accent">${precioFinal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
          </div>
          <div className="sell-stat">
            <span>Ganancia estimada</span>
            <span className={`sell-stat-val ${ganancia >= 0 ? 'accent' : 'danger'}`}>${ganancia.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
          </div>
          {selectedTalle && (
            <div className="sell-stat">
              <span>Stock talle {selectedTalle.talle_arg} después</span>
              <span className={`sell-stat-val ${selectedTalle.cantidad - 1 <= 0 ? 'danger' : ''}`}>{selectedTalle.cantidad - 1} pares</span>
            </div>
          )}
        </div>

        {error && <p className="sell-error">{error}</p>}

        <div className="sell-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={loading || !selectedTalleId}>
            {loading ? 'Registrando...' : '✓ Confirmar venta'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
