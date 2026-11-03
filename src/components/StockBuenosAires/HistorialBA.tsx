import { useEffect, useState } from 'react'
import { Modal } from '../Modal/Modal'
import {
  fetchPedidosBA, fetchMovimientosRecientesBA,
  type PedidoBAFila, type MovimientoBAReciente,
} from '../../services/stockBA'
import { analizarNombre } from '../../lib/stockBaNombre'

const fmt = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
const dia = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

export function HistorialBA({ isOpen, verCosto, onClose }: { isOpen: boolean; verCosto: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<'movs' | 'pedidos'>('movs')
  const [pedidos, setPedidos] = useState<PedidoBAFila[]>([])
  const [movs, setMovs] = useState<MovimientoBAReciente[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setError(null)
    Promise.all([fetchPedidosBA(), fetchMovimientosRecientesBA()])
      .then(([p, m]) => { setPedidos(p); setMovs(m) })
      .catch(e => setError((e as Error).message))
  }, [isOpen])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Historial" maxWidth="560px">
      <div className="sba-detalle">
        <div className="sba-talles" role="tablist">
          <button className={`sba-talle-btn${tab === 'movs' ? ' on' : ''}`} onClick={() => setTab('movs')}>Movimientos</button>
          <button className={`sba-talle-btn${tab === 'pedidos' ? ' on' : ''}`} onClick={() => setTab('pedidos')}>Pedidos cargados</button>
        </div>
        {error && <p className="sba-error">{error}</p>}

        {tab === 'movs' && (movs.length === 0 ? <p className="sba-vacio">Todavía no hay movimientos.</p> : movs.map(m => (
          <p key={m.id} className="sba-mov">
            <span className={m.delta < 0 ? 'neg' : 'pos'}>{m.delta > 0 ? '+' : ''}{m.delta}</span>{' '}
            {m.stock_ba_modelos ? analizarNombre(m.stock_ba_modelos.descripcion).titulo : 'Modelo borrado'} · talle {m.talle} · {m.motivo}
            <span className="sba-mov-fecha"> · {dia(m.created_at)} {hora(m.created_at)}</span>
          </p>
        )))}

        {tab === 'pedidos' && (pedidos.length === 0 ? <p className="sba-vacio">Todavía no hay pedidos cargados.</p> : pedidos.map(p => (
          <div key={p.id} className="sba-previa-pedido">
            <p className="sba-previa-titulo">Pedido {p.numero}</p>
            <p className="sba-previa-datos">
              {p.proveedor ?? 'Proveedora'} · {p.fecha ?? dia(p.created_at)} · {p.unidades ?? '?'} pares
              {verCosto && p.total != null ? ` · $${fmt(p.total)}` : ''}
            </p>
          </div>
        )))}
      </div>
    </Modal>
  )
}
