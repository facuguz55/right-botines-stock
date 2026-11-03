import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileUp, Search, Minus, Plus, Truck, X } from 'lucide-react'
import type { Role } from '../../types'
import { Modal } from '../Modal/Modal'
import { leerPedidoPdf, type PedidoLeido } from '../../lib/stockBaPdf'
import {
  fetchStockBA, importarPedidoBA, pedidoBAYaCargado, ajustarStockBA, renombrarModeloBA, fetchMovimientosBA,
  type ModeloBA, type MovimientoBA,
} from '../../services/stockBA'
import './StockBuenosAires.css'

interface Props { role: Role; empleadoId: string | null }

const totalPares = (m: ModeloBA) => m.stock_ba_talles.reduce((a, t) => a + t.cantidad, 0)
const ordenTalle = (a: string, b: string) => parseFloat(a) - parseFloat(b)
const fmt = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 0 })

interface PedidoEnCola { archivo: string; pedido: PedidoLeido | null; yaCargado: boolean; error: string | null }

export function StockBuenosAires({ role, empleadoId }: Props) {
  const [modelos, setModelos] = useState<ModeloBA[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [talleFiltro, setTalleFiltro] = useState('')
  const [abierto, setAbierto] = useState<string | null>(null)
  const [cola, setCola] = useState<PedidoEnCola[] | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [importando, setImportando] = useState<string | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const recargar = useCallback(async () => {
    try {
      setModelos(await fetchStockBA())
      setErrorCarga(null)
    } catch (e) {
      setErrorCarga((e as Error).message)
    } finally {
      setCargando(false)
    }
  }, [])
  useEffect(() => { recargar() }, [recargar])

  const talles = useMemo(
    () => [...new Set(modelos.flatMap(m => m.stock_ba_talles.filter(t => t.cantidad > 0).map(t => t.talle)))].sort(ordenTalle),
    [modelos],
  )

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return modelos
      .filter(m => totalPares(m) > 0)
      .filter(m => !q || m.descripcion.toLowerCase().includes(q) || m.codigo.includes(q))
      .filter(m => !talleFiltro || m.stock_ba_talles.some(t => t.talle === talleFiltro && t.cantidad > 0))
  }, [modelos, busqueda, talleFiltro])

  const pares = modelos.reduce((a, m) => a + totalPares(m), 0)
  const conStock = modelos.filter(m => totalPares(m) > 0).length
  const costoTotal = modelos.reduce((a, m) => a + totalPares(m) * (m.costo ?? 0), 0)

  const handlePdfs = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    setLeyendo(true)
    setResultado(null)
    const leidos: PedidoEnCola[] = []
    for (const f of files) {
      try {
        const pedido = await leerPedidoPdf(f)
        if (pedido.items.length === 0) throw new Error('No se encontraron productos en este PDF.')
        leidos.push({ archivo: f.name, pedido, yaCargado: pedido.numero ? await pedidoBAYaCargado(pedido.numero) : false, error: null })
      } catch (err) {
        leidos.push({ archivo: f.name, pedido: null, yaCargado: false, error: (err as Error).message || 'No se pudo leer el PDF.' })
      }
    }
    setLeyendo(false)
    setCola(leidos)
  }

  const handleCargar = async () => {
    if (!cola) return
    const mensajes: string[] = []
    try {
      for (const p of cola) {
        if (!p.pedido || p.yaCargado) continue
        setImportando(`Cargando pedido ${p.pedido.numero}…`)
        const r = await importarPedidoBA(p.pedido, p.archivo, empleadoId, (h, t) => setImportando(`Pedido ${p.pedido!.numero}: subiendo fotos ${h}/${t}`))
        mensajes.push(r.ya_estaba
          ? `Pedido ${r.numero}: ya estaba cargado, no se hizo nada.`
          : `Pedido ${r.numero}: ${fmt(r.pares ?? 0)} pares (${r.modelos_nuevos} modelos nuevos${r.modelos_existentes ? `, ${r.modelos_existentes} ya existían y se les sumó` : ''}).`)
      }
      setResultado(mensajes.join(' '))
      setCola(null)
      await recargar()
    } catch (err) {
      setResultado(`No se pudo cargar: ${(err as Error).message}`)
    } finally {
      setImportando(null)
    }
  }

  const modeloAbierto = modelos.find(m => m.id === abierto) ?? null
  const paraCargar = cola?.filter(p => p.pedido && !p.yaCargado) ?? []

  return (
    <div className="sba">
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock Buenos Aires</h1>
          <p className="sba-sub"><Truck size={14} /> Está en el depósito de la proveedora. Se vende solo por envío, no se retira en el showroom.</p>
        </div>
        <div className="sba-acciones">
          <input ref={inputRef} type="file" accept="application/pdf" multiple hidden onChange={handlePdfs} />
          <button className="btn btn-primary" disabled={leyendo || !!importando} onClick={() => inputRef.current?.click()}>
            <FileUp size={15} /> {leyendo ? 'Leyendo PDF…' : 'Subir pedido (PDF)'}
          </button>
        </div>
      </div>

      {resultado && (
        <div className="sba-aviso" role="status">
          <span>{resultado}</span>
          <button aria-label="Cerrar" onClick={() => setResultado(null)}><X size={14} /></button>
        </div>
      )}

      <div className="sba-resumen">
        <div className="sba-dato"><strong>{fmt(pares)}</strong><span>pares</span></div>
        <div className="sba-dato"><strong>{fmt(conStock)}</strong><span>modelos</span></div>
        {role === 'dueno' && costoTotal > 0 && (
          <div className="sba-dato"><strong>${fmt(costoTotal)}</strong><span>a costo</span></div>
        )}
      </div>

      <div className="sba-filtros">
        <label className="sba-buscar">
          <Search size={15} />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por modelo, color o código" />
        </label>
        <div className="sba-talles" role="group" aria-label="Filtrar por talle">
          <button className={`sba-talle-btn${talleFiltro === '' ? ' on' : ''}`} onClick={() => setTalleFiltro('')}>Todos</button>
          {talles.map(t => (
            <button key={t} className={`sba-talle-btn${talleFiltro === t ? ' on' : ''}`} onClick={() => setTalleFiltro(talleFiltro === t ? '' : t)}>{t}</button>
          ))}
        </div>
      </div>

      {errorCarga && <p className="sba-error">No se pudo cargar el stock: {errorCarga}</p>}
      {cargando ? (
        <p className="sba-vacio">Cargando…</p>
      ) : modelos.length === 0 ? (
        <div className="sba-vacio">
          <p><strong>Todavía no hay pedidos cargados.</strong></p>
          <p>Subí el PDF de la proveedora y se arman solos los modelos, con foto y talles.</p>
        </div>
      ) : visibles.length === 0 ? (
        <p className="sba-vacio">No hay modelos con ese filtro.</p>
      ) : (
        <div className="sba-grid">
          {visibles.map(m => (
            <button key={m.id} className="sba-card" onClick={() => setAbierto(m.id)}>
              <div className="sba-foto">
                {m.foto_url ? <img src={m.foto_url} alt={m.descripcion} loading="lazy" /> : <span>Sin foto</span>}
                <span className="sba-pares">{totalPares(m)}</span>
              </div>
              <p className="sba-nombre">{m.descripcion}</p>
              <p className="sba-codigo">Código {m.codigo}</p>
              <div className="sba-chips">
                {[...m.stock_ba_talles].filter(t => t.cantidad > 0).sort((a, b) => ordenTalle(a.talle, b.talle)).map(t => (
                  <span key={t.id} className={`sba-chip${talleFiltro === t.talle ? ' on' : ''}`}>{t.talle}<b>×{t.cantidad}</b></span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Vista previa del PDF antes de cargar */}
      <Modal isOpen={!!cola} onClose={() => !importando && setCola(null)} title="Pedido en PDF" maxWidth="640px">
        {cola && (
          <div className="sba-previa">
            {cola.map((p, i) => (
              <div key={i} className="sba-previa-pedido">
                <p className="sba-previa-titulo">{p.pedido ? `Pedido ${p.pedido.numero}` : p.archivo}</p>
                {p.error && <p className="sba-error">{p.error}</p>}
                {p.pedido && (
                  <>
                    <p className="sba-previa-datos">
                      {p.pedido.proveedor ?? 'Proveedora'} · {p.pedido.fecha ?? 'sin fecha'} · {fmt(p.pedido.items.reduce((a, it) => a + it.cantidad, 0))} pares · {p.pedido.items.length} modelos
                    </p>
                    {p.yaCargado && <p className="sba-ok">Este pedido ya estaba cargado. No se hace nada.</p>}
                    {p.pedido.avisos.map((a, k) => <p key={k} className="sba-warn">{a}</p>)}
                    {!p.yaCargado && (
                      <div className="sba-previa-fotos">
                        {p.pedido.items.slice(0, 12).map(it => {
                          const blob = it.fotoNombre ? p.pedido!.fotos[it.fotoNombre] : null
                          return blob ? <MiniFoto key={it.codigo + it.descripcion} blob={blob} titulo={`${it.codigo} · ${it.cantidad} pares`} /> : null
                        })}
                        {p.pedido.items.length > 12 && <span className="sba-previa-mas">+{p.pedido.items.length - 12} más</span>}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
            <p className="sba-previa-nota">Si un modelo ya está cargado de otro pedido, se le suman los pares. Un pedido ya cargado no se repite.</p>
            {importando && <p className="sba-ok">{importando}</p>}
            <div className="sba-previa-botones">
              <button className="btn btn-secondary" disabled={!!importando} onClick={() => setCola(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={!!importando || paraCargar.length === 0} onClick={handleCargar}>
                {paraCargar.length === 0 ? 'Nada para cargar' : `Cargar ${paraCargar.length === 1 ? 'el pedido' : `${paraCargar.length} pedidos`}`}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <DetalleModelo
        modelo={modeloAbierto}
        empleadoId={empleadoId}
        onClose={() => setAbierto(null)}
        onCambio={recargar}
      />
    </div>
  )
}

function MiniFoto({ blob, titulo }: { blob: Blob; titulo: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url ? <img className="sba-mini" src={url} alt={titulo} title={titulo} /> : null
}

function DetalleModelo({ modelo, empleadoId, onClose, onCambio }: {
  modelo: ModeloBA | null; empleadoId: string | null; onClose: () => void; onCambio: () => Promise<void>
}) {
  const [nombre, setNombre] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [movs, setMovs] = useState<MovimientoBA[]>([])

  const id = modelo?.id
  const cargarMovs = useCallback(async () => {
    if (id) setMovs(await fetchMovimientosBA(id).catch(() => []))
  }, [id])
  useEffect(() => { setNombre(modelo?.descripcion ?? ''); setError(null); cargarMovs() }, [modelo?.id, modelo?.descripcion, cargarMovs])

  if (!modelo) return null
  const total = totalPares(modelo)

  const mover = async (talleId: string, delta: number) => {
    setError(null)
    setOcupado(talleId)
    try {
      await ajustarStockBA(talleId, delta, delta < 0 ? 'Venta / envío' : 'Ajuste', empleadoId)
      await onCambio()
      await cargarMovs()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado(null)
    }
  }

  const guardarNombre = async () => {
    const n = nombre.trim()
    if (!n || n === modelo.descripcion) return
    try { await renombrarModeloBA(modelo.id, n); await onCambio() } catch (e) { setError((e as Error).message) }
  }

  return (
    <Modal isOpen onClose={onClose} title={`Código ${modelo.codigo}`} maxWidth="520px">
      <div className="sba-detalle">
        {modelo.foto_url && <img className="sba-detalle-foto" src={modelo.foto_url} alt={modelo.descripcion} />}
        <input className="sba-detalle-nombre" value={nombre} onChange={e => setNombre(e.target.value)} onBlur={guardarNombre} aria-label="Nombre del modelo" />
        <p className="sba-previa-datos">{total} pares en Buenos Aires · solo envío</p>

        <div className="sba-filas">
          {[...modelo.stock_ba_talles].sort((a, b) => ordenTalle(a.talle, b.talle)).map(t => (
            <div key={t.id} className="sba-fila">
              <span className="sba-fila-talle">Talle {t.talle}</span>
              <div className="sba-stepper">
                <button aria-label="Descontar un par" disabled={t.cantidad === 0 || ocupado === t.id} onClick={() => mover(t.id, -1)}><Minus size={14} /></button>
                <b>{t.cantidad}</b>
                <button aria-label="Sumar un par" disabled={ocupado === t.id} onClick={() => mover(t.id, 1)}><Plus size={14} /></button>
              </div>
            </div>
          ))}
        </div>
        <p className="sba-previa-nota">El − descuenta un par cuando se vende o se manda. Todo queda anotado abajo.</p>
        {error && <p className="sba-error">{error}</p>}

        {movs.length > 0 && (
          <div className="sba-movs">
            <p className="sba-previa-titulo">Movimientos</p>
            {movs.slice(0, 8).map(m => (
              <p key={m.id} className="sba-mov">
                <span className={m.delta < 0 ? 'neg' : 'pos'}>{m.delta > 0 ? '+' : ''}{m.delta}</span> talle {m.talle} · {m.motivo} · {new Date(m.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
              </p>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
