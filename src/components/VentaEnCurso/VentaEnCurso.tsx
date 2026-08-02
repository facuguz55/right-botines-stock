import { useState } from 'react'
import type { CartItem } from '../../types'
import { Modal } from '../Modal/Modal'
import './VentaEnCurso.css'

interface VentaEnCursoProps {
  items: CartItem[]
  subtotal: number
  onAddMore: () => void
  onStartPayment: () => void
  onCancelSale: () => void
}

export function VentaEnCurso({ items, subtotal, onAddMore, onStartPayment, onCancelSale }: VentaEnCursoProps) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  if (items.length === 0) return null

  return (
    <>
      <div className="venta-en-curso">
        <div className="venta-en-curso-header">
          <span>Venta en curso</span>
          <span className="venta-en-curso-total">${subtotal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
        </div>

        <div className="venta-en-curso-items">
          {items.map((item, idx) => (
            <div key={`${item.modelo.id}-${item.talleId}-${idx}`} className="venta-en-curso-item">
              <span className="venta-en-curso-item-name">{item.modelo.marca} {item.modelo.modelo}</span>
              <span className="venta-en-curso-item-detail">
                talle {item.talleArg} × {item.cantidad}
              </span>
              <span className="venta-en-curso-item-precio">
                ${(item.modelo.precio_venta * item.cantidad).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </span>
            </div>
          ))}
        </div>

        <div className="venta-en-curso-actions">
          <button className="btn btn-secondary" onClick={onAddMore}>+ Agregar producto</button>
          <button className="btn btn-danger" onClick={() => setShowCancelConfirm(true)}>Cancelar venta</button>
          <button className="btn btn-primary" onClick={onStartPayment}>Iniciar el pago →</button>
        </div>
      </div>

      <Modal isOpen={showCancelConfirm} onClose={() => setShowCancelConfirm(false)} title="Cancelar venta" maxWidth="380px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            ¿Seguro que querés cancelar esta venta? Se van a quitar los <strong style={{ color: 'var(--text-primary)' }}>{items.length}</strong> producto{items.length !== 1 ? 's' : ''} agregados.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.75rem' }}>
            <button className="btn btn-secondary" onClick={() => setShowCancelConfirm(false)}>Volver</button>
            <button className="btn btn-danger" onClick={() => { setShowCancelConfirm(false); onCancelSale() }}>Sí, cancelar venta</button>
          </div>
        </div>
      </Modal>
    </>
  )
}
