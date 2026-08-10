import { useState } from 'react'
import type { CartItem } from '../../types'
import { Modal } from '../Modal/Modal'
import { getPrecioReal } from '../../utils/precios'
import './VentaEnCurso.css'

interface VentaEnCursoProps {
  items: CartItem[]
  subtotal: number
  onAddMore: () => void
  onStartPayment: () => void
  onCancelSale: () => void
  puedeVender: boolean
  motivoBloqueoVenta: string | null
}

export function VentaEnCurso({ items, subtotal, onAddMore, onStartPayment, onCancelSale, puedeVender, motivoBloqueoVenta }: VentaEnCursoProps) {
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
          {items.map((item, idx) => {
            const precioUnit = getPrecioReal(item.modelo)
            return (
              <div key={`${item.modelo.id}-${item.talleId}-${idx}`} className="venta-en-curso-item">
                <div className="venta-en-curso-item-row">
                  <span className="venta-en-curso-item-name">{item.modelo.marca} {item.modelo.modelo}</span>
                  <span className="venta-en-curso-item-detail">
                    talle {item.talleArg} × {item.cantidad}
                  </span>
                  <span className="venta-en-curso-item-precio">
                    ${(precioUnit * item.cantidad).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="venta-en-curso-actions">
          <button className="btn btn-secondary" onClick={onAddMore}>+ Agregar producto</button>
          <button className="btn btn-danger" onClick={() => setShowCancelConfirm(true)}>Cancelar venta</button>
          <button
            className="btn btn-primary"
            onClick={onStartPayment}
            disabled={!puedeVender}
            title={puedeVender ? undefined : motivoBloqueoVenta ?? undefined}
          >
            Iniciar el pago →
          </button>
        </div>
        {!puedeVender && motivoBloqueoVenta && (
          <p className="venta-en-curso-bloqueo">⚠ {motivoBloqueoVenta}</p>
        )}
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
