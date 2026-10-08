import { useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  ComposedChart, LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { useTiendaNube } from '../../hooks/useTiendaNube'
import { formatARS, type TNOrder } from '../../services/tiendanubeService'
import { fechaAR, sumarDias, cantidadDias } from '../../lib/tnRango'
import './TNAnalytics.css'

// ── Fechas en hora Argentina, como texto YYYY-MM-DD ──────────────────────────
// Se trabaja con texto (no Date) para que el corte de cada día sea el de
// Argentina sin importar la zona horaria del dispositivo. fechaAR/sumarDias/
// cantidadDias vienen de lib/tnRango (probadas en tnRango.test.ts).

const TZ = 'America/Argentina/Buenos_Aires'

function horaAR(d: Date): number {
  return Number(d.toLocaleString('en-US', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }))
}

function diasEntre(desde: string, hasta: string): number {
  return cantidadDias({ desde, hasta }) - 1
}

function ultimoDiaDelMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return `${mes}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
}

function mesAnterior(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

function nombreMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  const txt = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return (txt.charAt(0).toUpperCase() + txt.slice(1)).replace(' de ', ' ') // "Octubre 2026"
}

function nombreMesCorto(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('es-AR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

function ddmm(fecha: string): string {
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`
}

// ── Períodos ─────────────────────────────────────────────────────────────────

type Preset = 'hoy' | 'ayer' | '7d' | '30d' | '60d' | '90d' | 'mes' | 'mes_ant' | 'anio' | 'custom'

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'ayer', label: 'Ayer' },
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: '60d', label: '60 días' },
  { key: '90d', label: '90 días' },
  { key: 'mes', label: 'Este mes' },
  { key: 'mes_ant', label: 'Mes pasado' },
  { key: 'anio', label: 'Este año' },
]

function rangoDePreset(p: Preset, hoy: string): { desde: string; hasta: string } {
  switch (p) {
    case 'hoy': return { desde: hoy, hasta: hoy }
    case 'ayer': { const a = sumarDias(hoy, -1); return { desde: a, hasta: a } }
    case '7d': return { desde: sumarDias(hoy, -6), hasta: hoy }
    case '30d': return { desde: sumarDias(hoy, -29), hasta: hoy }
    case '90d': return { desde: sumarDias(hoy, -89), hasta: hoy }
    case 'mes': return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy }
    case 'mes_ant': {
      const m = mesAnterior(hoy.slice(0, 7))
      return { desde: `${m}-01`, hasta: ultimoDiaDelMes(m) }
    }
    case 'anio': return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy }
    default: return { desde: sumarDias(hoy, -59), hasta: hoy }
  }
}

// Período contra el que se compara. Si el período está dentro de un mes y
// arranca el día 1 ("Este mes", "Mes pasado"), se compara contra los mismos
// días del mes anterior (1 al 8 de octubre vs 1 al 8 de septiembre). Si no,
// contra la misma cantidad de días justo antes.
function rangoComparacion(desde: string, hasta: string): { desde: string; hasta: string } {
  const largo = diasEntre(desde, hasta) + 1
  if (desde.endsWith('-01') && desde.slice(0, 7) === hasta.slice(0, 7)) {
    const m = mesAnterior(desde.slice(0, 7))
    const ultimo = ultimoDiaDelMes(m)
    // Mes completo (septiembre) → el mes anterior completo (agosto, con su 31).
    if (hasta === ultimoDiaDelMes(desde.slice(0, 7))) return { desde: `${m}-01`, hasta: ultimo }
    const fin = sumarDias(`${m}-01`, largo - 1)
    return { desde: `${m}-01`, hasta: fin > ultimo ? ultimo : fin }
  }
  return { desde: sumarDias(desde, -largo), hasta: sumarDias(desde, -1) }
}

// ── Agregados ────────────────────────────────────────────────────────────────

// Mismo criterio que el resto de TiendaNube (buildTNMetrics): cuenta como
// venta la orden pagada o autorizada y no cancelada.
interface OrdenAR {
  fecha: string
  hora: number
  total: number
  venta: boolean
  cancelada: boolean
}

function prepararOrdenes(orders: TNOrder[]): OrdenAR[] {
  return orders.map(o => {
    const d = new Date(o.created_at)
    const cancelada = o.status === 'cancelled'
    return {
      fecha: fechaAR(d),
      hora: horaAR(d),
      total: parseFloat(o.total ?? '0') || 0,
      venta: !cancelada && (o.payment_status === 'paid' || o.payment_status === 'authorized'),
      cancelada,
    }
  })
}

interface Resumen {
  ordenes: number
  facturado: number
  ticket: number
  canceladas: number
  porDia: Map<string, { ordenes: number; facturado: number }>
  porHora: number[]
}

function resumir(ordenes: OrdenAR[], desde: string, hasta: string): Resumen {
  const r: Resumen = { ordenes: 0, facturado: 0, ticket: 0, canceladas: 0, porDia: new Map(), porHora: Array(24).fill(0) }
  for (const o of ordenes) {
    if (o.fecha < desde || o.fecha > hasta) continue
    if (o.cancelada) { r.canceladas++; continue }
    if (!o.venta) continue
    r.ordenes++
    r.facturado += o.total
    r.porHora[o.hora]++
    const dia = r.porDia.get(o.fecha) ?? { ordenes: 0, facturado: 0 }
    dia.ordenes++
    dia.facturado += o.total
    r.porDia.set(o.fecha, dia)
  }
  r.ticket = r.ordenes ? r.facturado / r.ordenes : 0
  return r
}

// ── Piezas visuales ──────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  background: 'var(--bg-surface-3)', border: '1px solid var(--border)',
  borderRadius: '8px', color: 'var(--text-primary)', fontSize: '12px',
}
const COLOR_COMPARACION = '#9ca3af'
const TICK = { fill: 'var(--text-secondary)', fontSize: 10 }

function pesosCorto(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1).replace('.0', '')}M`
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}k`
  return `$${v}`
}

// Variación contra el período anterior. `menosEsMejor` para cancelaciones.
function Variacion({ actual, previo, menosEsMejor = false }: { actual: number; previo: number; menosEsMejor?: boolean }) {
  if (previo === 0) {
    return <span className="analytics-delta neutral">{actual > 0 ? 'sin datos antes' : '—'}</span>
  }
  const pct = ((actual - previo) / previo) * 100
  const redondeado = Math.abs(pct) < 10 ? pct.toFixed(1) : Math.round(pct).toString()
  if (Math.abs(pct) < 0.05) return <span className="analytics-delta neutral">= igual</span>
  const sube = pct > 0
  const bueno = menosEsMejor ? !sube : sube
  return (
    <span className={`analytics-delta ${bueno ? 'up' : 'down'}`}>
      {sube ? '▲' : '▼'} {redondeado.replace('-', '')}%
    </span>
  )
}

function Kpi({ label, valor, actual, previo, comparar, menosEsMejor, accent }: {
  label: string; valor: string; actual: number; previo: number; comparar: boolean; menosEsMejor?: boolean; accent?: boolean
}) {
  return (
    <div className="analytics-kpi">
      <p className="analytics-kpi-label">{label}</p>
      <p className={`analytics-kpi-value${accent ? ' accent' : ''}`}>{valor}</p>
      {comparar && (
        <p className="analytics-kpi-sub">
          <Variacion actual={actual} previo={previo} menosEsMejor={menosEsMejor} />
        </p>
      )}
    </div>
  )
}

// ── Página ───────────────────────────────────────────────────────────────────

export function TNAnalytics() {
  const { metrics, loading, error, progress, reload } = useTiendaNube()

  const hoy = fechaAR(new Date())
  const [preset, setPreset] = useState<Preset>('mes')
  const [rango, setRango] = useState(() => rangoDePreset('mes', hoy))
  const [comparar, setComparar] = useState(true)

  const mesActual = hoy.slice(0, 7)
  const [mesA, setMesA] = useState(mesActual)
  const [mesB, setMesB] = useState(mesAnterior(mesActual))

  const ordenes = useMemo(() => prepararOrdenes(metrics?.orders ?? []), [metrics])

  // Meses con datos, del primero al actual (para los selectores y el gráfico mensual).
  const meses = useMemo(() => {
    const primero = ordenes.reduce((min, o) => (o.fecha < min ? o.fecha : min), hoy).slice(0, 7)
    const lista: string[] = []
    for (let m = mesActual; m >= primero; m = mesAnterior(m)) lista.push(m)
    return lista // más reciente primero
  }, [ordenes, hoy, mesActual])

  const desde = rango.desde <= rango.hasta ? rango.desde : rango.hasta
  const hasta = rango.desde <= rango.hasta ? rango.hasta : rango.desde
  const comp = rangoComparacion(desde, hasta)

  const actual = useMemo(() => resumir(ordenes, desde, hasta), [ordenes, desde, hasta])
  const previo = useMemo(() => resumir(ordenes, comp.desde, comp.hasta), [ordenes, comp.desde, comp.hasta])

  // Un punto por día del período (también los días sin ventas, en 0), con el
  // día equivalente del período de comparación al lado.
  const serieDiaria = useMemo(() => {
    const largo = diasEntre(desde, hasta) + 1
    const largoComp = diasEntre(comp.desde, comp.hasta) + 1
    return Array.from({ length: largo }, (_, i) => {
      const fecha = sumarDias(desde, i)
      const fechaComp = i < largoComp ? sumarDias(comp.desde, i) : null
      const d = actual.porDia.get(fecha)
      const dc = fechaComp ? previo.porDia.get(fechaComp) : undefined
      return {
        name: ddmm(fecha),
        fechaComp: fechaComp ? ddmm(fechaComp) : null,
        ordenes: fecha > hoy ? null : d?.ordenes ?? 0,
        facturado: fecha > hoy ? null : d?.facturado ?? 0,
        ordenesComp: fechaComp ? dc?.ordenes ?? 0 : null,
        facturadoComp: fechaComp ? dc?.facturado ?? 0 : null,
      }
    })
  }, [actual, previo, desde, hasta, comp.desde, comp.hasta, hoy])

  const serieHoras = actual.porHora.map((v, h) => ({
    name: `${String(h).padStart(2, '0')}:00`, value: v, comp: previo.porHora[h],
  }))
  const horaPico = serieHoras.reduce((max, h) => (h.value > max.value ? h : max), { name: '—', value: 0, comp: 0 })

  // ── Mes contra mes: facturación acumulada día a día ──
  const resumenA = useMemo(() => resumir(ordenes, `${mesA}-01`, ultimoDiaDelMes(mesA)), [ordenes, mesA])
  const resumenB = useMemo(() => resumir(ordenes, `${mesB}-01`, ultimoDiaDelMes(mesB)), [ordenes, mesB])
  const serieMeses = useMemo(() => {
    const diasA = Number(ultimoDiaDelMes(mesA).slice(8))
    const diasB = Number(ultimoDiaDelMes(mesB).slice(8))
    let acA = 0, acB = 0
    return Array.from({ length: Math.max(diasA, diasB) }, (_, i) => {
      const dia = String(i + 1).padStart(2, '0')
      const fa = `${mesA}-${dia}`, fb = `${mesB}-${dia}`
      acA += resumenA.porDia.get(fa)?.facturado ?? 0
      acB += resumenB.porDia.get(fb)?.facturado ?? 0
      return {
        name: i + 1,
        a: i < diasA && fa <= hoy ? acA : null,
        b: i < diasB && fb <= hoy ? acB : null,
      }
    })
  }, [resumenA, resumenB, mesA, mesB, hoy])

  // Si el mes A está en curso, comparar contra los mismos días del mes B
  // (si no, un mes a medias siempre "pierde").
  const mesAEnCurso = mesA === mesActual
  const diaHoy = Number(hoy.slice(8))
  const corteB = mesAEnCurso ? sumarDias(`${mesB}-01`, diaHoy - 1) : ultimoDiaDelMes(mesB)
  const resumenBMismosDias = useMemo(
    () => (mesAEnCurso ? resumir(ordenes, `${mesB}-01`, corteB > ultimoDiaDelMes(mesB) ? ultimoDiaDelMes(mesB) : corteB) : resumenB),
    [ordenes, mesB, corteB, mesAEnCurso, resumenB],
  )

  const serieMensual = useMemo(
    () => [...meses].reverse().map(m => {
      const r = resumir(ordenes, `${m}-01`, ultimoDiaDelMes(m))
      return { mes: m, label: nombreMesCorto(m), facturado: r.facturado, ordenes: r.ordenes }
    }),
    [meses, ordenes],
  )
  const mejorMes = serieMensual.reduce<typeof serieMensual[number] | null>((max, m) => (!max || m.facturado > max.facturado ? m : max), null)

  if (loading) {
    return (
      <div className="tn-loading">
        <div className="spinner" />
        <p>Cargando análisis{progress > 0 ? ` — ${progress} órdenes` : '...'}</p>
      </div>
    )
  }

  if (error) return (
    <div className="tn-error">
      <p>⚠ {error}</p>
      <button className="btn btn-secondary btn-sm" onClick={reload}>Reintentar</button>
    </div>
  )

  if (!metrics) return null

  const elegirPreset = (p: Preset) => {
    setPreset(p)
    setRango(rangoDePreset(p, hoy))
  }
  const cambiarFecha = (campo: 'desde' | 'hasta', valor: string) => {
    if (!valor) return
    setPreset('custom')
    setRango(r => ({ ...r, [campo]: valor }))
  }

  // Un solo día (Hoy, Ayer): los gráficos por día serían un punto; queda el
  // de ventas por hora.
  const variosDias = desde !== hasta
  const textoPeriodo = variosDias ? `${ddmm(desde)} al ${ddmm(hasta)}` : ddmm(desde)
  const textoComp = comp.desde === comp.hasta ? ddmm(comp.desde) : `${ddmm(comp.desde)} al ${ddmm(comp.hasta)}`
  const nombreA = nombreMes(mesA), nombreB = nombreMes(mesB)

  return (
    <div className="tn-analytics">
      <div className="page-header">
        <div>
          <h1 className="page-title">Análisis</h1>
          <p className="page-subtitle">Ventas de la tienda online</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={reload}>
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {/* ── Filtros ── */}
      <div className="analytics-filtros">
        <div className="ventas-presets analytics-presets">
          {PRESETS.map(p => (
            <button key={p.key} className={`preset-btn${preset === p.key ? ' active' : ''}`} onClick={() => elegirPreset(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="analytics-filtros-row">
          <label className="analytics-fecha">
            <span>Desde</span>
            <input type="date" value={desde} max={hoy} onChange={e => cambiarFecha('desde', e.target.value)} />
          </label>
          <label className="analytics-fecha">
            <span>Hasta</span>
            <input type="date" value={hasta} max={hoy} onChange={e => cambiarFecha('hasta', e.target.value)} />
          </label>
          <label className="analytics-check">
            <input type="checkbox" checked={comparar} onChange={e => setComparar(e.target.checked)} />
            Comparar con {textoComp}
          </label>
        </div>
      </div>

      {/* ── KPIs del período ── */}
      <div className="analytics-kpis">
        <Kpi label="Órdenes" valor={actual.ordenes.toLocaleString('es-AR')} actual={actual.ordenes} previo={previo.ordenes} comparar={comparar} />
        <Kpi label="Facturado" valor={`$${formatARS(actual.facturado)}`} actual={actual.facturado} previo={previo.facturado} comparar={comparar} accent />
        <Kpi label="Ticket promedio" valor={`$${formatARS(actual.ticket)}`} actual={actual.ticket} previo={previo.ticket} comparar={comparar} />
        <Kpi label="Canceladas" valor={actual.canceladas.toLocaleString('es-AR')} actual={actual.canceladas} previo={previo.canceladas} comparar={comparar} menosEsMejor />
      </div>
      {comparar && (
        <p className="analytics-nota">
          {textoPeriodo} comparado con {textoComp}
          {' '}(antes: {previo.ordenes} órdenes, ${formatARS(previo.facturado)})
        </p>
      )}

      {/* ── Ventas por día ── */}
      {variosDias && <div className="tn-card">
        <h3 className="tn-card-title">Órdenes por día</h3>
        <p className="analytics-chart-sub">{textoPeriodo}{comparar && <> · <span className="analytics-leyenda-comp">gris: {textoComp}</span></>}</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={serieDiaria} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={(l, p) => {
                const fc = p?.[0]?.payload?.fechaComp
                return comparar && fc ? `${l} (vs ${fc})` : String(l)
              }}
              formatter={(v: number, key: string) => [v, key === 'ordenesComp' ? 'Antes' : 'Órdenes']}
            />
            {comparar && (
              <Line type="monotone" dataKey="ordenesComp" stroke={COLOR_COMPARACION} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
            )}
            <Line
              type="monotone" dataKey="ordenes" stroke="var(--accent)" strokeWidth={2}
              dot={false} activeDot={{ r: 4, fill: 'var(--accent)', strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>}

      {/* ── Facturación por día ── */}
      {variosDias && <div className="tn-card">
        <h3 className="tn-card-title">Facturación diaria</h3>
        <p className="analytics-chart-sub">{textoPeriodo}{comparar && <> · <span className="analytics-leyenda-comp">línea gris: {textoComp}</span></>}</p>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={serieDiaria} margin={{ top: 4, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tick={TICK} axisLine={false} tickLine={false} tickFormatter={pesosCorto} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={(l, p) => {
                const fc = p?.[0]?.payload?.fechaComp
                return comparar && fc ? `${l} (vs ${fc})` : String(l)
              }}
              formatter={(v: number, key: string) => [`$${formatARS(v)}`, key === 'facturadoComp' ? 'Antes' : 'Facturado']}
            />
            <Bar dataKey="facturado" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            {comparar && (
              <Line type="monotone" dataKey="facturadoComp" stroke={COLOR_COMPARACION} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>}

      {/* ── Mes contra mes ── */}
      <div className="tn-card">
        <div className="analytics-card-head">
          <h3 className="tn-card-title">Comparar meses</h3>
          <div className="analytics-meses">
            <select className="vf-select analytics-sel-a" value={mesA} onChange={e => setMesA(e.target.value)}>
              {meses.map(m => <option key={m} value={m}>{nombreMes(m)}</option>)}
            </select>
            <span className="analytics-vs">vs</span>
            <select className="vf-select analytics-sel-b" value={mesB} onChange={e => setMesB(e.target.value)}>
              {meses.map(m => <option key={m} value={m}>{nombreMes(m)}</option>)}
            </select>
          </div>
        </div>
        <p className="analytics-chart-sub">
          Facturación acumulada día a día
          {mesAEnCurso && ` · ${nombreA} está en curso: se compara contra los primeros ${diaHoy} días de ${nombreB}`}
        </p>

        <div className="analytics-mvm">
          {[
            { label: 'Órdenes', a: resumenA.ordenes, b: resumenBMismosDias.ordenes, fmt: (v: number) => v.toLocaleString('es-AR'), menos: false },
            { label: 'Facturado', a: resumenA.facturado, b: resumenBMismosDias.facturado, fmt: (v: number) => `$${formatARS(v)}`, menos: false },
            { label: 'Ticket promedio', a: resumenA.ticket, b: resumenBMismosDias.ticket, fmt: (v: number) => `$${formatARS(v)}`, menos: false },
            { label: 'Canceladas', a: resumenA.canceladas, b: resumenBMismosDias.canceladas, fmt: (v: number) => v.toLocaleString('es-AR'), menos: true },
          ].map(f => (
            <div key={f.label} className="analytics-mvm-item">
              <p className="analytics-kpi-label">{f.label}</p>
              <p className="analytics-mvm-a">{f.fmt(f.a)}</p>
              <p className="analytics-mvm-b">vs {f.fmt(f.b)} <Variacion actual={f.a} previo={f.b} menosEsMejor={f.menos} /></p>
            </div>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={serieMeses} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
            <YAxis tick={TICK} axisLine={false} tickLine={false} tickFormatter={pesosCorto} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={l => `Día ${l}`}
              formatter={(v: number, key: string) => [`$${formatARS(v)}`, key === 'a' ? nombreA : nombreB]}
            />
            <Legend formatter={(key: string) => (key === 'a' ? nombreA : nombreB)} wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="b" stroke={COLOR_COMPARACION} strokeWidth={2} strokeDasharray="4 4" dot={false} />
            <Line type="monotone" dataKey="a" stroke="var(--accent)" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Por hora + por mes ── */}
      <div className="analytics-row">
        <div className="tn-card">
          <h3 className="tn-card-title">Ventas por hora del día</h3>
          <p className="analytics-chart-sub">{textoPeriodo} · hora pico: {horaPico.name} ({horaPico.value} órdenes)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={serieHoras} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ ...TICK, fontSize: 9 }} axisLine={false} tickLine={false} interval={2} />
              <YAxis tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v, 'Órdenes']} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]} fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="tn-card">
          <h3 className="tn-card-title">Facturación por mes</h3>
          <p className="analytics-chart-sub">
            {mejorMes && mejorMes.facturado > 0 ? `Mejor mes: ${nombreMes(mejorMes.mes)} ($${formatARS(mejorMes.facturado)}) · ` : ''}
            Tocá un mes para compararlo
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={serieMensual} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ ...TICK, fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={TICK} axisLine={false} tickLine={false} tickFormatter={pesosCorto} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number) => [`$${formatARS(v)}`, 'Facturado']}
              />
              <Bar
                dataKey="facturado" radius={[3, 3, 0, 0]} cursor="pointer"
                onClick={(d: { mes?: string; payload?: { mes: string } }) => {
                  const m = d.payload?.mes ?? d.mes
                  if (m && m !== mesA) { setMesB(mesA); setMesA(m) }
                }}
              >
                {serieMensual.map(m => (
                  <Cell key={m.mes} fill={m.mes === mesA ? 'var(--accent)' : m.mes === mesB ? COLOR_COMPARACION : '#10b981'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
