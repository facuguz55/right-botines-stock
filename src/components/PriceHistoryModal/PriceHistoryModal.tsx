import { useState, useEffect } from 'react'
import type { Modelo, HistorialPrecio } from '../../types'
import { Modal } from '../Modal/Modal'
import { fetchHistorialPrecios } from '../../services/historial_precios'
import './PriceHistoryModal.css'

interface PriceHistoryModalProps {
  modelo: Modelo | null
  onClose: () => void
}

export function PriceHistoryModal({ modelo, onClose }: PriceHistoryModalProps) {
  const [historial, setHistorial] = useState<HistorialPrecio[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!modelo) return
    setLoading(true)
    fetchHistorialPrecios(modelo.id).then(setHistorial).catch(() => setHistorial([])).finally(() => setLoading(false))
  }, [modelo])

  return (
    <Modal isOpen={!!modelo} onClose={onClose} title="Historial de precios" maxWidth="440px">
      {modelo && (
        <div className="price-history">
          <div className="price-history-product">
            <span className="ph-marca">{modelo.marca}</span>
            <span className="ph-modelo">{modelo.modelo}</span>
            <span className="ph-ref">{modelo.codigo_base}</span>
          </div>

          <div className="ph-current">
            <span>Precio actual</span>
            <strong>${modelo.precio_venta.toLocaleString('es-AR')}</strong>
          </div>

          {loading ? (
            <div className="ph-loading"><div className="spinner" /></div>
          ) : historial.length === 0 ? (
            <p className="ph-empty">No hay cambios de precio registrados todavía.</p>
          ) : (
            <div className="ph-list">
              <p className="ph-list-title">Cambios anteriores</p>
              {historial.map(h => (
                <div key={h.id} className="ph-row">
                  <div className="ph-row-prices">
                    <span className="ph-old">${h.precio_venta_anterior.toLocaleString('es-AR')}</span>
                    <span className="ph-arrow">→</span>
                    <span className="ph-new">${h.precio_venta_nuevo.toLocaleString('es-AR')}</span>
                    <span className={`ph-diff ${h.precio_venta_nuevo > h.precio_venta_anterior ? 'up' : 'down'}`}>
                      {h.precio_venta_nuevo > h.precio_venta_anterior ? '↑' : '↓'}
                      {Math.abs(((h.precio_venta_nuevo - h.precio_venta_anterior) / h.precio_venta_anterior) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <span className="ph-date">
                    {new Date(h.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}{' '}
                    {new Date(h.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
