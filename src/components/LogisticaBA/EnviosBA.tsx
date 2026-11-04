import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, AlertTriangle, Truck, ExternalLink, Phone, Clock, ClipboardList, ChevronDown, FileDown, Upload, Trash2, CheckCircle2, Printer } from 'lucide-react'
import { fetchEnviosBA, marcarEnvioBA, avisarProblemaBA, subirRotulosBA, borrarRotuloBA, rotuloDescargadoBA, AccesoDenegado, type EnvioBA, type RotuloBA, type AccesoLogistica } from '../../services/logisticaBA'
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

// Un pedido sin despachar con más de 24 h se marca como atrasado.
const HORAS_ATRASO = 24
function horasDesde(iso: string) {
  return (Date.now() - Date.parse(iso)) / 3600_000
}
function atraso(horas: number) {
  return horas < 48 ? `${Math.floor(horas)} h` : `${Math.floor(horas / 24)} días`
}

const MOTIVOS = ['No tengo el talle', 'El par está fallado', 'Me falta el rótulo', 'Dirección incompleta o rara']

type OnProblema = (e: EnvioBA, motivo: string) => Promise<boolean>

function Problema({ e, onProblema }: { e: EnvioBA; onProblema: OnProblema }) {
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  if (!abierto) {
    return <button className="lba-problema-btn" onClick={() => setAbierto(true)}>Hay un problema</button>
  }
  const mensaje = [motivo, texto.trim()].filter(Boolean).join(' — ')
  const cerrar = () => { setAbierto(false); setMotivo(null); setTexto('') }
  return (
    <div className="lba-problema-form">
      <p className="lba-problema-titulo">¿Qué pasa con el pedido #{e.numero}?</p>
      <div className="lba-motivos">
        {MOTIVOS.map(m => (
          <button key={m} className={`lba-motivo${motivo === m ? ' on' : ''}`} onClick={() => setMotivo(motivo === m ? null : m)}>{m}</button>
        ))}
      </div>
      <textarea rows={2} maxLength={300} placeholder="Contá qué pasa (opcional si elegiste un motivo)" value={texto} onChange={ev => setTexto(ev.target.value)} />
      <div className="lba-acciones">
        <button className="btn btn-secondary btn-sm" disabled={enviando} onClick={cerrar}>Cancelar</button>
        <button className="btn btn-primary btn-sm" disabled={!mensaje || enviando} onClick={async () => {
          setEnviando(true)
          const ok = await onProblema(e, mensaje)
          setEnviando(false)
          if (ok) cerrar()
        }}>{enviando ? 'Enviando…' : 'Avisar a Right'}</button>
      </div>
    </div>
  )
}

// Todos los pares de los pedidos pendientes, agrupados por modelo y talle,
// para juntarlos de una vez antes de empaquetar.
function ListaSeparar({ pendientes }: { pendientes: EnvioBA[] }) {
  const [abierta, setAbierta] = useState(false)
  const grupos = new Map<string, { nombre: string; talle: string; foto: string | null; pares: number; pedidos: number[] }>()
  for (const e of pendientes) {
    for (const p of e.productos) {
      const k = `${p.nombre}|${p.talle}`
      const g = grupos.get(k) ?? { nombre: p.nombre, talle: p.talle, foto: p.foto, pares: 0, pedidos: [] }
      g.pares += p.cantidad
      if (!g.pedidos.includes(e.numero)) g.pedidos.push(e.numero)
      grupos.set(k, g)
    }
  }
  const lista = [...grupos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre) || a.talle.localeCompare(b.talle, 'es', { numeric: true }))
  const total = lista.reduce((s, g) => s + g.pares, 0)
  if (total === 0) return null
  return (
    <div className="lba-separar">
      <button className="lba-separar-head" onClick={() => setAbierta(!abierta)} aria-expanded={abierta}>
        <ClipboardList size={15} /> Lista para separar · <b>{total}</b> {total === 1 ? 'par' : 'pares'}
        <ChevronDown size={15} className={`lba-chevron${abierta ? ' on' : ''}`} />
      </button>
      {abierta && (
        <ul className="lba-separar-lista">
          {lista.map(g => (
            <li key={`${g.nombre}|${g.talle}`}>
              {g.foto ? <img src={g.foto} alt="" loading="lazy" /> : <span className="lba-sinfoto" />}
              <div>
                <p className="lba-prod-nombre">{g.nombre}</p>
                <p className="lba-prod-talle">Talle {g.talle}</p>
                <p className="lba-separar-pedidos">Pedidos {g.pedidos.map(n => `#${n}`).join(', ')}</p>
              </div>
              <span className="lba-separar-cant">×{g.pares}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Rótulos del día: Right sube el PDF de Andreani y la logística lo descarga.
function Rotulos({ rotulos, esRight, onSubir, onBorrar, onDescargar }: {
  rotulos: RotuloBA[]; esRight: boolean
  onSubir: (f: File) => Promise<void>; onBorrar: (r: RotuloBA) => void; onDescargar: (rotuloId: string) => void
}) {
  const [subiendo, setSubiendo] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const sinBajar = rotulos.filter(r => !r.descargado).length
  if (!esRight && rotulos.length === 0) return null
  return (
    <div className="lba-rotulos">
      <div className="lba-rotulos-head">
        <p className="lba-rotulos-titulo">
          <FileDown size={15} /> Rótulos
          {sinBajar > 0 && <span className="lba-rotulos-nuevos">{sinBajar} sin descargar</span>}
        </p>
        {esRight && (
          <>
            <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={async ev => {
              const f = ev.target.files?.[0]
              ev.target.value = ''
              if (!f) return
              setSubiendo(true)
              await onSubir(f)
              setSubiendo(false)
            }} />
            <button className="btn btn-primary btn-sm" disabled={subiendo} onClick={() => input.current?.click()}>
              <Upload size={13} /> {subiendo ? 'Subiendo…' : 'Subir rótulos del día'}
            </button>
          </>
        )}
      </div>
      {rotulos.length === 0 ? (
        <p className="lba-vacio">Todavía no subiste rótulos esta semana.</p>
      ) : (
        <ul className="lba-rotulos-lista">
          {rotulos.map(r => (
            <li key={r.id}>
              <div className="lba-rotulo-info">
                <p className="lba-rotulo-nombre">{r.nombre}</p>
                <p className="lba-rotulo-meta">
                  {r.etiquetas > 0 && <>{r.etiquetas} {r.etiquetas === 1 ? 'rótulo' : 'rótulos'} · </>}
                  Subido {fecha(r.subido)} · {r.descargado
                    ? <span className="ok"><CheckCircle2 size={11} /> Descargado {fecha(r.descargado)}</span>
                    : <span className="pend">Sin descargar</span>}
                </p>
                {r.sinPedido.length > 0 && (
                  <p className="lba-rotulo-raro">
                    <AlertTriangle size={12} /> {r.sinPedido.map(n => `#${n}`).join(', ')}: {r.sinPedido.length === 1 ? 'no figura' : 'no figuran'} entre los pedidos pagos que salen de Buenos Aires (¿cancelado o sale del local?). No {r.sinPedido.length === 1 ? 'lo' : 'los'} mandes sin consultar.
                  </p>
                )}
              </div>
              {r.url && (
                <a className="btn btn-secondary btn-sm" href={r.url} target="_blank" rel="noreferrer" onClick={() => onDescargar(r.id)}>
                  <FileDown size={13} /> {r.etiquetas > 0 ? 'Todos' : 'Descargar'}
                </a>
              )}
              {esRight && (
                <button className="lba-rotulo-borrar" title="Borrar" onClick={() => onBorrar(r)}><Trash2 size={14} /></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function wa(tel: string) {
  const d = tel.replace(/\D/g, '')
  return d ? `https://wa.me/${d}` : null
}

function Tarjeta({ e, onMarcar, onProblema, onImprimir, marcando }: { e: EnvioBA; onMarcar: (e: EnvioBA, accion: 'armado' | 'despachado') => void; onProblema: OnProblema; onImprimir: (rotuloId: string) => void; marcando: boolean }) {
  const est = ESTADO[e.estado] ?? { texto: e.estado, clase: e.despachado ? 'enviado' : 'pendiente' }
  const link = wa(e.telefono)
  const quien = e.marcado
    ? `${e.marcado.accion === 'despachado' ? 'Despachado' : 'Armado'} por ${e.marcado.origen === 'logistica' ? 'logística Bs As' : 'Right'} · ${fecha(e.marcado.created_at)}`
    : null
  const horas = horasDesde(e.fecha)
  const atrasado = !e.despachado && horas >= HORAS_ATRASO
  return (
    <article className={`lba-card${e.despachado ? ' hecho' : ''}${atrasado ? ' atrasado' : ''}`}>
      <header className="lba-card-head">
        <span className="lba-num">#{e.numero}</span>
        <span className="lba-fecha">{fecha(e.fecha)}</span>
        {atrasado && <span className="lba-atraso"><Clock size={11} /> Atrasado · {atraso(horas)}</span>}
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
      {!e.despachado && (e.rotulo?.url ? (
        <a className="btn btn-secondary btn-sm lba-imprimir" href={e.rotulo.url} target="_blank" rel="noreferrer" onClick={() => onImprimir(e.rotulo!.rotuloId)}>
          <Printer size={13} /> Imprimir rótulo
        </a>
      ) : (
        <p className="lba-sin-rotulo"><FileDown size={13} /> Todavía no tiene rótulo. Right lo sube con el PDF del día.</p>
      ))}
      {e.rotulo && !e.rotulo.coincide && (
        <p className="lba-alerta"><AlertTriangle size={14} /> El seguimiento del rótulo ({e.rotulo.seguimiento}) no es el de TiendaNube ({e.codigoSeguimiento}). Consultar con Right antes de mandar.</p>
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

      {quien && <p className="lba-quien">{quien}</p>}
      {e.problema && (
        <p className="lba-problema-aviso">
          <AlertTriangle size={14} /> Problema avisado por {e.problema.origen === 'logistica' ? 'logística Bs As' : 'Right'} · {fecha(e.problema.created_at)}: {e.problema.detalle}
        </p>
      )}
      {!e.despachado && <Problema e={e} onProblema={onProblema} />}
      {!e.despachado && (
        <div className="lba-acciones">
          {e.estado === 'UNPACKED' && (
            <button className="btn btn-secondary btn-sm" disabled={marcando} onClick={() => onMarcar(e, 'armado')}>Armado</button>
          )}
          <button className="btn btn-primary btn-sm" disabled={marcando} onClick={() => onMarcar(e, 'despachado')}>
            {marcando ? 'Guardando…' : 'Despachado'}
          </button>
        </div>
      )}
    </article>
  )
}

interface Props {
  acceso: AccesoLogistica
  onSinAcceso?: (mensaje: string) => void
}

// Lista de envíos del depósito de Buenos Aires: los que faltan mandar y los
// enviados de la última semana. Se actualiza sola cada 2 minutos.
export function EnviosBA({ acceso, onSinAcceso }: Props) {
  const [envios, setEnvios] = useState<EnvioBA[] | null>(null)
  const [rotulos, setRotulos] = useState<RotuloBA[]>([])
  const esRight = !('pin' in acceso)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [actualizado, setActualizado] = useState<Date | null>(null)
  const [marcando, setMarcando] = useState<number | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const r = await fetchEnviosBA(acceso)
      setEnvios(r.envios)
      setRotulos(r.rotulos)
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

  const marcar = async (e: EnvioBA, accion: 'armado' | 'despachado') => {
    if (accion === 'despachado') {
      const aviso = [
        `¿Marcar el pedido #${e.numero} como despachado?`,
        `TiendaNube le avisa al cliente${e.codigoSeguimiento ? ` con el seguimiento ${e.codigoSeguimiento}` : ' (todavía no tiene código de seguimiento)'}.`,
        e.envioDudoso ? `\nOJO: el envío es "${e.envio}", que es de Santa Fe. ¿Lo consultaste con Right?` : '',
      ].filter(Boolean).join('\n')
      if (!window.confirm(aviso)) return
    }
    setMarcando(e.numero)
    try {
      await marcarEnvioBA(acceso, e.orderId, accion)
      await cargar()
    } catch (err) {
      window.alert(`No se pudo marcar el pedido #${e.numero}: ${(err as Error).message}`)
    } finally {
      setMarcando(null)
    }
  }

  const problema: OnProblema = async (e, motivo) => {
    try {
      await avisarProblemaBA(acceso, e.orderId, motivo)
      await cargar()
      return true
    } catch (err) {
      window.alert(`No se pudo avisar el problema del pedido #${e.numero}: ${(err as Error).message}`)
      return false
    }
  }

  const subir = async (f: File) => {
    if (f.size > 20 * 1024 * 1024) { window.alert('El PDF pesa más de 20 MB.'); return }
    try {
      const n = await subirRotulosBA(acceso, f)
      await cargar()
      if (n === 0) window.alert('Se subió el PDF, pero no encontré rótulos de Andreani adentro (número de pedido "#1234-…"). La logística lo puede descargar entero.')
    } catch (err) {
      window.alert(`No se pudo subir el PDF: ${(err as Error).message}`)
    }
  }
  const borrar = async (r: RotuloBA) => {
    if (!window.confirm(`¿Borrar "${r.nombre}"? La logística ya no lo va a poder descargar.`)) return
    try {
      await borrarRotuloBA(acceso, r.id)
      await cargar()
    } catch (err) {
      window.alert(`No se pudo borrar: ${(err as Error).message}`)
    }
  }
  const descargar = (rotuloId: string) => {
    if (esRight || rotulos.find(r => r.id === rotuloId)?.descargado) return
    rotuloDescargadoBA(acceso, rotuloId).then(cargar).catch(() => { /* noop */ })
  }

  const pendientes = envios?.filter(e => !e.despachado) ?? []
  const atrasados = pendientes.filter(e => horasDesde(e.fecha) >= HORAS_ATRASO).length
  const sinRotulo = pendientes.filter(e => !e.rotulo).length
  const enviados = envios?.filter(e => e.despachado) ?? []

  return (
    <div className="lba">
      <div className="lba-barra">
        <p className="lba-resumen"><Truck size={15} /> {envios === null ? 'Buscando envíos…' : <span><b>{pendientes.length}</b> para mandar desde Buenos Aires{atrasados > 0 && <span className="lba-atrasados"> · {atrasados} {atrasados === 1 ? 'atrasado' : 'atrasados'}</span>}{envios && envios.length > 0 && sinRotulo > 0 && <span className="lba-sinrot"> · {sinRotulo} sin rótulo</span>}</span>}</p>
        <button className="btn btn-secondary btn-sm" onClick={cargar} disabled={cargando}>
          <RefreshCw size={13} /> {cargando ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>
      {actualizado && <p className="lba-hora">Actualizado {actualizado.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} · se actualiza solo</p>}
      {error && <p className="lba-error">{error}</p>}
      {envios === null && !error && <p className="lba-vacio">Cargando envíos…</p>}

      {envios && (
        <>
          <Rotulos rotulos={rotulos} esRight={esRight} onSubir={subir} onBorrar={borrar} onDescargar={descargar} />
          <ListaSeparar pendientes={pendientes} />
          <h2 className="lba-titulo">Para mandar ({pendientes.length})</h2>
          {pendientes.length === 0 ? <p className="lba-vacio">No hay envíos pendientes.</p> : (
            <div className="lba-lista">{pendientes.map(e => <Tarjeta key={e.numero} e={e} onMarcar={marcar} onProblema={problema} onImprimir={descargar} marcando={marcando === e.numero} />)}</div>
          )}
          {enviados.length > 0 && (
            <>
              <h2 className="lba-titulo">Enviados, última semana ({enviados.length})</h2>
              <div className="lba-lista">{enviados.map(e => <Tarjeta key={e.numero} e={e} onMarcar={marcar} onProblema={problema} onImprimir={descargar} marcando={false} />)}</div>
            </>
          )}
        </>
      )}
    </div>
  )
}
