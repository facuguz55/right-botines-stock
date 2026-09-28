import { useState } from 'react'
import { RefreshCw, ChevronLeft, ChevronRight, Settings, AlertTriangle, Lock } from 'lucide-react'
import {
  PieChart, Pie, Cell,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { useRentabilidad } from '../../hooks/useRentabilidad'
import { formatARS } from '../../services/tiendanubeService'
import { Modal } from '../Modal/Modal'
import type { RentabilidadCanal } from '../../types'
import './Rentabilidad.css'

interface RentabilidadProps {
  onConfigurarCostos: () => void
}

function mesLabel(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

function sumarMes(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function CanalBreakdown({ titulo, color, canal, manoObraIncluida }: { titulo: string; color: string; canal: RentabilidadCanal; manoObraIncluida: boolean }) {
  return (
    <div className="tn-card rent-breakdown">
      <h3 className="tn-card-title" style={{ color }}>{titulo}</h3>
      <div className="rent-breakdown-row">
        <span>Facturado</span>
        <strong>${formatARS(canal.facturado)}</strong>
      </div>
      <div className="rent-breakdown-row muted">
        <span>− Costo de productos</span>
        <span>${formatARS(canal.costoProductos)}</span>
      </div>
      <div className="rent-breakdown-row">
        <span>= Ganancia bruta</span>
        <span>${formatARS(canal.gananciaBruta)}</span>
      </div>
      <div className="rent-breakdown-row muted">
        <span>− Costos fijos</span>
        <span>${formatARS(canal.costosFijos)}</span>
      </div>
      <div className="rent-breakdown-row muted">
        <span>− Costos variables</span>
        <span>${formatARS(canal.costosVariables)}</span>
      </div>
      <div className="rent-breakdown-row muted">
        <span>− Costos únicos</span>
        <span>${formatARS(canal.costosUnicos)}</span>
      </div>
      <div className="rent-breakdown-row muted">
        <span>− Mano de obra (sueldos)</span>
        <span>{manoObraIncluida ? `$${formatARS(canal.costoManoObra)}` : '🔒 bloqueado'}</span>
      </div>
      <div className="rent-breakdown-row total">
        <span>Ganancia neta</span>
        <strong style={{ color }}>${formatARS(canal.gananciaNeta)}</strong>
      </div>
      <p className="rent-sub">Margen neto {canal.margenNeto.toFixed(1)}%</p>
    </div>
  )
}

export function Rentabilidad({ onConfigurarCostos }: RentabilidadProps) {
  const { data, mes, setMes, loading, error, reload, desbloquearManoObra } = useRentabilidad()
  // Ojo: se basa en el resultado real de data.manoObraIncluida, no en si
  // alguna vez se guardó un PIN en la sesión — si el PIN guardado quedó
  // desactualizado (ej. el dueño lo cambió), sigue mostrando el botón para
  // volver a pedirlo en vez de esconderlo con los sueldos igual bloqueados.
  const manoObraDesbloqueada = data ? data.manoObraIncluida : false

  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [verificandoPin, setVerificandoPin] = useState(false)

  const abrirPinModal = () => {
    setPinInput('')
    setPinError(null)
    setPinModalOpen(true)
  }

  const confirmarPin = async () => {
    setVerificandoPin(true)
    setPinError(null)
    try {
      const ok = await desbloquearManoObra(pinInput)
      if (!ok) { setPinError('PIN incorrecto'); return }
      setPinModalOpen(false)
    } catch (e) {
      setPinError((e as Error).message)
    } finally {
      setVerificandoPin(false)
    }
  }

  return (
    <div className="rentabilidad">
      <div className="page-header">
        <div>
          <h1 className="page-title">Rentabilidad</h1>
          <p className="page-subtitle">Ganancia neta real — Local + Tienda Online</p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          {!manoObraDesbloqueada && (
            <button className="btn btn-secondary btn-sm" onClick={abrirPinModal}>
              <Lock size={13} /> Incluir sueldos
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={onConfigurarCostos}>
            <Settings size={13} /> Configurar costos
          </button>
          <button className="btn btn-secondary btn-sm" onClick={reload} disabled={loading}>
            <RefreshCw size={13} /> {loading ? 'Calculando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      <div className="rent-mes-selector">
        <button className="icon-btn" onClick={() => setMes(sumarMes(mes, -1))}><ChevronLeft size={15} /></button>
        <span className="rent-mes-label">{mesLabel(mes)}</span>
        <button className="icon-btn" onClick={() => setMes(sumarMes(mes, 1))}><ChevronRight size={15} /></button>
      </div>

      {error && <div className="rent-banner">⚠ {error}</div>}

      {loading && (
        <div className="tn-loading"><div className="spinner" /><p>Calculando rentabilidad...</p></div>
      )}

      {!loading && data && (
        <>
          {data.web.sinVincular > 0 && (
            <div className="rent-banner">
              <AlertTriangle size={14} style={{ verticalAlign: '-2px', marginRight: '.375rem' }} />
              ${formatARS(data.web.sinVincular)} en ventas web corresponden a productos sin vincular a un modelo del Stock — su costo no se descontó de la ganancia.
            </div>
          )}

          {!data.manoObraIncluida && (
            <div className="rent-banner">
              <Lock size={14} style={{ verticalAlign: '-2px', marginRight: '.375rem' }} />
              La ganancia neta no incluye los sueldos (horas fichadas × valor por hora) — hay que ingresar el PIN del dueño para verlos.
            </div>
          )}

          {/* ── Métricas del mes ── */}
          <div className="rent-metrics">
            <div className="rent-metric-card total">
              <p className="rent-label">Facturado total del mes</p>
              <p className="rent-value">${formatARS(data.total.facturado)}</p>
              <div className="rent-canales">
                <span style={{ color: 'var(--accent)' }}>Local ${formatARS(data.local.facturado)}</span>
                <span className="rent-sep">·</span>
                <span style={{ color: '#3b82f6' }}>Web ${formatARS(data.web.facturado)}</span>
              </div>
            </div>

            <div className="rent-metric-card">
              <p className="rent-label">Ganancia neta local</p>
              <p className="rent-value accent">${formatARS(data.local.gananciaNeta)}</p>
              <p className="rent-sub">Margen {data.local.margenNeto.toFixed(1)}%</p>
            </div>

            <div className="rent-metric-card">
              <p className="rent-label">Ganancia neta web</p>
              <p className="rent-value" style={{ color: '#3b82f6' }}>${formatARS(data.web.gananciaNeta)}</p>
              <p className="rent-sub">Margen {data.web.margenNeto.toFixed(1)}%</p>
            </div>

            <div className="rent-metric-card">
              <p className="rent-label">Ganancia neta total</p>
              <p className="rent-value" style={{ color: '#10b981' }}>${formatARS(data.total.gananciaNeta)}</p>
              <p className="rent-sub">Margen {data.total.margenNeto.toFixed(1)}%</p>
            </div>
          </div>

          {/* ── Mix de canales + desglose ── */}
          <div className="rent-charts-row">
            {(data.local.facturado > 0 || data.web.facturado > 0) && (
              <div className="tn-card">
                <h3 className="tn-card-title">Mix de canales</h3>
                <div className="rent-pie-wrap">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Local', value: data.local.facturado, color: 'var(--accent)' },
                          { name: 'Web', value: data.web.facturado, color: '#3b82f6' },
                        ].filter(d => d.value > 0)}
                        dataKey="value" nameKey="name" cx="50%" cy="50%"
                        innerRadius={50} outerRadius={75} paddingAngle={4}
                      >
                        <Cell fill="var(--accent)" />
                        <Cell fill="#3b82f6" />
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: 'var(--bg-surface-3)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '12px' }}
                        formatter={(v: number) => [`$${formatARS(v)}`, '']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <CanalBreakdown titulo="Desglose Local" color="var(--accent)" canal={data.local} manoObraIncluida={data.manoObraIncluida} />
            <CanalBreakdown titulo="Desglose Web" color="#3b82f6" canal={data.web} manoObraIncluida={data.manoObraIncluida} />
          </div>
        </>
      )}

      <Modal isOpen={pinModalOpen} onClose={() => !verificandoPin && setPinModalOpen(false)} title="PIN del dueño" maxWidth="360px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '.875rem' }}>
            Los sueldos se verifican en el servidor para incluirlos en la ganancia neta.
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
    </div>
  )
}
