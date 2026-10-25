import { useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Download, Globe, Loader2, ScanSearch, MessageSquare, Clock, TrendingUp, Users, Zap, MailWarning } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useCrmStats } from '../../../hooks/useCrmStats'
import { CATEGORIA_COLORS } from '../../../types/crm'
import type { CrmCategoria, CrmStatsData } from '../../../types/crm'
import { DIAS } from '../../../lib/crmStatsCalc'
import { toISOLocal } from '../../../utils/fecha'
import './CrmDashboard.css'

const INTENCION_LABEL: Record<string, string> = {
  pedido_talle: 'Stock y talles',
  consulta_precio: 'Precios',
  consulta_envio: 'Envíos',
  estado_pedido: 'Estado de un pedido',
  garantia: 'Garantía',
  reclamo: 'Reclamos',
  saludo: 'Solo saludan',
  spam: 'Spam',
  otro: 'Otras consultas',
}

const TOOLTIP_STYLE = { background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }

function formatoTiempo(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return `${h} h ${min % 60 ? `${min % 60} min` : ''}`.trim()
}

function formatoHoras(h: number): string {
  if (h < 48) return `${h} h`
  return `${Math.round(h / 24)} días`
}

export function CrmDashboard() {
  const { stats, loading, range, setRange, reload } = useCrmStats()
  const [buscando, setBuscando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  // Vuelve a mirar los chats de la última semana que no tienen venta marcada
  // (comprobantes que se pasaron, ventas de antes de que existiera el detector).
  async function buscarVentas() {
    setBuscando(true); setAviso(null)
    try {
      const res = await fetch('/api/crm-detectar-venta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revisarDias: 7 }),
      })
      const r = await res.json() as { marcadas?: number; revisadas?: number; error?: string }
      if (!res.ok) throw new Error(r.error || `Error ${res.status}`)
      setAviso(r.marcadas ? `Encontré ${r.marcadas} ${r.marcadas === 1 ? 'venta nueva' : 'ventas nuevas'}.` : 'No encontré ventas sin marcar.')
      if (r.marcadas) reload()
    } catch (err) {
      setAviso(`No se pudo revisar: ${err instanceof Error ? err.message : err}`)
    } finally {
      setBuscando(false)
    }
  }

  const presets = useMemo(() => {
    const hoy = toISOLocal(new Date())
    const atras = (n: number) => toISOLocal(new Date(Date.now() - n * 86400000))
    return [
      { label: 'Hoy', start: hoy, end: hoy },
      { label: '7 días', start: atras(6), end: hoy },
      { label: '30 días', start: atras(29), end: hoy },
      { label: 'Este mes', start: `${hoy.slice(0, 8)}01`, end: hoy },
      { label: 'Todo', start: '2020-01-01', end: hoy },
    ]
  }, [])

  function exportExcel() {
    if (!stats) return
    const wb = XLSX.utils.book_new()
    const hoja = (nombre: string, filas: object[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), nombre)
    hoja('Resumen', [{
      'Mensajes': stats.totales.mensajes, 'Recibidos': stats.totales.recibidos, 'Enviados': stats.totales.enviados,
      'Chats con actividad': stats.totales.chatsConActividad, 'Chats nuevos': stats.totales.chatsNuevos,
      'Respuesta típica (min)': stats.respuesta.medianaMin, 'Respuesta promedio (min)': stats.respuesta.promedioMin,
      'Contestados en 1 h (%)': stats.respuesta.dentroDe60, 'Sin leer ahora': stats.sinLeer.cantidad,
      'Ventas concretadas': stats.conversion.concretadas, 'Conversion (%)': stats.conversion.porcentaje,
      'Monto con comprobante': stats.conversion.monto, 'Ventas cerradas por el bot': stats.conversion.porBot,
      'Pedidos web pagados por WhatsApp': stats.conversion.pedidosWeb, 'Monto pedidos web': stats.conversion.montoWeb,
    }])
    hoja('Mensajes por dia', stats.mensajesPorDia)
    hoja('Embudo', stats.embudo)
    hoja('Tiempo de respuesta', stats.respuesta.buckets)
    hoja('Que consultan', stats.intenciones.map(i => ({ consulta: INTENCION_LABEL[i.intencion] ?? i.intencion, mensajes: i.cantidad })))
    hoja('Talles', stats.talles)
    hoja('Tipos de botin', stats.tiposBotin)
    hoja('Modelos buscados', stats.modelosBuscados)
    hoja('Productos consultados', stats.productosMasConsultados)
    hoja('Por categoria', stats.porCategoria)
    hoja('Etiquetas', stats.etiquetas)
    hoja('Cuando escriben', DIAS.map((dia, i) => ({ dia, ...Object.fromEntries(stats.heatmap[i].map((n, h) => [`${h}hs`, n])) })))
    hoja('Actividad vendedora', stats.actividadVendedora)
    XLSX.writeFile(wb, `CRM_Stats_${range.start}_${range.end}.xlsx`)
  }

  return (
    <div className="crm-dash">
      <div className="page-header">
        <div>
          <h1 className="page-title">Estadísticas</h1>
          <p className="page-subtitle">WhatsApp: cuánto escriben, qué piden y cómo se atiende</p>
        </div>
        <div className="crm-dash-acciones">
          <button className="crm-dash-export" onClick={buscarVentas} disabled={buscando} title="Revisa los chats de la última semana buscando comprobantes y pagos confirmados">
            {buscando ? <Loader2 size={16} className="crm-dash-spin" /> : <ScanSearch size={16} />} {buscando ? 'Buscando…' : 'Buscar ventas'}
          </button>
          <button className="crm-dash-export" onClick={exportExcel} disabled={!stats || loading}>
            <Download size={16} /> Exportar Excel
          </button>
          {aviso && <span className="crm-dash-aviso">{aviso}</span>}
        </div>
      </div>

      <div className="crm-dash-range">
        <div className="crm-dash-presets">
          {presets.map(p => (
            <button
              key={p.label}
              className={range.start === p.start && range.end === p.end ? 'on' : ''}
              onClick={() => setRange({ start: p.start, end: p.end })}
            >{p.label}</button>
          ))}
        </div>
        <label>
          Desde
          <input type="date" value={range.start} onChange={e => setRange(r => ({ ...r, start: e.target.value }))} />
        </label>
        <label>
          Hasta
          <input type="date" value={range.end} onChange={e => setRange(r => ({ ...r, end: e.target.value }))} />
        </label>
      </div>

      {loading ? (
        <div className="crm-dash-loading">
          <Loader2 className="crm-dash-spin" size={28} />
          <span>Cargando estadísticas...</span>
        </div>
      ) : !stats ? (
        <div className="crm-dash-loading"><span>No se pudieron cargar las estadísticas.</span></div>
      ) : (
        <Contenido stats={stats} />
      )}
    </div>
  )
}

function Contenido({ stats }: { stats: CrmStatsData }) {
  const t = stats.totales
  const maxHeat = Math.max(1, ...stats.heatmap.flat())
  const mejor = stats.mejorMomento
  const botTotal = stats.bot.total

  return (
    <>
      <div className="crm-dash-kpis">
        <KpiCard icon={<MessageSquare size={18} />} label="Mensajes" value={t.mensajes.toLocaleString('es-AR')}
          sub={`${t.recibidos.toLocaleString('es-AR')} recibidos · ${t.enviados.toLocaleString('es-AR')} enviados`} />
        <KpiCard icon={<Users size={18} />} label="Chats con actividad" value={t.chatsConActividad.toLocaleString('es-AR')}
          sub={`${t.chatsNuevos.toLocaleString('es-AR')} nuevos en el período`} />
        <KpiCard icon={<Clock size={18} />} label="Tarda en contestar" value={stats.respuesta.total ? formatoTiempo(stats.respuesta.medianaMin) : '-'}
          sub={stats.respuesta.total ? `Lo típico. Promedio: ${formatoTiempo(stats.respuesta.promedioMin)}` : 'Sin respuestas en el período'} />
        <KpiCard icon={<Zap size={18} />} label="Contestados en 1 hora" value={stats.respuesta.total ? `${stats.respuesta.dentroDe60}%` : '-'}
          sub={stats.respuesta.total ? `${stats.respuesta.dentroDe5}% en menos de 5 min` : undefined} accent />
        <KpiCard icon={<MailWarning size={18} />} label="Sin leer ahora" value={stats.sinLeer.cantidad.toLocaleString('es-AR')}
          sub={stats.sinLeer.masViejaHoras != null ? `El más viejo espera hace ${formatoHoras(stats.sinLeer.masViejaHoras)}` : 'Todo al día'} />
        <KpiCard icon={<TrendingUp size={18} />} label="Ventas concretadas" value={stats.conversion.concretadas.toLocaleString('es-AR')}
          sub={[
            `${stats.conversion.porcentaje}% de los chats con actividad`,
            stats.conversion.conMonto ? `$${stats.conversion.monto.toLocaleString('es-AR')} en ${stats.conversion.conMonto} con comprobante` : null,
            stats.conversion.porBot ? `${stats.conversion.porBot} las cerró el bot` : null,
          ].filter(Boolean).join(' · ')} accent />
        <KpiCard icon={<Globe size={18} />} label="Pedidos web pagados por WhatsApp" value={stats.conversion.pedidosWeb.toLocaleString('es-AR')}
          sub={stats.conversion.montoWeb ? `$${stats.conversion.montoWeb.toLocaleString('es-AR')} · no cuentan como ventas del CRM` : 'No cuentan como ventas del CRM'} />
      </div>

      <Tarjeta titulo="Mensajes por día">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={stats.mensajesPorDia}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="fecha" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} tickFormatter={v => v.slice(5)} />
            <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: 'var(--text-secondary)' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="recibidos" name="Recibidos" stroke="#22D3EE" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="enviados" name="Enviados" stroke="#F97316" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Tarjeta>

      <div className="crm-dash-row-2">
        <Tarjeta titulo="Del chat a la venta" nota="Chats con actividad en el período">
          <Barras items={stats.embudo.map(e => ({ label: e.etapa, valor: e.cantidad }))} base={stats.embudo[0]?.cantidad} mostrarPct />
        </Tarjeta>
        <Tarjeta titulo="Cuánto tardan en contestarles" nota={stats.respuesta.total ? `${stats.respuesta.total} respuestas` : undefined}>
          <Barras items={stats.respuesta.buckets.map(b => ({ label: b.label, valor: b.cantidad }))} color="#F97316" base={stats.respuesta.total} mostrarPct />
        </Tarjeta>
      </div>

      <Tarjeta titulo="Cuándo escriben los clientes" nota={mejor ? `Lo más movido: ${mejor.dia} de ${mejor.hora} a ${mejor.hora + 1} hs (${mejor.cantidad} mensajes)` : 'Hora de Argentina'}>
        <div className="crm-heat-wrap">
          <div className="crm-heat">
            <span />
            {Array.from({ length: 24 }, (_, h) => <span key={h} className="crm-heat-hora">{h % 3 === 0 ? h : ''}</span>)}
            {DIAS.map((dia, di) => (
              <HeatFila key={dia} dia={dia} fila={stats.heatmap[di]} max={maxHeat} />
            ))}
          </div>
        </div>
      </Tarjeta>

      <div className="crm-dash-row-2">
        <Tarjeta titulo="Qué consultan" nota="Mensajes según lo que preguntan">
          <Barras items={stats.intenciones.map(i => ({ label: INTENCION_LABEL[i.intencion] ?? i.intencion, valor: i.cantidad }))} vacio="Todavía no hay consultas clasificadas" />
        </Tarjeta>
        <Tarjeta titulo="Qué mandan los clientes" nota="Mensajes recibidos">
          <Barras items={stats.tiposMensaje.map(i => ({ label: i.tipo, valor: i.cantidad }))} color="#A78BFA" base={stats.totales.recibidos} mostrarPct />
        </Tarjeta>
      </div>

      <div className="crm-dash-row-2">
        <Tarjeta titulo="Talles más pedidos" nota="Cantidad de chats que lo pidieron">
          <Barras items={stats.talles.map(i => ({ label: `Talle ${i.talle}`, valor: i.chats }))} color="#34D399" vacio="Todavía no hay talles pedidos" />
        </Tarjeta>
        <Tarjeta titulo="Qué tipo de botín piden" nota="Cantidad de chats">
          <Barras items={stats.tiposBotin.map(i => ({ label: i.tipo, valor: i.chats }))} color="#34D399" vacio="Todavía no hay tipos pedidos" />
        </Tarjeta>
      </div>

      <div className="crm-dash-row-2">
        <Tarjeta titulo="Modelos que más buscan" nota="Cuando el cliente nombra un modelo">
          <Barras items={stats.modelosBuscados.map(i => ({ label: i.modelo, valor: i.chats }))} color="#22D3EE" vacio="Todavía no hay modelos buscados" />
        </Tarjeta>
        <Tarjeta titulo="Fotos que más mandaron" nota="Productos de los que se enviaron fotos">
          <Barras items={stats.productosMasConsultados.map(p => ({ label: `${p.marca} ${p.modelo}`.trim(), valor: p.consultas }))} color="#22D3EE" vacio="Sin fotos enviadas en el período" />
        </Tarjeta>
      </div>

      <div className="crm-dash-row-2">
        <Tarjeta titulo="Chats por categoría">
          <Barras
            items={stats.porCategoria.map(c => ({ label: c.categoria, valor: c.cantidad, color: CATEGORIA_COLORS[c.categoria as CrmCategoria] }))}
            vacio="Sin chats en el período"
          />
        </Tarjeta>
        <Tarjeta titulo="Etiquetas">
          <Barras
            items={stats.etiquetas.map(e => ({ label: e.nombre, valor: e.cantidad, color: e.color }))}
            vacio="Todavía no usaron etiquetas en estos chats"
          />
        </Tarjeta>
      </div>

      <Tarjeta titulo="Cuánto acierta el bot" nota={botTotal ? `${botTotal} respuestas de Right comparadas con lo que sugirió el bot` : undefined}>
        {botTotal === 0 ? (
          <p className="crm-dash-vacio">Todavía no hay datos del bot en este período.</p>
        ) : (
          <Barras
            items={[
              { label: 'Right mandó lo mismo que sugirió el bot', valor: stats.bot.igual, color: '#34D399' },
              { label: 'Right contestó distinto', valor: stats.bot.distinto, color: '#FBBF24' },
              { label: 'El bot no tenía sugerencia', valor: stats.bot.sinSugerencia, color: '#5E7A91' },
            ]}
            base={botTotal}
            mostrarPct
          />
        )}
      </Tarjeta>

      <Tarjeta titulo="Actividad de la vendedora">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={stats.actividadVendedora}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="fecha" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} tickFormatter={v => v.slice(5)} />
            <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: 'var(--text-secondary)' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="mensajes_enviados" stroke="#22D3EE" strokeWidth={2} dot={false} name="Mensajes enviados" />
            <Line type="monotone" dataKey="conversaciones_atendidas" stroke="#F97316" strokeWidth={2} dot={false} name="Chats atendidos" />
          </LineChart>
        </ResponsiveContainer>
      </Tarjeta>
    </>
  )
}

function Tarjeta({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <div className="crm-dash-chart-card">
      <h3>{titulo}</h3>
      {nota && <p className="crm-dash-nota">{nota}</p>}
      <div className="crm-dash-chart">{children}</div>
    </div>
  )
}

// Barras horizontales simples: nombre, barra y número (y % si se pasa una base).
function Barras({ items, color = '#22D3EE', base, mostrarPct, vacio = 'Sin datos para este período' }: {
  items: { label: string; valor: number; color?: string }[]
  color?: string
  base?: number
  mostrarPct?: boolean
  vacio?: string
}) {
  if (items.length === 0 || items.every(i => i.valor === 0)) return <p className="crm-dash-vacio">{vacio}</p>
  const max = Math.max(1, ...items.map(i => i.valor))
  return (
    <ul className="crm-barras">
      {items.map(i => (
        <li key={i.label}>
          <span className="crm-barras-label" title={i.label}>{i.label}</span>
          <span className="crm-barras-pista"><span style={{ width: `${(i.valor / max) * 100}%`, background: i.color ?? color }} /></span>
          <span className="crm-barras-num">
            {i.valor.toLocaleString('es-AR')}
            {mostrarPct && base ? <em>{Math.round((i.valor / base) * 100)}%</em> : null}
          </span>
        </li>
      ))}
    </ul>
  )
}

function HeatFila({ dia, fila, max }: { dia: string; fila: number[]; max: number }) {
  return (
    <>
      <span className="crm-heat-dia">{dia.slice(0, 3)}</span>
      {fila.map((n, h) => (
        <span
          key={h}
          className="crm-heat-celda"
          style={{ background: n === 0 ? 'var(--bg-surface-2)' : `rgba(249, 115, 22, ${0.2 + (n / max) * 0.8})` }}
          title={`${dia} ${h} a ${h + 1} hs: ${n} mensajes`}
        />
      ))}
    </>
  )
}

function KpiCard({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="crm-dash-kpi">
      <div className="crm-dash-kpi-icon">{icon}</div>
      <div className="crm-dash-kpi-body">
        <span className="crm-dash-kpi-label">{label}</span>
        <span className={`crm-dash-kpi-value ${accent ? 'crm-dash-kpi-value--accent' : ''}`}>{value}</span>
        {sub && <span className="crm-dash-kpi-sub">{sub}</span>}
      </div>
    </div>
  )
}
