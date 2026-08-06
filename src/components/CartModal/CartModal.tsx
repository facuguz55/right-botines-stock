import { useState } from 'react'
import type { CartItem, ClienteLocal, MedioPago } from '../../types'
import { Modal } from '../Modal/Modal'
import { filterClientes } from '../../hooks/useClientesLocales'
import { getPrecioUnitario } from '../../utils/precios'
import './CartModal.css'

interface CartModalProps {
  isOpen: boolean
  onClose: () => void
  items: CartItem[]
  descuentoPct: number | null
  clear: () => void
  clientes: ClienteLocal[]
  addCliente: (input: { nombre: string; telefono: string | null; email: string | null; notas: string | null }) => Promise<ClienteLocal>
  onSell: (items: CartItem[], medioPago: MedioPago, clienteId: string, descuentoPct: number | null) => Promise<void>
}

const MEDIOS: MedioPago[] = ['Efectivo', 'Transferencia', 'Tarjeta']

export function CartModal({ isOpen, onClose, items, descuentoPct, clear, clientes, addCliente, onSell }: CartModalProps) {
  const [step, setStep] = useState<'pago' | 'cliente'>('pago')
  const [medioPago, setMedioPago] = useState<MedioPago>('Efectivo')
  const [search, setSearch] = useState('')
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [notas, setNotas] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const esTarjeta = medioPago === 'Tarjeta'
  const subtotal = items.reduce((s, i) => s + getPrecioUnitario(i.modelo, i.usarPromocional, descuentoPct) * i.cantidad, 0)
  const recargo = esTarjeta ? subtotal * 0.1 : 0
  const total = subtotal + recargo
  const ganancia = items.reduce((s, i) => {
    const base = getPrecioUnitario(i.modelo, i.usarPromocional, descuentoPct)
    const precioFinal = esTarjeta ? base * 1.1 : base
    return s + (precioFinal - i.modelo.precio_costo) * i.cantidad
  }, 0)

  const resetCliente = () => {
    setSearch('')
    setSelectedClienteId(null)
    setShowNewForm(false)
    setNombre('')
    setTelefono('')
    setEmail('')
    setNotas('')
    setError(null)
  }

  const handleClose = () => {
    setStep('pago')
    resetCliente()
    onClose()
  }

  const handleConfirm = async () => {
    setError(null)
    let clienteId = selectedClienteId

    if (!clienteId) {
      if (!nombre.trim()) return setError('Ingresá el nombre del cliente')
      if (!telefono.trim() && !email.trim()) return setError('Ingresá al menos un teléfono o un email')
    }

    setLoading(true)
    try {
      if (!clienteId) {
        const nuevo = await addCliente({
          nombre: nombre.trim(),
          telefono: telefono.trim() || null,
          email: email.trim() || null,
          notas: notas.trim() || null,
        })
        clienteId = nuevo.id
      }
      await onSell(items, medioPago, clienteId, descuentoPct)
      clear()
      handleClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const resultados = filterClientes(clientes, search)

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={step === 'pago' ? 'Medio de pago' : 'Datos del cliente'} maxWidth="520px">
      {step === 'pago' && (
        <div className="cart-modal">
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
            <div className="sell-stat"><span>Subtotal</span><span className="sell-stat-val">${subtotal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span></div>
            <div className="sell-stat"><span>Total</span><span className="sell-stat-val accent">${total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span></div>
            <div className="sell-stat"><span>Ganancia estimada</span><span className={`sell-stat-val ${ganancia >= 0 ? 'accent' : 'danger'}`}>${ganancia.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span></div>
          </div>

          <div className="sell-actions">
            <button className="btn btn-secondary" onClick={handleClose}>Cerrar</button>
            <button className="btn btn-primary" onClick={() => setStep('cliente')}>
              Continuar →
            </button>
          </div>
        </div>
      )}

      {step === 'cliente' && (
        <div className="cart-modal">
          {!showNewForm ? (
            <>
              <div className="sell-section">
                <p className="sell-label">Buscar cliente existente</p>
                <input
                  type="text"
                  className="cliente-search"
                  placeholder="Nombre o teléfono..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setSelectedClienteId(null) }}
                  autoFocus
                />
              </div>

              {search.trim() && (
                <div className="cliente-results">
                  {resultados.length === 0 ? (
                    <p className="cart-empty">No se encontraron clientes.</p>
                  ) : (
                    resultados.slice(0, 6).map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className={`cliente-result${selectedClienteId === c.id ? ' active' : ''}`}
                        onClick={() => setSelectedClienteId(c.id)}
                      >
                        <span className="cliente-result-nombre">{c.nombre}</span>
                        <span className="cliente-result-sub">{c.telefono || c.email || 'Sin contacto'}</span>
                      </button>
                    ))
                  )}
                </div>
              )}

              <button type="button" className="cliente-new-toggle" onClick={() => setShowNewForm(true)}>
                + Cargar cliente nuevo
              </button>
            </>
          ) : (
            <>
              <div className="sell-section">
                <p className="sell-label">Nombre *</p>
                <input type="text" className="cliente-input" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre y apellido" autoFocus />
              </div>
              <div className="sell-section">
                <p className="sell-label">Teléfono (WhatsApp)</p>
                <input type="tel" className="cliente-input" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="11 2345 6789" />
              </div>
              <div className="sell-section">
                <p className="sell-label">Email</p>
                <input type="email" className="cliente-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="cliente@mail.com" />
              </div>
              <div className="sell-section">
                <p className="sell-label">Notas</p>
                <input type="text" className="cliente-input" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional" />
              </div>
              <button type="button" className="cliente-new-toggle" onClick={() => setShowNewForm(false)}>
                ← Buscar cliente existente
              </button>
            </>
          )}

          {error && <p className="sell-error">{error}</p>}

          <div className="sell-actions">
            <button className="btn btn-secondary" onClick={() => setStep('pago')} disabled={loading}>← Volver</button>
            <button
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={loading || (!selectedClienteId && !showNewForm)}
            >
              {loading ? 'Registrando...' : '✓ Confirmar venta'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
