import { useState, useEffect, useCallback, useMemo } from 'react'
import { RefreshCw, Smartphone, Monitor, Tablet } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { Modelo } from '../../types'
import {
  fetchTraficoResumen, fetchAnalisisProductos, fetchTraficoCanales,
  type TraficoResumen, type AnalisisProductos, type TraficoCanales as DatosCanales,
} from '../../services/trafico'
import { TraficoProductos } from './TraficoProductos'
import { TraficoCanales } from './TraficoCanales'
import './TNTrafico.css'

// Fecha local (Argentina) en YYYY-MM-DD — toISOString() usaría UTC y de
// noche correría el "hoy" al día siguiente.
function fechaLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function rango(preset: string): { desde: string; hasta: string } {
  const hoy = new Date()
  const hasta = fechaLocal(hoy)
  const d = new Date(hoy)
  switch (preset) {
    case 'hoy': return { desde: hasta, hasta }
    case '7d': d.setDate(d.getDate() - 6); return { desde: fechaLocal(d), hasta }
    case 'mes': return { desde: fechaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta }
    default: d.setDate(d.getDate() - 29); return { desde: fechaLocal(d), hasta }
  }
}

const PRESETS = [
  { key: 'hoy', label: 'Hoy' },
  { key: '7d', label: 'Últimos 7 días' },
  { key: '30d', label: 'Últimos 30 días' },
  { key: 'mes', label: 'Este mes' },
]

const ICONO_DISPOSITIVO = { mobile: Smartphone, tablet: Tablet, desktop: Monitor }
const NOMBRE_DISPOSITIVO = { mobile: 'Celular', tablet: 'Tablet', desktop: 'Computadora' }

function pct(n: number, total: number): string {
  if (!total) return '0%'
  const v = (n / total) * 100
  return `${v < 10 ? v.toFixed(1) : Math.round(v)}%`
}

function nombrePagina(path: string): string {
  if (path === '/' || path === '') return 'Inicio'
  if (path.startsWith('/comprar')) return 'Carrito'
  if (path.startsWith('/search')) return 'Búsqueda'
  return decodeURIComponent(path).replace(/^\/|\/$/g, '').replace(/-/g, ' ')
}

interface TNTraficoProps {
  modelos: Modelo[]
}

export function TNTrafico({ modelos }: TNTraficoProps) {
  const [preset, setPreset] = useState('30d')
  const [data, setData] = useState<TraficoResumen | null>(null)
  const [analisis, setAnalisis] = useState<AnalisisProductos | null>(null)
  const [canales, setCanales] = useState<DatosCanales | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { desde, hasta } = rango(preset)
      const [resumen, porProducto, porCanal] = await Promise.all([
        fetchTraficoResumen(desde, hasta),
        fetchAnalisisProductos(desde, hasta),
        fetchTraficoCanales(desde, hasta),
      ])
      setData(resumen)
      setAnalisis(porProducto)
      setCanales(porCanal)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [preset])

  useEffect(() => { cargar() }, [cargar])

  const modeloPorTnId = useMemo(() => {
    const m = new Map<number, Modelo>()
    for (const mo of modelos) if (mo.tn_product_id) m.set(Number(mo.tn_product_id), mo)
    return m
  }, [modelos])

  const header = (
    <div className="page-header">
      <div>
        <h1 className="page-title">Tráfico</h1>
        <p className="page-subtitle">Visitas a right.com.ar y cómo avanzan hacia la compra</p>
      </div>
      <button className="btn btn-secondary btn-sm" onClick={cargar} disabled={loading}>
        <RefreshCw size={13} /> Actualizar
      </button>
    </div>
  )

  if (error) {
    return (
      <div className="trafico">
        {header}
        <div className="tn-error"><p>⚠ {error}</p></div>
      </div>
    )
  }

  if (!data && loading) {
    return (
      <div className="trafico">
        {header}
        <div className="tn-loading"><div className="spinner" /><p>Cargando tráfico...</p></div>
      </div>
    )
  }

  if (!data) return null

  if (!data.primer_evento) {
    return (
      <div className="trafico">
        {header}
        <div className="tn-card trafico-vacio">
          <h3 className="tn-card-title">Todavía no hay visitas registradas</h3>
          <p>
            El tracking empieza a contar desde que se instala el script en la tienda. Una vez cargado en
            Google Tag Manager, las visitas aparecen acá en unos segundos.
          </p>
        </div>
      </div>
    )
  }

  const e = data.embudo
  const conversion = e.sesiones ? (e.compraron / e.sesiones) * 100 : 0
  const pasos = [
    { label: 'Visitas (sesiones)', valor: e.sesiones },
    { label: 'Vieron un producto', valor: e.vieron_producto },
    { label: 'Agregaron al carrito', valor: e.agregaron_carrito },
    { label: 'Iniciaron la compra', valor: e.iniciaron_checkout },
    { label: 'Compraron', valor: e.compraron, nota: 'órdenes web' },
  ]
  const totalDispositivos = data.dispositivos.reduce((s, d) => s + d.sesiones, 0)
  const desdeTracking = new Date(data.primer_evento).toLocaleDateString('es-AR')

  return (
    <div className="trafico">
      {header}

      <div className="ventas-presets">
        {PRESETS.map(p => (
          <button key={p.key} className={`preset-btn${preset === p.key ? ' active' : ''}`} onClick={() => setPreset(p.key)}>
            {p.label}
          </button>
        ))}
      </div>
      <p className="trafico-nota">Midiendo desde el {desdeTracking}. Los días anteriores no tienen datos.</p>

      <div className="analytics-kpis">
        <div className="analytics-kpi">
          <p className="analytics-kpi-label">Visitantes únicos</p>
          <p className="analytics-kpi-value">{data.visitantes.toLocaleString('es-AR')}</p>
        </div>
        <div className="analytics-kpi">
          <p className="analytics-kpi-label">Visitas (sesiones)</p>
          <p className="analytics-kpi-value">{data.sesiones.toLocaleString('es-AR')}</p>
        </div>
        <div className="analytics-kpi">
          <p className="analytics-kpi-label">Páginas vistas</p>
          <p className="analytics-kpi-value">{data.paginas_vistas.toLocaleString('es-AR')}</p>
          <p className="analytics-kpi-sub">
            {data.sesiones ? (data.paginas_vistas / data.sesiones).toFixed(1) : '0'} por visita
          </p>
        </div>
        <div className="analytics-kpi">
          <p className="analytics-kpi-label">Conversión</p>
          <p className="analytics-kpi-value accent">{conversion < 10 ? conversion.toFixed(2) : conversion.toFixed(1)}%</p>
          <p className="analytics-kpi-sub">{e.compraron} compras / {e.sesiones} visitas</p>
        </div>
      </div>

      <div className="tn-card">
        <h3 className="tn-card-title">Visitas por día</h3>
        {data.por_dia.length === 0 ? (
          <p className="tn-no-data">Sin visitas en este rango.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={data.por_dia.map(d => ({ ...d, name: new Date(d.dia + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) }))}
              margin={{ top: 4, right: 12, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-surface-3)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '12px' }}
                formatter={(v: number, name: string) => [v, name === 'sesiones' ? 'Visitas' : 'Visitantes']}
              />
              <Line type="monotone" dataKey="sesiones" stroke="var(--accent)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="visitantes" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {canales && <TraficoCanales datos={canales} />}

      <div className="analytics-row">
        <div className="tn-card">
          <h3 className="tn-card-title">Embudo de compra</h3>
          <div className="trafico-embudo">
            {pasos.map((p, i) => (
              <div key={p.label} className="trafico-paso">
                <div className="trafico-paso-top">
                  <span>{p.label}{p.nota && <small> · {p.nota}</small>}</span>
                  <strong>{p.valor.toLocaleString('es-AR')}</strong>
                </div>
                <div className="trafico-barra">
                  <div className="trafico-barra-fill" style={{ width: e.sesiones ? `${Math.min(100, (p.valor / e.sesiones) * 100)}%` : '0%' }} />
                </div>
                {i > 0 && (
                  <span className="trafico-paso-pct">{pct(p.valor, pasos[i - 1].valor)} del paso anterior</span>
                )}
              </div>
            ))}
          </div>
          <p className="trafico-nota">
            Las compras salen de las órdenes web (TiendaNube no deja medir dentro del checkout), así que es la
            conversión total del período, no por visita exacta.
          </p>
        </div>

        <div className="tn-card">
          <h3 className="tn-card-title">Dispositivos</h3>
          <div className="trafico-lista">
            {data.dispositivos.map(d => {
              const Icono = ICONO_DISPOSITIVO[d.dispositivo] ?? Monitor
              return (
                <div key={d.dispositivo} className="trafico-fila">
                  <span className="trafico-fila-label"><Icono size={14} /> {NOMBRE_DISPOSITIVO[d.dispositivo] ?? d.dispositivo}</span>
                  <span className="trafico-fila-valor">{pct(d.sesiones, totalDispositivos)}</span>
                </div>
              )
            })}
          </div>

          <h3 className="tn-card-title trafico-subtitulo">Ciudades</h3>
          {data.ciudades.length === 0 ? (
            <p className="tn-no-data">Sin datos de ubicación todavía.</p>
          ) : (
            <div className="trafico-lista">
              {data.ciudades.map(c => (
                <div key={c.ciudad} className="trafico-fila">
                  <span className="trafico-fila-label">{c.ciudad}</span>
                  <span className="trafico-fila-valor">{c.sesiones}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="analytics-row">
        <div className="tn-card">
          <h3 className="tn-card-title">Productos más vistos</h3>
          {data.productos.length === 0 ? (
            <p className="tn-no-data">Sin vistas de productos en este rango.</p>
          ) : (
            <div className="trafico-lista">
              {data.productos.map(p => {
                const m = modeloPorTnId.get(Number(p.tn_product_id))
                const foto = m?.modelo_fotos[0]?.foto_url
                return (
                  <div key={p.tn_product_id} className="trafico-producto">
                    {foto ? <img src={foto} alt="" className="trafico-producto-foto" /> : <div className="trafico-producto-foto ph">⚽</div>}
                    <div className="trafico-producto-info">
                      <span className="trafico-producto-nombre">{m ? `${m.marca} ${m.modelo}` : `Producto #${p.tn_product_id}`}</span>
                      <span className="trafico-producto-meta">
                        {p.carritos} al carrito · {pct(p.carritos, p.vistas)} de las vistas
                      </span>
                    </div>
                    <span className="trafico-fila-valor">{p.vistas}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="tn-card">
          <h3 className="tn-card-title">Páginas más visitadas</h3>
          {data.paginas.length === 0 ? (
            <p className="tn-no-data">Sin datos.</p>
          ) : (
            <div className="trafico-lista">
              {data.paginas.map(p => (
                <div key={p.path} className="trafico-fila">
                  <span className="trafico-fila-label trafico-path" title={p.path}>{nombrePagina(p.path)}</span>
                  <span className="trafico-fila-valor">{p.vistas}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {analisis && <TraficoProductos analisis={analisis} modelos={modelos} />}
    </div>
  )
}
