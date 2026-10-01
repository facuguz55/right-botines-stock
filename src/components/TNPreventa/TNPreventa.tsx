import { useState, useEffect } from 'react'
import { RefreshCw, ChevronDown, ChevronUp, Search, MessageCircle, Mail, Inbox, Copy, Check, Send, CheckCircle2, XCircle } from 'lucide-react'
import { paymentStatusLabel, paymentStatusClass, formatARS } from '../../services/tiendanubeService'
import { fetchPreventaOrders, syncTNOrdenes, syncTNClientes, type PreventaOrder } from '../../services/tnOrdersSync'
import { enviarMailAVarios, type EnviarMailResultado } from '../../services/gmailIntegration'
import { getSessionPin, setSessionPin } from '../../lib/pinSession'
import { Modal } from '../Modal/Modal'
import './TNPreventa.css'

// Ver el mismo comentario en ClientesLocales.tsx: WhatsApp necesita el
// número con código de país, si no ya lo trae.
const numeroWhatsApp = (s: string) => {
  const digitos = s.replace(/\D/g, '')
  return digitos.startsWith('54') ? digitos : `549${digitos}`
}

interface TNPreventaProps {
  onOpenInCrm?: (numero: string, nombre: string | null) => void
}

export function TNPreventa({ onOpenInCrm }: TNPreventaProps) {
  const [orders, setOrders]     = useState<PreventaOrder[]>([])
  const [loading, setLoading]   = useState(true)
  const [syncing, setSyncing]   = useState(false)
  const [error, setError]       = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [search, setSearch]     = useState('')
  const [copied, setCopied]     = useState(false)

  // ── Mandar mail a los clientes seleccionados ─────────────────────────────
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [composePin, setComposePin] = useState('')
  const [composeSending, setComposeSending] = useState(false)
  const [composeResults, setComposeResults] = useState<EnviarMailResultado[] | null>(null)
  const [composeError, setComposeError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setOrders(await fetchPreventaOrders())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar las preventas')
    } finally {
      setLoading(false)
    }
  }

  const refresh = async () => {
    setSyncing(true)
    try {
      await Promise.all([syncTNOrdenes(), syncTNClientes()])
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => { load() }, [])

  const copiarEmails = async () => {
    const emails = [...new Set(orders.map(o => o.customer?.email).filter((e): e is string => !!e))]
    const texto = emails.join(', ')
    try {
      await navigator.clipboard.writeText(texto)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // El Clipboard API puede fallar por permisos del navegador (ej. sin
      // gesto de usuario reconocido, extensiones, políticas corporativas) —
      // sin este fallback, el click no hacía nada y no se enteraban. El
      // prompt() en sí también puede estar bloqueado en algunos entornos
      // (ej. webviews embebidos) — si eso pasa, al menos mostramos un
      // alert con los emails en vez de tirar un error sin capturar.
      try {
        window.prompt('No se pudo copiar automáticamente. Seleccioná el texto y copialo con Ctrl+C / Cmd+C:', texto)
      } catch {
        window.alert(`No se pudo copiar. Emails:\n\n${texto}`)
      }
    }
  }

  const toggleSelected = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const emailsSeleccionados = [...new Set(
    orders.filter(o => selected.has(o.id)).map(o => o.customer?.email).filter((e): e is string => !!e),
  )]

  const abrirCompose = () => {
    setComposeSubject('')
    setComposeBody('')
    setComposePin(getSessionPin() ?? '')
    setComposeResults(null)
    setComposeError('')
    setComposeOpen(true)
  }

  const handleComposeSend = async () => {
    if (!composeSubject.trim()) return setComposeError('Poné un asunto')
    if (!composeBody.trim()) return setComposeError('Escribí un mensaje')
    if (!composePin.trim()) return setComposeError('Falta el PIN del dueño')

    setComposeError('')
    setComposeSending(true)
    setComposeResults(null)
    try {
      const results = await enviarMailAVarios(composePin, emailsSeleccionados, composeSubject.trim(), composeBody)
      setComposeResults(results)
      // Si el primer envío ya confirmó el PIN, lo dejamos cacheado para no
      // volver a pedirlo en esta pestaña (mismo criterio que Devoluciones/
      // Rentabilidad) — pero solo si al menos uno salió bien, para no
      // guardar un PIN que en realidad vino mal.
      if (results.some(r => r.status === 'ok')) setSessionPin(composePin)
      const okCount = results.filter(r => r.status === 'ok').length
      if (okCount === results.length) {
        setComposeSubject(''); setComposeBody('')
      }
    } catch (e) {
      setComposeError(e instanceof Error ? e.message : 'No se pudo enviar')
    } finally {
      setComposeSending(false)
    }
  }

  if (loading) return (
    <div className="tn-loading">
      <div className="spinner" />
      <p>Cargando preventas...</p>
    </div>
  )
  if (error) return <div className="tn-error"><p>⚠ {error}</p><button className="btn btn-secondary btn-sm" onClick={() => load()}>Reintentar</button></div>

  const filtered = orders.filter(o => {
    if (!search) return true
    const q = search.toLowerCase()
    const name = o.customer?.name?.toLowerCase() ?? ''
    const email = o.customer?.email?.toLowerCase() ?? ''
    const num = String(o.number)
    return name.includes(q) || email.includes(q) || num.includes(q)
  })

  return (
    <div className="tn-preventa">
      <div className="page-header">
        <div>
          <h1 className="page-title">Preventas</h1>
          <p className="page-subtitle">{orders.length} venta{orders.length !== 1 ? 's' : ''} de la categoría Pre-venta</p>
        </div>
        <div className="tn-preventa-actions">
          <button
            className="btn btn-primary btn-sm"
            onClick={abrirCompose}
            disabled={selected.size === 0}
            title={selected.size === 0 ? 'Tildá al menos un cliente en la tabla' : `Mandar el mismo mail a ${selected.size} cliente${selected.size !== 1 ? 's' : ''}`}
          >
            <Send size={13} /> Enviar mail a seleccionados {selected.size > 0 && `(${selected.size})`}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={copiarEmails}
            disabled={orders.length === 0}
            title="Copia los emails de todos los clientes de preventa, separados por coma, para pegar en CCO"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Emails copiados' : 'Copiar emails'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={refresh} disabled={syncing}>
            <RefreshCw size={13} /> {syncing ? 'Sincronizando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      <div className="tn-search-row">
        <div className="tn-search-wrap">
          <Search size={14} />
          <input
            type="text"
            placeholder="Buscar por número, cliente o email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="tn-page-table-wrap">
        <table className="tn-page-table">
          <thead>
            <tr>
              <th style={{ width: '2rem' }}>
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every(o => selected.has(o.id))}
                  onChange={e => {
                    setSelected(prev => {
                      const next = new Set(prev)
                      for (const o of filtered) { if (e.target.checked) next.add(o.id); else next.delete(o.id) }
                      return next
                    })
                  }}
                  title="Seleccionar todos los que se ven"
                />
              </th>
              <th>#</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Total</th>
              <th>Estado</th>
              <th>Contacto</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(order => (
              <>
                <tr
                  key={order.id}
                  className={`tn-order-row${expanded === order.id ? ' expanded' : ''}`}
                >
                  <td onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(order.id)}
                      disabled={!order.customer?.email}
                      onChange={() => toggleSelected(order.id)}
                      title={order.customer?.email ? undefined : 'Sin email cargado'}
                    />
                  </td>
                  <td className="tn-order-num" onClick={() => setExpanded(expanded === order.id ? null : order.id)}>#{order.number}</td>
                  <td className="tn-order-date" onClick={() => setExpanded(expanded === order.id ? null : order.id)}>
                    {new Date(order.created_at).toLocaleDateString('es-AR', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      timeZone: 'America/Argentina/Buenos_Aires',
                    })}
                  </td>
                  <td className="tn-order-client" onClick={() => setExpanded(expanded === order.id ? null : order.id)}>
                    <p>{order.customer?.name ?? '—'}</p>
                    <p className="tn-order-email">{order.customer?.email ?? ''}</p>
                  </td>
                  <td className="tn-order-total" onClick={() => setExpanded(expanded === order.id ? null : order.id)}>${formatARS(parseFloat(order.total))}</td>
                  <td onClick={() => setExpanded(expanded === order.id ? null : order.id)}>
                    <span className={`tn-status-badge ${paymentStatusClass(order.payment_status)}`}>
                      {paymentStatusLabel(order.payment_status)}
                    </span>
                  </td>
                  <td>
                    <div className="tn-preventa-contacto">
                      <a
                        className="tn-contacto-btn tn-contacto-btn--whatsapp"
                        href={order.clienteTelefono ? `https://wa.me/${numeroWhatsApp(order.clienteTelefono)}` : undefined}
                        target="_blank" rel="noreferrer"
                        aria-disabled={!order.clienteTelefono}
                        onClick={e => { e.stopPropagation(); if (!order.clienteTelefono) e.preventDefault() }}
                        title={order.clienteTelefono ? `WhatsApp: ${order.clienteTelefono}` : 'Sin teléfono cargado'}
                      >
                        <MessageCircle size={14} />
                      </a>
                      <a
                        className="tn-contacto-btn tn-contacto-btn--email"
                        href={order.customer?.email ? `mailto:${order.customer.email}?subject=${encodeURIComponent(`Right Botines — Pedido #${order.number} (preventa)`)}` : undefined}
                        aria-disabled={!order.customer?.email}
                        onClick={e => { e.stopPropagation(); if (!order.customer?.email) e.preventDefault() }}
                        title={order.customer?.email ? `Email: ${order.customer.email}` : 'Sin email cargado'}
                      >
                        <Mail size={14} />
                      </a>
                      {onOpenInCrm && (
                        <button
                          type="button"
                          className="tn-contacto-btn tn-contacto-btn--crm"
                          disabled={!order.clienteTelefono}
                          onClick={e => {
                            e.stopPropagation()
                            if (order.clienteTelefono) onOpenInCrm(order.clienteTelefono, order.customer?.name ?? null)
                          }}
                          title={order.clienteTelefono ? 'Abrir conversación en el CRM' : 'Sin teléfono cargado'}
                        >
                          <Inbox size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="tn-order-chevron" onClick={() => setExpanded(expanded === order.id ? null : order.id)}>
                    {expanded === order.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </td>
                </tr>
                {expanded === order.id && (
                  <tr key={`${order.id}-detail`} className="tn-order-detail-row">
                    <td colSpan={8}>
                      <div className="tn-order-detail">
                        <div className="tn-detail-products">
                          <p className="tn-detail-label">Productos</p>
                          {order.products.map((p, i) => (
                            <div key={i} className="tn-detail-product">
                              <span className="tn-detail-product-name">{p.name}</span>
                              <span className="tn-detail-product-info">
                                x{p.quantity} · ${formatARS(parseFloat(p.price) * p.quantity)}
                              </span>
                              {p.sku && <span className="tn-detail-sku">SKU: {p.sku}</span>}
                            </div>
                          ))}
                        </div>

                        <div className="tn-detail-totals">
                          <div className="tn-detail-row">
                            <span>Subtotal</span>
                            <span>${formatARS(parseFloat(order.subtotal))}</span>
                          </div>
                          {parseFloat(order.total_shipping) > 0 && (
                            <div className="tn-detail-row">
                              <span>Envío</span>
                              <span>${formatARS(parseFloat(order.total_shipping))}</span>
                            </div>
                          )}
                          {parseFloat(order.discount) > 0 && (
                            <div className="tn-detail-row discount">
                              <span>Descuento</span>
                              <span>-${formatARS(parseFloat(order.discount))}</span>
                            </div>
                          )}
                          <div className="tn-detail-row total">
                            <span>Total</span>
                            <span>${formatARS(parseFloat(order.total))}</span>
                          </div>
                        </div>

                        {order.shipping_address && (
                          <div className="tn-detail-shipping">
                            <p className="tn-detail-label">Envío a</p>
                            <p>{order.shipping_address.name}</p>
                            <p>{order.shipping_address.address}, {order.shipping_address.city}</p>
                            <p>{order.shipping_address.province} {order.shipping_address.zipcode}</p>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="tn-empty">
            {orders.length === 0
              ? 'No hay ventas de la categoría Pre-venta todavía.'
              : 'No hay preventas que coincidan con la búsqueda.'}
          </div>
        )}
      </div>

      <Modal isOpen={composeOpen} onClose={() => !composeSending && setComposeOpen(false)} title="Enviar mail a clientes de preventa" maxWidth="520px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '.8125rem', color: 'var(--text-secondary)' }}>
            Mismo mensaje para los {emailsSeleccionados.length} cliente{emailsSeleccionados.length !== 1 ? 's' : ''} seleccionado{emailsSeleccionados.length !== 1 ? 's' : ''},
            cada uno como mail independiente (no en copia).
          </p>

          {/* No alcanza con "hay un PIN cacheado" para esconder el campo — si
              quedó desactualizado (ej. se cambió el PIN), todos los envíos
              fallarían con "PIN incorrecto" y no habría forma de corregirlo
              sin este campo visible otra vez. */}
          {(!getSessionPin() || composeResults?.some(r => r.error === 'PIN incorrecto')) && (
            <div>
              <label className="config-label">PIN del dueño</label>
              <input
                type="password" className="config-input" autoFocus={!composePin}
                value={composePin} onChange={e => setComposePin(e.target.value)}
                placeholder="Se verifica en el servidor al enviar"
              />
            </div>
          )}

          <div>
            <label className="config-label">Asunto</label>
            <input
              type="text" className="config-input"
              value={composeSubject} onChange={e => setComposeSubject(e.target.value)}
              placeholder="Ej: Demora en tu pedido de preventa"
            />
          </div>

          <div>
            <label className="config-label">Mensaje</label>
            <textarea
              className="config-input" rows={6}
              value={composeBody} onChange={e => setComposeBody(e.target.value)}
              placeholder="Escribí el mensaje..."
            />
          </div>

          {composeError && <p className="sell-error">{composeError}</p>}

          {composeResults && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.375rem', maxHeight: 160, overflowY: 'auto' }}>
              {composeResults.map(r => (
                <div key={r.email} style={{ display: 'flex', alignItems: 'center', gap: '.375rem', fontSize: '.75rem' }}>
                  {r.status === 'ok'
                    ? <CheckCircle2 size={12} color="var(--accent)" />
                    : <XCircle size={12} color="var(--danger)" />}
                  <span style={{ color: r.status === 'ok' ? 'var(--text-secondary)' : 'var(--danger)' }}>
                    {r.email}{r.error ? ` — ${r.error}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="sell-actions">
            <button className="btn btn-secondary" onClick={() => setComposeOpen(false)} disabled={composeSending}>Cerrar</button>
            <button className="btn btn-primary" onClick={handleComposeSend} disabled={composeSending}>
              {composeSending ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
