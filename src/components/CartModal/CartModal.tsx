import { useState } from 'react'
import type { CartItem, ClienteLocal, MedioPago, RecargoTarjeta } from '../../types'
import { Modal } from '../Modal/Modal'
import { filterClientes } from '../../hooks/useClientesLocales'
import { getPrecioItem, getRecargoPct, getPrecioConRecargo, tarjetasDisponibles, cuotasDisponibles } from '../../utils/precios'
import './CartModal.css'

interface CartModalProps {
  isOpen: boolean
  onClose: () => void
  items: CartItem[]
  recargos: RecargoTarjeta[]
  clear: () => void
  clientes: ClienteLocal[]
  addCliente: (input: { nombre: string; telefono: string | null; email: string | null; dni: string | null; notas: string | null }) => Promise<ClienteLocal>
  onSell: (
    items: CartItem[], medioPago: MedioPago, clienteId: string, tarjeta: string | null, cuotas: number | null,
    recargoPct: number, montoEfectivo: number | null, montoTransferencia: number | null,
    montoRecibidoEfectivo: number | null, vueltoEfectivo: number | null,
  ) => Promise<void>
}

const MEDIOS: MedioPago[] = ['Efectivo', 'Transferencia', 'Tarjeta', 'Mixto']

export function CartModal({ isOpen, onClose, items, recargos, clear, clientes, addCliente, onSell }: CartModalProps) {
  const [step, setStep] = useState<'pago' | 'cliente'>('pago')
  // Sin default: si nadie toca nada acá, no hay forma de confirmar la venta
  // sin elegir a propósito. Antes arrancaba en 'Efectivo' preseleccionado —
  // una venta por transferencia que el vendedor se olvidaba de cambiar
  // quedaba cargada como efectivo, inflando lo que la caja "espera" tener
  // sin que haya entrado esa plata físicamente al cajón.
  const [medioPago, setMedioPago] = useState<MedioPago | null>(null)
  const [tarjeta, setTarjeta] = useState<string | null>(null)
  const [cuotas, setCuotas] = useState<number | null>(null)
  const [montoEfectivoMixto, setMontoEfectivoMixto] = useState('')
  const [montoRecibidoEfectivo, setMontoRecibidoEfectivo] = useState('')
  const [search, setSearch] = useState('')
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [dni, setDni] = useState('')
  const [notas, setNotas] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const esTarjeta = medioPago === 'Tarjeta'
  const esMixto = medioPago === 'Mixto'
  const hayRecargosConfigurados = recargos.some(r => r.activo)
  const tarjetas = tarjetasDisponibles(recargos)
  const cuotasParaTarjeta = tarjeta ? cuotasDisponibles(recargos, tarjeta) : []
  // Mientras no haya ningún recargo cargado, se usa el 10% fijo de siempre.
  // En cuanto haya al menos uno, hace falta elegir tarjeta+cuotas para saber el %.
  const faltaElegirRecargo = esTarjeta && hayRecargosConfigurados && (!tarjeta || !cuotas)
  const recargoPct = getRecargoPct(recargos, tarjeta, cuotas)

  const subtotal = items.reduce((s, i) => s + getPrecioItem(i) * i.cantidad, 0)
  const montoEfectivoMixtoNum = montoEfectivoMixto ? Number(montoEfectivoMixto) : 0
  const montoTransferenciaMixtoNum = Math.max(0, subtotal - montoEfectivoMixtoNum)
  const mixtoInvalido = esMixto && (montoEfectivoMixto === '' || montoEfectivoMixtoNum < 0 || montoEfectivoMixtoNum > subtotal)
  const total = esTarjeta && !faltaElegirRecargo
    ? items.reduce((s, i) => s + getPrecioConRecargo(i.modelo, tarjeta, cuotas, recargoPct, i.precioManual) * i.cantidad, 0)
    : subtotal
  const recargo = total - subtotal
  // % efectivo mostrado junto al monto: puede diferir un poco del % nominal
  // configurado cuando el precio viene del real de TiendaNube (Crédito 3 cuotas).
  const recargoPctMostrado = subtotal > 0 ? (recargo / subtotal) * 100 : recargoPct

  const esEfectivo = medioPago === 'Efectivo'
  // Base sobre la que se calcula el vuelto: el total de la venta si es
  // 100% efectivo, o solo la porción en efectivo si es un pago mixto.
  const baseEfectivo = esEfectivo ? total : esMixto ? montoEfectivoMixtoNum : 0
  const montoRecibidoEfectivoNum = montoRecibidoEfectivo ? Number(montoRecibidoEfectivo) : 0
  const hayRecibido = montoRecibidoEfectivo !== ''
  const vuelto = hayRecibido ? montoRecibidoEfectivoNum - baseEfectivo : 0
  const recibidoInvalido = hayRecibido && montoRecibidoEfectivoNum < baseEfectivo

  const ganancia = items.reduce((s, i) => {
    const precioFinal = esTarjeta && !faltaElegirRecargo ? getPrecioConRecargo(i.modelo, tarjeta, cuotas, recargoPct, i.precioManual) : getPrecioItem(i)
    return s + (precioFinal - i.modelo.precio_costo) * i.cantidad
  }, 0)

  const resetCliente = () => {
    setSearch('')
    setSelectedClienteId(null)
    setShowNewForm(false)
    setNombre('')
    setTelefono('')
    setEmail('')
    setDni('')
    setNotas('')
    setError(null)
  }

  const handleClose = () => {
    setStep('pago')
    setMedioPago(null)
    setTarjeta(null)
    setCuotas(null)
    setMontoEfectivoMixto('')
    setMontoRecibidoEfectivo('')
    resetCliente()
    onClose()
  }

  const handleMedioPago = (m: MedioPago) => {
    setMedioPago(m)
    setTarjeta(null)
    setCuotas(null)
    setMontoEfectivoMixto('')
    setMontoRecibidoEfectivo('')
  }

  const handleConfirm = async () => {
    setError(null)
    if (!medioPago) return setError('Elegí el medio de pago')
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
          dni: dni.trim() || null,
          notas: notas.trim() || null,
        })
        clienteId = nuevo.id
      }
      await onSell(
        items, medioPago, clienteId,
        esTarjeta && !faltaElegirRecargo ? tarjeta : null,
        esTarjeta && !faltaElegirRecargo ? cuotas : null,
        recargoPct,
        esMixto ? montoEfectivoMixtoNum : null,
        esMixto ? montoTransferenciaMixtoNum : null,
        (esEfectivo || esMixto) && hayRecibido ? montoRecibidoEfectivoNum : null,
        (esEfectivo || esMixto) && hayRecibido ? vuelto : null,
      )
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
                <button key={m} type="button" className={`medio-btn${medioPago === m ? ' active' : ''}`} onClick={() => handleMedioPago(m)}>
                  {m === 'Efectivo' ? '💵 ' : m === 'Transferencia' ? '📲 ' : m === 'Tarjeta' ? '💳 ' : '🔀 '}{m}
                </button>
              ))}
            </div>
          </div>

          {esTarjeta && hayRecargosConfigurados && (
            <div className="sell-section">
              <p className="sell-label">Tarjeta</p>
              <div className="medio-pago-options">
                {tarjetas.map(t => (
                  <button key={t} type="button" className={`medio-btn${tarjeta === t ? ' active' : ''}`}
                    onClick={() => { setTarjeta(t); setCuotas(null) }}>
                    {t}
                  </button>
                ))}
              </div>
              {tarjeta && (
                <>
                  <p className="sell-label" style={{ marginTop: '.75rem' }}>Cuotas</p>
                  <div className="medio-pago-options">
                    {cuotasParaTarjeta.map(c => (
                      <button key={c} type="button" className={`medio-btn${cuotas === c ? ' active' : ''}`} onClick={() => setCuotas(c)}>
                        {c === 1 ? '1 pago' : `${c} cuotas`}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {esTarjeta && !faltaElegirRecargo && (
            <div className="sell-recargo-notice">
              <span>+{recargoPctMostrado.toFixed(2)}% recargo tarjeta</span>
              <span className="recargo-amount">+${recargo.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
            </div>
          )}

          {esMixto && (
            <div className="sell-section">
              <p className="sell-label">Monto en efectivo</p>
              <div className="config-input-wrap">
                <input
                  type="number" className="config-input" min={0} max={subtotal}
                  value={montoEfectivoMixto} onChange={e => { setMontoEfectivoMixto(e.target.value); setMontoRecibidoEfectivo('') }}
                  placeholder="0" autoFocus
                />
                <span className="config-input-suffix">ARS</span>
              </div>
              <p className="sell-mixto-resto">
                Resto en transferencia: <strong>${montoTransferenciaMixtoNum.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</strong>
              </p>
              {mixtoInvalido && montoEfectivoMixto !== '' && (
                <p className="sell-error">El monto en efectivo no puede superar el total.</p>
              )}
            </div>
          )}

          {(esEfectivo || (esMixto && montoEfectivoMixtoNum > 0)) && (
            <div className="sell-section">
              <p className="sell-label">¿Con cuánto paga el cliente? (opcional)</p>
              <div className="config-input-wrap">
                <input
                  type="number" className="config-input" min={baseEfectivo}
                  value={montoRecibidoEfectivo} onChange={e => setMontoRecibidoEfectivo(e.target.value)}
                  placeholder={`${baseEfectivo.toLocaleString('es-AR', { maximumFractionDigits: 0 })} (exacto)`}
                />
                <span className="config-input-suffix">ARS</span>
              </div>
              {recibidoInvalido ? (
                <p className="sell-error">El monto no puede ser menor a ${baseEfectivo.toLocaleString('es-AR', { maximumFractionDigits: 0 })}.</p>
              ) : hayRecibido && vuelto > 0 ? (
                <p className="sell-mixto-resto">
                  Vuelto a entregar: <strong>${vuelto.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</strong>
                </p>
              ) : null}
            </div>
          )}

          <div className="sell-stats">
            <div className="sell-stat"><span>Subtotal</span><span className="sell-stat-val">${subtotal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span></div>
            <div className="sell-stat"><span>Total</span><span className="sell-stat-val accent">${total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span></div>
            <div className="sell-stat"><span>Ganancia estimada</span><span className={`sell-stat-val ${ganancia >= 0 ? 'accent' : 'danger'}`}>${ganancia.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span></div>
          </div>

          {faltaElegirRecargo && (
            <p style={{ fontSize: '.8125rem', color: 'var(--text-muted)' }}>Elegí tarjeta y cuotas para continuar.</p>
          )}

          <div className="sell-actions">
            <button className="btn btn-secondary" onClick={handleClose}>Cerrar</button>
            <button className="btn btn-primary" onClick={() => setStep('cliente')} disabled={!medioPago || faltaElegirRecargo || mixtoInvalido || recibidoInvalido}>
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
                <p className="sell-label">DNI (opcional)</p>
                <input type="text" inputMode="numeric" className="cliente-input" value={dni} onChange={e => setDni(e.target.value)} placeholder="12345678" />
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
