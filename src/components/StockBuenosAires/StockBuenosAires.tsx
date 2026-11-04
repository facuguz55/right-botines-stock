import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileUp, Search, Truck, X, Plus, History, ClipboardCopy, Link2 } from 'lucide-react'
import type { Modelo, Role } from '../../types'
import { Modal } from '../Modal/Modal'
import { leerPedidoPdf, type PedidoLeido } from '../../lib/stockBaPdf'
import { analizarNombre, type MarcaBA } from '../../lib/stockBaNombre'
import { fetchStockBA, importarPedidoBA, pedidoBAYaCargado, type ModeloBA } from '../../services/stockBA'
import { FotoBA } from './FotoBA'
import { DetalleModeloBA } from './DetalleModeloBA'
import { AltaModeloBA } from './AltaModeloBA'
import { HistorialBA } from './HistorialBA'
import './StockBuenosAires.css'

// embebido: va adentro de la pestaña "Pedidos de la proveedora" (sin título propio).
interface Props { role: Role; empleadoId: string | null; modelosLocales: Modelo[]; embebido?: boolean }

type Orden = 'pares_desc' | 'pares_asc' | 'nombre' | 'nuevo'
const ORDENES: { v: Orden; t: string }[] = [
  { v: 'pares_desc', t: 'Más pares' },
  { v: 'pares_asc', t: 'Menos pares' },
  { v: 'nombre', t: 'Nombre A-Z' },
  { v: 'nuevo', t: 'Más nuevos' },
]

const totalPares = (m: ModeloBA) => m.stock_ba_talles.reduce((a, t) => a + t.cantidad, 0)
const ordenTalle = (a: string, b: string) => parseFloat(a) - parseFloat(b)
const fmt = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 0 })

interface PedidoEnCola { archivo: string; pedido: PedidoLeido | null; yaCargado: boolean; error: string | null }

export function StockBuenosAires({ role, empleadoId, modelosLocales, embebido = false }: Props) {
  const [modelos, setModelos] = useState<ModeloBA[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [talleFiltro, setTalleFiltro] = useState('')
  const [marcaFiltro, setMarcaFiltro] = useState<MarcaBA | ''>('')
  const [soloNinos, setSoloNinos] = useState(false)
  const [verAgotados, setVerAgotados] = useState(false)
  const [orden, setOrden] = useState<Orden>('pares_desc')
  const [altaAbierta, setAltaAbierta] = useState(false)
  const [historialAbierto, setHistorialAbierto] = useState(false)
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

  const infos = useMemo(() => new Map(modelos.map(m => [m.id, analizarNombre(m.descripcion)])), [modelos])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const lista = modelos
      .filter(m => verAgotados || totalPares(m) > 0)
      .filter(m => !q || m.descripcion.toLowerCase().includes(q) || infos.get(m.id)!.titulo.toLowerCase().includes(q) || m.codigo.includes(q))
      .filter(m => !marcaFiltro || infos.get(m.id)!.marca === marcaFiltro)
      .filter(m => !soloNinos || infos.get(m.id)!.nino)
      .filter(m => !talleFiltro || m.stock_ba_talles.some(t => t.talle === talleFiltro && t.cantidad > 0))
    const cmp: Record<Orden, (a: ModeloBA, b: ModeloBA) => number> = {
      pares_desc: (a, b) => totalPares(b) - totalPares(a),
      pares_asc: (a, b) => totalPares(a) - totalPares(b),
      nombre: (a, b) => infos.get(a.id)!.titulo.localeCompare(infos.get(b.id)!.titulo, 'es'),
      nuevo: (a, b) => b.created_at.localeCompare(a.created_at),
    }
    return [...lista].sort(cmp[orden])
  }, [modelos, infos, busqueda, talleFiltro, marcaFiltro, soloNinos, verAgotados, orden])

  const pares = modelos.reduce((a, m) => a + totalPares(m), 0)
  const conStock = modelos.filter(m => totalPares(m) > 0).length
  const costoTotal = modelos.reduce((a, m) => a + totalPares(m) * (m.costo ?? 0), 0)
  const ventaTotal = modelos.reduce((a, m) => a + totalPares(m) * (m.precio_venta ?? 0), 0)
  const sinPrecio = modelos.filter(m => totalPares(m) > 0 && !m.precio_venta).length

  // Lista lista para pegar en un chat: lo que se ve con los filtros de ahora.
  const copiarLista = async () => {
    const lineas = visibles.map(m => {
      const t = [...m.stock_ba_talles].filter(x => x.cantidad > 0).sort((a, b) => ordenTalle(a.talle, b.talle))
        .map(x => (x.cantidad > 1 ? `${x.talle}×${x.cantidad}` : x.talle)).join(', ')
      return `• ${infos.get(m.id)!.titulo}${m.precio_venta ? ` · $${fmt(m.precio_venta)}` : ''}\n  Talles: ${t}`
    })
    const texto = `Stock Buenos Aires (solo envío)\n\n${lineas.join('\n')}`
    try {
      await navigator.clipboard.writeText(texto)
      setResultado(`Lista copiada: ${visibles.length} modelos.`)
    } catch {
      setResultado('No se pudo copiar. Probá de nuevo.')
    }
  }

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
        {!embebido && (
          <div>
            <h1 className="page-title">Stock Buenos Aires</h1>
            <p className="sba-sub"><Truck size={14} /> Está en el depósito de la proveedora. Se vende solo por envío, no se retira en el showroom.</p>
          </div>
        )}
        <div className="sba-acciones">
          <button className="btn btn-secondary" onClick={() => setAltaAbierta(true)}><Plus size={15} /> Agregar modelo</button>
          <button className="btn btn-secondary" onClick={() => setHistorialAbierto(true)}><History size={15} /> Historial</button>
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
        {role === 'dueno' && ventaTotal > 0 && (
          <div className="sba-dato"><strong>${fmt(ventaTotal)}</strong><span>a precio de venta{sinPrecio ? ` (${sinPrecio} sin precio)` : ''}</span></div>
        )}
      </div>

      <div className="sba-filtros">
        <div className="sba-fila-filtros">
          <label className="sba-buscar">
            <Search size={15} />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por modelo, color o código" />
          </label>
          <select className="sba-orden" value={orden} onChange={e => setOrden(e.target.value as Orden)} aria-label="Ordenar">
            {ORDENES.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
          </select>
          <button className="btn btn-secondary sba-copiar" onClick={copiarLista} disabled={visibles.length === 0}>
            <ClipboardCopy size={14} /> Copiar lista
          </button>
        </div>
        <div className="sba-talles" role="group" aria-label="Filtrar por marca">
          {(['', 'Nike', 'Adidas', 'Otras'] as const).map(mc => (
            <button key={mc || 'todas'} className={`sba-talle-btn${marcaFiltro === mc ? ' on' : ''}`} onClick={() => setMarcaFiltro(mc)}>{mc || 'Todas las marcas'}</button>
          ))}
          <button className={`sba-talle-btn${soloNinos ? ' on' : ''}`} onClick={() => setSoloNinos(!soloNinos)}>Niños</button>
          <button className={`sba-talle-btn${verAgotados ? ' on' : ''}`} onClick={() => setVerAgotados(!verAgotados)}>Con agotados</button>
        </div>
        <div className="sba-talles" role="group" aria-label="Filtrar por talle">
          <button className={`sba-talle-btn${talleFiltro === '' ? ' on' : ''}`} onClick={() => setTalleFiltro('')}>Todos los talles</button>
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
          {visibles.map(m => {
            const info = infos.get(m.id)!
            const n = totalPares(m)
            return (
              <button key={m.id} className="sba-card" onClick={() => setAbierto(m.id)}>
                <div className="sba-foto-wrap">
                  <FotoBA src={m.foto_url} alt={info.titulo} />
                  <span className={`sba-pares${n === 0 ? ' cero' : ''}`}>{n === 0 ? 'Agotado' : n === 1 ? 'Último par' : n}</span>
                  {m.modelo_local_id && <span className="sba-vinc" title="Vinculado con un modelo del local"><Link2 size={11} /></span>}
                </div>
                <p className="sba-nombre">{info.titulo}</p>
                <p className="sba-codigo">Código {m.codigo}{info.ref ? ` · ${info.ref}` : ''}{info.nino ? ' · niño' : ''}</p>
                {m.precio_venta ? <p className="sba-precio">${fmt(m.precio_venta)}</p> : null}
                <div className="sba-chips">
                  {[...m.stock_ba_talles].filter(t => t.cantidad > 0).sort((a, b) => ordenTalle(a.talle, b.talle)).map(t => (
                    <span key={t.id} className={`sba-chip${talleFiltro === t.talle ? ' on' : ''}`}>{t.talle}<b>×{t.cantidad}</b></span>
                  ))}
                </div>
              </button>
            )
          })}
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

      <DetalleModeloBA
        modelo={modeloAbierto}
        modelosLocales={modelosLocales}
        role={role}
        empleadoId={empleadoId}
        onClose={() => setAbierto(null)}
        onCambio={recargar}
      />
      <AltaModeloBA isOpen={altaAbierta} empleadoId={empleadoId} verCosto={role === 'dueno'} onClose={() => setAltaAbierta(false)} onCreado={recargar} />
      <HistorialBA isOpen={historialAbierto} verCosto={role === 'dueno'} onClose={() => setHistorialAbierto(false)} />
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
