import { useState, useEffect } from 'react'
import { Plus, Clock } from 'lucide-react'
import type { Modelo, MedioPago, TipoDevolucionCambio, Venta } from '../../types'
import { useDevoluciones } from '../../hooks/useDevoluciones'
import { fetchVentas } from '../../services/ventas'
import { getPrecioReal } from '../../utils/precios'
import { Modal } from '../Modal/Modal'
import './Devoluciones.css'

function toISO(d: Date) { return d.toISOString().split('T')[0] }

function getPreset(preset: string): { start: string; end: string } {
  const now = new Date()
  const today = toISO(now)
  switch (preset) {
    case 'hoy': return { start: today, end: today }
    case 'semana': { const d = new Date(now); d.setDate(d.getDate() - 6); return { start: toISO(d), end: today } }
    case 'mes': return { start: toISO(new Date(now.getFullYear(), now.getMonth(), 1)), end: today }
    case 'todo': return { start: '2020-01-01', end: today }
    default: return { start: toISO(new Date(now.getFullYear(), now.getMonth(), 1)), end: today }
  }
}

const PRESETS = [
  { key: 'mes', label: 'Este mes' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'todo', label: 'Todo' },
]

const MEDIOS_DIFERENCIA: MedioPago[] = ['Efectivo', 'Transferencia', 'Tarjeta']

function fmt(n: number) { return n.toLocaleString('es-AR', { maximumFractionDigits: 0 }) }

interface DevolucionesProps {
  modelos: Modelo[]
  empleadoId: string | null
}

export function Devoluciones({ modelos, empleadoId }: DevolucionesProps) {
  const initial = getPreset('mes')
  const [startDate, setStartDate] = useState(initial.start)
  const [endDate, setEndDate] = useState(initial.end)
  const [activePreset, setActivePreset] = useState('mes')
  const { registros, loading, registrar } = useDevoluciones(startDate, endDate)

  const applyPreset = (key: string) => {
    const { start, end } = getPreset(key)
    setStartDate(start); setEndDate(end); setActivePreset(key)
  }

  const [modalOpen, setModalOpen] = useState(false)
  const [tipo, setTipo] = useState<TipoDevolucionCambio>('devolucion')

  const [ventaSearch, setVentaSearch] = useState('')
  const [ventasRecientes, setVentasRecientes] = useState<Venta[]>([])
  const [loadingVentas, setLoadingVentas] = useState(false)
  const [ventaSeleccionada, setVentaSeleccionada] = useState<Venta | null>(null)

  const [modeloOriginal, setModeloOriginal] = useState<Modelo | null>(null)
  const [talleOriginalId, setTalleOriginalId] = useState('')
  const [searchOriginal, setSearchOriginal] = useState('')

  const [modeloNuevo, setModeloNuevo] = useState<Modelo | null>(null)
  const [talleNuevoId, setTalleNuevoId] = useState('')
  const [searchNuevo, setSearchNuevo] = useState('')

  const [cantidad, setCantidad] = useState(1)
  const [motivo, setMotivo] = useState('')
  const [montoDiferencia, setMontoDiferencia] = useState('0')
  const [medioPagoDiferencia, setMedioPagoDiferencia] = useState<MedioPago>('Efectivo')
  const [diferenciaEditada, setDiferenciaEditada] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const abrirModal = async () => {
    setModalOpen(true)
    setTipo('devolucion')
    setVentaSearch(''); setVentaSeleccionada(null)
    setModeloOriginal(null); setTalleOriginalId(''); setSearchOriginal('')
    setModeloNuevo(null); setTalleNuevoId(''); setSearchNuevo('')
    setCantidad(1); setMotivo(''); setMontoDiferencia('0'); setMedioPagoDiferencia('Efectivo')
    setDiferenciaEditada(false); setError('')
    setLoadingVentas(true)
    try {
      const desde = toISO(new Date(Date.now() - 30 * 86400000))
      setVentasRecientes(await fetchVentas(desde, toISO(new Date())))
    } finally {
      setLoadingVentas(false)
    }
  }

  const ventasFiltradas = ventaSearch.trim()
    ? ventasRecientes.filter(v => {
        const s = ventaSearch.toLowerCase()
        const nombreModelo = v.modelos ? `${v.modelos.marca} ${v.modelos.modelo}`.toLowerCase() : ''
        return nombreModelo.includes(s)
      }).slice(0, 8)
    : []

  const seleccionarVenta = (v: Venta) => {
    setVentaSeleccionada(v)
    setVentaSearch(v.modelos ? `${v.modelos.marca} ${v.modelos.modelo}` : '')
    const m = v.modelo_id ? modelos.find(mo => mo.id === v.modelo_id) ?? null : null
    setModeloOriginal(m)
    setSearchOriginal(m ? `${m.marca} ${m.modelo}` : '')
    const t = m?.modelo_talles.find(tt => tt.talle_arg === v.talle_arg)
    setTalleOriginalId(t?.id ?? '')
  }

  const filterModelosFor = (q: string) => {
    if (!q.trim()) return []
    const s = q.toLowerCase()
    return modelos.filter(m => `${m.marca} ${m.modelo}`.toLowerCase().includes(s)).slice(0, 6)
  }

  const seleccionarModeloOriginal = (m: Modelo) => {
    setVentaSeleccionada(null)
    setModeloOriginal(m)
    setSearchOriginal(`${m.marca} ${m.modelo}`)
    setTalleOriginalId('')
  }

  const seleccionarModeloNuevo = (m: Modelo) => {
    setModeloNuevo(m)
    setSearchNuevo(`${m.marca} ${m.modelo}`)
    setTalleNuevoId('')
  }

  // Sugiere la diferencia automáticamente salvo que el usuario ya la haya tocado a mano.
  useEffect(() => {
    if (diferenciaEditada || !modeloOriginal) return
    const precioOriginal = ventaSeleccionada?.precio_venta ?? getPrecioReal(modeloOriginal)
    if (tipo === 'devolucion') {
      setMontoDiferencia(String(-precioOriginal * cantidad))
    } else if (modeloNuevo) {
      const precioNuevo = getPrecioReal(modeloNuevo)
      setMontoDiferencia(String((precioNuevo - precioOriginal) * cantidad))
    }
  }, [tipo, modeloOriginal, modeloNuevo, cantidad, ventaSeleccionada, diferenciaEditada])

  const handleGuardar = async () => {
    setError('')
    if (!modeloOriginal || !talleOriginalId) return setError('Elegí el modelo y talle a devolver')
    if (!motivo.trim()) return setError('El motivo es obligatorio')
    if (tipo === 'cambio' && (!modeloNuevo || !talleNuevoId)) return setError('Elegí el modelo y talle nuevo')

    const talleOriginal = modeloOriginal.modelo_talles.find(t => t.id === talleOriginalId)
    if (!talleOriginal) return setError('El talle elegido ya no existe')
    const talleNuevo = tipo === 'cambio' ? modeloNuevo!.modelo_talles.find(t => t.id === talleNuevoId) : undefined
    if (tipo === 'cambio' && !talleNuevo) return setError('El talle nuevo elegido ya no existe')

    const diff = Number(montoDiferencia) || 0

    setSaving(true)
    try {
      await registrar({
        tipo,
        ventaId: ventaSeleccionada?.id ?? null,
        talleIdOriginal: talleOriginal.id,
        cantidad,
        talleIdNuevo: tipo === 'cambio' ? (talleNuevo?.id ?? null) : null,
        montoDiferencia: diff,
        medioPagoDiferencia: diff !== 0 ? medioPagoDiferencia : null,
        motivo: motivo.trim(),
        empleadoId,
      })
      setModalOpen(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="devoluciones-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Devoluciones y cambios</h1>
          <p className="page-subtitle">{loading ? 'Cargando...' : `${registros.length} registro${registros.length !== 1 ? 's' : ''}`}</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={abrirModal}>
          <Plus size={13} /> Registrar devolución/cambio
        </button>
      </div>

      <section className="config-section">
        <div className="config-section-header">
          <Clock size={16} />
          <h2 className="config-section-title">Historial</h2>
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

        {loading ? (
          <div className="ventas-loading"><div className="spinner" /><p>Cargando...</p></div>
        ) : registros.length === 0 ? (
          <div className="ventas-empty"><span>↩️</span><p>No hay devoluciones ni cambios en ese rango.</p></div>
        ) : (
          <div className="ventas-table-wrap">
            <table className="ventas-table">
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Modelo</th><th>Diferencia</th><th>Motivo</th><th>Empleado</th></tr></thead>
              <tbody>
                {registros.map(r => (
                  <tr key={r.id}>
                    <td className="date-cell">
                      {new Date(r.fecha).toLocaleDateString('es-AR')}
                      <span className="time-cell">{new Date(r.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </td>
                    <td><span className={`tipo-badge ${r.tipo}`}>{r.tipo === 'cambio' ? 'Cambio' : 'Devolución'}</span></td>
                    <td>
                      {r.modelo_original ? <span><strong>{r.modelo_original.marca}</strong> {r.modelo_original.modelo}</span> : <span className="deleted-product">—</span>}
                      {r.tipo === 'cambio' && r.modelo_nuevo && <> → <strong>{r.modelo_nuevo.marca}</strong> {r.modelo_nuevo.modelo}</>}
                    </td>
                    <td className={r.monto_diferencia < 0 ? 'price-cell danger' : 'price-cell'}>
                      {r.monto_diferencia === 0 ? '—' : `${r.monto_diferencia > 0 ? '+' : ''}$${fmt(r.monto_diferencia)}`}
                    </td>
                    <td>{r.motivo}</td>
                    <td>{r.empleados?.nombre ?? 'Dueño'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal isOpen={modalOpen} onClose={() => !saving && setModalOpen(false)} title="Registrar devolución/cambio" maxWidth="560px">
        <div className="devolucion-modal">
          <div className="sell-section">
            <p className="sell-label">Tipo</p>
            <div className="medio-pago-options">
              <button type="button" className={`medio-btn${tipo === 'devolucion' ? ' active' : ''}`} onClick={() => { setTipo('devolucion'); setDiferenciaEditada(false) }}>Devolución</button>
              <button type="button" className={`medio-btn${tipo === 'cambio' ? ' active' : ''}`} onClick={() => { setTipo('cambio'); setDiferenciaEditada(false) }}>Cambio</button>
            </div>
          </div>

          <div className="sell-section">
            <p className="sell-label">Buscar la venta original (opcional)</p>
            <input
              className="dev-search"
              placeholder={loadingVentas ? 'Cargando ventas recientes...' : 'Buscar por modelo...'}
              value={ventaSearch}
              disabled={loadingVentas}
              onChange={e => { setVentaSearch(e.target.value); setVentaSeleccionada(null) }}
            />
            {ventaSearch.trim() && !ventaSeleccionada && ventasFiltradas.length > 0 && (
              <div className="dev-search-results">
                {ventasFiltradas.map(v => (
                  <button key={v.id} type="button" className="dev-search-result" onClick={() => seleccionarVenta(v)}>
                    <strong>{v.modelos?.marca}</strong> {v.modelos?.modelo} · talle {v.talle_arg} · ${fmt(v.precio_venta)} · {new Date(v.fecha).toLocaleDateString('es-AR')}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!ventaSeleccionada && (
            <div className="sell-section">
              <p className="sell-label">O elegí el modelo a devolver directamente</p>
              <input
                className="dev-search"
                placeholder="Buscar modelo..."
                value={searchOriginal}
                onChange={e => { setSearchOriginal(e.target.value); setModeloOriginal(null); setTalleOriginalId('') }}
              />
              {searchOriginal.trim() && !modeloOriginal && filterModelosFor(searchOriginal).length > 0 && (
                <div className="dev-search-results">
                  {filterModelosFor(searchOriginal).map(m => (
                    <button key={m.id} type="button" className="dev-search-result" onClick={() => seleccionarModeloOriginal(m)}>
                      <strong>{m.marca}</strong> {m.modelo}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {modeloOriginal && (
            <div className="sell-section">
              <p className="sell-label">Talle a devolver</p>
              <div className="talle-selector">
                {modeloOriginal.modelo_talles.map(t => (
                  <button key={t.id} type="button" className={`talle-btn${talleOriginalId === t.id ? ' active' : ''}`} onClick={() => setTalleOriginalId(t.id)}>
                    <span className="talle-btn-arg">{t.talle_arg}</span>
                    <span className="talle-btn-us">{t.talle_us} us</span>
                    <span className="talle-btn-stock">×{t.cantidad}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tipo === 'cambio' && (
            <div className="sell-section">
              <p className="sell-label">Modelo nuevo</p>
              <input
                className="dev-search"
                placeholder="Buscar modelo..."
                value={searchNuevo}
                onChange={e => { setSearchNuevo(e.target.value); setModeloNuevo(null); setTalleNuevoId('') }}
              />
              {searchNuevo.trim() && !modeloNuevo && filterModelosFor(searchNuevo).length > 0 && (
                <div className="dev-search-results">
                  {filterModelosFor(searchNuevo).map(m => (
                    <button key={m.id} type="button" className="dev-search-result" onClick={() => seleccionarModeloNuevo(m)}>
                      <strong>{m.marca}</strong> {m.modelo}
                    </button>
                  ))}
                </div>
              )}
              {modeloNuevo && (
                <div className="talle-selector" style={{ marginTop: '.5rem' }}>
                  {modeloNuevo.modelo_talles.map(t => (
                    <button key={t.id} type="button" disabled={t.cantidad <= 0} className={`talle-btn${talleNuevoId === t.id ? ' active' : ''}`} onClick={() => setTalleNuevoId(t.id)}>
                      <span className="talle-btn-arg">{t.talle_arg}</span>
                      <span className="talle-btn-us">{t.talle_us} us</span>
                      <span className="talle-btn-stock">×{t.cantidad}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="sell-section">
            <p className="sell-label">Cantidad</p>
            <div className="cantidad-stepper">
              <button type="button" className="cantidad-btn" onClick={() => setCantidad(c => Math.max(1, c - 1))}>−</button>
              <span className="cantidad-val">{cantidad}</span>
              <button type="button" className="cantidad-btn" onClick={() => setCantidad(c => c + 1)}>+</button>
            </div>
          </div>

          <div className="sell-section">
            <p className="sell-label">Motivo</p>
            <input className="dev-search" placeholder="Ej: talle equivocado, producto con defecto..." value={motivo} onChange={e => setMotivo(e.target.value)} />
          </div>

          <div className="sell-section">
            <p className="sell-label">Diferencia de precio {montoDiferencia !== '0' && (Number(montoDiferencia) > 0 ? '(el cliente paga más)' : '(se le devuelve)')}</p>
            <input
              type="number"
              className="dev-search"
              value={montoDiferencia}
              onChange={e => { setMontoDiferencia(e.target.value); setDiferenciaEditada(true) }}
            />
          </div>

          {Number(montoDiferencia) !== 0 && (
            <div className="sell-section">
              <p className="sell-label">Medio de pago de la diferencia</p>
              <div className="medio-pago-options">
                {MEDIOS_DIFERENCIA.map(m => (
                  <button key={m} type="button" className={`medio-btn${medioPagoDiferencia === m ? ' active' : ''}`} onClick={() => setMedioPagoDiferencia(m)}>{m}</button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="sell-error">{error}</p>}

          <div className="sell-actions">
            <button className="btn btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleGuardar} disabled={saving}>
              {saving ? 'Guardando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
