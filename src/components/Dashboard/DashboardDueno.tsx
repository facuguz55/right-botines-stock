import { useState } from 'react'
import { AlertTriangle, ArrowRight, PackagePlus, TrendingUp, Tag, Users, Eye, Coins, Ruler } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useDashboardDueno, type DashboardDueno as Datos, type FotoModelo } from '../../hooks/useDashboardDueno'
import type { ActivePage } from '../../types'
import './DashboardDueno.css'

// Dashboard del dueño: arriba la plata real del mes y, abajo, qué hacer.

const plata = (n: number | null | undefined) => (n == null ? '—' : '$' + Math.round(n).toLocaleString('es-AR'))
const pct = (n: number | null | undefined) => (n == null || !isFinite(n) ? '—' : `${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`)
const hace = (iso: string | null) => {
  if (!iso) return 'nunca'
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400_000)
  return d < 1 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`
}
const nombreMes = (m: string | undefined) => (m ? new Date(`${m}-15T12:00:00`).toLocaleDateString('es-AR', { month: 'long' }) : '')

function Miniatura({ m }: { m: FotoModelo }) {
  return m.foto ? <img src={m.foto} alt={m.modelo} className="dd-foto" loading="lazy" decoding="async" /> : <div className="dd-foto dd-foto-vacia">⚽</div>
}

function Seccion({ icono, titulo, bajada, accion, children, className }: { icono: React.ReactNode; titulo: string; bajada?: string; accion?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`dd-card ${className ?? ''}`}>
      <header className="dd-card-head">
        <div>
          <h3 className="dd-card-title">{icono}{titulo}</h3>
          {bajada && <p className="dd-card-sub">{bajada}</p>}
        </div>
        {accion}
      </header>
      {children}
    </section>
  )
}

// Lista que muestra las primeras filas y deja abrir el resto, para que las tarjetas queden parejas.
function ListaCorta<T>({ items, max = 6, fila }: { items: T[]; max?: number; fila: (x: T, i: number) => React.ReactNode }) {
  const [todo, setTodo] = useState(false)
  const visibles = todo ? items : items.slice(0, max)
  return (
    <>
      <div className="dd-lista">{visibles.map(fila)}</div>
      {items.length > max && (
        <button type="button" className="dd-mas" onClick={() => setTodo(!todo)}>{todo ? 'Ver menos' : `Ver ${items.length - max} más`}</button>
      )}
    </>
  )
}

export function DashboardDueno({ onNavigate }: { onNavigate?: (p: ActivePage) => void }) {
  const { data, loading, error } = useDashboardDueno()

  if (loading) return (
    <div className="dashboard dd">
      <div className="page-header"><h1 className="page-title">Dashboard</h1></div>
      <div className="dd-kpis">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="dd-kpi"><div className="skeleton" style={{ height: 12, width: '60%' }} /><div className="skeleton" style={{ height: 34, width: '75%', marginTop: 10 }} /></div>)}</div>
      <div className="dd-grid">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="dd-card"><div className="skeleton" style={{ height: 220 }} /></div>)}</div>
    </div>
  )
  if (error) return <div className="dash-error">No se pudo cargar el dashboard: {error}</div>
  if (!data) return null
  return <VistaDueno data={data} onNavigate={onNavigate} />
}

export function VistaDueno({ data, onNavigate }: { data: Datos; onNavigate?: (p: ActivePage) => void }) {
  const { mes, mesAnterior } = data
  const ir = (p: ActivePage) => onNavigate && (
    <button type="button" className="dd-link" onClick={() => onNavigate(p)}>Ver <ArrowRight size={13} /></button>
  )
  const maxCurva = Math.max(1, ...data.curvaTalles.map((t) => t.pares))
  const totalCurva = data.curvaTalles.reduce((s, t) => s + t.pares, 0)

  return (
    <div className="dashboard dd">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="dd-intro">Cómo viene el mes y qué conviene hacer: qué comprar, qué liquidar y qué empujar.</p>
      </div>

      {data.modelosSinCosto.cantidad > 0 && (
        <div className="dd-aviso">
          <AlertTriangle size={18} />
          <div>
            <b>{data.modelosSinCosto.cantidad} {data.modelosSinCosto.cantidad === 1 ? 'modelo vendido este mes no tiene' : 'modelos vendidos este mes no tienen'} el costo cargado.</b>
            <span> Mientras falte, esas ventas ({plata(data.modelosSinCosto.facturado)}) se cuentan como si fueran todo ganancia y el número de ganancia no es real.
              {data.modelosSinCosto.ejemplos.length > 0 && <> Empezá por: {data.modelosSinCosto.ejemplos.join(', ')}.</>}</span>
          </div>
          {ir('stock')}
        </div>
      )}

      {/* ── La plata del mes ── */}
      <div className="dd-kpis">
        <div className="dd-kpi dd-kpi-hero">
          <span className="dd-kpi-label">Facturado en {nombreMes(mes?.mes)}</span>
          <span className="dd-kpi-value">{plata(mes?.total.facturado)}</span>
          <span className="dd-kpi-sub">Local {plata(mes?.local.facturado)} · Web {plata(mes?.web.facturado)}</span>
          {data.proyeccion != null && <span className="dd-kpi-sub">A este ritmo cerrás el mes en <b>{plata(data.proyeccion)}</b></span>}
        </div>
        <div className="dd-kpi">
          <span className="dd-kpi-label">Ganancia neta</span>
          <span className={`dd-kpi-value ${mes && mes.total.gananciaNeta < 0 ? 'neg' : 'pos'}`}>{plata(mes?.total.gananciaNeta)}</span>
          <span className="dd-kpi-sub">Margen {pct(mes?.total.margenNeto)} · ya descontados costo de los pares, gastos y costos cargados{mes && !mes.manoObraIncluida ? ' (sin sueldos)' : ''}</span>
        </div>
        <div className="dd-kpi">
          <span className="dd-kpi-label">Pares vendidos</span>
          <span className="dd-kpi-value">{(data.paresMes.local + data.paresMes.web).toLocaleString('es-AR')}</span>
          <span className="dd-kpi-sub">{data.paresMes.local} en el local · {data.paresMes.web} por la web</span>
        </div>
        <div className="dd-kpi">
          <span className="dd-kpi-label">El mes pasado completo</span>
          <span className="dd-kpi-value dd-kpi-value-sm">{plata(mesAnterior?.total.facturado)}</span>
          <span className="dd-kpi-sub">Ganancia neta {plata(mesAnterior?.total.gananciaNeta)} · margen {pct(mesAnterior?.total.margenNeto)}</span>
        </div>
      </div>

      {/* ── Qué comprar ── */}
      <div className="dd-grid dd-grid-ancha">
        <Seccion icono={<PackagePlus size={17} />} titulo="Qué comprar" bajada="Talles que se venden y se están por acabar, ordenados por urgencia. «Pedí» cubre un mes de ventas al ritmo de los últimos 60 días." accion={ir('stock')}>
          {data.reponer.length === 0 ? <p className="dash-no-data">No hay talles que se estén por acabar. 👌</p> : (
            <ListaCorta items={data.reponer} max={9} fila={(r) => (
                <div key={r.id} className="dd-fila">
                  <Miniatura m={r} />
                  <div className="dd-fila-info">
                    <p className="dd-nombre"><span>{r.marca}</span> {r.modelo}</p>
                    <div className="dd-chips">
                      {r.talles.map((t) => (
                        <span key={t.talle} className={`dd-chip ${t.stock <= 0 ? 'agotado' : t.diasRestantes! <= 7 ? 'urgente' : ''}`} title={`Vendiste ${t.vendidos} en 60 días`}>
                          <b>{t.talle}</b> {t.stock <= 0 ? 'agotado' : `quedan ${t.stock} · ~${t.diasRestantes} días`}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="dd-fila-der"><b>Pedí {r.comprarTotal}</b><span>{r.comprarTotal === 1 ? 'par' : 'pares'}</span></div>
                </div>
              )} />
          )}
        </Seccion>

        <div className="dd-col">
        <Seccion icono={<Ruler size={17} />} titulo="Qué talles se venden" bajada="Pares por talle en los últimos 60 días (local + web). Usalo para armar la curva del próximo pedido.">
          {data.curvaTalles.length === 0 ? <p className="dash-no-data">Sin ventas con talle todavía.</p> : (
            <div className="dd-curva">
              {data.curvaTalles.map((t) => (
                <div key={t.talle} className="dd-curva-fila">
                  <span className="dd-curva-talle">{t.talle}</span>
                  <span className="dd-curva-barra"><span style={{ width: `${(t.pares / maxCurva) * 100}%` }} /></span>
                  <span className="dd-curva-n">{t.pares} · {pct((t.pares / totalCurva) * 100)}</span>
                </div>
              ))}
            </div>
          )}
        </Seccion>
        {data.demandaSinStock.length > 0 && (
          <Seccion icono={<Eye size={17} />} titulo="Lo buscaron y no había talle" bajada="Talles que pidieron en la web en el último mes y estaban agotados.">
            <ListaCorta items={data.demandaSinStock} max={5} fila={(d, i) => (
              <div key={i} className="dd-fila">
                <div className="dd-fila-info"><p className="dd-nombre">{d.nombre}</p><p className="dd-detalle">Talle {d.talle}</p></div>
                <div className="dd-fila-der"><b>{d.busquedas}</b><span>{d.busquedas === 1 ? 'persona' : 'personas'}</span></div>
              </div>
            )} />
          </Seccion>
        )}
        </div>
      </div>

      {/* ── Qué deja plata / qué liquidar / qué empujar ── */}
      <div className={`dd-grid ${data.empujar.length > 0 ? 'dd-grid-3' : ''}`}>
        <Seccion icono={<TrendingUp size={17} />} titulo="Qué te deja más plata" bajada="Últimos 30 días, ordenado por ganancia (no por pares vendidos).">
          {data.ranking.length === 0 ? <p className="dash-no-data">Sin ventas en los últimos 30 días.</p> : (
            <ListaCorta items={data.ranking} fila={(m, i) => (
                <div key={m.id} className="dd-fila">
                  <span className="dd-rank">{i + 1}</span>
                  <Miniatura m={m} />
                  <div className="dd-fila-info">
                    <p className="dd-nombre"><span>{m.marca}</span> {m.modelo}</p>
                    <p className="dd-detalle">{m.pares} {m.pares === 1 ? 'par' : 'pares'} · facturó {plata(m.facturado)}</p>
                  </div>
                  <div className="dd-fila-der">
                    {m.ganancia == null ? <span className="dd-sin-costo">sin costo cargado</span> : <><b className="pos">{plata(m.ganancia)}</b><span>margen {pct(m.margen)}</span></>}
                  </div>
                </div>
              )} />
          )}
        </Seccion>

        <Seccion icono={<Coins size={17} />} titulo="Qué liquidar" bajada={`Modelos sin ventas en 60 días. ${data.capitalParado > 0 ? `Hay ${plata(data.capitalParado)} parados (al costo).` : ''} Conviene promocionarlos o bajarles el precio.`}>
          {data.parados.length === 0 ? <p className="dash-no-data">No hay stock parado. 👌</p> : (
            <ListaCorta items={data.parados} fila={(p) => (
                <div key={p.id} className="dd-fila">
                  <Miniatura m={p} />
                  <div className="dd-fila-info">
                    <p className="dd-nombre"><span>{p.marca}</span> {p.modelo}</p>
                    <p className="dd-detalle">{p.pares} {p.pares === 1 ? 'par' : 'pares'} en stock · última venta {hace(p.ultimaVenta)}</p>
                  </div>
                  <div className="dd-fila-der">{p.capital == null ? <span className="dd-sin-costo">sin costo cargado</span> : <><b className="neg">{plata(p.capital)}</b><span>parados</span></>}</div>
                </div>
              )} />
          )}
        </Seccion>

        {data.empujar.length > 0 && (
        <Seccion icono={<Tag size={17} />} titulo="Qué empujar en redes y anuncios" bajada="Tenés stock, dejan buen margen y se venden poco: son los mejores candidatos para publicar o pautar.">
            <ListaCorta items={data.empujar} fila={(m) => (
                <div key={m.id} className="dd-fila">
                  <Miniatura m={m} />
                  <div className="dd-fila-info">
                    <p className="dd-nombre"><span>{m.marca}</span> {m.modelo}</p>
                    <p className="dd-detalle">{m.pares} pares en stock · {m.motivo}</p>
                  </div>
                  <div className="dd-fila-der"><b className="pos">{pct(m.margen)}</b><span>de margen</span></div>
                </div>
              )} />
        </Seccion>
        )}
      </div>

      {/* ── Ventas semanales / lo miran y no lo compran ── */}
      <div className="dd-grid dd-grid-ancha">
        <Seccion icono={<TrendingUp size={17} />} titulo="Pares por semana" bajada="Local y web, últimas 10 semanas.">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.semanas} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="semana" tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#111820', border: '1px solid #1E2D3E', borderRadius: 8, color: '#fff', fontSize: 13 }} cursor={{ fill: 'rgba(255,69,0,.06)' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="local" name="Local" stackId="a" fill="#FF4500" />
              <Bar dataKey="web" name="Web" stackId="a" fill="#00d46a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Seccion>

        <Seccion icono={<Eye size={17} />} titulo="Lo miran pero no lo compran" bajada="Productos de la web con muchas visitas y casi ninguna venta (últimos 30 días). Revisá precio, fotos, talles o la descripción." accion={ir('tn_trafico')}>
          {data.loMiranNoLoCompran.length === 0 ? <p className="dash-no-data">Sin datos de visitas todavía.</p> : (
            <ListaCorta items={data.loMiranNoLoCompran} max={4} fila={(p, i) => (
                <div key={i} className="dd-fila">
                  <div className="dd-fila-info">
                    <p className="dd-nombre">{p.nombre}</p>
                    <p className="dd-detalle">{p.carritos} lo agregaron al carrito · {p.ordenes} {p.ordenes === 1 ? 'compra' : 'compras'}</p>
                  </div>
                  <div className="dd-fila-der"><b>{p.vistas.toLocaleString('es-AR')}</b><span>visitas</span></div>
                </div>
              )} />
          )}
        </Seccion>
      </div>

      {/* ── Clientes ── */}
        <Seccion icono={<Users size={17} />} titulo="Clientes" bajada="Últimos 6 meses." accion={ir('clientes_locales')} className="dd-clientes">
          <div className="dd-mini-kpis">
            <div><b>{data.clientes.conCompra.toLocaleString('es-AR')}</b><span>compraron</span></div>
            <div><b>{pct(data.clientes.conCompra ? (data.clientes.repiten / data.clientes.conCompra) * 100 : null)}</b><span>volvieron a comprar</span></div>
          </div>
          <div className="dd-clientes-lista">
          <p className="dd-sub-titulo">Buenos clientes para volver a escribirles</p>
          {data.clientes.volver.length === 0 ? <p className="dash-no-data">Todavía no hay.</p> : (
            <ListaCorta items={data.clientes.volver} max={6} fila={(c, i) => (
                <div key={i} className="dd-fila">
                  <div className="dd-fila-info">
                    <p className="dd-nombre">{c.nombre} <span className="dd-canal">{c.canal}</span></p>
                    <p className="dd-detalle">{c.contacto ?? 'sin contacto'} · última compra {hace(c.ultima)}</p>
                  </div>
                  <div className="dd-fila-der"><b>{plata(c.gastado)}</b><span>{c.compras} {c.compras === 1 ? 'compra' : 'compras'}</span></div>
                </div>
              )} />
          )}
          </div>
        </Seccion>
    </div>
  )
}
