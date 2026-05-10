import { useState, useMemo, useRef } from 'react'
import {
  Search, Trash2, DollarSign, CheckSquare, Square, Minus,
  Percent, ArrowDownUp, Edit2, X, Check, AlertTriangle,
  ChevronDown, ChevronUp, Package,
} from 'lucide-react'
import type { Modelo } from '../../types'
import { bulkUpdatePrecio, bulkUpdateStockTalles, bulkDeleteModelos, updateModelo } from '../../services/modelos'
import { supabase } from '../../lib/supabase'
import './StockAvanzado.css'

type SortKey = 'marca' | 'modelo' | 'precio_venta' | 'precio_costo' | 'total_pares' | 'gama'
type StockOp = 'sumar' | 'restar' | 'fijar'
type PrecioTipo = 'exacto' | 'porcentaje' | 'fijo'
type PrecioOp = 'descuento' | 'aumento'

interface InlineEdit { id: string; campo: 'precio_venta' | 'precio_costo' | 'stock'; valor: string }

function totalPares(m: Modelo) { return m.modelo_talles.reduce((s, t) => s + t.cantidad, 0) }
function fmt(n: number) { return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 }) }
function calcNuevo(actual: number, tipo: PrecioTipo, op: PrecioOp, v: number): number {
  if (tipo === 'exacto') return Math.max(0, Math.round(v))
  let d = tipo === 'porcentaje' ? actual * (v / 100) : v
  if (op === 'descuento') d = -d
  return Math.max(0, Math.round(actual + d))
}

// ── Modal precios ────────────────────────────────────────────────────────────

function ModalPrecio({ seleccionados, onClose, onApply }: {
  seleccionados: Modelo[]
  onClose: () => void
  onApply: (campo: 'precio_venta' | 'precio_costo', items: { id: string; precioActual: number; precioNuevo: number }[]) => Promise<void>
}) {
  const [campo, setCampo] = useState<'precio_venta' | 'precio_costo'>('precio_venta')
  const [tipo, setTipo] = useState<PrecioTipo>('porcentaje')
  const [op, setOp] = useState<PrecioOp>('descuento')
  const [valor, setValor] = useState('')
  const [loading, setLoading] = useState(false)

  const v = parseFloat(valor)
  const isValid = valor !== '' && !isNaN(v) && v > 0

  const preview = useMemo(() => {
    if (!isValid) return []
    return seleccionados.map(m => {
      const actual = campo === 'precio_venta' ? m.precio_venta : m.precio_costo
      return { id: m.id, marca: m.marca, modelo: m.modelo, precioActual: actual, precioNuevo: calcNuevo(actual, tipo, op, v) }
    })
  }, [seleccionados, campo, tipo, op, v, isValid])

  const handle = async () => {
    setLoading(true)
    try { await onApply(campo, preview) } finally { setLoading(false) }
  }

  return (
    <div className="sa-modal-overlay" onClick={e => e.target === e.currentTarget && !loading && onClose()}>
      <div className="sa-modal">
        <div className="sa-modal-header">
          <h3>{seleccionados.length === 1 ? `Editar precio — ${seleccionados[0].marca} ${seleccionados[0].modelo}` : `Editar precio — ${seleccionados.length} modelos`}</h3>
          <button className="sa-modal-close" onClick={onClose} disabled={loading}><X size={16} /></button>
        </div>
        <div className="sa-modal-body">

          <div className="sa-modal-row">
            <span className="sa-modal-label">¿Cuál precio?</span>
            <div className="sa-toggle-group">
              <button className={`sa-toggle${campo === 'precio_venta' ? ' active' : ''}`} onClick={() => setCampo('precio_venta')}>Venta</button>
              <button className={`sa-toggle${campo === 'precio_costo' ? ' active' : ''}`} onClick={() => setCampo('precio_costo')}>Costo</button>
            </div>
          </div>

          <div className="sa-modal-row">
            <span className="sa-modal-label">¿Cómo?</span>
            <div className="sa-toggle-group">
              <button className={`sa-toggle${tipo === 'exacto' ? ' active' : ''}`} onClick={() => setTipo('exacto')}>= Precio exacto</button>
              <button className={`sa-toggle${tipo === 'porcentaje' ? ' active' : ''}`} onClick={() => setTipo('porcentaje')}><Percent size={12} /> Porcentaje</button>
              <button className={`sa-toggle${tipo === 'fijo' ? ' active' : ''}`} onClick={() => setTipo('fijo')}><DollarSign size={12} /> Monto fijo</button>
            </div>
          </div>

          {tipo !== 'exacto' && (
            <div className="sa-modal-row">
              <span className="sa-modal-label">Operación</span>
              <div className="sa-toggle-group">
                <button className={`sa-toggle${op === 'descuento' ? ' active' : ''}`} onClick={() => setOp('descuento')}>▼ Bajar</button>
                <button className={`sa-toggle${op === 'aumento' ? ' active' : ''}`} onClick={() => setOp('aumento')}>▲ Subir</button>
              </div>
            </div>
          )}

          <div className="sa-modal-row">
            <span className="sa-modal-label">
              {tipo === 'exacto' ? 'Nuevo precio' : tipo === 'porcentaje' ? 'Porcentaje' : 'Monto'}
            </span>
            <div className="sa-input-wrap">
              <input autoFocus type="number" className="sa-input" min={0} value={valor}
                placeholder={tipo === 'porcentaje' ? 'Ej: 15' : 'Ej: 5000'}
                onChange={e => setValor(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && isValid && handle()} />
              <span className="sa-input-suffix">{tipo === 'porcentaje' ? '%' : 'ARS'}</span>
            </div>
          </div>

          {isValid && preview.length > 0 && (
            <div className="sa-modal-preview">
              <p className="sa-modal-preview-title">Vista previa</p>
              <div className="sa-modal-preview-scroll">
                <table className="sa-prev-table">
                  <thead><tr><th>Modelo</th><th>Actual</th><th>Nuevo</th><th>Diferencia</th></tr></thead>
                  <tbody>
                    {preview.map(p => {
                      const d = p.precioNuevo - p.precioActual
                      return (
                        <tr key={p.id}>
                          <td>{p.marca} {p.modelo}</td>
                          <td>{fmt(p.precioActual)}</td>
                          <td className="pv-nuevo">{fmt(p.precioNuevo)}</td>
                          <td className={d < 0 ? 'pv-neg' : d > 0 ? 'pv-pos' : ''}>
                            {d !== 0 ? (d > 0 ? '+' : '') + d.toLocaleString('es-AR') : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div className="sa-modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
          <button className="btn btn-primary" onClick={handle} disabled={!isValid || loading}>
            {loading ? 'Aplicando...' : seleccionados.length === 1 ? 'Aplicar' : `Aplicar a ${seleccionados.length} modelos`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal stock ──────────────────────────────────────────────────────────────

function ModalStock({ seleccionados, onClose, onApply }: {
  seleccionados: Modelo[]
  onClose: () => void
  onApply: (items: { modeloId: string; talles: { id: string; cantidadActual: number }[] }[], op: StockOp, valor: number) => Promise<void>
}) {
  const [op, setOp] = useState<StockOp>('sumar')
  const [valor, setValor] = useState('')
  const [loading, setLoading] = useState(false)

  const v = parseInt(valor, 10)
  const isValid = valor !== '' && !isNaN(v) && v >= 0

  const calcNuevoStock = (actual: number) => {
    if (op === 'fijar') return Math.max(0, v)
    if (op === 'sumar') return actual + v
    return Math.max(0, actual - v)
  }

  const preview = useMemo(() => {
    if (!isValid) return []
    return seleccionados.map(m => ({
      id: m.id, marca: m.marca, modelo: m.modelo,
      totalActual: totalPares(m),
      totalNuevo: m.modelo_talles.reduce((s, t) => s + calcNuevoStock(t.cantidad), 0),
      talles: m.modelo_talles.map(t => ({ talle_arg: t.talle_arg, actual: t.cantidad, nuevo: calcNuevoStock(t.cantidad) })),
    }))
  }, [seleccionados, op, v, isValid])

  const handle = async () => {
    setLoading(true)
    try {
      await onApply(
        seleccionados.map(m => ({ modeloId: m.id, talles: m.modelo_talles.map(t => ({ id: t.id, cantidadActual: t.cantidad })) })),
        op, v
      )
    } finally { setLoading(false) }
  }

  const opLabel = { sumar: 'Sumar pares a cada talle', restar: 'Restar pares de cada talle', fijar: 'Fijar cantidad en cada talle' }

  return (
    <div className="sa-modal-overlay" onClick={e => e.target === e.currentTarget && !loading && onClose()}>
      <div className="sa-modal">
        <div className="sa-modal-header">
          <h3>{seleccionados.length === 1 ? `Editar stock — ${seleccionados[0].marca} ${seleccionados[0].modelo}` : `Editar stock — ${seleccionados.length} modelos`}</h3>
          <button className="sa-modal-close" onClick={onClose} disabled={loading}><X size={16} /></button>
        </div>
        <div className="sa-modal-body">

          <div className="sa-modal-row">
            <span className="sa-modal-label">Operación</span>
            <div className="sa-toggle-group">
              <button className={`sa-toggle${op === 'sumar' ? ' active' : ''}`} onClick={() => setOp('sumar')}>+ Sumar</button>
              <button className={`sa-toggle${op === 'restar' ? ' active' : ''}`} onClick={() => setOp('restar')}>− Restar</button>
              <button className={`sa-toggle${op === 'fijar' ? ' active' : ''}`} onClick={() => setOp('fijar')}>= Fijar</button>
            </div>
          </div>

          <p className="sa-modal-hint">{opLabel[op]}</p>

          <div className="sa-modal-row">
            <span className="sa-modal-label">Cantidad</span>
            <div className="sa-input-wrap">
              <input autoFocus type="number" className="sa-input" min={0} value={valor}
                placeholder="0"
                onChange={e => setValor(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && isValid && handle()} />
              <span className="sa-input-suffix">pares</span>
            </div>
          </div>

          {isValid && preview.length > 0 && (
            <div className="sa-modal-preview">
              <p className="sa-modal-preview-title">Vista previa</p>
              <div className="sa-modal-preview-scroll">
                <table className="sa-prev-table">
                  <thead><tr><th>Modelo</th><th>Talles</th><th>Total actual</th><th>Total nuevo</th></tr></thead>
                  <tbody>
                    {preview.map(p => (
                      <tr key={p.id}>
                        <td>{p.marca} {p.modelo}</td>
                        <td>
                          <div className="sa-prev-talles">
                            {p.talles.map(t => (
                              <span key={t.talle_arg} className={`sa-prev-talle${t.nuevo !== t.actual ? ' changed' : ''}`}>
                                {t.talle_arg}: {t.actual}→{t.nuevo}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>{p.totalActual}</td>
                        <td className={p.totalNuevo > p.totalActual ? 'pv-pos' : p.totalNuevo < p.totalActual ? 'pv-neg' : 'pv-nuevo'}>
                          {p.totalNuevo}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div className="sa-modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
          <button className="btn btn-primary" onClick={handle} disabled={!isValid || loading}>
            {loading ? 'Aplicando...' : seleccionados.length === 1 ? 'Aplicar' : `Aplicar a ${seleccionados.length} modelos`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ────────────────────────────────────────────────────

export function StockAvanzado({ modelos, onReload }: { modelos: Modelo[]; onReload: () => void }) {
  const [search, setSearch] = useState('')
  const [filtroMarca, setFiltroMarca] = useState('')
  const [filtroGama, setFiltroGama] = useState('')
  const [filtroCat, setFiltroCat] = useState('')
  const [filtroDisp, setFiltroDisp] = useState<'todos' | 'disponible' | 'agotado'>('todos')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'marca', dir: 'asc' })

  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<'precio' | 'stock' | 'borrar' | null>(null)
  const [inlineEdit, setInlineEdit] = useState<InlineEdit | null>(null)
  const [operando, setOperando] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)
  const inlineRef = useRef<HTMLInputElement>(null)

  const marcasDisp = useMemo(() => [...new Set(modelos.map(m => m.marca))].sort(), [modelos])

  const filtrados = useMemo(() => {
    let list = modelos
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(m => m.marca.toLowerCase().includes(q) || m.modelo.toLowerCase().includes(q) || m.codigo_base.toLowerCase().includes(q))
    }
    if (filtroMarca) list = list.filter(m => m.marca === filtroMarca)
    if (filtroGama) list = list.filter(m => m.gama === filtroGama)
    if (filtroCat) list = list.filter(m => m.categoria === filtroCat)
    if (filtroDisp === 'disponible') list = list.filter(m => totalPares(m) > 0)
    if (filtroDisp === 'agotado') list = list.filter(m => totalPares(m) === 0)
    return list
  }, [modelos, search, filtroMarca, filtroGama, filtroCat, filtroDisp])

  const ordenados = useMemo(() => [...filtrados].sort((a, b) => {
    let va: any = sort.key === 'total_pares' ? totalPares(a) : (a as any)[sort.key]
    let vb: any = sort.key === 'total_pares' ? totalPares(b) : (b as any)[sort.key]
    if (typeof va === 'string') return sort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    return sort.dir === 'asc' ? va - vb : vb - va
  }), [filtrados, sort])

  const seleccionados = useMemo(() => modelos.filter(m => seleccion.has(m.id)), [modelos, seleccion])
  const allChecked = ordenados.length > 0 && ordenados.every(m => seleccion.has(m.id))
  const someChecked = ordenados.some(m => seleccion.has(m.id)) && !allChecked

  const toggleAll = () => {
    if (allChecked) setSeleccion(s => { const n = new Set(s); ordenados.forEach(m => n.delete(m.id)); return n })
    else setSeleccion(s => { const n = new Set(s); ordenados.forEach(m => n.add(m.id)); return n })
  }
  const toggleOne = (id: string) =>
    setSeleccion(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const handleSort = (key: SortKey) =>
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })

  const SortIcon = ({ k }: { k: SortKey }) =>
    sort.key !== k ? <ArrowDownUp size={11} className="sort-icon inactive" /> :
    sort.dir === 'asc' ? <ChevronUp size={11} className="sort-icon" /> : <ChevronDown size={11} className="sort-icon" />

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg })
    setTimeout(() => setToast(null), 3500)
  }

  // Handlers
  const handleBulkPrecio = async (campo: 'precio_venta' | 'precio_costo', items: { id: string; precioActual: number; precioNuevo: number }[]) => {
    await bulkUpdatePrecio(items, campo)
    setModal(null); setSeleccion(new Set()); onReload()
    showToast(true, `Precio actualizado en ${items.length} modelo${items.length !== 1 ? 's' : ''}.`)
  }

  const handleBulkStock = async (
    items: { modeloId: string; talles: { id: string; cantidadActual: number }[] }[],
    op: StockOp, valor: number
  ) => {
    await bulkUpdateStockTalles(items, op, valor)
    setModal(null); setSeleccion(new Set()); onReload()
    showToast(true, `Stock actualizado en ${items.length} modelo${items.length !== 1 ? 's' : ''}.`)
  }

  const handleBulkDelete = async () => {
    setOperando(true)
    try {
      const n = seleccion.size
      await bulkDeleteModelos([...seleccion])
      setSeleccion(new Set()); setModal(null); onReload()
      showToast(true, `${n} modelo${n !== 1 ? 's' : ''} eliminado${n !== 1 ? 's' : ''}.`)
    } catch (e: any) {
      showToast(false, e.message ?? 'Error al eliminar.')
    } finally { setOperando(false) }
  }

  // Inline edit
  const startInline = (m: Modelo, campo: InlineEdit['campo']) => {
    const valor = campo === 'precio_venta' ? String(m.precio_venta)
      : campo === 'precio_costo' ? String(m.precio_costo)
      : String(totalPares(m))
    setInlineEdit({ id: m.id, campo, valor })
    setTimeout(() => inlineRef.current?.select(), 50)
  }

  const commitInline = async () => {
    if (!inlineEdit) return
    const v = parseFloat(inlineEdit.valor)
    if (isNaN(v) || v < 0) { setInlineEdit(null); return }
    const modelo = modelos.find(m => m.id === inlineEdit.id)
    if (!modelo) { setInlineEdit(null); return }
    try {
      if (inlineEdit.campo === 'stock') {
        // Fijar todos los talles al valor ingresado
        await bulkUpdateStockTalles(
          [{ modeloId: modelo.id, talles: modelo.modelo_talles.map(t => ({ id: t.id, cantidadActual: t.cantidad })) }],
          'fijar', Math.round(v)
        )
      } else if (inlineEdit.campo === 'precio_venta') {
        await Promise.all([
          updateModelo(inlineEdit.id, { precio_venta: Math.round(v) } as any),
          supabase.from('historial_precios').insert([{ modelo_id: inlineEdit.id, precio_venta_anterior: modelo.precio_venta, precio_venta_nuevo: Math.round(v) }]),
        ])
      } else {
        await updateModelo(inlineEdit.id, { precio_costo: Math.round(v) } as any)
      }
      onReload()
      showToast(true, 'Actualizado.')
    } catch { showToast(false, 'Error al guardar.') }
    setInlineEdit(null)
  }

  const EditableCell = ({ m, campo, display }: { m: Modelo; campo: InlineEdit['campo']; display: string }) => {
    const isEditing = inlineEdit?.id === m.id && inlineEdit?.campo === campo
    if (isEditing) {
      return (
        <div className="sa-inline-edit">
          <input
            ref={inlineRef}
            className="sa-inline-input"
            type="number" min={0}
            value={inlineEdit!.valor}
            onChange={e => setInlineEdit(ie => ie ? { ...ie, valor: e.target.value } : ie)}
            onKeyDown={e => { if (e.key === 'Enter') commitInline(); if (e.key === 'Escape') setInlineEdit(null) }}
          />
          <button className="sa-inline-btn ok" onClick={commitInline}><Check size={12} /></button>
          <button className="sa-inline-btn cancel" onClick={() => setInlineEdit(null)}><X size={12} /></button>
        </div>
      )
    }
    return (
      <button className="sa-price-cell" onClick={() => startInline(m, campo)} title="Clic para editar">
        {display} <Edit2 size={10} className="sa-edit-ico" />
      </button>
    )
  }

  const hayFiltros = search || filtroMarca || filtroGama || filtroCat || filtroDisp !== 'todos'

  return (
    <div className="sa-root">

      {/* Toolbar */}
      <div className="sa-toolbar">
        <div className="sa-search-wrap">
          <Search size={14} className="sa-search-ico" />
          <input className="sa-search" placeholder="Buscar por marca, modelo o código…"
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="sa-search-clear" onClick={() => setSearch('')}><X size={13} /></button>}
        </div>

        <div className="sa-filter-chips">
          {(['todos', 'disponible', 'agotado'] as const).map(d => (
            <button key={d} className={`chip${filtroDisp === d ? ' active' : ''}`} onClick={() => setFiltroDisp(d)}>
              {d === 'todos' ? 'Todos' : d === 'disponible' ? 'Con stock' : 'Agotados'}
            </button>
          ))}
          <span className="sa-chip-sep" />
          {['Económica', 'Media', 'Alta'].map(g => (
            <button key={g} className={`chip${filtroGama === g ? ' active' : ''}`}
              onClick={() => setFiltroGama(filtroGama === g ? '' : g)}>{g}</button>
          ))}
          <span className="sa-chip-sep" />
          {['F5', 'F11', 'Futsal', 'Hockey'].map(c => (
            <button key={c} className={`chip${filtroCat === c ? ' active' : ''}`}
              onClick={() => setFiltroCat(filtroCat === c ? '' : c)}>{c}</button>
          ))}
          <span className="sa-chip-sep" />
          <select className="sa-select" value={filtroMarca} onChange={e => setFiltroMarca(e.target.value)}>
            <option value="">Todas las marcas</option>
            {marcasDisp.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {hayFiltros && (
            <button className="chip chip-reset" onClick={() => { setSearch(''); setFiltroMarca(''); setFiltroGama(''); setFiltroCat(''); setFiltroDisp('todos') }}>
              <X size={11} /> Limpiar
            </button>
          )}
        </div>

        <p className="sa-count">
          {filtrados.length} modelo{filtrados.length !== 1 ? 's' : ''}
          {filtrados.length !== modelos.length && ` de ${modelos.length}`}
          {seleccion.size > 0 && <span className="sa-count-sel"> · {seleccion.size} seleccionado{seleccion.size !== 1 ? 's' : ''}</span>}
        </p>
      </div>

      {/* Leyenda de edición inline */}
      <div className="sa-hint-bar">
        <div className="sa-hint-item">
          <Edit2 size={13} />
          <span><strong>Clic en Pares</strong> → editá el total de stock del modelo</span>
        </div>
        <span className="sa-hint-sep" />
        <div className="sa-hint-item">
          <Edit2 size={13} />
          <span><strong>Clic en Costo o Venta</strong> → editá el precio directamente</span>
        </div>
        <span className="sa-hint-sep" />
        <div className="sa-hint-item">
          <CheckSquare size={13} />
          <span><strong>Seleccioná varios</strong> → editá o eliminá en conjunto</span>
        </div>
      </div>

      {/* Tabla */}
      <div className="sa-table-wrap">
        <table className="sa-table">
          <thead>
            <tr>
              <th className="sa-th-check">
                <button className="sa-checkbox" onClick={toggleAll} title="Seleccionar todos">
                  {allChecked ? <CheckSquare size={15} className="checked" /> : someChecked ? <Minus size={15} className="some" /> : <Square size={15} />}
                </button>
              </th>
              <th className="sa-th-foto" />
              <th className="sa-th sortable" onClick={() => handleSort('marca')}>Marca / Modelo <SortIcon k="marca" /></th>
              <th className="sa-th sortable" onClick={() => handleSort('gama')}>Gama / Cat <SortIcon k="gama" /></th>
              <th className="sa-th">Talles</th>
              <th className="sa-th sortable" onClick={() => handleSort('total_pares')}>Pares <SortIcon k="total_pares" /></th>
              <th className="sa-th sortable" onClick={() => handleSort('precio_costo')}>Costo <SortIcon k="precio_costo" /></th>
              <th className="sa-th sortable" onClick={() => handleSort('precio_venta')}>Venta <SortIcon k="precio_venta" /></th>
              <th className="sa-th">Margen</th>
            </tr>
          </thead>
          <tbody>
            {ordenados.length === 0 ? (
              <tr><td colSpan={9} className="sa-empty">
                {modelos.length === 0 ? 'No hay modelos en el stock.' : 'Sin resultados para esos filtros.'}
              </td></tr>
            ) : ordenados.map(m => {
              const pares = totalPares(m)
              const margen = m.precio_venta > 0 && m.precio_costo > 0
                ? Math.round((m.precio_venta - m.precio_costo) / m.precio_venta * 100) : null
              const checked = seleccion.has(m.id)
              const foto = m.modelo_fotos[0]?.foto_url
              return (
                <tr key={m.id} className={`sa-row${checked ? ' selected' : ''}${pares === 0 ? ' agotado' : ''}`}>
                  <td className="sa-td-check">
                    <button className="sa-checkbox" onClick={() => toggleOne(m.id)}>
                      {checked ? <CheckSquare size={15} className="checked" /> : <Square size={15} />}
                    </button>
                  </td>
                  <td className="sa-td-foto">
                    {foto ? <img src={foto} alt="" className="sa-thumb" /> : <div className="sa-thumb-ph">⚽</div>}
                  </td>
                  <td className="sa-td-nombre">
                    <p className="sa-marca">{m.marca}</p>
                    <p className="sa-modelo">{m.modelo}</p>
                    <p className="sa-codigo">{m.codigo_base}</p>
                  </td>
                  <td className="sa-td-gama">
                    <span className={`sa-badge gama-${m.gama.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}`}>{m.gama}</span>
                    <span className="sa-cat">{m.categoria}</span>
                  </td>
                  <td className="sa-td-talles">
                    {m.modelo_talles.length === 0 ? <span className="sa-no-talles">—</span> : (
                      <div className="sa-talles-list">
                        {m.modelo_talles.map(t => (
                          <span key={t.id} className={`sa-talle-chip${t.cantidad === 0 ? ' out' : t.cantidad <= t.stock_minimo ? ' low' : ''}`}>
                            {t.talle_arg}<small>/{t.cantidad}</small>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="sa-td-pares">
                    <EditableCell m={m} campo="stock" display={String(pares)} />
                  </td>
                  <td className="sa-td-precio">
                    <EditableCell m={m} campo="precio_costo" display={fmt(m.precio_costo)} />
                  </td>
                  <td className="sa-td-precio">
                    <EditableCell m={m} campo="precio_venta" display={fmt(m.precio_venta)} />
                  </td>
                  <td className="sa-td-margen">
                    {margen !== null ? <span className={`sa-margen${margen < 20 ? ' low' : ''}`}>{margen}%</span> : <span className="sa-muted">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Barra flotante */}
      {seleccion.size > 0 && (
        <div className="sa-float-bar">
          <button className="sa-float-desel" onClick={() => setSeleccion(new Set())}>
            <X size={14} /> {seleccion.size} seleccionado{seleccion.size !== 1 ? 's' : ''}
          </button>
          <div className="sa-float-actions">
            <button className="btn btn-secondary sa-float-btn" onClick={() => setModal('precio')}>
              <DollarSign size={14} /> Editar precio
            </button>
            <button className="btn btn-secondary sa-float-btn" onClick={() => setModal('stock')}>
              <Package size={14} /> Editar stock
            </button>
            <button className="btn btn-danger sa-float-btn" onClick={() => setModal('borrar')}>
              <Trash2 size={14} /> Eliminar
            </button>
          </div>
        </div>
      )}

      {modal === 'precio' && (
        <ModalPrecio seleccionados={seleccionados} onClose={() => setModal(null)} onApply={handleBulkPrecio} />
      )}

      {modal === 'stock' && (
        <ModalStock seleccionados={seleccionados} onClose={() => setModal(null)} onApply={handleBulkStock} />
      )}

      {modal === 'borrar' && (
        <div className="sa-modal-overlay" onClick={e => e.target === e.currentTarget && !operando && setModal(null)}>
          <div className="sa-modal sa-modal-sm">
            <div className="sa-modal-header">
              <h3>Eliminar {seleccion.size} modelo{seleccion.size !== 1 ? 's' : ''}</h3>
              <button className="sa-modal-close" onClick={() => setModal(null)} disabled={operando}><X size={16} /></button>
            </div>
            <div className="sa-modal-body">
              <p className="sa-confirm-text">
                <AlertTriangle size={16} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                Esto elimina <strong>{seleccion.size} modelo{seleccion.size !== 1 ? 's' : ''}</strong> y todas sus fotos. <strong>No se puede deshacer.</strong>
              </p>
            </div>
            <div className="sa-modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)} disabled={operando}>Cancelar</button>
              <button className="btn btn-danger" onClick={handleBulkDelete} disabled={operando}>
                {operando ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`sa-toast ${toast.ok ? 'ok' : 'error'}`}>
          {toast.ok ? <Check size={14} /> : <AlertTriangle size={14} />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}
