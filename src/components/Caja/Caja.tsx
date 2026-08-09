import { useState } from 'react'
import { Wallet, Lock, Unlock, AlertTriangle, Receipt, MinusCircle } from 'lucide-react'
import type { Role } from '../../types'
import { useCaja } from '../../hooks/useCaja'
import { Modal } from '../Modal/Modal'
import './Caja.css'

function toISO(d: Date) { return d.toISOString().split('T')[0] }

function getPreset(preset: string): { start: string; end: string } {
  const now = new Date()
  const today = toISO(now)
  switch (preset) {
    case 'hoy': return { start: today, end: today }
    case 'ayer': {
      const d = new Date(now); d.setDate(d.getDate() - 1); const s = toISO(d)
      return { start: s, end: s }
    }
    case 'semana': {
      const d = new Date(now); d.setDate(d.getDate() - 6)
      return { start: toISO(d), end: today }
    }
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
  { key: 'hoy', label: 'Hoy' },
  { key: 'ayer', label: 'Ayer' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes', label: 'Este mes' },
  { key: 'mes_ant', label: 'Mes anterior' },
  { key: 'todo', label: 'Todo' },
]

interface CajaProps {
  empleadoId: string | null
  empleadoNombre: string | null
  role: Role
}

export function Caja({ empleadoId, empleadoNombre, role }: CajaProps) {
  const initial = getPreset('mes')
  const [startDate, setStartDate] = useState(initial.start)
  const [endDate, setEndDate] = useState(initial.end)
  const [activePreset, setActivePreset] = useState('mes')

  const { cajaAbierta, totalesDia, gastos, cerradas, loading, error, abrir, cerrar, registrarGasto } = useCaja(startDate, endDate)

  const [montoApertura, setMontoApertura] = useState('')
  const [abriendo, setAbriendo] = useState(false)

  const [showCerrar, setShowCerrar] = useState(false)
  const [montoContado, setMontoContado] = useState('')
  const [notas, setNotas] = useState('')
  const [cerrando, setCerrando] = useState(false)

  const [showGasto, setShowGasto] = useState(false)
  const [montoGasto, setMontoGasto] = useState('')
  const [motivoGasto, setMotivoGasto] = useState('')
  const [gastoError, setGastoError] = useState<string | null>(null)
  const [registrandoGasto, setRegistrandoGasto] = useState(false)

  const quienSoy = role === 'dueno' ? 'Dueño' : empleadoNombre

  function applyPreset(key: string) {
    const { start, end } = getPreset(key)
    setStartDate(start)
    setEndDate(end)
    setActivePreset(key)
  }

  const handleAbrir = async () => {
    const monto = Number(montoApertura)
    if (!(monto >= 0)) return
    setAbriendo(true)
    try {
      await abrir(monto, empleadoId)
      setMontoApertura('')
    } finally {
      setAbriendo(false)
    }
  }

  const totalGastos = gastos.reduce((s, g) => s + g.monto, 0)
  const esperado = cajaAbierta ? cajaAbierta.monto_apertura + totalesDia.efectivo - totalGastos : 0
  const contadoNum = montoContado ? Number(montoContado) : null
  const diferenciaPreview = contadoNum != null ? contadoNum - esperado : null

  const handleRegistrarGasto = async () => {
    setGastoError(null)
    const monto = Number(montoGasto)
    if (!(monto > 0)) return setGastoError('Ingresá un monto válido')
    if (!motivoGasto.trim()) return setGastoError('Ingresá el motivo del gasto')
    setRegistrandoGasto(true)
    try {
      await registrarGasto(monto, motivoGasto.trim(), empleadoId)
      setShowGasto(false)
      setMontoGasto('')
      setMotivoGasto('')
    } catch (e) {
      setGastoError((e as Error).message)
    } finally {
      setRegistrandoGasto(false)
    }
  }

  const handleCerrar = async () => {
    if (contadoNum == null) return
    setCerrando(true)
    try {
      await cerrar(contadoNum, empleadoId, notas.trim() || null)
      setShowCerrar(false)
      setMontoContado('')
      setNotas('')
    } finally {
      setCerrando(false)
    }
  }

  const hoy = toISO(new Date())
  const esDeHoy = cajaAbierta?.fecha === hoy

  return (
    <div className="caja-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Caja</h1>
          <p className="page-subtitle">{loading ? 'Cargando...' : quienSoy}</p>
        </div>
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: '.875rem' }}>⚠ {error}</p>}

      {!cajaAbierta ? (
        <section className="config-section">
          <div className="config-section-header"><Unlock size={16} /><h2 className="config-section-title">Abrir caja</h2></div>
          <p className="config-section-desc">No hay una caja abierta hoy. Ingresá el efectivo inicial para empezar el día.</p>
          <div className="config-card">
            <div className="config-row">
              <label className="config-label">Monto inicial</label>
              <div className="config-input-wrap">
                <input
                  type="number" className="config-input" min={0}
                  value={montoApertura} onChange={e => setMontoApertura(e.target.value)}
                  placeholder="0"
                />
                <span className="config-input-suffix">ARS</span>
              </div>
            </div>
            <div className="config-actions">
              <button className="btn btn-primary" disabled={!montoApertura || abriendo} onClick={handleAbrir}>
                {abriendo ? 'Abriendo...' : 'Abrir caja'}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="config-section">
          <div className="config-section-header"><Wallet size={16} /><h2 className="config-section-title">Caja de hoy</h2></div>

          {!esDeHoy && (
            <p className="caja-warning">
              <AlertTriangle size={14} /> Caja abierta del {new Date(cajaAbierta.fecha + 'T00:00:00').toLocaleDateString('es-AR')} sin cerrar.
            </p>
          )}

          <div className="caja-stats">
            <div className="sell-stat"><span>Apertura</span><span className="sell-stat-val">${cajaAbierta.monto_apertura.toLocaleString('es-AR')}</span></div>
            <div className="sell-stat"><span>Abierta por</span><span className="sell-stat-val">{cajaAbierta.empleado_apertura?.nombre ?? 'Dueño'}</span></div>
            <div className="sell-stat"><span>Efectivo vendido hoy</span><span className="sell-stat-val">${totalesDia.efectivo.toLocaleString('es-AR')}</span></div>
            <div className="sell-stat"><span>Gastos</span><span className="sell-stat-val">-${totalGastos.toLocaleString('es-AR')}</span></div>
            <div className="sell-stat"><span>Efectivo esperado</span><span className="sell-stat-val accent">${esperado.toLocaleString('es-AR')}</span></div>
          </div>

          <p className="caja-referencia">
            Referencia (no afecta el arqueo): Transferencia ${totalesDia.transferencia.toLocaleString('es-AR')} · Tarjeta ${totalesDia.tarjeta.toLocaleString('es-AR')}
          </p>

          <div className="caja-gastos-header">
            <div className="config-section-header"><Receipt size={16} /><h3 className="config-section-title">Gastos de hoy</h3></div>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowGasto(true)}><MinusCircle size={14} /> Registrar gasto</button>
          </div>

          {gastos.length === 0 ? (
            <p className="caja-referencia">Sin gastos registrados hoy.</p>
          ) : (
            <div className="caja-gastos-list">
              {gastos.map(g => (
                <div key={g.id} className="caja-gasto-row">
                  <div>
                    <span className="caja-gasto-motivo">{g.motivo}</span>
                    <span className="caja-gasto-meta">
                      {g.empleados?.nombre ?? 'Dueño'} · {new Date(g.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <span className="caja-gasto-monto">-${g.monto.toLocaleString('es-AR')}</span>
                </div>
              ))}
              <div className="caja-gasto-row caja-gasto-total">
                <span>Total gastos</span>
                <span className="caja-gasto-monto">-${totalGastos.toLocaleString('es-AR')}</span>
              </div>
            </div>
          )}

          <div className="config-actions">
            <button className="btn btn-primary" onClick={() => setShowCerrar(true)}><Lock size={14} /> Cerrar caja</button>
          </div>
        </section>
      )}

      <section className="config-section">
        <div className="config-section-header"><Wallet size={16} /><h2 className="config-section-title">Historial de cajas cerradas</h2></div>

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

        {cerradas.length === 0 ? (
          <div className="ventas-empty"><span>🔒</span><p>No hay cajas cerradas en ese rango.</p></div>
        ) : (
          <div className="ventas-table-wrap">
            <table className="ventas-table">
              <thead><tr><th>Fecha</th><th>Apertura</th><th>Gastos</th><th>Contado</th><th>Esperado</th><th>Diferencia</th><th>Abierta / Cerrada por</th></tr></thead>
              <tbody>
                {cerradas.map(c => {
                  const dif = c.diferencia ?? 0
                  return (
                    <tr key={c.id}>
                      <td>{new Date(c.fecha + 'T00:00:00').toLocaleDateString('es-AR')}</td>
                      <td>${c.monto_apertura.toLocaleString('es-AR')}</td>
                      <td>${(c.total_gastos_snapshot ?? 0).toLocaleString('es-AR')}</td>
                      <td>${(c.monto_cierre_contado ?? 0).toLocaleString('es-AR')}</td>
                      <td>${(c.monto_esperado_snapshot ?? 0).toLocaleString('es-AR')}</td>
                      <td className={`ganancia-cell ${dif >= 0 ? 'positive' : 'negative'}`}>
                        {dif >= 0 ? '+' : ''}${dif.toLocaleString('es-AR')}
                      </td>
                      <td>{c.empleado_apertura?.nombre ?? 'Dueño'} / {c.empleado_cierre?.nombre ?? 'Dueño'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal isOpen={showCerrar} onClose={() => !cerrando && setShowCerrar(false)} title="Cerrar caja" maxWidth="420px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="config-row">
            <label className="config-label">Efectivo contado</label>
            <div className="config-input-wrap">
              <input
                type="number" className="config-input" min={0}
                value={montoContado} onChange={e => setMontoContado(e.target.value)}
                placeholder="0" autoFocus
              />
              <span className="config-input-suffix">ARS</span>
            </div>
          </div>

          {diferenciaPreview !== null && (
            <p className={`caja-diferencia-preview ${diferenciaPreview === 0 ? 'neutral' : diferenciaPreview > 0 ? 'positive' : 'negative'}`}>
              {diferenciaPreview === 0
                ? 'Cuadra exacto.'
                : diferenciaPreview > 0
                  ? `Sobran $${diferenciaPreview.toLocaleString('es-AR')}`
                  : `Faltan $${Math.abs(diferenciaPreview).toLocaleString('es-AR')}`}
            </p>
          )}

          <div className="config-row config-row-col">
            <label className="config-label">Notas</label>
            <div className="config-input-wrap" style={{ width: '100%' }}>
              <input
                className="config-input" style={{ fontWeight: 400, fontSize: '.875rem' }}
                value={notas} onChange={e => setNotas(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>

          <div className="sell-actions">
            <button className="btn btn-secondary" onClick={() => setShowCerrar(false)} disabled={cerrando}>Cancelar</button>
            <button className="btn btn-primary" disabled={!montoContado || cerrando} onClick={handleCerrar}>
              {cerrando ? 'Cerrando...' : 'Confirmar cierre'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showGasto} onClose={() => !registrandoGasto && setShowGasto(false)} title="Registrar gasto" maxWidth="420px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="config-row">
            <label className="config-label">Monto</label>
            <div className="config-input-wrap">
              <input
                type="number" className="config-input" min={0}
                value={montoGasto} onChange={e => setMontoGasto(e.target.value)}
                placeholder="0" autoFocus
              />
              <span className="config-input-suffix">ARS</span>
            </div>
          </div>

          <div className="config-row config-row-col">
            <label className="config-label">Motivo</label>
            <div className="config-input-wrap" style={{ width: '100%' }}>
              <input
                className="config-input" style={{ fontWeight: 400, fontSize: '.875rem' }}
                value={motivoGasto} onChange={e => setMotivoGasto(e.target.value)}
                placeholder="Ej: compra de bolsas, flete, etc."
              />
            </div>
          </div>

          {gastoError && <p className="sell-error">{gastoError}</p>}

          <div className="sell-actions">
            <button className="btn btn-secondary" onClick={() => setShowGasto(false)} disabled={registrandoGasto}>Cancelar</button>
            <button className="btn btn-primary" disabled={!montoGasto || !motivoGasto.trim() || registrandoGasto} onClick={handleRegistrarGasto}>
              {registrandoGasto ? 'Registrando...' : 'Registrar gasto'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
