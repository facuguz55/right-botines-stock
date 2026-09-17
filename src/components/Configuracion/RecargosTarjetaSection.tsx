import { useState } from 'react'
import { Plus, Trash2, Power, PauseCircle, CreditCard } from 'lucide-react'
import type { useRecargosTarjeta } from '../../hooks/useRecargosTarjeta'
import type { RecargoTarjeta } from '../../types'
import { Modal } from '../Modal/Modal'

function formatPct(n: number) {
  return `${n}%`
}

interface RecargosTarjetaSectionProps {
  recargosTarjeta: ReturnType<typeof useRecargosTarjeta>
}

export function RecargosTarjetaSection({ recargosTarjeta }: RecargosTarjetaSectionProps) {
  const { recargos, loading, error, addRecargo, toggleActivo, removeRecargo } = recargosTarjeta
  const [mostrarForm, setMostrarForm] = useState(false)
  const [tarjeta, setTarjeta] = useState('')
  const [cuotas, setCuotas] = useState('')
  const [porcentaje, setPorcentaje] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  // Borrar un recargo sin querer (ej. el de "Crédito 3 cuotas") deja al
  // sync de TiendaNube sin poder calcular el precio de efectivo de
  // productos nuevos — pasa a cobrarse el precio de tarjeta por error,
  // silenciosamente. Por eso esto sí pide confirmación (a diferencia de
  // activar/desactivar, que es reversible con un clic).
  const [deleteTarget, setDeleteTarget] = useState<RecargoTarjeta | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await removeRecargo(deleteTarget.id)
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  const puedeGuardar = tarjeta.trim().length > 0 && Number(cuotas) > 0 && porcentaje.trim().length > 0

  const handleGuardar = async () => {
    setSaving(true)
    setMsg('')
    try {
      await addRecargo({ tarjeta: tarjeta.trim(), cuotas: Number(cuotas), porcentaje: Number(porcentaje), activo: true })
      setTarjeta('')
      setCuotas('')
      setPorcentaje('')
      setMostrarForm(false)
    } catch (e) {
      setMsg((e as Error).message?.includes('duplicate') ? 'Ya existe un recargo para esa tarjeta con esa cantidad de cuotas.' : ((e as Error).message ?? 'Error al guardar.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="config-section">
      <div className="config-section-header">
        <CreditCard size={16} />
        <h2 className="config-section-title">Recargos por tarjeta (local)</h2>
      </div>
      <p className="config-section-desc">
        El % real que cobra tu posnet según la tarjeta y la cantidad de cuotas. Mientras no cargues ninguno acá,
        se sigue usando el recargo fijo del 10% que ya tenía la app. En cuanto cargues el primero, el vendedor
        va a tener que elegir tarjeta y cuotas al vender con Tarjeta en el local.
      </p>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '.875rem' }}>Cargando...</p>
      ) : error ? (
        <p style={{ color: 'var(--danger)', fontSize: '.875rem' }}>⚠ {error}</p>
      ) : (
        <div className="config-table-wrap">
          <table className="config-table">
            <thead>
              <tr><th>Tarjeta</th><th>Cuotas</th><th>Recargo</th><th></th></tr>
            </thead>
            <tbody>
              {recargos.map(r => (
                <tr key={r.id} className={r.activo ? '' : 'inactive'}>
                  <td>{r.tarjeta}</td>
                  <td>{r.cuotas}</td>
                  <td>{formatPct(r.porcentaje)}</td>
                  <td>
                    <div className="config-table-actions">
                      <button className="icon-btn" title={r.activo ? 'Desactivar' : 'Activar'} onClick={() => toggleActivo(r.id, !r.activo)}>
                        {r.activo ? <Power size={13} /> : <PauseCircle size={13} />}
                      </button>
                      <button className="icon-btn danger" title="Eliminar" onClick={() => setDeleteTarget(r)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {recargos.length === 0 && (
                <tr><td colSpan={4} className="config-table-empty">No hay recargos cargados — se usa el 10% fijo por defecto.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {mostrarForm ? (
        <div className="config-card">
          <div className="config-row">
            <label className="config-label">Tarjeta</label>
            <div className="config-input-wrap" style={{ width: 200 }}>
              <input className="config-input" style={{ fontWeight: 400, fontSize: '.875rem' }}
                value={tarjeta} onChange={e => setTarjeta(e.target.value)} placeholder="Ej: Visa" />
            </div>
          </div>
          <div className="config-row">
            <label className="config-label">Cuotas</label>
            <div className="config-input-wrap">
              <input type="number" className="config-input" min={1}
                value={cuotas} onChange={e => setCuotas(e.target.value)} placeholder="Ej: 3" />
            </div>
          </div>
          <div className="config-row">
            <label className="config-label">Recargo</label>
            <div className="config-input-wrap">
              <input type="number" className="config-input" min={0}
                value={porcentaje} onChange={e => setPorcentaje(e.target.value)} placeholder="Ej: 15" />
              <span className="config-input-suffix">%</span>
            </div>
          </div>
          {msg && <p style={{ fontSize: '.8125rem', color: 'var(--danger)' }}>{msg}</p>}
          <div className="config-actions">
            <button className="btn btn-secondary" onClick={() => setMostrarForm(false)}>Cancelar</button>
            <button className="btn btn-primary" disabled={!puedeGuardar || saving} onClick={handleGuardar}>
              {saving ? 'Guardando...' : 'Guardar recargo'}
            </button>
          </div>
        </div>
      ) : (
        <button className="btn btn-secondary btn-sm" onClick={() => setMostrarForm(true)}>
          <Plus size={13} /> Nuevo recargo
        </button>
      )}

      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Eliminar recargo" maxWidth="380px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            ¿Seguro que querés eliminar el recargo de{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{deleteTarget?.tarjeta} en {deleteTarget?.cuotas} cuota{deleteTarget?.cuotas !== 1 ? 's' : ''}</strong>?
            {deleteTarget?.tarjeta === 'Crédito' && deleteTarget?.cuotas === 3 && (
              <> Este puntual también se usa para calcular el precio de efectivo de productos nuevos de TiendaNube — borrarlo puede hacer que se les cobre el precio de tarjeta por error hasta que lo cargues de nuevo.</>
            )}
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.75rem' }}>
            <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancelar</button>
            <button className="btn btn-danger" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? 'Eliminando...' : 'Sí, eliminar'}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  )
}
