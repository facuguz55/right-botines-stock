import { useState, useMemo } from 'react'
import { useVentas } from '../../hooks/useVentas'
import { deleteVenta } from '../../services/ventas'
import { Modal } from '../Modal/Modal'
import type { Role, Venta } from '../../types'
import { toISOLocal, semanaActual } from '../../utils/fecha'
import { estadoGarantia, textoGarantia, DIAS_GARANTIA } from '../../utils/garantia'
import './VentasHistory.css'

const MEDIO_ICONS: Record<string, string> = { Efectivo: '💵', Transferencia: '📲', Tarjeta: '💳', Mixto: '🔀' }
const MEDIOS: Venta['medio_pago'][] = ['Efectivo', 'Transferencia', 'Tarjeta', 'Mixto']

const sinTildes = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const soloDigitos = (t: string) => t.replace(/\D/g, '')

// Busca por nombre, teléfono (sin importar espacios o guiones), mail o DNI.
function coincideCliente(v: Venta, busqueda: string): boolean {
  const c = v.clientes_locales
  if (!c) return false
  const q = sinTildes(busqueda.trim())
  if (sinTildes(c.nombre).includes(q) || sinTildes(c.email ?? '').includes(q)) return true
  const d = soloDigitos(busqueda)
  return d.length >= 3 && (soloDigitos(c.telefono ?? '').includes(d) || soloDigitos(c.dni ?? '').includes(d))
}

function getPreset(preset: string): { start: string; end: string } {
  const now = new Date()
  const today = toISOLocal(now)
  switch (preset) {
    case 'hoy': return { start: today, end: today }
    case 'ayer': {
      const d = new Date(now); d.setDate(d.getDate() - 1); const s = toISOLocal(d)
      return { start: s, end: s }
    }
    case 'semana': return semanaActual(now)
    case 'mes': return { start: toISOLocal(new Date(now.getFullYear(), now.getMonth(), 1)), end: today }
    case 'mes_ant': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      return { start: toISOLocal(start), end: toISOLocal(end) }
    }
    case 'todo': {
      return { start: '2020-01-01', end: today }
    }
    default: return { start: toISOLocal(new Date(now.getFullYear(), now.getMonth(), 1)), end: today }
  }
}

const PRESETS = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'ayer', label: 'Ayer' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes', label: 'Este mes' },
  { key: 'mes_ant', label: 'Mes anterior' },
  { key: 'todo', label: 'Todo' },
]

interface VentasHistoryProps {
  role: Role
}

function GarantiaTag({ venta }: { venta: Venta }) {
  const g = estadoGarantia(venta.fecha, venta.modelos?.gama)
  if (!g) return <span className="sin-cliente">-</span>
  return (
    <span
      className={`garantia-tag ${g.vigente ? 'garantia-tag--vigente' : 'garantia-tag--vencida'}`}
      title={`Garantía de ${DIAS_GARANTIA} días desde la compra: cubre hasta el ${g.venceEl}`}
    >
      {textoGarantia(g)}
    </span>
  )
}

export function VentasHistory({ role }: VentasHistoryProps) {
  // Los empleados ven el detalle de cada venta (para verificar que se
  // registró bien) pero no la ganancia ni los totales facturados/recaudados
  // — esa info es solo del dueño.
  const puedeVerMontos = role === 'dueno'
  const initial = getPreset('mes')
  const [startDate, setStartDate] = useState(initial.start)
  const [endDate, setEndDate] = useState(initial.end)
  const [activePreset, setActivePreset] = useState('mes')

  const [filterCliente, setFilterCliente] = useState('')
  const [filterModelo, setFilterModelo] = useState('')
  const [filterTalle, setFilterTalle] = useState('')
  const [filterPago, setFilterPago] = useState('')
  const [filterPrecioMin, setFilterPrecioMin] = useState('')
  const [filterPrecioMax, setFilterPrecioMax] = useState('')
  const [filterGananciaMin, setFilterGananciaMin] = useState('')
  const [filterGananciaMax, setFilterGananciaMax] = useState('')

  // Para ver cuándo compró un cliente (cambio o garantía) hay que mirar todas las
  // fechas: al buscar por cliente se ignora el rango elegido.
  const buscandoCliente = filterCliente.trim().length > 0
  const { ventas, loading, error, reload } = useVentas(
    buscandoCliente ? '2020-01-01' : startDate,
    buscandoCliente ? toISOLocal(new Date()) : endDate,
  )

  const [ventaAEliminar, setVentaAEliminar] = useState<Venta | null>(null)
  const [pinEliminar, setPinEliminar] = useState('')
  const [eliminando, setEliminando] = useState(false)
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null)

  function cerrarModalEliminar() {
    setVentaAEliminar(null)
    setPinEliminar('')
    setErrorEliminar(null)
  }

  async function confirmarEliminar() {
    if (!ventaAEliminar || !pinEliminar || eliminando) return
    setEliminando(true)
    setErrorEliminar(null)
    try {
      const ok = await deleteVenta(pinEliminar, ventaAEliminar)
      if (ok) {
        cerrarModalEliminar()
        await reload()
      } else {
        setErrorEliminar('Pin incorrecto.')
      }
    } catch (e) {
      setErrorEliminar((e as Error).message || 'No se pudo eliminar la venta.')
    } finally {
      setEliminando(false)
    }
  }

  const tallesDisponibles = useMemo(
    () => [...new Set(ventas.map(v => v.talle_arg))].sort((a, b) => a - b),
    [ventas]
  )

  const filtered = useMemo(() => ventas.filter(v => {
    if (buscandoCliente && !coincideCliente(v, filterCliente)) return false
    if (filterModelo) {
      const texto = `${v.modelos?.marca ?? ''} ${v.modelos?.modelo ?? ''}`.toLowerCase()
      if (!texto.includes(filterModelo.toLowerCase())) return false
    }
    if (filterTalle && String(v.talle_arg) !== filterTalle) return false
    if (filterPago && v.medio_pago !== filterPago) return false
    if (filterPrecioMin && v.precio_venta < parseFloat(filterPrecioMin)) return false
    if (filterPrecioMax && v.precio_venta > parseFloat(filterPrecioMax)) return false
    if (filterGananciaMin && v.ganancia < parseFloat(filterGananciaMin)) return false
    if (filterGananciaMax && v.ganancia > parseFloat(filterGananciaMax)) return false
    return true
  }), [ventas, buscandoCliente, filterCliente, filterModelo, filterTalle, filterPago, filterPrecioMin, filterPrecioMax, filterGananciaMin, filterGananciaMax])

  const totalVentas = filtered.reduce((s, v) => s + v.precio_venta, 0)
  const totalGanancia = filtered.reduce((s, v) => s + v.ganancia, 0)

  const hasExtraFilters = filterCliente || filterModelo || filterTalle || filterPago || filterPrecioMin || filterPrecioMax || filterGananciaMin || filterGananciaMax

  function applyPreset(key: string) {
    const { start, end } = getPreset(key)
    setStartDate(start)
    setEndDate(end)
    setActivePreset(key)
  }

  function clearExtraFilters() {
    setFilterCliente(''); setFilterModelo(''); setFilterTalle(''); setFilterPago('')
    setFilterPrecioMin(''); setFilterPrecioMax('')
    setFilterGananciaMin(''); setFilterGananciaMax('')
  }

  return (
    <div className="ventas-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Historial de ventas</h1>
          <p className="page-subtitle">
            {loading ? 'Cargando...' : `${filtered.length}${filtered.length !== ventas.length ? ` de ${ventas.length}` : ''} venta${ventas.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* Presets */}
      <div className="ventas-presets">
        {PRESETS.map(p => (
          <button
            key={p.key}
            className={`preset-btn${activePreset === p.key ? ' active' : ''}`}
            onClick={() => applyPreset(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Fecha */}
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

      {/* Filtros adicionales */}
      <div className="ventas-extra-filters">
        <input
          className="vf-input vf-cliente"
          type="search"
          placeholder="Buscar cliente (nombre, teléfono, DNI)..."
          value={filterCliente}
          onChange={e => setFilterCliente(e.target.value)}
        />
        <input
          className="vf-input"
          type="text"
          placeholder="Buscar modelo..."
          value={filterModelo}
          onChange={e => setFilterModelo(e.target.value)}
        />

        <select className="vf-select" value={filterTalle} onChange={e => setFilterTalle(e.target.value)}>
          <option value="">Talle ARG</option>
          {tallesDisponibles.map(t => <option key={t} value={String(t)}>{t}</option>)}
        </select>

        <select className="vf-select" value={filterPago} onChange={e => setFilterPago(e.target.value)}>
          <option value="">Medio de pago</option>
          {MEDIOS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <div className="vf-range">
          <input className="vf-input vf-number" type="number" placeholder="Precio mín" value={filterPrecioMin} onChange={e => setFilterPrecioMin(e.target.value)} />
          <span className="vf-sep">–</span>
          <input className="vf-input vf-number" type="number" placeholder="Precio máx" value={filterPrecioMax} onChange={e => setFilterPrecioMax(e.target.value)} />
        </div>

        {puedeVerMontos && (
          <div className="vf-range">
            <input className="vf-input vf-number" type="number" placeholder="Gan. mín" value={filterGananciaMin} onChange={e => setFilterGananciaMin(e.target.value)} />
            <span className="vf-sep">–</span>
            <input className="vf-input vf-number" type="number" placeholder="Gan. máx" value={filterGananciaMax} onChange={e => setFilterGananciaMax(e.target.value)} />
          </div>
        )}

        {hasExtraFilters && (
          <button className="btn btn-secondary btn-sm" onClick={clearExtraFilters}>Limpiar</button>
        )}
      </div>

      {buscandoCliente && (
        <p className="ventas-buscando">Buscando en todas las fechas. Cada compra muestra si la garantía ({DIAS_GARANTIA} días, gama alta) sigue vigente.</p>
      )}

      {/* Summary — recaudado y ganancia son solo del dueño */}
      {!loading && filtered.length > 0 && puedeVerMontos && (
        <div className="ventas-summary">
          <div className="summary-item"><span>Total facturado</span><strong className="accent">${totalVentas.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</strong></div>
          <div className="summary-item"><span>Ganancia estimada</span><strong className="accent">${totalGanancia.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</strong></div>
          <div className="summary-item"><span>Ticket promedio</span><strong>${filtered.length ? Math.round(totalVentas / filtered.length).toLocaleString('es-AR') : 0}</strong></div>
        </div>
      )}

      {loading ? (
        <div className="ventas-loading"><div className="spinner" /><p>Cargando ventas...</p></div>
      ) : error ? (
        <div className="ventas-error">Error: {error}</div>
      ) : filtered.length === 0 ? (
        <div className="ventas-empty"><span>💰</span><p>No hay ventas con esos filtros.</p></div>
      ) : (
        <div className="ventas-table-wrap">
          <table className="ventas-table">
            <thead>
              <tr><th>Fecha</th><th>Cliente</th><th>Modelo</th><th>Talle</th><th>Garantía</th><th>Empleado</th><th>Pago</th><th>Precio</th>{puedeVerMontos && <th>Ganancia</th>}{puedeVerMontos && <th></th>}</tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id}>
                  <td className="date-cell">
                    {new Date(v.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    <span className="time-cell">{new Date(v.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </td>
                  <td className="cliente-cell">
                    {v.clientes_locales
                      ? <><strong>{v.clientes_locales.nombre}</strong>{v.clientes_locales.telefono && <span className="cliente-tel">{v.clientes_locales.telefono}</span>}</>
                      : <span className="sin-cliente">Sin cliente</span>}
                  </td>
                  <td>{v.modelos ? <span><strong>{v.modelos.marca}</strong> {v.modelos.modelo}</span> : <span className="deleted-product">Eliminado</span>}</td>
                  <td>{v.talle_arg} arg</td>
                  <td><GarantiaTag venta={v} /></td>
                  <td>{v.empleados?.nombre ?? 'Dueño'}</td>
                  <td>
                    <span className="medio-pago-badge">
                      {MEDIO_ICONS[v.medio_pago] ?? ''} {v.medio_pago}
                      {v.recargo_tarjeta != null && v.recargo_tarjeta > 0 && <span className="recargo-tag">+10%</span>}
                    </span>
                    {v.medio_pago === 'Mixto' && (
                      <span className="mixto-detalle">
                        {[
                          v.monto_efectivo ? `$${v.monto_efectivo.toLocaleString('es-AR')} efec.` : null,
                          v.monto_transferencia ? `$${v.monto_transferencia.toLocaleString('es-AR')} transf.` : null,
                          v.monto_tarjeta ? `$${v.monto_tarjeta.toLocaleString('es-AR')} tarjeta` : null,
                        ].filter(Boolean).join(' + ')}
                      </span>
                    )}
                  </td>
                  <td className="price-cell">
                    ${v.precio_venta.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    {v.precio_editado && <span className="precio-editado-tag" title="El precio se editó a mano al vender">editado</span>}
                  </td>
                  {puedeVerMontos && (
                    <td className={`ganancia-cell ${v.ganancia >= 0 ? 'positive' : 'negative'}`}>${v.ganancia.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</td>
                  )}
                  {puedeVerMontos && (
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        title="Eliminar venta y devolver el stock"
                        onClick={() => setVentaAEliminar(v)}
                      >
                        Eliminar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={!!ventaAEliminar} onClose={cerrarModalEliminar} title="Eliminar venta" maxWidth="380px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            ¿Seguro que querés eliminar esta venta
            {ventaAEliminar?.modelos ? <> de <strong style={{ color: 'var(--text-primary)' }}>{ventaAEliminar.modelos.marca} {ventaAEliminar.modelos.modelo}</strong></> : ''}
            {' '}(talle {ventaAEliminar?.talle_arg})? El stock vendido se devuelve automáticamente. Esta acción no se puede deshacer.
          </p>
          <div className="form-group">
            <label>Pin de dueño</label>
            <input
              type="password"
              autoFocus
              value={pinEliminar}
              onChange={e => setPinEliminar(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmarEliminar()}
              placeholder="Ingresá tu pin"
            />
          </div>
          {errorEliminar && <p style={{ color: 'var(--danger, #e53e3e)', margin: 0 }}>{errorEliminar}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.75rem' }}>
            <button className="btn btn-secondary" onClick={cerrarModalEliminar}>Cancelar</button>
            <button className="btn btn-danger" disabled={!pinEliminar || eliminando} onClick={confirmarEliminar}>
              {eliminando ? 'Eliminando...' : 'Sí, eliminar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
