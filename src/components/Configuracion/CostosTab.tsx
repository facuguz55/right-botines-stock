import { useState } from 'react'
import { Plus, Trash2, Power, PauseCircle, Calendar, Repeat, Zap } from 'lucide-react'
import type { CostoCanal, CostoModoValor, CostoTipo } from '../../types'
import { useCostos } from '../../hooks/useCostos'

const CANAL_LABEL: Record<CostoCanal, string> = { local: 'Local', web: 'Web', ambos: 'Ambos' }

function formatMonto(n: number) {
  return `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

function hoyStr() {
  return new Date().toISOString().slice(0, 10)
}

interface ConfigFormState {
  nombre: string
  canal: CostoCanal
  modo_valor: CostoModoValor
  valor: string
  categoria: string
  vigente_desde: string
  vigente_hasta: string
  prorateo_web_pct: string
  notas: string
}

function emptyConfigForm(): ConfigFormState {
  return {
    nombre: '', canal: 'ambos', modo_valor: 'monto', valor: '',
    categoria: '', vigente_desde: hoyStr(), vigente_hasta: '', prorateo_web_pct: '', notas: '',
  }
}

function CostoConfigTable({
  descripcion, tipo, items, onToggle, onDelete,
}: {
  descripcion: string
  tipo: CostoTipo
  items: ReturnType<typeof useCostos>['costosConfig']
  onToggle: (id: string, activo: boolean) => void
  onDelete: (id: string) => void
}) {
  const filtrados = items.filter(c => c.tipo === tipo)

  return (
    <div className="config-table-wrap">
      <table className="config-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Canal</th>
            {tipo === 'variable_venta' && <th>Valor</th>}
            {tipo === 'fijo_mensual' && <th>Monto/mes</th>}
            <th>Vigencia</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtrados.map(c => (
            <tr key={c.id} className={c.activo ? '' : 'inactive'}>
              <td>{c.nombre}{c.categoria ? <span style={{ color: 'var(--text-muted)', fontSize: '.7rem' }}> · {c.categoria}</span> : ''}</td>
              <td><span className={`canal-badge ${c.canal}`}>{CANAL_LABEL[c.canal]}</span></td>
              <td>
                {c.modo_valor === 'porcentaje' ? `${c.valor}%` : formatMonto(c.valor)}
              </td>
              <td style={{ fontSize: '.75rem' }}>
                {new Date(c.vigente_desde + 'T00:00:00').toLocaleDateString('es-AR')}
                {c.vigente_hasta ? ` → ${new Date(c.vigente_hasta + 'T00:00:00').toLocaleDateString('es-AR')}` : ' → sigue'}
              </td>
              <td>
                <div className="config-table-actions">
                  <button
                    className="icon-btn"
                    title={c.activo ? 'Desactivar' : 'Activar'}
                    onClick={() => onToggle(c.id, !c.activo)}
                  >
                    {c.activo ? <Power size={13} /> : <PauseCircle size={13} />}
                  </button>
                  <button className="icon-btn danger" title="Eliminar" onClick={() => onDelete(c.id)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {filtrados.length === 0 && (
            <tr><td colSpan={5} className="config-table-empty">{descripcion}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function CostoConfigForm({
  tipo, onCancel, onSave,
}: {
  tipo: CostoTipo
  onCancel: () => void
  onSave: (form: ConfigFormState) => Promise<void>
}) {
  const [form, setForm] = useState<ConfigFormState>(emptyConfigForm())
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof ConfigFormState>(k: K, v: ConfigFormState[K]) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  const puedeGuardar = form.nombre.trim().length > 0 && Number(form.valor) > 0

  return (
    <div className="config-card">
      <div className="config-row">
        <label className="config-label">Nombre</label>
        <div className="config-input-wrap" style={{ width: 260 }}>
          <input className="config-input" style={{ fontWeight: 400, fontSize: '.875rem' }}
            value={form.nombre} onChange={e => set('nombre', e.target.value)}
            placeholder={tipo === 'fijo_mensual' ? 'Ej: Alquiler local' : 'Ej: Comisión Mercado Pago'} />
        </div>
      </div>

      <div className="config-row">
        <label className="config-label">Canal</label>
        <div className="config-toggle-group">
          {(['local', 'web', 'ambos'] as CostoCanal[]).map(c => (
            <button key={c} className={`config-toggle${form.canal === c ? ' active' : ''}`} onClick={() => set('canal', c)}>
              {CANAL_LABEL[c]}
            </button>
          ))}
        </div>
      </div>

      {form.canal === 'ambos' && (
        <div className="config-row">
          <label className="config-label">% para Web</label>
          <div className="config-input-wrap">
            <input type="number" className="config-input" min={0} max={100}
              value={form.prorateo_web_pct} onChange={e => set('prorateo_web_pct', e.target.value)}
              placeholder="Auto (por facturación)" />
            <span className="config-input-suffix">%</span>
          </div>
        </div>
      )}

      {tipo === 'variable_venta' && (
        <div className="config-row">
          <label className="config-label">Modo</label>
          <div className="config-toggle-group">
            <button className={`config-toggle${form.modo_valor === 'monto' ? ' active' : ''}`} onClick={() => set('modo_valor', 'monto')}>$ por venta</button>
            <button className={`config-toggle${form.modo_valor === 'porcentaje' ? ' active' : ''}`} onClick={() => set('modo_valor', 'porcentaje')}>% de la venta</button>
          </div>
        </div>
      )}

      <div className="config-row">
        <label className="config-label">{tipo === 'fijo_mensual' ? 'Monto mensual' : form.modo_valor === 'porcentaje' ? 'Porcentaje' : 'Monto por venta'}</label>
        <div className="config-input-wrap">
          <input type="number" className="config-input" min={0}
            value={form.valor} onChange={e => set('valor', e.target.value)}
            placeholder={form.modo_valor === 'porcentaje' && tipo === 'variable_venta' ? 'Ej: 5' : 'Ej: 150000'} />
          <span className="config-input-suffix">{tipo === 'variable_venta' && form.modo_valor === 'porcentaje' ? '%' : 'ARS'}</span>
        </div>
      </div>

      <div className="config-row">
        <label className="config-label">Categoría</label>
        <div className="config-input-wrap" style={{ width: 200 }}>
          <input className="config-input" style={{ fontWeight: 400, fontSize: '.875rem' }}
            value={form.categoria} onChange={e => set('categoria', e.target.value)}
            placeholder="Opcional (ej: alquiler)" />
        </div>
      </div>

      {tipo === 'fijo_mensual' && (
        <div className="config-row">
          <label className="config-label">Vigencia</label>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <input type="date" className="config-input" style={{ fontWeight: 400, fontSize: '.8125rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface-2)' }}
              value={form.vigente_desde} onChange={e => set('vigente_desde', e.target.value)} />
            <span style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>hasta</span>
            <input type="date" className="config-input" style={{ fontWeight: 400, fontSize: '.8125rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface-2)' }}
              value={form.vigente_hasta} onChange={e => set('vigente_hasta', e.target.value)} placeholder="Sigue vigente" />
          </div>
        </div>
      )}

      <div className="config-actions">
        <button className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
        <button className="btn btn-primary" disabled={!puedeGuardar || saving} onClick={handleSave}>
          {saving ? 'Guardando...' : 'Guardar costo'}
        </button>
      </div>
    </div>
  )
}

interface UnicoFormState {
  nombre: string
  canal: CostoCanal
  monto: string
  categoria: string
  fecha: string
  notas: string
}

export function CostosTab() {
  const {
    costosConfig, costosUnicos, loading, error,
    addCostoConfig, toggleActivo, removeCostoConfig,
    addCostoUnico, removeCostoUnico,
  } = useCostos()

  const [formTipo, setFormTipo] = useState<CostoTipo | null>(null)
  const [mostrarFormUnico, setMostrarFormUnico] = useState(false)
  const [unico, setUnico] = useState<UnicoFormState>({ nombre: '', canal: 'ambos', monto: '', categoria: '', fecha: hoyStr(), notas: '' })
  const [savingUnico, setSavingUnico] = useState(false)

  const guardarConfig = async (tipo: CostoTipo, form: ConfigFormState) => {
    await addCostoConfig({
      nombre: form.nombre.trim(),
      tipo,
      canal: form.canal,
      modo_valor: tipo === 'fijo_mensual' ? 'monto' : form.modo_valor,
      valor: Number(form.valor) || 0,
      categoria: form.categoria.trim() || null,
      activo: true,
      vigente_desde: form.vigente_desde || hoyStr(),
      vigente_hasta: form.vigente_hasta || null,
      prorateo_web_pct: form.prorateo_web_pct ? Number(form.prorateo_web_pct) : null,
      notas: form.notas.trim() || null,
    })
    setFormTipo(null)
  }

  const guardarUnico = async () => {
    if (!unico.nombre.trim() || Number(unico.monto) <= 0) return
    setSavingUnico(true)
    try {
      await addCostoUnico({
        nombre: unico.nombre.trim(),
        canal: unico.canal,
        monto: Number(unico.monto) || 0,
        categoria: unico.categoria.trim() || null,
        fecha: unico.fecha || hoyStr(),
        notas: unico.notas.trim() || null,
      })
      setUnico({ nombre: '', canal: 'ambos', monto: '', categoria: '', fecha: hoyStr(), notas: '' })
      setMostrarFormUnico(false)
    } finally {
      setSavingUnico(false)
    }
  }

  if (loading) return <p style={{ color: 'var(--text-secondary)', fontSize: '.875rem' }}>Cargando costos...</p>
  if (error) return <p style={{ color: 'var(--danger)', fontSize: '.875rem' }}>⚠ {error}</p>

  return (
    <div className="config-tab-panel">
      {/* ── Costos fijos mensuales ── */}
      <section className="config-section">
        <div className="config-section-header">
          <Calendar size={16} />
          <h2 className="config-section-title">Costos fijos mensuales</h2>
        </div>
        <p className="config-section-desc">Alquiler, sueldos, servicios — se descuentan del mes completo (o proporcional a los días de vigencia).</p>

        <CostoConfigTable
          descripcion="No hay costos fijos cargados."
          tipo="fijo_mensual" items={costosConfig}
          onToggle={toggleActivo} onDelete={removeCostoConfig}
        />

        {formTipo === 'fijo_mensual' ? (
          <CostoConfigForm tipo="fijo_mensual" onCancel={() => setFormTipo(null)} onSave={f => guardarConfig('fijo_mensual', f)} />
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={() => setFormTipo('fijo_mensual')}>
            <Plus size={13} /> Nuevo costo fijo
          </button>
        )}
      </section>

      {/* ── Costos variables por venta ── */}
      <section className="config-section">
        <div className="config-section-header">
          <Repeat size={16} />
          <h2 className="config-section-title">Costos variables por venta</h2>
        </div>
        <p className="config-section-desc">Comisión de tarjeta/Mercado Pago, comisión de TiendaNube, envío — se aplican por cada venta del canal correspondiente.</p>

        <CostoConfigTable
          descripcion="No hay costos variables cargados."
          tipo="variable_venta" items={costosConfig}
          onToggle={toggleActivo} onDelete={removeCostoConfig}
        />

        {formTipo === 'variable_venta' ? (
          <CostoConfigForm tipo="variable_venta" onCancel={() => setFormTipo(null)} onSave={f => guardarConfig('variable_venta', f)} />
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={() => setFormTipo('variable_venta')}>
            <Plus size={13} /> Nuevo costo variable
          </button>
        )}
      </section>

      {/* ── Costos únicos / eventuales ── */}
      <section className="config-section">
        <div className="config-section-header">
          <Zap size={16} />
          <h2 className="config-section-title">Costos únicos / eventuales</h2>
        </div>
        <p className="config-section-desc">Gastos puntuales que no se repiten (reparaciones, compras puntuales) — se imputan al mes de la fecha cargada.</p>

        <div className="config-table-wrap">
          <table className="config-table">
            <thead>
              <tr><th>Fecha</th><th>Nombre</th><th>Canal</th><th>Monto</th><th></th></tr>
            </thead>
            <tbody>
              {costosUnicos.map(c => (
                <tr key={c.id}>
                  <td style={{ fontSize: '.75rem' }}>{new Date(c.fecha + 'T00:00:00').toLocaleDateString('es-AR')}</td>
                  <td>{c.nombre}{c.categoria ? <span style={{ color: 'var(--text-muted)', fontSize: '.7rem' }}> · {c.categoria}</span> : ''}</td>
                  <td><span className={`canal-badge ${c.canal}`}>{CANAL_LABEL[c.canal]}</span></td>
                  <td>{formatMonto(c.monto)}</td>
                  <td>
                    <button className="icon-btn danger" title="Eliminar" onClick={() => removeCostoUnico(c.id)}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
              {costosUnicos.length === 0 && (
                <tr><td colSpan={5} className="config-table-empty">No hay costos únicos cargados.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {mostrarFormUnico ? (
          <div className="config-card">
            <div className="config-row">
              <label className="config-label">Nombre</label>
              <div className="config-input-wrap" style={{ width: 260 }}>
                <input className="config-input" style={{ fontWeight: 400, fontSize: '.875rem' }}
                  value={unico.nombre} onChange={e => setUnico(u => ({ ...u, nombre: e.target.value }))}
                  placeholder="Ej: Arreglo vidriera" />
              </div>
            </div>
            <div className="config-row">
              <label className="config-label">Canal</label>
              <div className="config-toggle-group">
                {(['local', 'web', 'ambos'] as CostoCanal[]).map(c => (
                  <button key={c} className={`config-toggle${unico.canal === c ? ' active' : ''}`} onClick={() => setUnico(u => ({ ...u, canal: c }))}>
                    {CANAL_LABEL[c]}
                  </button>
                ))}
              </div>
            </div>
            <div className="config-row">
              <label className="config-label">Monto</label>
              <div className="config-input-wrap">
                <input type="number" className="config-input" min={0}
                  value={unico.monto} onChange={e => setUnico(u => ({ ...u, monto: e.target.value }))} placeholder="Ej: 25000" />
                <span className="config-input-suffix">ARS</span>
              </div>
            </div>
            <div className="config-row">
              <label className="config-label">Fecha</label>
              <input type="date" className="config-input" style={{ fontWeight: 400, fontSize: '.8125rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface-2)' }}
                value={unico.fecha} onChange={e => setUnico(u => ({ ...u, fecha: e.target.value }))} />
            </div>
            <div className="config-row">
              <label className="config-label">Categoría</label>
              <div className="config-input-wrap" style={{ width: 200 }}>
                <input className="config-input" style={{ fontWeight: 400, fontSize: '.875rem' }}
                  value={unico.categoria} onChange={e => setUnico(u => ({ ...u, categoria: e.target.value }))} placeholder="Opcional" />
              </div>
            </div>
            <div className="config-actions">
              <button className="btn btn-secondary" onClick={() => setMostrarFormUnico(false)}>Cancelar</button>
              <button className="btn btn-primary" disabled={!unico.nombre.trim() || Number(unico.monto) <= 0 || savingUnico} onClick={guardarUnico}>
                {savingUnico ? 'Guardando...' : 'Guardar gasto'}
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={() => setMostrarFormUnico(true)}>
            <Plus size={13} /> Registrar gasto puntual
          </button>
        )}
      </section>
    </div>
  )
}
