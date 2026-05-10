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

// ── Tipos ───────────────────────────────────────────────────────────────────

type BulkCampo = 'precio_venta' | 'precio_costo' | 'stock'
type PrecioTipo = 'exacto' | 'porcentaje' | 'fijo'
type PrecioOp = 'descuento' | 'aumento'
type StockOp = 'sumar' | 'restar' | 'exacto'
type SortKey = 'marca' | 'modelo' | 'precio_venta' | 'precio_costo' | 'total_pares' | 'gama'

interface InlineEdit {
  id: string
  campo: 'precio_venta' | 'precio_costo'
  valor: string
}

interface InlineStock {
  id: string
  op: StockOp
  valor: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function totalPares(m: Modelo) {
  return m.modelo_talles.reduce((s, t) => s + t.cantidad, 0)
}

function fmt(n: number) {
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

function calcPrecioNuevo(actual: number, tipo: PrecioTipo, op: PrecioOp, valor: number): number {
  if (tipo === 'exacto') return Math.max(0, Math.round(valor))
  let delta = tipo === 'porcentaje' ? actual * (valor / 100) : valor
  if (op === 'descuento') delta = -delta
  return Math.max(0, Math.round(actual + delta))
}

function calcStockNuevo(actual: number, op: StockOp, valor: number): number {
  if (op === 'exacto') return Math.max(0, Math.round(valor))
  if (op === 'sumar') return actual + Math.round(valor)
  return Math.max(0, actual - Math.round(valor))
}

// ── Modal unificado ─────────────────────────────────────────────────────────

interface BulkModalProps {
  count: number
  seleccionados: Modelo[]
  onClose: () => void
  onApplyPrecio: (campo: 'precio_venta' | 'precio_costo', items: { id: string; precioActual: number; precioNuevo: number }[]) => Promise<void>
  onApplyStock: (items: { modeloId: string; talles: { id: string; cantidadActual: number }[] }[], op: StockOp, valor: number) => Promise<void>
}

function BulkEditModal({ count, seleccionados, onClose, onApplyPrecio, onApplyStock }: BulkModalProps) {
  const [campo, setCampo] = useState<BulkCampo>('precio_venta')
  const [precioTipo, setPrecioTipo] = useState<PrecioTipo>('porcentaje')
  const [precioOp, setPrecioOp] = useState<PrecioOp>('descuento')
  const [stockOp, setStockOp] = useState<StockOp>('sumar')
  const [valor, setValor] = useState('')
  const [loading, setLoading] = useState(false)

  const v = parseFloat(valor)
  const isValid = valor !== '' && !isNaN(v) && v >= 0 && (campo === 'stock' || v > 0)

  // Preview para precios
  const precioPreview = useMemo(() => {
    if (campo === 'stock' || !isValid) return []
    return seleccionados.map(m => {
      const actual = campo === 'precio_venta' ? m.precio_venta : m.precio_costo
      return { id: m.id, marca: m.marca, modelo: m.modelo, precioActual: actual, precioNuevo: calcPrecioNuevo(actual, precioTipo, precioOp, v) }
    })
  }, [seleccionados, campo, precioTipo, precioOp, v, isValid])

  // Preview para stock
  const stockPreview = useMemo(() => {
    if (campo !== 'stock' || !isValid) return []
    return seleccionados.map(m => ({
      id: m.id,
      marca: m.marca,
      modelo: m.modelo,
      totalActual: totalPares(m),
      totalNuevo: m.modelo_talles.reduce((s, t) => s + calcStockNuevo(t.cantidad, stockOp, v), 0),
      talles: m.modelo_talles.map(t => ({
        talle_arg: t.talle_arg,
        actual: t.cantidad,
        nuevo: calcStockNuevo(t.cantidad, stockOp, v),
      })),
    }))
  }, [seleccionados, campo, stockOp, v, isValid])

  const handle = async () => {
    if (!isValid) return
    setLoading(true)
    try {
      if (campo === 'stock') {
        const items = seleccionados.map(m => ({
          modeloId: m.id,
          talles: m.modelo_talles.map(t => ({ id: t.id, cantidadActual: t.cantidad })),
        }))
        await onApplyStock(items, stockOp, Math.round(v))
      } else {
        await onApplyPrecio(campo, precioPreview)
      }
    } finally {
      setLoading(false)
    }
  }

  const labelSufijo = campo === 'stock' ? 'pares' : precioTipo === 'porcentaje' ? '%' : 'ARS'
  const labelValor =
    campo === 'stock' ? 'Cantidad (pares)' :
    precioTipo === 'exacto' ? 'Nuevo precio (ARS)' :
    precioTipo === 'porcentaje' ? 'Porcentaje (%)' : 'Monto (ARS)'

  return (
    <div className="sa-modal-overlay" onClick={e => e.target === e.currentTarget && !loading && onClose()}>
      <div className="sa-modal">
        <div className="sa-modal-header">
          <h3>Editar en masa — {count} modelo{count !== 1 ? 's' : ''}</h3>
          <button className="sa-modal-close" onClick={onClose} disabled={loading}><X size={16} /></button>
        </div>

        <div className="sa-modal-body">
          {/* Selector de campo */}
          <div className="sa-modal-row">
            <span className="sa-modal-label">¿Qué editás?</span>
            <div className="sa-toggle-group">
              <button className={`sa-toggle${campo === 'precio_venta' ? ' active' : ''}`} onClick={() => setCampo('precio_venta')}>
                <DollarSign size={12} /> Precio venta
              </button>
              <button className={`sa-toggle${campo === 'precio_costo' ? ' active' : ''}`} onClick={() => setCampo('precio_costo')}>
                <DollarSign size={12} /> Precio costo
              </button>
              <button className={`sa-toggle${campo === 'stock' ? ' active' : ''}`} onClick={() => setCampo('stock')}>
                <Package size={12} /> Stock
              </button>
            </div>
          </div>

          {/* Opciones de precio */}
          {campo !== 'stock' && (
            <>
              <div className="sa-modal-row">
                <span className="sa-modal-label">Tipo</span>
                <div className="sa-toggle-group">
                  <button className={`sa-toggle${precioTipo === 'exacto' ? ' active' : ''}`} onClick={() => setPrecioTipo('exacto')}>
                    = Precio exacto
                  </button>
                  <button className={`sa-toggle${precioTipo === 'porcentaje' ? ' active' : ''}`} onClick={() => setPrecioTipo('porcentaje')}>
                    <Percent size={12} /> Porcentaje
                  </button>
                  <button className={`sa-toggle${precioTipo === 'fijo' ? ' active' : ''}`} onClick={() => setPrecioTipo('fijo')}>
                    <DollarSign size={12} /> Monto fijo
                  </button>
                </div>
              </div>
              {precioTipo !== 'exacto' && (
                <div className="sa-modal-row">
                  <span className="sa-modal-label">Operación</span>
                  <div className="sa-toggle-group">
                    <button className={`sa-toggle${precioOp === 'descuento' ? ' active' : ''}`} onClick={() => setPrecioOp('descuento')}>▼ Descuento</button>
                    <button className={`sa-toggle${precioOp === 'aumento' ? ' active' : ''}`} onClick={() => setPrecioOp('aumento')}>▲ Aumento</button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Opciones de stock */}
          {campo === 'stock' && (
            <div className="sa-modal-row">
              <span className="sa-modal-label">Operación</span>
              <div className="sa-toggle-group">
                <button className={`sa-toggle${stockOp === 'sumar' ? ' active' : ''}`} onClick={() => setStockOp('sumar')}>+ Sumar pares</button>
                <button className={`sa-toggle${stockOp === 'restar' ? ' active' : ''}`} onClick={() => setStockOp('restar')}>− Restar pares</button>
                <button className={`sa-toggle${stockOp === 'exacto' ? ' active' : ''}`} onClick={() => setStockOp('exacto')}>= Fijar cantidad</button>
              </div>
            </div>
          )}

          {/* Valor */}
          <div className="sa-modal-row">
            <span className="sa-modal-label">{labelValor}</span>
            <div className="sa-input-wrap">
              <input
                autoFocus
                type="number"
                className="sa-input"
                min={0}
                value={valor}
                placeholder="0"
                onChange={e => setValor(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handle()}
              />
              <span className="sa-input-suffix">{labelSufijo}</span>
            </div>
          </div>

          {/* Preview precios */}
          {isValid && campo !== 'stock' && precioPreview.length > 0 && (
            <div className="sa-modal-preview">
              <p className="sa-modal-preview-title">Vista previa</p>
              <div className="sa-modal-preview-scroll">
                <table className="sa-prev-table">
                  <thead><tr><th>Modelo</th><th>Actual</th><th>Nuevo</th><th>Δ</th></tr></thead>
                  <tbody>
                    {precioPreview.map(p => {
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

          {/* Preview stock */}
          {isValid && campo === 'stock' && stockPreview.length > 0 && (
            <div className="sa-modal-preview">
              <p className="sa-modal-preview-title">Vista previa — pares por modelo</p>
              <div className="sa-modal-preview-scroll">
                <table className="sa-prev-table">
                  <thead><tr><th>Modelo</th><th>Talles afectados</th><th>Total actual</th><th>Total nuevo</th></tr></thead>
                  <tbody>
                    {stockPreview.map(p => {
                      const d = p.totalNuevo - p.totalActual
                      return (
                        <tr key={p.id}>
                          <td>{p.marca} {p.modelo}</td>
                          <td className="sa-prev-talles">
                            {p.talles.map(t => (
                              <span key={t.talle_arg} className={`sa-prev-talle${t.nuevo !== t.actual ? ' changed' : ''}`}>
                                {t.talle_arg}: {t.actual}→{t.nuevo}
                              </span>
                            ))}
                          </td>
                          <td>{p.totalActual}</td>
                          <td className={d < 0 ? 'pv-neg' : d > 0 ? 'pv-pos' : 'pv-nuevo'}>{p.totalNuevo}</td>
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
            {loading ? 'Aplicando...' : `Aplicar a ${count} modelo${count !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ────────────────────────────────────────────────────

interface StockAvanzadoProps {
  modelos: Modelo[]
  onReload: () => void
}

export function StockAvanzado({ modelos, onReload }: StockAvanzadoProps) {
  const [search, setSearch] = useState('')
  const [filtroMarca, setFiltroMarca] = useState('')
  const [filtroGama, setFiltroGama] = useState('')
  const [filtroCat, setFiltroCat] = useState('')
  const [filtroDisp, setFiltroDisp] = useState<'todos' | 'disponible' | 'agotado'>('todos')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'marca', dir: 'asc' })

  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [inlineEdit, setInlineEdit] = useState<InlineEdit | null>(null)
  const [inlineStock, setInlineStock] = useState<InlineStock | null>(null)
  const [operando, setOperando] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)
  const inlineRef = useRef<HTMLInputElement>(null)

  const marcasDisp = useMemo(() => [...new Set(modelos.map(m => m.marca))].sort(), [modelos])
  const gamas = ['Económica', 'Media', 'Alta']
  const categorias = ['F5', 'F11', 'Futsal', 'Hockey']

  const filtrados = useMemo(() => {
    let list = modelos
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(m =>
        m.marca.toLowerCase().includes(q) || m.modelo.toLowerCase().includes(q) || m.codigo_base.toLowerCase().includes(q)
      )
    }
    if (filtroMarca) list = list.filter(m => m.marca === filtroMarca)
    if (filtroGama) list = list.filter(m => m.gama === filtroGama)
    if (filtroCat) list = list.filter(m => m.categoria === filtroCat)
    if (filtroDisp === 'disponible') list = list.filter(m => totalPares(m) > 0)
    if (filtroDisp === 'agotado') list = list.filter(m => totalPares(m) === 0)
    return list
  }, [modelos, search, filtroMarca, filtroGama, filtroCat, filtroDisp])

  const ordenados = useMemo(() => [...filtrados].sort((a, b) => {
    let va: any, vb: any
    if (sort.key === 'total_pares') { va = totalPares(a); vb = totalPares(b) }
    else { va = (a as any)[sort.key]; vb = (b as any)[sort.key] }
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

  // ── Bulk precio ──
  const handleBulkPrecio = async (
    campo: 'precio_venta' | 'precio_costo',
    items: { id: string; precioActual: number; precioNuevo: number }[]
  ) => {
    await bulkUpdatePrecio(items, campo)
    setShowBulkModal(false)
    setSeleccion(new Set())
    onReload()
    showToast(true, `Precio actualizado en ${items.length} modelo${items.length !== 1 ? 's' : ''}.`)
  }

  // ── Bulk stock ──
  const handleBulkStock = async (
    items: { modeloId: string; talles: { id: string; cantidadActual: number }[] }[],
    op: StockOp,
    valor: number
  ) => {
    await bulkUpdateStockTalles(items, op, valor)
    setShowBulkModal(false)
    setSeleccion(new Set())
    onReload()
    showToast(true, `Stock actualizado en ${items.length} modelo${items.length !== 1 ? 's' : ''}.`)
  }

  // ── Bulk delete ──
  const handleBulkDelete = async () => {
    setOperando(true)
    try {
      const n = seleccion.size
      await bulkDeleteModelos([...seleccion])
      setSeleccion(new Set())
      setDeleteConfirm(false)
      onReload()
      showToast(true, `${n} modelo${n !== 1 ? 's' : ''} eliminado${n !== 1 ? 's' : ''}.`)
    } catch (e: any) {
      showToast(false, e.message ?? 'Error al eliminar.')
    } finally {
      setOperando(false)
    }
  }

  // ── Inline precio ──
  const startInline = (m: Modelo, campo: 'precio_venta' | 'precio_costo') => {
    setInlineStock(null)
    setInlineEdit({ id: m.id, campo, valor: String(campo === 'precio_venta' ? m.precio_venta : m.precio_costo) })
    setTimeout(() => inlineRef.current?.select(), 50)
  }

  const commitInline = async () => {
    if (!inlineEdit) return
    const v = parseFloat(inlineEdit.valor)
    if (isNaN(v) || v < 0) { setInlineEdit(null); return }
    const modelo = modelos.find(m => m.id === inlineEdit.id)
    if (!modelo) { setInlineEdit(null); return }
    try {
      if (inlineEdit.campo === 'precio_venta') {
        await Promise.all([
          updateModelo(inlineEdit.id, { precio_venta: Math.round(v) } as any),
          supabase.from('historial_precios').insert([{
            modelo_id: inlineEdit.id,
            precio_venta_anterior: modelo.precio_venta,
            precio_venta_nuevo: Math.round(v),
          }]),
        ])
      } else {
        await updateModelo(inlineEdit.id, { precio_costo: Math.round(v) } as any)
      }
      onReload()
      showToast(true, 'Precio actualizado.')
    } catch { showToast(false, 'Error al guardar.') }
    setInlineEdit(null)
  }

  // ── Inline stock ──
  const startInlineStock = (m: Modelo) => {
    setInlineEdit(null)
    setInlineStock({ id: m.id, op: 'sumar', valor: '' })
    setTimeout(() => inlineRef.current?.focus(), 50)
  }

  const commitInlineStock = async () => {
    if (!inlineStock) return
    const v = parseFloat(inlineStock.valor)
    if (isNaN(v) || v < 0) { setInlineStock(null); return }
    const modelo = modelos.find(m => m.id === inlineStock.id)
    if (!modelo || modelo.modelo_talles.length === 0) { setInlineStock(null); return }
    try {
      await bulkUpdateStockTalles(
        [{ modeloId: modelo.id, talles: modelo.modelo_talles.map(t => ({ id: t.id, cantidadActual: t.cantidad })) }],
        inlineStock.op,
        Math.round(v)
      )
      onReload()
      showToast(true, 'Stock actualizado.')
    } catch { showToast(false, 'Error al guardar.') }
    setInlineStock(null)
  }

  // ── Celdas editables ──
  const PriceCell = ({ m, campo }: { m: Modelo; campo: 'precio_venta' | 'precio_costo' }) => {
    const isEditing = inlineEdit?.id === m.id && inlineEdit?.campo === campo
    const valor = campo === 'precio_venta' ? m.precio_venta : m.precio_costo
    if (isEditing) {
      return (
        <div className="sa-inline-edit">
          <input
            ref={inlineRef}
            className="sa-inline-input"
            type="number"
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
        {fmt(valor)} <Edit2 size={10} className="sa-edit-ico" />
      </button>
    )
  }

  const StockCell = ({ m }: { m: Modelo }) => {
    const pares = totalPares(m)
    const isEditing = inlineStock?.id === m.id
    if (isEditing) {
      return (
        <div className="sa-inline-stock">
          <div className="sa-stock-ops">
            {(['sumar', 'restar', 'exacto'] as StockOp[]).map(op => (
              <button
                key={op}
                className={`sa-stock-op-btn${inlineStock!.op === op ? ' active' : ''}`}
                onClick={() => setInlineStock(is => is ? { ...is, op } : is)}
              >
                {op === 'sumar' ? '+' : op === 'restar' ? '−' : '='}
              </button>
            ))}
          </div>
          <input
            ref={inlineRef}
            className="sa-inline-input sa-stock-input"
            type="number"
            min={0}
            value={inlineStock!.valor}
            placeholder="0"
            onChange={e => setInlineStock(is => is ? { ...is, valor: e.target.value } : is)}
            onKeyDown={e => { if (e.key === 'Enter') commitInlineStock(); if (e.key === 'Escape') setInlineStock(null) }}
          />
          <button className="sa-inline-btn ok" onClick={commitInlineStock}><Check size={12} /></button>
          <button className="sa-inline-btn cancel" onClick={() => setInlineStock(null)}><X size={12} /></button>
        </div>
      )
    }
    return (
      <button className={`sa-pares-cell${pares === 0 ? ' zero' : ''}`} onClick={() => startInlineStock(m)} title="Clic para editar stock">
        <span className={`sa-pares${pares === 0 ? ' zero' : ''}`}>{pares}</span>
        <Edit2 size={10} className="sa-edit-ico" />
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
          <input
            className="sa-search"
            placeholder="Buscar por marca, modelo o código…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button className="sa-search-clear" onClick={() => setSearch('')}><X size={13} /></button>}
        </div>

        <div className="sa-filter-chips">
          {(['todos', 'disponible', 'agotado'] as const).map(d => (
            <button key={d} className={`chip${filtroDisp === d ? ' active' : ''}`} onClick={() => setFiltroDisp(d)}>
              {d === 'todos' ? 'Todos' : d === 'disponible' ? 'Con stock' : 'Agotados'}
            </button>
          ))}
          <span className="sa-chip-sep" />
          {gamas.map(g => (
            <button key={g} className={`chip${filtroGama === g ? ' active' : ''}`}
              onClick={() => setFiltroGama(filtroGama === g ? '' : g)}>{g}</button>
          ))}
          <span className="sa-chip-sep" />
          {categorias.map(c => (
            <button key={c} className={`chip${filtroCat === c ? ' active' : ''}`}
              onClick={() => setFiltroCat(filtroCat === c ? '' : c)}>{c}</button>
          ))}
          <span className="sa-chip-sep" />
          <select className="sa-select" value={filtroMarca} onChange={e => setFiltroMarca(e.target.value)}>
            <option value="">Todas las marcas</option>
            {marcasDisp.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {hayFiltros && (
            <button className="chip chip-reset" onClick={() => {
              setSearch(''); setFiltroMarca(''); setFiltroGama(''); setFiltroCat(''); setFiltroDisp('todos')
            }}>
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
                ? Math.round((m.precio_venta - m.precio_costo) / m.precio_venta * 100)
                : null
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
                    <span className={`sa-badge gama-${m.gama.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}`}>
                      {m.gama}
                    </span>
                    <span className="sa-cat">{m.categoria}</span>
                  </td>
                  <td className="sa-td-talles">
                    {m.modelo_talles.length === 0
                      ? <span className="sa-no-talles">—</span>
                      : <div className="sa-talles-list">
                          {m.modelo_talles.map(t => (
                            <span key={t.id} className={`sa-talle-chip${t.cantidad === 0 ? ' out' : t.cantidad <= t.stock_minimo ? ' low' : ''}`}>
                              {t.talle_arg}<small>/{t.cantidad}</small>
                            </span>
                          ))}
                        </div>
                    }
                  </td>
                  <td className="sa-td-pares">
                    <StockCell m={m} />
                  </td>
                  <td className="sa-td-precio">
                    <PriceCell m={m} campo="precio_costo" />
                  </td>
                  <td className="sa-td-precio">
                    <PriceCell m={m} campo="precio_venta" />
                  </td>
                  <td className="sa-td-margen">
                    {margen !== null
                      ? <span className={`sa-margen${margen < 20 ? ' low' : ''}`}>{margen}%</span>
                      : <span className="sa-muted">—</span>
                    }
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
            <button className="btn btn-secondary sa-float-btn" onClick={() => setShowBulkModal(true)}>
              <Edit2 size={14} /> Editar en masa
            </button>
            <button className="btn btn-danger sa-float-btn" onClick={() => setDeleteConfirm(true)}>
              <Trash2 size={14} /> Eliminar
            </button>
          </div>
        </div>
      )}

      {/* Modal edición masiva */}
      {showBulkModal && (
        <BulkEditModal
          count={seleccion.size}
          seleccionados={seleccionados}
          onClose={() => setShowBulkModal(false)}
          onApplyPrecio={handleBulkPrecio}
          onApplyStock={handleBulkStock}
        />
      )}

      {/* Confirm borrado */}
      {deleteConfirm && (
        <div className="sa-modal-overlay" onClick={e => e.target === e.currentTarget && !operando && setDeleteConfirm(false)}>
          <div className="sa-modal sa-modal-sm">
            <div className="sa-modal-header">
              <h3>Eliminar {seleccion.size} modelo{seleccion.size !== 1 ? 's' : ''}</h3>
              <button className="sa-modal-close" onClick={() => setDeleteConfirm(false)} disabled={operando}><X size={16} /></button>
            </div>
            <div className="sa-modal-body">
              <p className="sa-confirm-text">
                <AlertTriangle size={16} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                Esto elimina <strong>{seleccion.size} modelo{seleccion.size !== 1 ? 's' : ''}</strong> y todas sus fotos. <strong>No se puede deshacer.</strong>
              </p>
            </div>
            <div className="sa-modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(false)} disabled={operando}>Cancelar</button>
              <button className="btn btn-danger" onClick={handleBulkDelete} disabled={operando}>
                {operando ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`sa-toast ${toast.ok ? 'ok' : 'error'}`}>
          {toast.ok ? <Check size={14} /> : <AlertTriangle size={14} />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}
