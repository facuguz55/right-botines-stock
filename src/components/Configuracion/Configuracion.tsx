import { useState, useMemo } from 'react'
import { Percent, DollarSign, CheckCircle, AlertTriangle, Palette, List } from 'lucide-react'
import type { Modelo, AjustePrecioConfig, AjusteTipo, AjusteOperacion } from '../../types'
import { previewAjuste, aplicarAjuste } from '../../services/ajuste_precios'
import { StockAvanzado } from '../StockAvanzado/StockAvanzado'
import './Configuracion.css'

const MARCAS = ['Nike', 'Adidas', 'Puma', 'New Balance', 'Mizuno', 'Umbro', 'Under Armour', 'Joma', 'Otra']
const CATEGORIAS = ['F5', 'F11', 'Futsal', 'Hockey']
const GAMAS = ['Económica', 'Media', 'Alta']

const ACCENTS = [
  { label: 'Verde', value: '#00d46a', hover: '#00b559', dim: 'rgba(0,212,106,0.12)' },
  { label: 'Naranja', value: '#ff6b00', hover: '#e05f00', dim: 'rgba(255,107,0,0.12)' },
  { label: 'Azul', value: '#3b82f6', hover: '#2563eb', dim: 'rgba(59,130,246,0.12)' },
  { label: 'Violeta', value: '#8b5cf6', hover: '#7c3aed', dim: 'rgba(139,92,246,0.12)' },
  { label: 'Rojo', value: '#ef4444', hover: '#dc2626', dim: 'rgba(239,68,68,0.12)' },
]

const ACCENT_KEY = 'rb_accent'

function getSavedAccent() {
  try { return localStorage.getItem(ACCENT_KEY) || ACCENTS[0].value } catch { return ACCENTS[0].value }
}

function applyAccent(value: string) {
  const found = ACCENTS.find(a => a.value === value) ?? ACCENTS[0]
  const root = document.documentElement
  root.style.setProperty('--accent', found.value)
  root.style.setProperty('--accent-hover', found.hover)
  root.style.setProperty('--accent-dim', found.dim)
  try { localStorage.setItem(ACCENT_KEY, found.value) } catch { /* noop */ }
}

interface ConfiguracionProps {
  modelos: Modelo[]
  onReload: () => void
}

const DEFAULT_CONFIG: AjustePrecioConfig = {
  tipo: 'porcentaje',
  operacion: 'descuento',
  valor: 0,
  filtros: { gama: '', marca: '', categoria: '' },
}

export function Configuracion({ modelos, onReload }: ConfiguracionProps) {
  const [config, setConfig] = useState<AjustePrecioConfig>(DEFAULT_CONFIG)
  const [mostrarPreview, setMostrarPreview] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string } | null>(null)
  const [accentColor, setAccentColor] = useState(getSavedAccent)

  const preview = useMemo(() => {
    if (config.valor <= 0) return []
    return previewAjuste(modelos, config)
  }, [modelos, config])

  const handleAplicar = async () => {
    setAplicando(true)
    setResultado(null)
    try {
      await aplicarAjuste(modelos, config)
      setResultado({ ok: true, msg: `Precio actualizado en ${preview.length} modelo${preview.length !== 1 ? 's' : ''}.` })
      setMostrarPreview(false)
      setConfig(DEFAULT_CONFIG)
      onReload()
    } catch (e: any) {
      setResultado({ ok: false, msg: e.message ?? 'Error al aplicar el ajuste.' })
    } finally {
      setAplicando(false)
    }
  }

  const handleAccent = (value: string) => {
    setAccentColor(value)
    applyAccent(value)
  }

  const setField = <K extends keyof AjustePrecioConfig>(k: K, v: AjustePrecioConfig[K]) =>
    setConfig(c => ({ ...c, [k]: v }))

  const setFiltro = (k: keyof AjustePrecioConfig['filtros'], v: string) =>
    setConfig(c => ({ ...c, filtros: { ...c.filtros, [k]: v } }))

  const filtroActivo = config.filtros.gama || config.filtros.marca || config.filtros.categoria
  const labelFiltro = filtroActivo
    ? [config.filtros.gama, config.filtros.marca, config.filtros.categoria].filter(Boolean).join(', ')
    : 'todos los modelos'

  return (
    <div className="config-page">
      <div className="page-header">
        <h1 className="page-title">Configuración</h1>
      </div>

      {/* ── Ajuste de precios ── */}
      <section className="config-section">
        <div className="config-section-header">
          <DollarSign size={16} />
          <h2 className="config-section-title">Ajuste de precios masivo</h2>
        </div>
        <p className="config-section-desc">
          Aplicá un descuento o aumento a todos los modelos o solo a un subgrupo. El cambio se registra en el historial de precios.
        </p>

        <div className="config-card">
          {/* Operación */}
          <div className="config-row">
            <label className="config-label">Operación</label>
            <div className="config-toggle-group">
              {(['descuento', 'aumento'] as AjusteOperacion[]).map(op => (
                <button
                  key={op}
                  className={`config-toggle${config.operacion === op ? ' active' : ''}`}
                  onClick={() => setField('operacion', op)}
                >
                  {op === 'descuento' ? '▼ Descuento' : '▲ Aumento'}
                </button>
              ))}
            </div>
          </div>

          {/* Tipo */}
          <div className="config-row">
            <label className="config-label">Tipo de ajuste</label>
            <div className="config-toggle-group">
              {([['porcentaje', <Percent size={13} />, '%'], ['fijo', <DollarSign size={13} />, 'Monto fijo']] as [AjusteTipo, React.ReactNode, string][]).map(([t, Icon, lbl]) => (
                <button
                  key={t}
                  className={`config-toggle${config.tipo === t ? ' active' : ''}`}
                  onClick={() => setField('tipo', t)}
                >
                  {Icon} {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Valor */}
          <div className="config-row">
            <label className="config-label">
              {config.tipo === 'porcentaje' ? 'Porcentaje (%)' : 'Monto fijo (ARS)'}
            </label>
            <div className="config-input-wrap">
              <input
                type="number"
                className="config-input"
                min={0}
                max={config.tipo === 'porcentaje' ? 100 : undefined}
                value={config.valor || ''}
                placeholder={config.tipo === 'porcentaje' ? 'Ej: 15' : 'Ej: 5000'}
                onChange={e => setField('valor', Math.max(0, Number(e.target.value)))}
              />
              <span className="config-input-suffix">{config.tipo === 'porcentaje' ? '%' : 'ARS'}</span>
            </div>
          </div>

          {/* Filtros */}
          <div className="config-row config-row-col">
            <label className="config-label">Aplicar a</label>
            <div className="config-filtros">
              <div className="config-filtro-group">
                <span className="config-filtro-label">Gama</span>
                <div className="config-chips">
                  <button
                    className={`chip${!config.filtros.gama ? ' active' : ''}`}
                    onClick={() => setFiltro('gama', '')}
                  >Todas</button>
                  {GAMAS.map(g => (
                    <button
                      key={g}
                      className={`chip${config.filtros.gama === g ? ' active' : ''}`}
                      onClick={() => setFiltro('gama', config.filtros.gama === g ? '' : g)}
                    >{g}</button>
                  ))}
                </div>
              </div>
              <div className="config-filtro-group">
                <span className="config-filtro-label">Categoría</span>
                <div className="config-chips">
                  <button
                    className={`chip${!config.filtros.categoria ? ' active' : ''}`}
                    onClick={() => setFiltro('categoria', '')}
                  >Todas</button>
                  {CATEGORIAS.map(c => (
                    <button
                      key={c}
                      className={`chip${config.filtros.categoria === c ? ' active' : ''}`}
                      onClick={() => setFiltro('categoria', config.filtros.categoria === c ? '' : c)}
                    >{c}</button>
                  ))}
                </div>
              </div>
              <div className="config-filtro-group">
                <span className="config-filtro-label">Marca</span>
                <div className="config-chips">
                  <button
                    className={`chip${!config.filtros.marca ? ' active' : ''}`}
                    onClick={() => setFiltro('marca', '')}
                  >Todas</button>
                  {MARCAS.map(m => (
                    <button
                      key={m}
                      className={`chip${config.filtros.marca === m ? ' active' : ''}`}
                      onClick={() => setFiltro('marca', config.filtros.marca === m ? '' : m)}
                    >{m}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Resumen */}
          {config.valor > 0 && (
            <div className="config-resumen">
              <span className="config-resumen-ico">{config.operacion === 'descuento' ? '▼' : '▲'}</span>
              <span>
                {config.tipo === 'porcentaje'
                  ? <>{config.operacion === 'descuento' ? 'Bajás' : 'Subís'} el precio un <strong>{config.valor}%</strong></>
                  : <>{config.operacion === 'descuento' ? 'Restás' : 'Sumás'} <strong>${config.valor.toLocaleString('es-AR')}</strong></>
                }{' '}a <strong>{labelFiltro}</strong> — afecta <strong>{preview.length}</strong> modelo{preview.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          <div className="config-actions">
            <button
              className="btn btn-secondary"
              disabled={config.valor <= 0 || preview.length === 0}
              onClick={() => setMostrarPreview(v => !v)}
            >
              {mostrarPreview ? 'Ocultar previsualización' : 'Ver previsualización'}
            </button>
            <button
              className="btn btn-primary"
              disabled={config.valor <= 0 || preview.length === 0 || aplicando}
              onClick={handleAplicar}
            >
              {aplicando ? 'Aplicando...' : `Aplicar a ${preview.length} modelo${preview.length !== 1 ? 's' : ''}`}
            </button>
          </div>

          {resultado && (
            <div className={`config-resultado ${resultado.ok ? 'ok' : 'error'}`}>
              {resultado.ok ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
              {resultado.msg}
            </div>
          )}
        </div>

        {/* Preview tabla */}
        {mostrarPreview && preview.length > 0 && (
          <div className="config-preview">
            <p className="config-preview-title">Previsualización — {preview.length} modelo{preview.length !== 1 ? 's' : ''}</p>
            <div className="config-preview-table-wrap">
              <table className="config-preview-table">
                <thead>
                  <tr>
                    <th>Marca</th>
                    <th>Modelo</th>
                    <th>Precio actual</th>
                    <th>Precio nuevo</th>
                    <th>Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map(p => {
                    const diff = p.precioNuevo - p.precioActual
                    return (
                      <tr key={p.id}>
                        <td>{p.marca}</td>
                        <td>{p.modelo}</td>
                        <td>${p.precioActual.toLocaleString('es-AR')}</td>
                        <td className="precio-nuevo">${p.precioNuevo.toLocaleString('es-AR')}</td>
                        <td className={diff < 0 ? 'diff-neg' : 'diff-pos'}>
                          {diff > 0 ? '+' : ''}{diff.toLocaleString('es-AR')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Stock Avanzado ── */}
      <section className="config-section">
        <div className="config-section-header">
          <List size={16} />
          <h2 className="config-section-title">Stock avanzado</h2>
        </div>
        <p className="config-section-desc">
          Lista completa del stock. Hacé clic en cualquier precio o cantidad para editarlo directamente, o seleccioná varios modelos para editarlos o eliminarlos juntos.
        </p>
        <StockAvanzado modelos={modelos} onReload={onReload} />
      </section>

      {/* ── Personalización ── */}
      <section className="config-section">
        <div className="config-section-header">
          <Palette size={16} />
          <h2 className="config-section-title">Personalización</h2>
        </div>
        <p className="config-section-desc">Cambiá el color de acento de la app. Se guarda en este dispositivo.</p>

        <div className="config-card">
          <div className="config-row">
            <label className="config-label">Color de acento</label>
            <div className="accent-options">
              {ACCENTS.map(a => (
                <button
                  key={a.value}
                  className={`accent-btn${accentColor === a.value ? ' active' : ''}`}
                  style={{ '--ac': a.value } as React.CSSProperties}
                  onClick={() => handleAccent(a.value)}
                  title={a.label}
                >
                  <span className="accent-dot" />
                  <span className="accent-label">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
