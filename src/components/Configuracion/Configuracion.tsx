import { useState, useMemo } from 'react'
import { Percent, DollarSign, CheckCircle, AlertTriangle, Palette, ShoppingBag, Key, Trash2, ShieldCheck, SlidersHorizontal, Wallet } from 'lucide-react'
import type { Modelo, AjustePrecioConfig, AjusteTipo, AjusteOperacion } from '../../types'
import { previewAjuste, aplicarAjuste } from '../../services/ajuste_precios'
import { getTNCredentials, saveTNCredentials, clearTNCredentials, listTNWebhooks, createTNWebhook } from '../../services/tiendanubeService'
import { setOwnerPin } from '../../services/auth'
import type { useConfigVentas } from '../../hooks/useConfigVentas'
import { CostosTab } from './CostosTab'
import './Configuracion.css'

type ConfigTab = 'general' | 'tiendanube' | 'seguridad' | 'costos'

const TABS: { key: ConfigTab; label: string; Icon: typeof SlidersHorizontal }[] = [
  { key: 'general', label: 'General', Icon: SlidersHorizontal },
  { key: 'tiendanube', label: 'TiendaNube', Icon: ShoppingBag },
  { key: 'seguridad', label: 'Seguridad', Icon: ShieldCheck },
  { key: 'costos', label: 'Costos', Icon: Wallet },
]

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
  tabInicial?: ConfigTab
  configVentas: ReturnType<typeof useConfigVentas>
}

const DEFAULT_CONFIG: AjustePrecioConfig = {
  tipo: 'porcentaje',
  operacion: 'descuento',
  valor: 0,
  filtros: { gama: '', marca: '', categoria: '' },
}

export function Configuracion({ modelos, onReload, tabInicial, configVentas }: ConfiguracionProps) {
  const [tab, setTab] = useState<ConfigTab>(tabInicial ?? 'general')
  const [config, setConfig] = useState<AjustePrecioConfig>(DEFAULT_CONFIG)
  const [mostrarPreview, setMostrarPreview] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string } | null>(null)
  const [accentColor, setAccentColor] = useState(getSavedAccent)

  // Descuento por transferencia (precio promocional en ventas del local)
  const [pctInput, setPctInput] = useState('')
  const [descuentoMsg, setDescuentoMsg] = useState('')
  const [detectando, setDetectando] = useState(false)
  const [guardandoPct, setGuardandoPct] = useState(false)

  const pctActual = configVentas.descuentoTransferenciaPct
  const pctMostrado = pctInput || (pctActual != null ? String(pctActual) : '')

  const handleDetectarPct = async () => {
    setDetectando(true)
    setDescuentoMsg('')
    try {
      const detectado = await configVentas.detectarAutomatico()
      if (detectado != null) {
        setPctInput(String(detectado))
        setDescuentoMsg(`✓ Detectado y guardado: ${detectado}%`)
      } else {
        setDescuentoMsg('No se encontraron órdenes de TiendaNube con descuento por transferencia todavía.')
      }
    } catch (e) {
      setDescuentoMsg((e as Error).message ?? 'Error al detectar el descuento.')
    } finally {
      setDetectando(false)
    }
  }

  const handleGuardarPct = async () => {
    const n = Number(pctInput)
    if (!pctInput || Number.isNaN(n) || n < 0 || n > 100) {
      setDescuentoMsg('Ingresá un porcentaje válido entre 0 y 100.')
      return
    }
    setGuardandoPct(true)
    setDescuentoMsg('')
    try {
      await configVentas.guardarPct(n)
      setDescuentoMsg('✓ Guardado')
    } catch (e) {
      setDescuentoMsg((e as Error).message ?? 'Error al guardar.')
    } finally {
      setGuardandoPct(false)
    }
  }

  // PIN de acceso dueño
  const [nuevoPin, setNuevoPin] = useState('')
  const [confirmarPin, setConfirmarPin] = useState('')
  const [pinMsg, setPinMsg] = useState<{ ok: boolean; msg: string } | null>(null)
  const [guardandoPin, setGuardandoPin] = useState(false)

  const handleGuardarPin = async () => {
    setPinMsg(null)
    if (!/^\d{4}$/.test(nuevoPin)) {
      setPinMsg({ ok: false, msg: 'El PIN debe tener 4 dígitos.' })
      return
    }
    if (nuevoPin !== confirmarPin) {
      setPinMsg({ ok: false, msg: 'Los PIN no coinciden.' })
      return
    }
    setGuardandoPin(true)
    try {
      await setOwnerPin(nuevoPin)
      setPinMsg({ ok: true, msg: '✓ PIN actualizado' })
      setNuevoPin('')
      setConfirmarPin('')
    } catch (e: any) {
      setPinMsg({ ok: false, msg: e.message ?? 'Error al actualizar el PIN.' })
    } finally {
      setGuardandoPin(false)
    }
  }

  // TiendaNube credentials
  const tnSaved = getTNCredentials()
  const [tnStoreId, setTnStoreId] = useState(tnSaved.storeId)
  const [tnToken, setTnToken]     = useState(tnSaved.token)
  const [tnMsg, setTnMsg]         = useState('')

  const handleSaveTN = () => {
    saveTNCredentials(tnStoreId.trim(), tnToken.trim())
    setTnMsg('✓ Credenciales guardadas')
    setTimeout(() => setTnMsg(''), 2500)
  }

  const handleClearTN = () => {
    clearTNCredentials()
    setTnStoreId('')
    setTnToken('')
    setTnMsg('Credenciales eliminadas')
    setTimeout(() => setTnMsg(''), 2500)
  }

  // Registro automático de webhooks (reemplaza la configuración manual en el panel de TN)
  const [registrandoWebhooks, setRegistrandoWebhooks] = useState(false)
  const [webhookMsg, setWebhookMsg] = useState<{ ok: boolean; msg: string } | null>(null)

  const REQUIRED_TN_EVENTS = [
    'order/created', 'order/updated', 'order/paid', 'order/cancelled',
    'product/created', 'product/updated', 'product/deleted',
    'customer/created', 'customer/updated', 'customer/deleted',
  ]

  const handleRegisterWebhooks = async () => {
    setRegistrandoWebhooks(true)
    setWebhookMsg(null)
    try {
      const { storeId, token } = getTNCredentials()
      const url = `${window.location.origin}/api/tn-webhook`
      const existing = await listTNWebhooks(storeId, token)
      const lineas: string[] = []
      for (const event of REQUIRED_TN_EVENTS) {
        const yaExiste = existing.some(w => w.event === event && w.url === url)
        if (yaExiste) { lineas.push(`${event}: ya estaba`); continue }
        await createTNWebhook(storeId, token, event, url)
        lineas.push(`${event}: registrado`)
      }
      setWebhookMsg({ ok: true, msg: lineas.join(' · ') })
    } catch (e) {
      setWebhookMsg({ ok: false, msg: (e as Error).message ?? 'No se pudieron registrar los webhooks.' })
    } finally {
      setRegistrandoWebhooks(false)
    }
  }

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

      <div className="config-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`config-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <t.Icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && <div className="config-tab-panel">

      {/* ── Descuento por transferencia ── */}
      <section className="config-section">
        <div className="config-section-header">
          <Percent size={16} />
          <h2 className="config-section-title">Descuento por transferencia</h2>
        </div>
        <p className="config-section-desc">
          El % que TiendaNube aplica en el checkout a pagos por transferencia. Se usa para calcular el "precio promocional"
          que puede elegir el vendedor al armar una venta en el local, para que la ganancia calculada sea real.
        </p>
        <div className="config-card">
          <div className="config-row">
            <label className="config-label">Porcentaje (%)</label>
            <div className="config-input-wrap">
              <input
                type="number"
                className="config-input"
                min={0}
                max={100}
                value={pctMostrado}
                onChange={e => setPctInput(e.target.value)}
                placeholder="Ej: 22"
              />
              <span className="config-input-suffix">%</span>
            </div>
          </div>
          {descuentoMsg && <p style={{ fontSize: '.8125rem', color: descuentoMsg.startsWith('✓') ? 'var(--accent)' : 'var(--text-secondary)' }}>{descuentoMsg}</p>}
          <div className="config-actions">
            <button className="btn btn-secondary" onClick={handleDetectarPct} disabled={detectando}>
              {detectando ? 'Detectando...' : 'Detectar desde TiendaNube'}
            </button>
            <button className="btn btn-primary" onClick={handleGuardarPct} disabled={guardandoPct}>
              <CheckCircle size={14} /> {guardandoPct ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </section>

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

      </div>}

      {tab === 'tiendanube' && <div className="config-tab-panel">

      {/* ── TiendaNube ── */}
      <section className="config-section">
        <div className="config-section-header">
          <ShoppingBag size={16} />
          <h2 className="config-section-title">TiendaNube — Credenciales de API</h2>
        </div>
        <p className="config-section-desc">
          Ingresá tu ID de tienda y token de acceso para conectar el dashboard con TiendaNube.
          Las credenciales se guardan solo en este dispositivo.
        </p>
        <div className="config-card">
          <div className="config-row">
            <label className="config-label"><Key size={11} /> ID de tienda</label>
            <div className="config-input-wrap" style={{ maxWidth: 220 }}>
              <input
                type="text"
                className="config-input"
                value={tnStoreId}
                onChange={e => setTnStoreId(e.target.value)}
                placeholder="Ej: 1234567"
              />
            </div>
          </div>
          <div className="config-row">
            <label className="config-label"><Key size={11} /> Token de acceso</label>
            <div className="config-input-wrap">
              <input
                type="password"
                className="config-input"
                value={tnToken}
                onChange={e => setTnToken(e.target.value)}
                placeholder="Token de la API de TiendaNube"
              />
            </div>
          </div>
          {tnMsg && <p style={{ fontSize: '.8125rem', color: tnMsg.startsWith('✓') ? 'var(--accent)' : 'var(--text-secondary)' }}>{tnMsg}</p>}
          <div className="config-actions">
            {tnStoreId && tnToken && (
              <button className="btn btn-danger btn-sm" onClick={handleClearTN}>
                <Trash2 size={13} /> Desconectar
              </button>
            )}
            <button
              className="btn btn-primary"
              onClick={handleSaveTN}
              disabled={!tnStoreId || !tnToken}
            >
              <CheckCircle size={14} /> Guardar credenciales
            </button>
          </div>
        </div>
      </section>

      {/* ── Webhook info ── */}
      <section className="config-section">
        <div className="config-section-header">
          <ShoppingBag size={16} />
          <h2 className="config-section-title">Sincronización de stock automática</h2>
        </div>
        <p className="config-section-desc">
          La app avisa a TiendaNube que le mande un aviso cada vez que se vende, crea, edita o borra un producto, para reflejarlo acá al toque (sin esperar la sync de respaldo cada 1h).
        </p>
        <div className="config-card">
          <div className="config-actions">
            <button
              className="btn btn-primary"
              onClick={handleRegisterWebhooks}
              disabled={registrandoWebhooks}
            >
              <CheckCircle size={14} /> {registrandoWebhooks ? 'Registrando...' : 'Registrar webhooks automáticamente'}
            </button>
          </div>
          {webhookMsg && (
            <p style={{ fontSize: '.8125rem', color: webhookMsg.ok ? 'var(--accent)' : 'var(--danger)' }}>
              {webhookMsg.msg}
            </p>
          )}
          <div className="config-row" style={{ marginTop: '.5rem' }}>
            <label className="config-label">URL del webhook (por si el registro automático falla)</label>
            <div className="config-input-wrap">
              <input
                type="text"
                className="config-input"
                value={`${window.location.origin}/api/tn-webhook`}
                readOnly
                style={{ cursor: 'pointer' }}
                onClick={e => { (e.target as HTMLInputElement).select(); navigator.clipboard.writeText(`${window.location.origin}/api/tn-webhook`) }}
                title="Clic para copiar"
              />
            </div>
          </div>
          <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: '.25rem' }}>
            Clic sobre la URL para copiarla y cargarla a mano en Configuración → Webhooks del panel de TiendaNube. También necesitás las variables de entorno <code style={{ fontFamily: 'monospace', background: 'var(--bg-surface-3)', padding: '1px 5px', borderRadius: '3px' }}>SUPABASE_URL</code> y <code style={{ fontFamily: 'monospace', background: 'var(--bg-surface-3)', padding: '1px 5px', borderRadius: '3px' }}>SUPABASE_ANON_KEY</code> en Vercel.
          </p>
        </div>
      </section>

      </div>}

      {tab === 'seguridad' && <div className="config-tab-panel">

      {/* ── Seguridad ── */}
      <section className="config-section">
        <div className="config-section-header">
          <ShieldCheck size={16} />
          <h2 className="config-section-title">Seguridad — PIN de acceso dueño</h2>
        </div>
        <p className="config-section-desc">
          Cambiá el PIN de 4 dígitos que se pide para entrar como dueño. Los intentos fallidos quedan registrados y avisan en la campanita del menú.
        </p>
        <div className="config-card">
          <div className="config-row">
            <label className="config-label"><Key size={11} /> Nuevo PIN</label>
            <div className="config-input-wrap" style={{ maxWidth: 140 }}>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                className="config-input"
                value={nuevoPin}
                onChange={e => setNuevoPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
              />
            </div>
          </div>
          <div className="config-row">
            <label className="config-label"><Key size={11} /> Confirmar PIN</label>
            <div className="config-input-wrap" style={{ maxWidth: 140 }}>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                className="config-input"
                value={confirmarPin}
                onChange={e => setConfirmarPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
              />
            </div>
          </div>
          {pinMsg && (
            <p style={{ fontSize: '.8125rem', color: pinMsg.ok ? 'var(--accent)' : 'var(--danger)' }}>{pinMsg.msg}</p>
          )}
          <div className="config-actions">
            <button
              className="btn btn-primary"
              disabled={guardandoPin || nuevoPin.length !== 4 || confirmarPin.length !== 4}
              onClick={handleGuardarPin}
            >
              {guardandoPin ? 'Guardando...' : 'Actualizar PIN'}
            </button>
          </div>
        </div>
      </section>

      </div>}

      {tab === 'general' && <div className="config-tab-panel">

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

      </div>}

      {tab === 'costos' && <CostosTab />}
    </div>
  )
}
