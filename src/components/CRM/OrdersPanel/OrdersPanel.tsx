import { useCallback, useEffect, useState } from 'react'
import { X, Search, Loader2, Truck, Copy, ExternalLink, Package, Store, Check } from 'lucide-react'
import type { WspConversacion } from '../../../types/crm'
import { buscarPedidos, fetchPedidoEnVivo, fetchPedidosDeContacto } from '../../../services/crmPedidos'
import { fetchHistorialCompras } from '../../../services/crmClients'
import { formatARS, paymentStatusLabel, type TNOrder } from '../../../services/tiendanubeService'
import {
  ESTADO_PEDIDO_LABEL, diasDesdeCompra, formatoFechaCorta, respuestaEstadoPedido, resumenEnvio, textoEntrega,
  type PedidoTN,
} from '../../../lib/crmPedidos'
import './OrdersPanel.css'

interface OrdersPanelProps {
  conversacion: WspConversacion
  onUsarTexto: (texto: string) => void
  onClose: () => void
}

interface CompraLocal {
  id: string
  fecha: string
  talle_arg: number
  precio_venta: number
  modelos?: { modelo: string; marca: string } | null
}

type EstadoVivo = PedidoTN | 'cargando' | 'error'

// Cuántos pedidos se consultan en vivo apenas se abre el panel (el resto, con
// "Ver envío"): cada consulta es un pedido a la API de TiendaNube.
const AUTO_VIVO = 3

function haceDias(n: number): string {
  if (n <= 0) return 'hoy'
  if (n === 1) return 'hace 1 día'
  return `hace ${n} días`
}

export function OrdersPanel({ conversacion, onUsarTexto, onClose }: OrdersPanelProps) {
  const [pedidos, setPedidos] = useState<TNOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [faltaMigracion, setFaltaMigracion] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<TNOrder[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [vivo, setVivo] = useState<Record<number, EstadoVivo>>({})
  const [compras, setCompras] = useState<CompraLocal[]>([])
  const [copiado, setCopiado] = useState<string | null>(null)

  const telefono = conversacion.telefono || conversacion.wa_contact_id
  const email = conversacion.crm_clientes?.clientes_locales?.email ?? null
  const clienteLocalId = conversacion.crm_clientes?.cliente_local_id ?? null

  const cargarVivo = useCallback(async (tnOrderId: number) => {
    setVivo(prev => ({ ...prev, [tnOrderId]: 'cargando' }))
    try {
      const pedido = await fetchPedidoEnVivo(tnOrderId)
      setVivo(prev => ({ ...prev, [tnOrderId]: pedido }))
    } catch (err) {
      console.error('Error consultando el pedido en TiendaNube:', err)
      setVivo(prev => ({ ...prev, [tnOrderId]: 'error' }))
    }
  }, [])

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    setFaltaMigracion(false)
    setResultados(null)
    setBusqueda('')
    setVivo({})
    fetchPedidosDeContacto(telefono, email)
      .then(data => {
        if (cancelado) return
        setPedidos(data)
        data.slice(0, AUTO_VIVO).forEach(p => cargarVivo(p.id))
      })
      .catch(err => {
        console.error('Error buscando pedidos del contacto:', err)
        if (cancelado) return
        setPedidos([])
        if (String(err?.message ?? err).includes('telefono_digitos')) setFaltaMigracion(true)
      })
      .finally(() => { if (!cancelado) setLoading(false) })

    setCompras([])
    if (clienteLocalId) {
      fetchHistorialCompras(clienteLocalId)
        .then(data => { if (!cancelado) setCompras(data as CompraLocal[]) })
        .catch(err => console.error('Error cargando compras en el local:', err))
    }
    return () => { cancelado = true }
  }, [telefono, email, clienteLocalId, cargarVivo])

  const handleBuscar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!busqueda.trim()) { setResultados(null); return }
    setBuscando(true)
    try {
      const data = await buscarPedidos(busqueda)
      setResultados(data)
      data.slice(0, AUTO_VIVO).forEach(p => { if (!vivo[p.id]) cargarVivo(p.id) })
    } catch (err) {
      console.error('Error buscando pedidos:', err)
      setResultados([])
    } finally {
      setBuscando(false)
    }
  }

  const copiar = (texto: string) => {
    navigator.clipboard?.writeText(texto).then(() => {
      setCopiado(texto)
      setTimeout(() => setCopiado(null), 1500)
    }).catch(() => {})
  }

  const lista = resultados ?? pedidos

  return (
    <div className="orders-panel" role="dialog" aria-label="Pedidos del cliente">
      <div className="orders-panel-header">
        <div>
          <div className="orders-panel-title"><Package size={16} /> Pedidos</div>
          <div className="orders-panel-subtitle">
            Tienda web, buscados por el teléfono {telefono}{email ? ` y el mail ${email}` : ''}
          </div>
        </div>
        <button className="orders-panel-close" onClick={onClose} aria-label="Cerrar" title="Cerrar">
          <X size={18} />
        </button>
      </div>

      <form className="orders-panel-search" onSubmit={handleBuscar}>
        <Search size={14} />
        <input
          value={busqueda}
          onChange={e => { setBusqueda(e.target.value); if (!e.target.value) setResultados(null) }}
          placeholder="Buscar otro: # de pedido, nombre o mail"
          title="Si el cliente compró con otro teléfono, buscalo por número de pedido, nombre o mail"
        />
        {buscando && <Loader2 size={14} className="orders-spin" />}
      </form>

      <div className="orders-panel-body">
        {resultados && (
          <div className="orders-panel-section-title">
            Resultados de "{busqueda}"
            <button className="orders-panel-link" onClick={() => { setResultados(null); setBusqueda('') }}>Volver a los del cliente</button>
          </div>
        )}

        {loading && !resultados ? (
          <div className="orders-panel-empty"><Loader2 size={20} className="orders-spin" /> Buscando pedidos…</div>
        ) : lista.length === 0 ? (
          <div className="orders-panel-empty">
            {resultados
              ? 'No hay pedidos que coincidan.'
              : faltaMigracion
                ? 'Para encontrar los pedidos por teléfono falta aplicar la migración 040 en Supabase. Mientras tanto, buscalo arriba por número, nombre o mail.'
                : 'No hay pedidos web con este teléfono. Si compró con otro, buscalo arriba por número, nombre o mail.'}
          </div>
        ) : (
          lista.map(local => {
            const v = vivo[local.id]
            const enVivo = v && v !== 'cargando' && v !== 'error' ? v : null
            const pedido: PedidoTN = enVivo ?? local
            const r = resumenEnvio(pedido)
            const entrega = textoEntrega(r)
            const dias = diasDesdeCompra(local)
            return (
              <div key={local.id} className="orders-card">
                <div className="orders-card-head">
                  <strong>#{local.number}</strong>
                  <span className="orders-card-date">{formatoFechaCorta(new Date(local.created_at))} · {haceDias(dias)}</span>
                  <span className={`orders-badge orders-badge--${r.estado}`}>{ESTADO_PEDIDO_LABEL[r.estado]}</span>
                </div>
                {local.customer?.name && <div className="orders-card-customer">{local.customer.name}</div>}
                <ul className="orders-card-products">
                  {local.products.map((p, i) => (
                    <li key={i}>{p.name}{p.quantity > 1 ? ` ×${p.quantity}` : ''}</li>
                  ))}
                </ul>
                <div className="orders-card-meta">
                  ${formatARS(parseFloat(local.total) || 0)} · {paymentStatusLabel(local.payment_status)}
                </div>

                {v === 'cargando' && (
                  <div className="orders-card-live orders-card-live--loading">
                    <Loader2 size={13} className="orders-spin" /> Consultando el envío en TiendaNube…
                  </div>
                )}
                {v === 'error' && (
                  <div className="orders-card-live orders-card-live--error">
                    No se pudo consultar el envío en TiendaNube.
                    <button className="orders-panel-link" onClick={() => cargarVivo(local.id)}>Reintentar</button>
                  </div>
                )}
                {enVivo && (
                  <div className="orders-card-live">
                    {r.transportista && <div><Truck size={13} /> {r.transportista}</div>}
                    {r.codigo ? (
                      <div className="orders-card-tracking">
                        Seguimiento: <code>{r.codigo}</code>
                        <button onClick={() => copiar(r.codigo!)} title="Copiar código">
                          {copiado === r.codigo ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                        {r.url && (
                          <a href={r.url} target="_blank" rel="noreferrer" title="Abrir el seguimiento">
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    ) : (
                      !['cancelado', 'pago_pendiente', 'entregado'].includes(r.estado) && !r.esRetiro &&
                        <div className="orders-card-muted">Todavía sin código de seguimiento.</div>
                    )}
                    {entrega && <div>{entrega}</div>}
                  </div>
                )}

                <div className="orders-card-actions">
                  {!v && (
                    <button className="orders-btn" onClick={() => cargarVivo(local.id)} title="Consultar en TiendaNube el estado del envío y el código de seguimiento">
                      <Truck size={13} /> Ver envío
                    </button>
                  )}
                  <button
                    className="orders-btn orders-btn--primary"
                    onClick={() => onUsarTexto(respuestaEstadoPedido(pedido))}
                    disabled={v === 'cargando'}
                    title={enVivo ? 'Escribir en el mensaje el estado del pedido con el seguimiento' : 'Escribir en el mensaje el estado del pedido (conviene "Ver envío" antes, para incluir el seguimiento)'}
                  >
                    Usar en el mensaje
                  </button>
                </div>
              </div>
            )
          })
        )}

        {!resultados && compras.length > 0 && (
          <>
            <div className="orders-panel-section-title"><Store size={13} /> Compras en el local</div>
            {compras.map(c => (
              <div key={c.id} className="orders-card orders-card--local">
                <div className="orders-card-head">
                  <strong>{c.modelos ? `${c.modelos.marca} ${c.modelos.modelo}` : 'Producto'}</strong>
                  <span className="orders-card-date">
                    {formatoFechaCorta(new Date(c.fecha))} · {haceDias(diasDesdeCompra({ created_at: c.fecha }))}
                  </span>
                </div>
                <div className="orders-card-meta">Talle {c.talle_arg} · ${formatARS(c.precio_venta)}</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
