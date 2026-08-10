import { useState } from 'react'
import { Plus, Power, PauseCircle, Truck, ShoppingBag, Receipt, ChevronDown, ChevronUp } from 'lucide-react'
import type { Compra, Modelo } from '../../types'
import type { useProveedores } from '../../hooks/useProveedores'
import { useCompras } from '../../hooks/useCompras'
import { Modal } from '../Modal/Modal'
import './Proveedores.css'

function toISO(d: Date) { return d.toISOString().split('T')[0] }

function getPreset(preset: string): { start: string; end: string } {
  const now = new Date()
  const today = toISO(now)
  switch (preset) {
    case 'hoy': return { start: today, end: today }
    case 'semana': { const d = new Date(now); d.setDate(d.getDate() - 6); return { start: toISO(d), end: today } }
    case 'mes': return { start: toISO(new Date(now.getFullYear(), now.getMonth(), 1)), end: today }
    case 'mes_ant': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      return { start: toISO(start), end: toISO(end) }
    }
    case 'todo': return { start: '2020-01-01', end: today }
    default: return { start: toISO(new Date(now.getFullYear(), now.getMonth(), 1)), end: today }
  }
}

const PRESETS = [
  { key: 'mes', label: 'Este mes' },
  { key: 'mes_ant', label: 'Mes anterior' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'todo', label: 'Todo' },
]

function fmt(n: number) { return n.toLocaleString('es-AR', { maximumFractionDigits: 0 }) }

interface ItemForm {
  modeloId: string | null
  descripcion: string
  talleArg: string
  cantidad: string
  costoUnitario: string
  search: string
}
function blankItem(): ItemForm {
  return { modeloId: null, descripcion: '', talleArg: '', cantidad: '1', costoUnitario: '', search: '' }
}

interface ProveedoresProps {
  proveedoresHook: ReturnType<typeof useProveedores>
  modelos: Modelo[]
  empleadoId: string | null
}

export function Proveedores({ proveedoresHook, modelos, empleadoId }: ProveedoresProps) {
  const { proveedores, loading, addProveedor, toggleActivo } = proveedoresHook

  const [nombre, setNombre] = useState('')
  const [contacto, setContacto] = useState('')
  const [telefono, setTelefono] = useState('')
  const [mostrarFormProveedor, setMostrarFormProveedor] = useState(false)
  const [savingProveedor, setSavingProveedor] = useState(false)

  const initial = getPreset('mes')
  const [startDate, setStartDate] = useState(initial.start)
  const [endDate, setEndDate] = useState(initial.end)
  const [activePreset, setActivePreset] = useState('mes')
  const { compras, saldosPorProveedor, loading: loadingCompras, registrarCompra, registrarPago } = useCompras(startDate, endDate)

  const [mostrarFormCompra, setMostrarFormCompra] = useState(false)
  const [compraProveedorId, setCompraProveedorId] = useState('')
  const [compraFecha, setCompraFecha] = useState(toISO(new Date()))
  const [numeroRemito, setNumeroRemito] = useState('')
  const [notasCompra, setNotasCompra] = useState('')
  const [items, setItems] = useState<ItemForm[]>([blankItem()])
  const [savingCompra, setSavingCompra] = useState(false)
  const [errorCompra, setErrorCompra] = useState('')

  const [expandedCompraId, setExpandedCompraId] = useState<string | null>(null)

  const [pagoTarget, setPagoTarget] = useState<Compra | null>(null)
  const [montoPago, setMontoPago] = useState('')
  const [fechaPago, setFechaPago] = useState(toISO(new Date()))
  const [notasPago, setNotasPago] = useState('')
  const [savingPago, setSavingPago] = useState(false)

  const applyPreset = (key: string) => {
    const { start, end } = getPreset(key)
    setStartDate(start); setEndDate(end); setActivePreset(key)
  }

  const saldoDe = (proveedorId: string) => saldosPorProveedor.find(s => s.proveedorId === proveedorId)?.saldo ?? 0

  const handleAddProveedor = async () => {
    if (!nombre.trim()) return
    setSavingProveedor(true)
    try {
      await addProveedor(nombre.trim(), contacto.trim() || null, telefono.trim() || null, null)
      setNombre(''); setContacto(''); setTelefono(''); setMostrarFormProveedor(false)
    } finally {
      setSavingProveedor(false)
    }
  }

  const updateItem = (idx: number, patch: Partial<ItemForm>) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  const addItemRow = () => setItems(prev => [...prev, blankItem()])
  const removeItemRow = (idx: number) => setItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)

  const filterModelosFor = (q: string) => {
    if (!q.trim()) return []
    const s = q.toLowerCase()
    return modelos.filter(m => `${m.marca} ${m.modelo}`.toLowerCase().includes(s)).slice(0, 6)
  }

  const selectModeloForItem = (idx: number, m: Modelo) =>
    updateItem(idx, { modeloId: m.id, descripcion: `${m.marca} ${m.modelo}`, search: `${m.marca} ${m.modelo}` })

  const totalCompra = items.reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.costoUnitario) || 0), 0)

  const handleGuardarCompra = async () => {
    setErrorCompra('')
    if (!compraProveedorId) return setErrorCompra('Elegí un proveedor')
    const itemsValidos = items.filter(it => it.descripcion.trim() && Number(it.cantidad) > 0)
    if (itemsValidos.length === 0) return setErrorCompra('Agregá al menos un ítem con cantidad')
    setSavingCompra(true)
    try {
      await registrarCompra(
        compraProveedorId, compraFecha, numeroRemito.trim() || null,
        itemsValidos.map(it => ({
          modeloId: it.modeloId,
          descripcion: it.descripcion.trim(),
          talleArg: it.talleArg ? Number(it.talleArg) : null,
          cantidad: Number(it.cantidad),
          costoUnitario: Number(it.costoUnitario) || 0,
        })),
        notasCompra.trim() || null,
        empleadoId,
      )
      setCompraProveedorId(''); setNumeroRemito(''); setNotasCompra(''); setItems([blankItem()])
      setMostrarFormCompra(false)
    } catch (e) {
      setErrorCompra((e as Error).message)
    } finally {
      setSavingCompra(false)
    }
  }

  const abrirPago = (c: Compra) => {
    setPagoTarget(c); setMontoPago(''); setFechaPago(toISO(new Date())); setNotasPago('')
  }

  const confirmarPago = async () => {
    if (!pagoTarget || !montoPago || Number(montoPago) <= 0) return
    setSavingPago(true)
    try {
      await registrarPago(pagoTarget.id, Number(montoPago), fechaPago, notasPago.trim() || null, empleadoId)
      setPagoTarget(null)
    } finally {
      setSavingPago(false)
    }
  }

  return (
    <div className="proveedores-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Proveedores</h1>
          <p className="page-subtitle">
            {loading ? 'Cargando...' : `${proveedores.length} proveedor${proveedores.length !== 1 ? 'es' : ''}`}
          </p>
        </div>
      </div>

      <section className="config-section">
        <div className="config-section-header">
          <Truck size={16} />
          <h2 className="config-section-title">Gestión de proveedores</h2>
        </div>

        <div className="config-table-wrap">
          <table className="config-table">
            <thead><tr><th>Nombre</th><th>Contacto</th><th>Estado</th><th>Saldo adeudado</th><th></th></tr></thead>
            <tbody>
              {proveedores.map(p => {
                const saldo = saldoDe(p.id)
                return (
                  <tr key={p.id} className={p.activo ? '' : 'inactive'}>
                    <td>{p.nombre}</td>
                    <td>{[p.contacto, p.telefono].filter(Boolean).join(' · ') || '—'}</td>
                    <td><span className={`empleado-badge ${p.activo ? 'activo' : 'inactivo'}`}>{p.activo ? 'Activo' : 'Inactivo'}</span></td>
                    <td className={saldo > 0 ? 'price-cell danger' : 'price-cell'}>${fmt(saldo)}</td>
                    <td>
                      <div className="config-table-actions">
                        <button className="icon-btn" title={p.activo ? 'Desactivar' : 'Activar'} onClick={() => toggleActivo(p.id, !p.activo)}>
                          {p.activo ? <Power size={13} /> : <PauseCircle size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {proveedores.length === 0 && (
                <tr><td colSpan={5} className="config-table-empty">No hay proveedores cargados.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {mostrarFormProveedor ? (
          <div className="config-card">
            <div className="config-row">
              <label className="config-label">Nombre</label>
              <div className="config-input-wrap" style={{ width: 220 }}>
                <input className="config-input" style={{ fontWeight: 400, fontSize: '.875rem' }} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del proveedor" autoFocus />
              </div>
            </div>
            <div className="config-row">
              <label className="config-label">Contacto</label>
              <div className="config-input-wrap" style={{ width: 220 }}>
                <input className="config-input" style={{ fontWeight: 400, fontSize: '.875rem' }} value={contacto} onChange={e => setContacto(e.target.value)} placeholder="Nombre de contacto" />
              </div>
            </div>
            <div className="config-row">
              <label className="config-label">Teléfono</label>
              <div className="config-input-wrap" style={{ width: 220 }}>
                <input className="config-input" style={{ fontWeight: 400, fontSize: '.875rem' }} value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="Opcional" />
              </div>
            </div>
            <div className="config-actions">
              <button className="btn btn-secondary" onClick={() => setMostrarFormProveedor(false)}>Cancelar</button>
              <button className="btn btn-primary" disabled={!nombre.trim() || savingProveedor} onClick={handleAddProveedor}>
                {savingProveedor ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={() => setMostrarFormProveedor(true)}>
            <Plus size={13} /> Agregar proveedor
          </button>
        )}
      </section>

      <section className="config-section">
        <div className="config-section-header">
          <ShoppingBag size={16} />
          <h2 className="config-section-title">Registrar compra</h2>
        </div>

        {mostrarFormCompra ? (
          <div className="config-card">
            <div className="config-row">
              <label className="config-label">Proveedor</label>
              <div className="config-input-wrap" style={{ width: 220 }}>
                <select className="config-input" style={{ fontWeight: 400, fontSize: '.875rem' }} value={compraProveedorId} onChange={e => setCompraProveedorId(e.target.value)}>
                  <option value="">Elegí uno</option>
                  {proveedores.filter(p => p.activo).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
            </div>
            <div className="config-row">
              <label className="config-label">Fecha</label>
              <div className="config-input-wrap" style={{ width: 220 }}>
                <input type="date" className="config-input" style={{ fontWeight: 400, fontSize: '.875rem' }} value={compraFecha} onChange={e => setCompraFecha(e.target.value)} />
              </div>
            </div>
            <div className="config-row">
              <label className="config-label">N° remito</label>
              <div className="config-input-wrap" style={{ width: 220 }}>
                <input className="config-input" style={{ fontWeight: 400, fontSize: '.875rem' }} value={numeroRemito} onChange={e => setNumeroRemito(e.target.value)} placeholder="Opcional" />
              </div>
            </div>

            <div className="compra-items">
              {items.map((it, idx) => (
                <div key={idx} className="compra-item-row">
                  <div className="compra-item-search-wrap">
                    <input
                      className="compra-search"
                      placeholder="Buscar modelo o escribir descripción..."
                      value={it.search}
                      onChange={e => updateItem(idx, { search: e.target.value, descripcion: e.target.value, modeloId: null })}
                    />
                    {it.search.trim() && !it.modeloId && filterModelosFor(it.search).length > 0 && (
                      <div className="compra-search-results">
                        {filterModelosFor(it.search).map(m => (
                          <button key={m.id} type="button" className="compra-search-result" onClick={() => selectModeloForItem(idx, m)}>
                            <strong>{m.marca}</strong> {m.modelo}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input className="compra-mini-input" placeholder="Talle" value={it.talleArg} onChange={e => updateItem(idx, { talleArg: e.target.value })} />
                  <input className="compra-mini-input" placeholder="Cant." type="number" min={1} value={it.cantidad} onChange={e => updateItem(idx, { cantidad: e.target.value })} />
                  <input className="compra-mini-input" placeholder="Costo unit." type="number" min={0} value={it.costoUnitario} onChange={e => updateItem(idx, { costoUnitario: e.target.value })} />
                  <span className="compra-item-subtotal">${fmt((Number(it.cantidad) || 0) * (Number(it.costoUnitario) || 0))}</span>
                  <button type="button" className="icon-btn" onClick={() => removeItemRow(idx)} title="Quitar ítem">✕</button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm" onClick={addItemRow}>
                <Plus size={13} /> Agregar ítem
              </button>
            </div>

            <div className="config-row">
              <label className="config-label">Notas</label>
              <div className="config-input-wrap" style={{ width: 320 }}>
                <input className="config-input" style={{ fontWeight: 400, fontSize: '.875rem' }} value={notasCompra} onChange={e => setNotasCompra(e.target.value)} placeholder="Opcional" />
              </div>
            </div>

            <p className="compra-total">Total: <strong>${fmt(totalCompra)}</strong></p>

            {errorCompra && <p className="sell-error">{errorCompra}</p>}

            <div className="config-actions">
              <button className="btn btn-secondary" onClick={() => setMostrarFormCompra(false)}>Cancelar</button>
              <button className="btn btn-primary" disabled={savingCompra} onClick={handleGuardarCompra}>
                {savingCompra ? 'Guardando...' : 'Guardar compra'}
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={() => setMostrarFormCompra(true)}>
            <Plus size={13} /> Registrar compra
          </button>
        )}
      </section>

      <section className="config-section">
        <div className="config-section-header">
          <Receipt size={16} />
          <h2 className="config-section-title">Historial de compras</h2>
        </div>

        <div className="ventas-presets">
          {PRESETS.map(p => (
            <button key={p.key} className={`preset-btn${activePreset === p.key ? ' active' : ''}`} onClick={() => applyPreset(p.key)}>{p.label}</button>
          ))}
        </div>
        <div className="ventas-filters">
          <div className="form-group date-group">
            <label>Desde</label>
            <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setActivePreset('') }} />
          </div>
          <div className="form-group date-group">
            <label>Hasta</label>
            <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setActivePreset('') }} />
          </div>
        </div>

        {loadingCompras ? (
          <div className="ventas-loading"><div className="spinner" /><p>Cargando compras...</p></div>
        ) : compras.length === 0 ? (
          <div className="ventas-empty"><span>📦</span><p>No hay compras en ese rango.</p></div>
        ) : (
          <div className="ventas-table-wrap">
            <table className="ventas-table">
              <thead><tr><th>Proveedor</th><th>Fecha</th><th>Remito</th><th>Registrada por</th><th>Total</th><th>Pagado</th><th>Saldo</th><th></th></tr></thead>
              <tbody>
                {compras.map(c => {
                  const pagado = (c.compra_pagos ?? []).reduce((s, p) => s + Number(p.monto), 0)
                  const saldo = c.saldo ?? 0
                  return (
                    <>
                      <tr key={c.id}>
                        <td>{c.proveedores?.nombre ?? '—'}</td>
                        <td>{new Date(c.fecha + 'T00:00:00').toLocaleDateString('es-AR')}</td>
                        <td>{c.numero_remito ?? '—'}</td>
                        <td>{c.empleados?.nombre ?? 'Dueño'}</td>
                        <td className="price-cell">${fmt(c.total)}</td>
                        <td className="price-cell">${fmt(pagado)}</td>
                        <td className={saldo > 0 ? 'price-cell danger' : 'price-cell'}>${fmt(saldo)}</td>
                        <td>
                          <div className="config-table-actions">
                            {saldo > 0 && (
                              <button className="btn btn-secondary btn-sm" onClick={() => abrirPago(c)}>Registrar pago</button>
                            )}
                            <button className="icon-btn" onClick={() => setExpandedCompraId(expandedCompraId === c.id ? null : c.id)}>
                              {expandedCompraId === c.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedCompraId === c.id && (
                        <tr key={`${c.id}-detail`}>
                          <td colSpan={8}>
                            <div className="compra-detail">
                              <div className="compra-detail-col">
                                <p className="compra-detail-label">Ítems</p>
                                {(c.compra_items ?? []).map(it => (
                                  <div key={it.id} className="compra-detail-item">
                                    <span>{it.descripcion}{it.talle_arg ? ` (talle ${it.talle_arg})` : ''} x{it.cantidad}</span>
                                    <span>${fmt(it.subtotal)}</span>
                                  </div>
                                ))}
                              </div>
                              {(c.compra_pagos ?? []).length > 0 && (
                                <div className="compra-detail-col">
                                  <p className="compra-detail-label">Pagos</p>
                                  {(c.compra_pagos ?? []).map(pg => (
                                    <div key={pg.id} className="compra-detail-item">
                                      <span>{new Date(pg.fecha + 'T00:00:00').toLocaleDateString('es-AR')} {pg.empleados?.nombre ? `· ${pg.empleados.nombre}` : ''}</span>
                                      <span>${fmt(pg.monto)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal isOpen={!!pagoTarget} onClose={() => !savingPago && setPagoTarget(null)} title="Registrar pago" maxWidth="380px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '.875rem' }}>
            Saldo pendiente: <strong style={{ color: 'var(--text-primary)' }}>${fmt(pagoTarget?.saldo ?? 0)}</strong>
          </p>
          <input type="number" min={0} className="config-input" placeholder="Monto" value={montoPago} onChange={e => setMontoPago(e.target.value)} autoFocus />
          <input type="date" className="config-input" value={fechaPago} onChange={e => setFechaPago(e.target.value)} />
          <input className="config-input" placeholder="Notas (opcional)" value={notasPago} onChange={e => setNotasPago(e.target.value)} />
          <div className="sell-actions">
            <button className="btn btn-secondary" onClick={() => setPagoTarget(null)} disabled={savingPago}>Cancelar</button>
            <button className="btn btn-primary" onClick={confirmarPago} disabled={savingPago || !montoPago || Number(montoPago) <= 0}>
              {savingPago ? 'Guardando...' : 'Confirmar pago'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
