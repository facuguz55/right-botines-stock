import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Minus, Plus, Camera, Link2, Unlink } from 'lucide-react'
import type { Modelo } from '../../types'
import { Modal } from '../Modal/Modal'
import { ImageLightbox } from '../ImageLightbox/ImageLightbox'
import { FotoBA } from './FotoBA'
import { analizarNombre } from '../../lib/stockBaNombre'
import {
  ajustarStockBA, sumarTalleBA, actualizarModeloBA, eliminarModeloBA, subirFotoBA, fetchMovimientosBA,
  type ModeloBA, type MovimientoBA,
} from '../../services/stockBA'

const ordenTalle = (a: string, b: string) => parseFloat(a) - parseFloat(b)
const MOTIVOS = ['Venta / envío', 'Ajuste', 'Devuelto a la proveedora', 'Roto / perdido']

const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const palabras = (s: string) => normalizar(s).split(/[^a-z0-9]+/).filter(w => w.length >= 3)

// Ordena los modelos del local por cuántas palabras comparten con el de Buenos Aires.
function sugeridos(modelosLocales: Modelo[], texto: string, busqueda: string): Modelo[] {
  const q = palabras(busqueda)
  const base = palabras(texto)
  return modelosLocales
    .map(m => {
      const nombre = normalizar(`${m.marca} ${m.modelo} ${m.notas ?? ''}`)
      if (q.length > 0 && !q.every(w => nombre.includes(w))) return null
      return { m, puntos: base.filter(w => nombre.includes(w)).length }
    })
    .filter((x): x is { m: Modelo; puntos: number } => x !== null)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, 8)
    .map(x => x.m)
}

interface Props {
  modelo: ModeloBA | null
  modelosLocales: Modelo[]
  role: string
  empleadoId: string | null
  onClose: () => void
  onCambio: () => Promise<void>
}

export function DetalleModeloBA({ modelo, modelosLocales, role, empleadoId, onClose, onCambio }: Props) {
  const esDueno = role === 'dueno'
  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [costo, setCosto] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [movs, setMovs] = useState<MovimientoBA[]>([])
  const [motivo, setMotivo] = useState(MOTIVOS[0])
  const [nota, setNota] = useState('')
  const [talleNuevo, setTalleNuevo] = useState('')
  const [cantNueva, setCantNueva] = useState('1')
  const [verFoto, setVerFoto] = useState(false)
  const [vinculando, setVinculando] = useState(false)
  const [busquedaLocal, setBusquedaLocal] = useState('')
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)
  const inputFoto = useRef<HTMLInputElement>(null)

  const id = modelo?.id
  const cargarMovs = useCallback(async () => {
    if (id) setMovs(await fetchMovimientosBA(id).catch(() => []))
  }, [id])

  useEffect(() => {
    setNombre(modelo?.descripcion ?? '')
    setPrecio(modelo?.precio_venta != null ? String(modelo.precio_venta) : '')
    setCosto(modelo?.costo != null ? String(modelo.costo) : '')
  }, [modelo?.id, modelo?.descripcion, modelo?.precio_venta, modelo?.costo])

  useEffect(() => {
    setError(null); setNota(''); setVinculando(false); setBusquedaLocal(''); setConfirmarBorrar(false); setTalleNuevo('')
    cargarMovs()
  }, [id, cargarMovs])

  const local = useMemo(() => modelosLocales.find(m => m.id === modelo?.modelo_local_id) ?? null, [modelosLocales, modelo?.modelo_local_id])
  const opciones = useMemo(
    () => (modelo && vinculando ? sugeridos(modelosLocales, modelo.descripcion, busquedaLocal) : []),
    [modelo, vinculando, modelosLocales, busquedaLocal],
  )

  if (!modelo) return null
  const m = modelo
  const info = analizarNombre(m.descripcion)
  const total = m.stock_ba_talles.reduce((a, t) => a + t.cantidad, 0)

  const correr = async (clave: string, fn: () => Promise<void>) => {
    setError(null)
    setOcupado(clave)
    try { await fn() } catch (e) { setError((e as Error).message) } finally { setOcupado(null) }
  }

  const mover = (talleId: string, delta: number) => correr(talleId, async () => {
    const base = delta < 0 ? motivo : 'Ajuste (suma)'
    await ajustarStockBA(talleId, delta, nota.trim() ? `${base} · ${nota.trim()}` : base, empleadoId)
    await onCambio()
    await cargarMovs()
  })

  const guardarCampo = (cambios: Parameters<typeof actualizarModeloBA>[1]) => correr('campo', async () => {
    await actualizarModeloBA(m.id, cambios)
    await onCambio()
  })

  const guardarNombre = () => {
    const n = nombre.trim()
    if (n && n !== m.descripcion) guardarCampo({ descripcion: n })
  }
  const guardarNumero = (valor: string, actual: number | null, campo: 'precio_venta' | 'costo') => {
    const n = valor.trim() === '' ? null : Number(valor.replace(',', '.'))
    if (n !== null && Number.isNaN(n)) return setError('Poné un número en el precio.')
    if (n !== actual) guardarCampo({ [campo]: n })
  }

  const cambiarFoto = (f: File | undefined) => {
    if (!f) return
    correr('foto', async () => {
      const url = await subirFotoBA(f, m.codigo)
      await actualizarModeloBA(m.id, { foto_url: url })
      await onCambio()
    })
  }

  const agregarTalle = () => {
    const t = talleNuevo.trim().replace(',', '.')
    const c = parseInt(cantNueva, 10)
    if (!/^\d{2}(\.5)?$/.test(t)) return setError('El talle tiene que ser como 42 o 42.5.')
    if (!c || c < 1) return setError('Poné cuántos pares.')
    correr('talle', async () => {
      await sumarTalleBA(m.id, t, c, nota.trim() ? `Ingreso · ${nota.trim()}` : 'Ingreso', empleadoId)
      setTalleNuevo(''); setCantNueva('1')
      await onCambio()
      await cargarMovs()
    })
  }

  const vincular = (localId: string | null) => correr('vinculo', async () => {
    await actualizarModeloBA(m.id, { modelo_local_id: localId })
    setVinculando(false); setBusquedaLocal('')
    await onCambio()
  })

  const borrar = () => correr('borrar', async () => {
    await eliminarModeloBA(m.id)
    await onCambio()
    onClose()
  })

  const margen = (() => {
    const p = Number(precio.replace(',', '.'))
    const c = Number(costo.replace(',', '.'))
    return esDueno && p > 0 && c > 0 ? Math.round(((p - c) / p) * 100) : null
  })()

  return (
    <Modal isOpen onClose={onClose} title={`Código ${m.codigo}`} maxWidth="540px">
      <div className="sba-detalle">
        <FotoBA src={m.foto_url} alt={info.titulo} onClick={() => setVerFoto(true)} />
        <div className="sba-detalle-acciones">
          <button className="btn btn-secondary btn-sm" disabled={ocupado === 'foto'} onClick={() => inputFoto.current?.click()}>
            <Camera size={14} /> {ocupado === 'foto' ? 'Subiendo…' : m.foto_url ? 'Cambiar foto' : 'Poner foto'}
          </button>
          <input ref={inputFoto} type="file" accept="image/*" hidden onChange={e => { cambiarFoto(e.target.files?.[0]); e.target.value = '' }} />
        </div>
        {verFoto && m.foto_url && <ImageLightbox src={m.foto_url} alt={info.titulo} onClose={() => setVerFoto(false)} />}

        <input className="sba-detalle-nombre" value={nombre} onChange={e => setNombre(e.target.value)} onBlur={guardarNombre} aria-label="Nombre del modelo" />
        <p className="sba-previa-datos">
          {total} pares en Buenos Aires · solo envío{info.ref ? ` · ${info.ref}` : ''}{info.nino ? ' · niño' : ''}
        </p>

        <div className="sba-form-fila">
          <label>Precio de venta ($)
            <input value={precio} onChange={e => setPrecio(e.target.value)} onBlur={() => guardarNumero(precio, m.precio_venta, 'precio_venta')} inputMode="decimal" placeholder="sin precio" />
          </label>
          {esDueno && (
            <label>Costo ($)
              <input value={costo} onChange={e => setCosto(e.target.value)} onBlur={() => guardarNumero(costo, m.costo, 'costo')} inputMode="decimal" placeholder="sin costo" />
            </label>
          )}
          {margen !== null && <div className="sba-margen"><strong>{margen}%</strong><span>margen</span></div>}
        </div>

        <p className="sba-form-titulo">Pares por talle</p>
        <div className="sba-filas">
          {[...m.stock_ba_talles].sort((a, b) => ordenTalle(a.talle, b.talle)).map(t => (
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

        <div className="sba-form-fila">
          <label>Al descontar, anotar como
            <select value={motivo} onChange={e => setMotivo(e.target.value)}>
              {MOTIVOS.map(x => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label className="grande">Nota (cliente, ciudad…)
            <input value={nota} onChange={e => setNota(e.target.value)} placeholder="opcional" />
          </label>
        </div>

        <div className="sba-form-fila sba-agregar-talle">
          <label>Talle nuevo<input value={talleNuevo} onChange={e => setTalleNuevo(e.target.value)} inputMode="decimal" placeholder="43" /></label>
          <label>Pares<input value={cantNueva} onChange={e => setCantNueva(e.target.value.replace(/\D/g, ''))} inputMode="numeric" /></label>
          <button className="btn btn-secondary" disabled={ocupado === 'talle' || !talleNuevo.trim()} onClick={agregarTalle}>Agregar talle</button>
        </div>

        <p className="sba-form-titulo">En el local</p>
        {local ? (
          <div className="sba-vinculo">
            {local.modelo_fotos[0] && <img src={local.modelo_fotos[0].foto_url} alt="" />}
            <div>
              <p className="sba-nombre">{local.marca} {local.modelo}</p>
              <p className="sba-codigo">
                {local.modelo_talles.filter(t => t.cantidad > 0).map(t => `${t.talle_arg}×${t.cantidad}`).join('  ') || 'Sin pares en el local'}
              </p>
            </div>
            <button className="btn btn-secondary btn-sm" disabled={ocupado === 'vinculo'} onClick={() => vincular(null)}><Unlink size={13} /> Desvincular</button>
          </div>
        ) : vinculando ? (
          <div className="sba-vincular">
            <input className="sba-detalle-nombre" autoFocus value={busquedaLocal} onChange={e => setBusquedaLocal(e.target.value)} placeholder="Buscar el modelo en el local" />
            {opciones.length === 0 && <p className="sba-previa-nota">No hay modelos del local con eso.</p>}
            {opciones.map(o => (
              <button key={o.id} className="sba-vinculo sba-opcion" onClick={() => vincular(o.id)}>
                {o.modelo_fotos[0] ? <img src={o.modelo_fotos[0].foto_url} alt="" /> : <span className="sba-vinculo-sin">⚽</span>}
                <div><p className="sba-nombre">{o.marca} {o.modelo}</p><p className="sba-codigo">{o.codigo_base}</p></div>
              </button>
            ))}
            <button className="btn btn-secondary btn-sm" onClick={() => setVinculando(false)}>Cancelar</button>
          </div>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={() => setVinculando(true)}><Link2 size={14} /> Es el mismo modelo que uno del local</button>
            <p className="sba-previa-nota">Al vincularlo, en Stock ese modelo muestra también estos talles de Buenos Aires, marcados como solo envío.</p>
          </>
        )}

        {error && <p className="sba-error">{error}</p>}

        {movs.length > 0 && (
          <div className="sba-movs">
            <p className="sba-form-titulo">Movimientos</p>
            {movs.slice(0, 12).map(mv => (
              <p key={mv.id} className="sba-mov">
                <span className={mv.delta < 0 ? 'neg' : 'pos'}>{mv.delta > 0 ? '+' : ''}{mv.delta}</span> talle {mv.talle} · {mv.motivo} · {new Date(mv.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
              </p>
            ))}
          </div>
        )}

        {esDueno && (
          confirmarBorrar ? (
            <div className="sba-borrar">
              <p className="sba-error">Se borra el modelo con todo su historial.</p>
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirmarBorrar(false)}>Cancelar</button>
              <button className="btn btn-danger btn-sm" disabled={ocupado === 'borrar'} onClick={borrar}>Sí, eliminar</button>
            </div>
          ) : (
            <button className="sba-borrar-link" onClick={() => setConfirmarBorrar(true)}>Eliminar modelo</button>
          )
        )}
      </div>
    </Modal>
  )
}
