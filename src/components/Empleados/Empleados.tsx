import { useState, useEffect } from 'react'
import { Plus, Power, PauseCircle, UserPlus, Clock, Eye, Timer, Wallet, Lock } from 'lucide-react'
import type { Fichaje, Venta } from '../../types'
import type { useEmpleados } from '../../hooks/useEmpleados'
import { useFichajes } from '../../hooks/useFichajes'
import { fetchVentasPorEmpleadoYRango } from '../../services/ventas'
import { fetchConfiguracionFichajes, updateHoraLimiteCierre, updateHorasMaximasTurno, updateHoraCorteTurno } from '../../services/configuracionFichajes'
import { verifyOwnerPin } from '../../services/auth'
import { fetchValoresHora, asignarValorHora } from '../../services/valoresHora'
import { getSessionPin, setSessionPin } from '../../lib/pinSession'
import { valorHoraEn, calcularPagos, type ValorHora } from '../../utils/valoresHora'
import { Modal } from '../Modal/Modal'
import './Empleados.css'

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

function toDatetimeLocalValue(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function horasTrabajadas(f: Fichaje): string {
  const entrada = new Date(f.hora_entrada).getTime()
  const salida = f.hora_salida ? new Date(f.hora_salida).getTime() : Date.now()
  const mins = Math.max(0, Math.round((salida - entrada) / 60000))
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function fmtHoras(horas: number): string {
  const mins = Math.round(horas * 60)
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

interface EmpleadosProps {
  empleadosHook: ReturnType<typeof useEmpleados>
}

export function Empleados({ empleadosHook }: EmpleadosProps) {
  const { empleados, loading, addEmpleado, toggleActivo } = empleadosHook

  const [nombre, setNombre] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const initial = getPreset('mes')
  const [startDate, setStartDate] = useState(initial.start)
  const [endDate, setEndDate] = useState(initial.end)
  const [activePreset, setActivePreset] = useState('mes')
  const { fichajes, loading: loadingFichajes, cerrarManual } = useFichajes(startDate, endDate)

  const [cerrarTarget, setCerrarTarget] = useState<Fichaje | null>(null)
  const [horaSalidaInput, setHoraSalidaInput] = useState('')
  const [cerrando, setCerrando] = useState(false)

  const [movimientosTarget, setMovimientosTarget] = useState<Fichaje | null>(null)
  const [movimientos, setMovimientos] = useState<Venta[]>([])
  const [loadingMovs, setLoadingMovs] = useState(false)

  const [horaLimite, setHoraLimite] = useState('20:00')
  const [loadingHoraLimite, setLoadingHoraLimite] = useState(true)
  const [savingHoraLimite, setSavingHoraLimite] = useState(false)

  const [horasMaximas, setHorasMaximas] = useState('12')
  const [savingHorasMaximas, setSavingHorasMaximas] = useState(false)

  const [corteActivo, setCorteActivo] = useState(true)
  const [horaCorte, setHoraCorte] = useState('13:00')
  const [savingCorte, setSavingCorte] = useState(false)

  // Sueldos: importes ocultos hasta pedir el PIN — verificado server-side
  // (verifyOwnerPin), no por el rol del cliente. Una vez válido, se recuerda
  // para el resto de la pestaña (getSessionPin/setSessionPin) para no
  // repreguntarlo en cada acción.
  const [pin, setPin] = useState<string | null>(() => getSessionPin())
  const [valoresHora, setValoresHora] = useState<ValorHora[] | null>(null)
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [verificandoPin, setVerificandoPin] = useState(false)

  const [asignarTarget, setAsignarTarget] = useState<{ empleadoId: string | null; nombre: string } | null>(null)
  const [montoAsignar, setMontoAsignar] = useState('')
  const [fechaAsignar, setFechaAsignar] = useState(hoyISO())
  const [asignarError, setAsignarError] = useState<string | null>(null)
  const [asignando, setAsignando] = useState(false)

  const cargarValoresHora = async (pinValido: string) => {
    setValoresHora(await fetchValoresHora(pinValido))
  }

  // Si ya había un PIN recordado de esta pestaña, lo revalida server-side
  // antes de confiar en él (pudo haber cambiado desde la última vez).
  useEffect(() => {
    if (!pin) return
    verifyOwnerPin(pin).then(ok => {
      if (ok) cargarValoresHora(pin)
      else { setPin(null); setSessionPin('') }
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const abrirPinModal = () => {
    setPinInput('')
    setPinError(null)
    setPinModalOpen(true)
  }

  const confirmarPin = async () => {
    setVerificandoPin(true)
    setPinError(null)
    try {
      const ok = await verifyOwnerPin(pinInput)
      if (!ok) { setPinError('PIN incorrecto'); return }
      setSessionPin(pinInput)
      setPin(pinInput)
      await cargarValoresHora(pinInput)
      setPinModalOpen(false)
    } catch (e) {
      setPinError((e as Error).message)
    } finally {
      setVerificandoPin(false)
    }
  }

  const abrirAsignar = (empleadoId: string | null, nombre: string) => {
    setAsignarTarget({ empleadoId, nombre })
    setMontoAsignar('')
    setFechaAsignar(hoyISO())
    setAsignarError(null)
  }

  // El botón que abre este modal solo se muestra una vez desbloqueados los
  // sueldos (pin ya verificado), así que acá siempre hay un pin válido.
  const confirmarAsignar = async () => {
    if (!asignarTarget || !pin) return
    const monto = Number(montoAsignar)
    if (!(monto >= 0)) return setAsignarError('Ingresá un valor válido')
    if (!fechaAsignar) return setAsignarError('Elegí la fecha desde la que rige')

    setAsignarError(null)
    setAsignando(true)
    try {
      const ok = await asignarValorHora(pin, asignarTarget.empleadoId, monto, fechaAsignar)
      if (!ok) return setAsignarError('PIN incorrecto — pedí "Ver importes" de nuevo.')
      await cargarValoresHora(pin)
      setAsignarTarget(null)
    } catch (e) {
      setAsignarError((e as Error).message)
    } finally {
      setAsignando(false)
    }
  }

  useEffect(() => {
    fetchConfiguracionFichajes()
      .then(cfg => {
        setHoraLimite(cfg.hora_limite_cierre.slice(0, 5))
        setHorasMaximas(String(cfg.horas_maximas_turno))
        setCorteActivo(!!cfg.hora_corte_turno)
        if (cfg.hora_corte_turno) setHoraCorte(cfg.hora_corte_turno.slice(0, 5))
      })
      .finally(() => setLoadingHoraLimite(false))
  }, [])

  const guardarHoraLimite = async () => {
    setSavingHoraLimite(true)
    try {
      await updateHoraLimiteCierre(horaLimite)
    } finally {
      setSavingHoraLimite(false)
    }
  }

  const guardarHorasMaximas = async () => {
    const n = Number(horasMaximas)
    if (!(n > 0)) return
    setSavingHorasMaximas(true)
    try {
      await updateHorasMaximasTurno(n)
    } finally {
      setSavingHorasMaximas(false)
    }
  }

  const guardarCorteTurno = async () => {
    setSavingCorte(true)
    try {
      await updateHoraCorteTurno(corteActivo ? horaCorte : null)
    } finally {
      setSavingCorte(false)
    }
  }

  function applyPreset(key: string) {
    const { start, end } = getPreset(key)
    setStartDate(start)
    setEndDate(end)
    setActivePreset(key)
  }

  const handleAdd = async () => {
    if (!nombre.trim()) return
    setSaving(true)
    try {
      await addEmpleado(nombre.trim())
      setNombre('')
      setMostrarForm(false)
    } finally {
      setSaving(false)
    }
  }

  const abrirCerrarManual = (f: Fichaje) => {
    setCerrarTarget(f)
    setHoraSalidaInput(toDatetimeLocalValue(new Date()))
  }

  const confirmarCerrarManual = async () => {
    if (!cerrarTarget || !horaSalidaInput) return
    setCerrando(true)
    try {
      await cerrarManual(cerrarTarget.id, new Date(horaSalidaInput).toISOString())
      setCerrarTarget(null)
    } finally {
      setCerrando(false)
    }
  }

  const verMovimientos = async (f: Fichaje) => {
    setMovimientosTarget(f)
    setLoadingMovs(true)
    try {
      const hasta = f.hora_salida ?? new Date().toISOString()
      setMovimientos(await fetchVentasPorEmpleadoYRango(f.empleado_id, f.hora_entrada, hasta))
    } finally {
      setLoadingMovs(false)
    }
  }

  return (
    <div className="empleados-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Empleados</h1>
          <p className="page-subtitle">
            {loading ? 'Cargando...' : `${empleados.length} empleado${empleados.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      <section className="config-section">
        <div className="config-section-header">
          <UserPlus size={16} />
          <h2 className="config-section-title">Gestión de empleados</h2>
        </div>

        <div className="config-table-wrap">
          <table className="config-table">
            <thead><tr><th>Nombre</th><th>Estado</th><th>Alta</th><th></th></tr></thead>
            <tbody>
              {empleados.map(emp => (
                <tr key={emp.id} className={emp.activo ? '' : 'inactive'}>
                  <td>{emp.nombre}</td>
                  <td><span className={`empleado-badge ${emp.activo ? 'activo' : 'inactivo'}`}>{emp.activo ? 'Activo' : 'Inactivo'}</span></td>
                  <td>{new Date(emp.created_at).toLocaleDateString('es-AR')}</td>
                  <td>
                    <div className="config-table-actions">
                      <button className="icon-btn" title={emp.activo ? 'Desactivar' : 'Activar'} onClick={() => toggleActivo(emp.id, !emp.activo)}>
                        {emp.activo ? <Power size={13} /> : <PauseCircle size={13} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {empleados.length === 0 && (
                <tr><td colSpan={4} className="config-table-empty">No hay empleados cargados.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {mostrarForm ? (
          <div className="config-card">
            <div className="config-row">
              <label className="config-label">Nombre</label>
              <div className="config-input-wrap" style={{ width: 220 }}>
                <input
                  className="config-input"
                  style={{ fontWeight: 400, fontSize: '.875rem' }}
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  placeholder="Nombre y apellido"
                  autoFocus
                />
              </div>
            </div>
            <div className="config-actions">
              <button className="btn btn-secondary" onClick={() => setMostrarForm(false)}>Cancelar</button>
              <button className="btn btn-primary" disabled={!nombre.trim() || saving} onClick={handleAdd}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={() => setMostrarForm(true)}>
            <Plus size={13} /> Agregar empleado
          </button>
        )}
      </section>

      <section className="config-section">
        <div className="config-section-header">
          <Wallet size={16} />
          <h2 className="config-section-title">Sueldos por hora</h2>
        </div>

        {!pin ? (
          <div className="sueldos-lock">
            <Lock size={15} />
            <p>Los importes están protegidos con el PIN del dueño, verificado en el servidor — no alcanza con estar en esta sección para verlos.</p>
            <button className="btn btn-secondary btn-sm" onClick={abrirPinModal}>Ver / asignar sueldos</button>
          </div>
        ) : (
          <div className="config-table-wrap">
            <table className="config-table">
              <thead><tr><th>Persona</th><th>Valor por hora</th><th>Vigente desde</th><th></th></tr></thead>
              <tbody>
                {[{ id: null as string | null, nombre: 'Dueño' }, ...empleados.map(e => ({ id: e.id, nombre: e.nombre }))].map(persona => {
                  const hoy = hoyISO()
                  const valorActual = valoresHora ? valorHoraEn(valoresHora, persona.id, hoy) : null
                  const registro = valoresHora?.find(v => v.empleado_id === persona.id && v.valor_hora === valorActual)
                  return (
                    <tr key={persona.id ?? 'dueno'}>
                      <td>{persona.nombre}</td>
                      <td>{valorActual != null ? fmtMoney(valorActual) + '/h' : <span className="sueldos-sin-asignar">Sin asignar</span>}</td>
                      <td>{registro ? new Date(registro.vigente_desde + 'T00:00:00').toLocaleDateString('es-AR') : '—'}</td>
                      <td>
                        <button className="btn btn-secondary btn-sm" onClick={() => abrirAsignar(persona.id, persona.nombre)}>
                          {valorActual != null ? 'Cambiar' : 'Asignar'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="config-section">
        <div className="config-section-header">
          <Timer size={16} />
          <h2 className="config-section-title">Cierre automático de fichajes</h2>
        </div>
        <p className="config-section-desc">
          Si un empleado se olvida de hacer logout, su fichaje queda abierto sumando horas indefinidamente.
          Cada vez que alguien abre la app, se cierran solos los fichajes de días anteriores a esta hora.
        </p>
        <div className="config-row">
          <label className="config-label">Hora límite</label>
          <div className="config-input-wrap">
            <input
              type="time" className="config-input"
              value={horaLimite} onChange={e => setHoraLimite(e.target.value)}
              disabled={loadingHoraLimite}
            />
          </div>
          <button className="btn btn-secondary btn-sm" disabled={loadingHoraLimite || savingHoraLimite} onClick={guardarHoraLimite}>
            {savingHoraLimite ? 'Guardando...' : 'Guardar'}
          </button>
        </div>

        <p className="config-section-desc">
          El fichaje de <strong>hoy</strong> normalmente no se toca (podría ser un turno largo real en curso). Pero si pasa este máximo de horas desde que entró, también se cierra solo.
        </p>
        <div className="config-row">
          <label className="config-label">Máximo de horas de turno</label>
          <div className="config-input-wrap">
            <input
              type="number" min={1} step={1} className="config-input"
              value={horasMaximas} onChange={e => setHorasMaximas(e.target.value)}
              disabled={loadingHoraLimite}
            />
          </div>
          <button className="btn btn-secondary btn-sm" disabled={loadingHoraLimite || savingHorasMaximas || !horasMaximas} onClick={guardarHorasMaximas}>
            {savingHorasMaximas ? 'Guardando...' : 'Guardar'}
          </button>
        </div>

        <p className="config-section-desc">
          Corte de turno (ej. mediodía): a esta hora se cierran solos los fichajes de <strong>hoy</strong> que sigan
          abiertos y, si hay una caja abierta, se corta también — sin pedirle a nadie que cuente efectivo (usa el
          monto calculado, sin diferencia). Así el turno siguiente arranca con una caja nueva pidiendo el efectivo
          real que hay en ese momento, en vez de seguir sumando sobre lo de la mañana.
        </p>
        <div className="config-row">
          <label className="config-label">
            <input
              type="checkbox" checked={corteActivo}
              onChange={e => setCorteActivo(e.target.checked)}
              disabled={loadingHoraLimite}
              style={{ marginRight: '.375rem' }}
            />
            Cortar turno
          </label>
          <div className="config-input-wrap">
            <input
              type="time" className="config-input"
              value={horaCorte} onChange={e => setHoraCorte(e.target.value)}
              disabled={loadingHoraLimite || !corteActivo}
            />
          </div>
          <button className="btn btn-secondary btn-sm" disabled={loadingHoraLimite || savingCorte} onClick={guardarCorteTurno}>
            {savingCorte ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </section>

      <section className="config-section">
        <div className="config-section-header">
          <Clock size={16} />
          <h2 className="config-section-title">Historial de fichajes</h2>
        </div>

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

        {!pin ? (
          <p className="sueldos-lock-nota">Desbloqueá "Sueldos por hora" arriba para ver el importe de este período.</p>
        ) : !loadingFichajes && fichajes.length > 0 && (
          <div className="pagos-periodo">
            <p className="config-section-desc" style={{ marginBottom: '.75rem' }}>Pagos del período</p>
            {calcularPagos(fichajes, valoresHora ?? []).map(pago => {
              const nombre = empleados.find(e => e.id === pago.empleadoId)?.nombre ?? 'Dueño'
              return (
                <div key={pago.empleadoId ?? 'dueno'} className="pagos-fila">
                  <span className="pagos-nombre">{nombre}</span>
                  <span className="pagos-horas">{fmtHoras(pago.horas)}</span>
                  <span className="pagos-importe">{fmtMoney(pago.importe)}</span>
                  {pago.horasSinValorizar > 0 && (
                    <span className="pagos-sin-valorizar" title="Horas trabajadas antes de tener un valor por hora asignado — no están sumadas al importe.">
                      ⚠ {fmtHoras(pago.horasSinValorizar)} sin valorizar
                    </span>
                  )}
                </div>
              )
            })}
            <div className="pagos-fila pagos-total">
              <span className="pagos-nombre">Total del período</span>
              <span />
              <span className="pagos-importe">
                {fmtMoney(calcularPagos(fichajes, valoresHora ?? []).reduce((s, p) => s + p.importe, 0))}
              </span>
            </div>
          </div>
        )}

        {loadingFichajes ? (
          <div className="ventas-loading"><div className="spinner" /><p>Cargando fichajes...</p></div>
        ) : fichajes.length === 0 ? (
          <div className="ventas-empty"><span>🕐</span><p>No hay fichajes en ese rango.</p></div>
        ) : (
          <div className="ventas-table-wrap">
            <table className="ventas-table">
              <thead><tr><th>Empleado</th><th>Entrada</th><th>Salida</th><th>Horas</th><th></th></tr></thead>
              <tbody>
                {fichajes.map(f => (
                  <tr key={f.id}>
                    <td>{f.empleados?.nombre ?? '—'}</td>
                    <td className="date-cell">
                      {new Date(f.hora_entrada).toLocaleDateString('es-AR')}
                      <span className="time-cell">{new Date(f.hora_entrada).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </td>
                    <td>
                      {f.hora_salida ? (
                        <span className="date-cell">
                          {new Date(f.hora_salida).toLocaleDateString('es-AR')}
                          <span className="time-cell">{new Date(f.hora_salida).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                        </span>
                      ) : (
                        <span className="empleado-badge en-curso">En curso</span>
                      )}
                    </td>
                    <td>{horasTrabajadas(f)}</td>
                    <td>
                      <div className="config-table-actions">
                        <button className="icon-btn" title="Ver movimientos del turno" onClick={() => verMovimientos(f)}>
                          <Eye size={13} />
                        </button>
                        {!f.hora_salida && (
                          <button className="btn btn-secondary btn-sm" onClick={() => abrirCerrarManual(f)}>
                            Cerrar manualmente
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal isOpen={!!cerrarTarget} onClose={() => !cerrando && setCerrarTarget(null)} title="Cerrar fichaje manualmente" maxWidth="380px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '.875rem' }}>
            Turno de <strong style={{ color: 'var(--text-primary)' }}>{cerrarTarget?.empleados?.nombre}</strong> — elegí la hora de salida.
          </p>
          <input
            type="datetime-local"
            className="config-input empleados-datetime"
            value={horaSalidaInput}
            onChange={e => setHoraSalidaInput(e.target.value)}
          />
          <div className="sell-actions">
            <button className="btn btn-secondary" onClick={() => setCerrarTarget(null)} disabled={cerrando}>Cancelar</button>
            <button className="btn btn-primary" onClick={confirmarCerrarManual} disabled={cerrando || !horaSalidaInput}>
              {cerrando ? 'Cerrando...' : 'Confirmar cierre'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!movimientosTarget} onClose={() => setMovimientosTarget(null)} title="Movimientos del turno" maxWidth="520px">
        {loadingMovs ? (
          <p style={{ color: 'var(--text-secondary)' }}>Cargando...</p>
        ) : movimientos.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>Sin ventas registradas en este turno.</p>
        ) : (
          <div className="ventas-table-wrap">
            <table className="ventas-table">
              <thead><tr><th>Hora</th><th>Modelo</th><th>Pago</th><th>Precio</th></tr></thead>
              <tbody>
                {movimientos.map(v => (
                  <tr key={v.id}>
                    <td className="time-cell">{new Date(v.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>{v.modelos ? <span><strong>{v.modelos.marca}</strong> {v.modelos.modelo}</span> : <span className="deleted-product">Eliminado</span>}</td>
                    <td>{v.medio_pago}</td>
                    <td className="price-cell">${v.precio_venta.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <Modal isOpen={pinModalOpen} onClose={() => !verificandoPin && setPinModalOpen(false)} title="PIN del dueño" maxWidth="360px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '.875rem' }}>
            Los importes de sueldos se verifican en el servidor, no alcanza con estar en esta pantalla.
          </p>
          <input
            type="password"
            className="config-input"
            autoFocus
            value={pinInput}
            onChange={e => setPinInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !verificandoPin && confirmarPin()}
            placeholder="PIN"
          />
          {pinError && <p className="sell-error">{pinError}</p>}
          <div className="sell-actions">
            <button className="btn btn-secondary" onClick={() => setPinModalOpen(false)} disabled={verificandoPin}>Cancelar</button>
            <button className="btn btn-primary" disabled={!pinInput || verificandoPin} onClick={confirmarPin}>
              {verificandoPin ? 'Verificando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!asignarTarget} onClose={() => !asignando && setAsignarTarget(null)} title={`Valor por hora — ${asignarTarget?.nombre ?? ''}`} maxWidth="380px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="config-row">
            <label className="config-label">Monto por hora</label>
            <div className="config-input-wrap">
              <input
                type="number" min={0} className="config-input" autoFocus
                value={montoAsignar} onChange={e => setMontoAsignar(e.target.value)}
                placeholder="0"
              />
              <span className="config-input-suffix">ARS/h</span>
            </div>
          </div>
          <div className="config-row">
            <label className="config-label">Vigente desde</label>
            <input
              type="date" className="config-input"
              value={fechaAsignar} onChange={e => setFechaAsignar(e.target.value)}
            />
          </div>
          <p className="sueldos-lock-nota">
            Lo trabajado antes de esta fecha se sigue calculando con el valor que regía en ese momento — esto no reescribe pagos anteriores.
          </p>
          {asignarError && <p className="sell-error">{asignarError}</p>}
          <div className="sell-actions">
            <button className="btn btn-secondary" onClick={() => setAsignarTarget(null)} disabled={asignando}>Cancelar</button>
            <button className="btn btn-primary" disabled={!montoAsignar || !fechaAsignar || asignando} onClick={confirmarAsignar}>
              {asignando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
