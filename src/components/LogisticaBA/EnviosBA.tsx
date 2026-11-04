import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, AlertTriangle, Truck, ExternalLink, Phone } from 'lucide-react'
import { fetchEnviosBA, AccesoDenegado, type EnvioBA } from '../../services/logisticaBA'
import './LogisticaBA.css'

const ESTADO: Record<string, { texto: string; clase: string }> = {
  UNPACKED: { texto: 'Sin armar', clase: 'pendiente' },
  PACKED: { texto: 'Armado · etiqueta lista', clase: 'armado' },
  READY_FOR_PICKUP: { texto: 'Listo para retirar', clase: 'armado' },
  DISPATCHED: { texto: 'Enviado', clase: 'enviado' },
  DELIVERED: { texto: 'Entregado', clase: 'enviado' },
}

function fecha(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
}

function wa(tel: string) {
  const d = tel.replace(/\D/g, '')
  return d ? `https://wa.me/${d}` : null
}

function Tarjeta({ e }: { e: EnvioBA }) {
  const est = ESTADO[e.estado] ?? { texto: e.estado, clase: e.despachado ? 'enviado' : 'pendiente' }
  const link = wa(e.telefono)
  return (
    <article className={`lba-card${e.despachado ? ' hecho' : ''}`}>
      <header className="lba-card-head">
        <span className="lba-num">#{e.numero}</span>
        <span className="lba-fecha">{fecha(e.fecha)}</span>
        <span className={`lba-estado ${est.clase}`}>{est.texto}</span>
      </header>

      <ul className="lba-productos">
        {e.productos.map((p, i) => (
          <li key={i}>
            {p.foto ? <img src={p.foto} alt="" loading="lazy" /> : <span className="lba-sinfoto" />}
            <div>
              <p className="lba-prod-nombre">{p.nombre}</p>
              <p className="lba-prod-talle">Talle {p.talle}{p.cantidad > 1 ? ` · ${p.cantidad} pares` : ''}</p>
            </div>
          </li>
        ))}
      </ul>

      {e.envioDudoso && (
        <p className="lba-alerta"><AlertTriangle size={14} /> Envío "{e.envio}": es de Santa Fe, no sale desde Buenos Aires. Consultar con Right antes de mandar.</p>
      )}
      {e.dividida && <p className="lba-info">Orden dividida: acá figura solo lo que sale de Buenos Aires. El resto lo manda el local.</p>}

      <dl className="lba-datos">
        <div><dt>Cliente</dt><dd>{e.cliente || '—'}</dd></div>
        {e.telefono && (
          <div><dt>Teléfono</dt><dd>{link ? <a href={link} target="_blank" rel="noreferrer"><Phone size={12} /> {e.telefono}</a> : e.telefono}</dd></div>
        )}
        <div><dt>Dirección</dt><dd>{e.direccion || '—'}</dd></div>
        <div><dt>Envío</dt><dd>{e.envio || '—'}</dd></div>
        {(e.seguimiento || e.codigoSeguimiento) && (
          <div><dt>Seguimiento</dt><dd>{e.seguimiento ? <a href={e.seguimiento} target="_blank" rel="noreferrer">{e.codigoSeguimiento ?? 'Ver'} <ExternalLink size={11} /></a> : e.codigoSeguimiento}</dd></div>
        )}
        {e.nota && <div><dt>Nota</dt><dd>{e.nota}</dd></div>}
      </dl>
    </article>
  )
}

interface Props {
  acceso: { pin: string } | { dispositivo: string | null }
  onSinAcceso?: (mensaje: string) => void
}

// Lista de envíos del depósito de Buenos Aires: los que faltan mandar y los
// enviados de la última semana. Se actualiza sola cada 2 minutos.
export function EnviosBA({ acceso, onSinAcceso }: Props) {
  const [envios, setEnvios] = useState<EnvioBA[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [actualizado, setActualizado] = useState<Date | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      setEnvios(await fetchEnviosBA(acceso))
      setError(null)
      setActualizado(new Date())
    } catch (e) {
      if (e instanceof AccesoDenegado && onSinAcceso) onSinAcceso(e.message)
      else setError(e instanceof AccesoDenegado
        ? 'Este dispositivo no está habilitado para ver los envíos. Habilitalo con el PIN del dueño (botón "Habilitar" del cartel amarillo).'
        : (e as Error).message)
    } finally {
      setCargando(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(acceso)])

  useEffect(() => {
    cargar()
    const t = setInterval(cargar, 2 * 60 * 1000)
    return () => clearInterval(t)
  }, [cargar])

  const pendientes = envios?.filter(e => !e.despachado) ?? []
  const enviados = envios?.filter(e => e.despachado) ?? []

  return (
    <div className="lba">
      <div className="lba-barra">
        <p className="lba-resumen"><Truck size={15} /> {envios === null ? 'Buscando envíos…' : <><b>{pendientes.length}</b> para mandar desde Buenos Aires</>}</p>
        <button className="btn btn-secondary btn-sm" onClick={cargar} disabled={cargando}>
          <RefreshCw size={13} /> {cargando ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>
      {actualizado && <p className="lba-hora">Actualizado {actualizado.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} · se actualiza solo</p>}
      {error && <p className="lba-error">{error}</p>}
      {envios === null && !error && <p className="lba-vacio">Cargando envíos…</p>}

      {envios && (
        <>
          <h2 className="lba-titulo">Para mandar ({pendientes.length})</h2>
          {pendientes.length === 0 ? <p className="lba-vacio">No hay envíos pendientes.</p> : (
            <div className="lba-lista">{pendientes.map(e => <Tarjeta key={e.numero} e={e} />)}</div>
          )}
          {enviados.length > 0 && (
            <>
              <h2 className="lba-titulo">Enviados, última semana ({enviados.length})</h2>
              <div className="lba-lista">{enviados.map(e => <Tarjeta key={e.numero} e={e} />)}</div>
            </>
          )}
        </>
      )}
    </div>
  )
}
