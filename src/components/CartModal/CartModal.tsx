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
    recargoPct: number, montoEfectivo: number | null, montoTransferencia: number | null, montoTarjeta: number | null,
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
  // Mixto: tres montos libres — no solo efectivo+transferencia. Cada uno
  // puede quedar en 0/vacío; tienen que sumar el subtotal entre los tres
  // (el recargo de la porción tarjeta se agrega aparte, no cuenta para esa suma).
  const [montoEfectivoMixto, setMontoEfectivoMixto] = useState('')
  const [montoTransferenciaMixto, setMontoTransferenciaMixto] = useState('')
  const [montoTarjetaMixto, setMontoTarjetaMixto] = useState('')
  const [montoRecibidoEfectivo, setMontoRecibidoEfectivo] = useState('')
  // Ajuste manual del total en efectivo (ej. redondear para abajo o un
  // descuento puntual negociado). Vacío = usar el precio de lista tal cual.
  const [totalAjustadoStr, setTotalAjustadoStr] = useState('')
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
  const esEfectivo = medioPago === 'Efectivo'
  const hayRecargosConfigurados = recargos.some(r => r.activo)
  const tarjetas = tarjetasDisponibles(recargos)
  const cuotasParaTarjeta = tarjeta ? cuotasDisponibles(recargos, tarjeta) : []

  const subtotal = items.reduce((s, i) => s + getPrecioItem(i) * i.cantidad, 0)

  // Mixto ya no es "un monto en efectivo y el resto transferencia": son tres
  // montos libres (efectivo/transferencia/tarjeta), cada uno opcional, que
  // tienen que sumar el subtotal exacto entre los tres — así se puede cubrir
  // cualquier combinación real (efectivo+tarjeta, transferencia+tarjeta,
  // los tres juntos), no solo efectivo+transferencia.
  const montoEfectivoMixtoNum = montoEfectivoMixto ? Number(montoEfectivoMixto) : 0
  const montoTransferenciaMixtoNum = montoTransferenciaMixto ? Number(montoTransferenciaMixto) : 0
  const montoTarjetaMixtoNum = montoTarjetaMixto ? Number(montoTarjetaMixto) : 0
  const hayTarjetaEnMixto = esMixto && montoTarjetaMixtoNum > 0

  // Tarjeta+cuotas hace falta tanto si el medio es "Tarjeta" puro como si
  // hay una porción tarjeta dentro de un Mixto — el recargo se calcula igual.
  const necesitaTarjetaYCuotas = esTarjeta || hayTarjetaEnMixto
  // Mientras no haya ningún recargo cargado, se usa el 10% fijo de siempre.
  // En cuanto haya al menos uno, hace falta elegir tarjeta+cuotas para saber el %.
  const faltaElegirRecargo = necesitaTarjetaYCuotas && hayRecargosConfigurados && (!tarjeta || !cuotas)
  const recargoPct = getRecargoPct(recargos, tarjeta, cuotas)

  // Los tres montos (sin el recargo de la porción tarjeta) tienen que cerrar
  // exacto contra el subtotal: el recargo se suma aparte, no es parte de
  // "cómo se reparte el precio del botín" entre los medios de pago.
  const sumaMixtoSinRecargo = montoEfectivoMixtoNum + montoTransferenciaMixtoNum + montoTarjetaMixtoNum
  const mixtoDesbalanceado = esMixto && Math.round(sumaMixtoSinRecargo * 100) !== Math.round(subtotal * 100)
  const mixtoInvalido = esMixto && (
    montoEfectivoMixtoNum < 0 || montoTransferenciaMixtoNum < 0 || montoTarjetaMixtoNum < 0 || mixtoDesbalanceado
  )

  const total = faltaElegirRecargo
    ? subtotal
    : esTarjeta
      ? items.reduce((s, i) => s + getPrecioConRecargo(i.modelo, tarjeta, cuotas, recargoPct, i.precioManual) * i.cantidad, 0)
      : hayTarjetaEnMixto
        ? subtotal + montoTarjetaMixtoNum * (recargoPct / 100)
        : subtotal
  const recargo = total - subtotal
  // % efectivo mostrado junto al monto: puede diferir un poco del % nominal
  // configurado cuando el precio viene del real de TiendaNube (Crédito 3 cuotas).
  const recargoPctMostrado = esTarjeta && subtotal > 0 ? (recargo / subtotal) * 100 : recargoPct

  // Lo que realmente se guarda como "monto tarjeta" incluye el recargo de
  // esa porción (igual que precio_venta ya lo incluye en una venta 100%
  // tarjeta) — es lo que de verdad se cobró por esa vía, no la parte "de
  // lista" que se usa arriba solo para chequear que los tres montos cierren.
  const montoTarjetaMixtoConRecargoNum = hayTarjetaEnMixto ? montoTarjetaMixtoNum + recargo : montoTarjetaMixtoNum

  // Ajuste manual del total, solo para pago 100% en efectivo (ej. cobrar
  // menos por un descuento negociado en el momento, o redondear). Vacío o
  // inválido = se usa el precio de lista (`total`) sin tocar nada.
  const totalAjustadoNum = totalAjustadoStr !== '' ? Number(totalAjustadoStr) : null
  const ajusteInvalido = esEfectivo && totalAjustadoStr !== '' && (isNaN(totalAjustadoNum!) || totalAjustadoNum! < 0)
  const totalFinal = esEfectivo && totalAjustadoNum != null && !ajusteInvalido ? totalAjustadoNum : total
  const factorAjuste = total > 0 ? totalFinal / total : 1

  // Base sobre la que se calcula el vuelto: el total de la venta si es
  // 100% efectivo, o solo la porción en efectivo si es un pago mixto.
  const baseEfectivo = esEfectivo ? totalFinal : esMixto ? montoEfectivoMixtoNum : 0
  const montoRecibidoEfectivoNum = montoRecibidoEfectivo ? Number(montoRecibidoEfectivo) : 0
  const hayRecibido = montoRecibidoEfectivo !== ''
  const vuelto = hayRecibido ? montoRecibidoEfectivoNum - baseEfectivo : 0
  const recibidoInvalido = hayRecibido && montoRecibidoEfectivoNum < baseEfectivo

  // La ganancia no suma el recargo de una porción tarjeta dentro de un
  // Mixto (igual que ya pasaba antes de este cambio): solo se calcula sobre
  // precio de lista + recargo cuando el medio es 100% Tarjeta.
  const ganancia = items.reduce((s, i) => {
    const precioFinal = esTarjeta && !faltaElegirRecargo ? getPrecioConRecargo(i.modelo, tarjeta, cuotas, recargoPct, i.precioManual) : getPrecioItem(i)
    const precioFinalAjustado = esEfectivo ? precioFinal * factorAjuste : precioFinal
    return s + (precioFinalAjustado - i.modelo.precio_costo) * i.cantidad
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
    setMontoTransferenciaMixto('')
    setMontoTarjetaMixto('')
    setMontoRecibidoEfectivo('')
    setTotalAjustadoStr('')
    resetCliente()
    onClose()
  }

  const handleMedioPago = (m: MedioPago) => {
    setMedioPago(m)
    setTarjeta(null)
    setCuotas(null)
    setMontoEfectivoMixto('')
    setMontoTransferenciaMixto('')
    setMontoTarjetaMixto('')
    setMontoRecibidoEfectivo('')
    setTotalAjustadoStr('')
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
      // El ajuste de total (efectivo) se traduce a un precioManual por línea,
      // prorrateado sobre el precio que ya tenía cada una (de lista o ya
      // editada a mano en SellModal) — sellCarrito no conoce "totalAjustado",
      // solo precios por ítem, así que la distribución se resuelve acá.
      const itemsAEnviar = esEfectivo && totalAjustadoNum != null && !ajusteInvalido && factorAjuste !== 1
        ? items.map(i => ({ ...i, precioManual: Math.round(getPrecioItem(i) * factorAjuste) }))
        : items
      await onSell(
        itemsAEnviar, medioPago, clienteId,
        !faltaElegirRecargo && necesitaTarjetaYCuotas ? tarjeta : null,
        !faltaElegirRecargo && necesitaTarjetaYCuotas ? cuotas : null,
        recargoPct,
        esMixto ? montoEfectivoMixtoNum : null,
        esMixto ? montoTransferenciaMixtoNum : null,
        esMixto ? montoTarjetaMixtoConRecargoNum : null,
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

          {esMixto && (
            <div className="sell-section">
              <p className="sell-label">Repartí el subtotal (${subtotal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}) entre los medios que corresponda</p>
              <div className="mixto-montos">
                <div className="mixto-monto-item">
                  <span className="mixto-monto-label">💵 Efectivo</span>
                  <div className="config-input-wrap">
                    <input
                      type="number" className="config-input" min={0}
                      value={montoEfectivoMixto} onChange={e => { setMontoEfectivoMixto(e.target.value); setMontoRecibidoEfectivo('') }}
                      placeholder="0" autoFocus
                    />
                    <span className="config-input-suffix">ARS</span>
                  </div>
                </div>
                <div className="mixto-monto-item">
                  <span className="mixto-monto-label">📲 Transferencia</span>
                  <div className="config-input-wrap">
                    <input
                      type="number" className="config-input" min={0}
                      value={montoTransferenciaMixto} onChange={e => setMontoTransferenciaMixto(e.target.value)}
                      placeholder="0"
                    />
                    <span className="config-input-suffix">ARS</span>
                  </div>
                </div>
                <div className="mixto-monto-item">
                  <span className="mixto-monto-label">💳 Tarjeta</span>
                  <div className="config-input-wrap">
                    <input
                      type="number" className="config-input" min={0}
                      value={montoTarjetaMixto} onChange={e => setMontoTarjetaMixto(e.target.value)}
                      placeholder="0"
                    />
                    <span className="config-input-suffix">ARS</span>
                  </div>
                </div>
              </div>
              {mixtoDesbalanceado ? (
                <p className="sell-error">
                  {sumaMixtoSinRecargo < subtotal
                    ? `Falta cubrir $${(subtotal - sumaMixtoSinRecargo).toLocaleString('es-AR', { maximumFractionDigits: 0 })}.`
                    : `Sobran $${(sumaMixtoSinRecargo - subtotal).toLocaleString('es-AR', { maximumFractionDigits: 0 })} de más — no pueden sumar más que el subtotal.`}
                </p>
              ) : (
                <p className="sell-mixto-resto">✓ Cubre el subtotal entre los tres.</p>
              )}
            </div>
          )}

          {necesitaTarjetaYCuotas && hayRecargosConfigurados && (
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

          {necesitaTarjetaYCuotas && !faltaElegirRecargo && (
            <div className="sell-recargo-notice">
              <span>+{recargoPctMostrado.toFixed(2)}% recargo tarjeta{esMixto && ' (sobre la porción tarjeta)'}</span>
              <span className="recargo-amount">+${recargo.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
            </div>
          )}

          {esEfectivo && (
            <div className="sell-section">
              <p className="sell-label">Ajustar total a cobrar (opcional)</p>
              <div className="config-input-wrap">
                <input
                  type="number" className="config-input" min={0}
                  value={totalAjustadoStr} onChange={e => { setTotalAjustadoStr(e.target.value); setMontoRecibidoEfectivo('') }}
                  placeholder={`${total.toLocaleString('es-AR', { maximumFractionDigits: 0 })} (precio de lista)`}
                />
                <span className="config-input-suffix">ARS</span>
              </div>
              {ajusteInvalido && (
                <p className="sell-error">El monto tiene que ser un número positivo.</p>
              )}
              {!ajusteInvalido && totalAjustadoStr !== '' && totalFinal !== total && (
                <p className="sell-mixto-resto">
                  {totalFinal < total ? 'Descuento' : 'Recargo'} de <strong>${Math.abs(total - totalFinal).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</strong> sobre el precio de lista.
                </p>
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
            <div className="sell-stat"><span>Total</span><span className="sell-stat-val accent">${totalFinal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span></div>
            <div className="sell-stat"><span>Ganancia estimada</span><span className={`sell-stat-val ${ganancia >= 0 ? 'accent' : 'danger'}`}>${ganancia.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span></div>
          </div>

          {faltaElegirRecargo && (
            <p style={{ fontSize: '.8125rem', color: 'var(--text-muted)' }}>Elegí tarjeta y cuotas para continuar.</p>
          )}

          <div className="sell-actions">
            <button className="btn btn-secondary" onClick={handleClose}>Cerrar</button>
            <button className="btn btn-primary" onClick={() => setStep('cliente')} disabled={!medioPago || faltaElegirRecargo || mixtoInvalido || recibidoInvalido || ajusteInvalido}>
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
