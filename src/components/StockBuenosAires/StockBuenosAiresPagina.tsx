import { useMemo, useState } from 'react'
import { Search, Truck } from 'lucide-react'
import type { Modelo, Role } from '../../types'
import { paresBA } from '../../lib/stockUbicacion'
import { getPrecioReal } from '../../utils/precios'
import { FotoBA } from './FotoBA'
import { StockBuenosAires } from './StockBuenosAires'
import './StockBuenosAires.css'

interface Props { role: Role; empleadoId: string | null; modelosLocales: Modelo[] }

const fmt = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 0 })

// Stock Buenos Aires: lo que hay de verdad en el depósito de la proveedora.
// Sale de TiendaNube (ubicación "Deposito CABA", modelo_talles.cantidad_ba),
// así que baja solo cuando se vende por la web o en el local, igual que el
// resto del stock. La sección anterior (lista propia cargada desde los PDF de
// pedidos) no estaba conectada con nada y no descontaba ventas: queda en la
// pestaña "Pedidos de la proveedora" como registro.
export function StockBuenosAiresPagina({ role, empleadoId, modelosLocales }: Props) {
  const [pestana, setPestana] = useState<'deposito' | 'pedidos'>('deposito')
  const [busqueda, setBusqueda] = useState('')
  const [talleFiltro, setTalleFiltro] = useState('')

  const enDeposito = useMemo(
    () => modelosLocales
      .map(m => ({ m, talles: m.modelo_talles.filter(t => paresBA(t) > 0).sort((a, b) => a.talle_arg - b.talle_arg) }))
      .filter(x => x.talles.length > 0),
    [modelosLocales],
  )

  const talles = useMemo(
    () => [...new Set(enDeposito.flatMap(x => x.talles.map(t => Number(t.talle_arg))))].sort((a, b) => a - b),
    [enDeposito],
  )

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return enDeposito
      .filter(x => !q || `${x.m.marca} ${x.m.modelo}`.toLowerCase().includes(q))
      .filter(x => !talleFiltro || x.talles.some(t => String(t.talle_arg) === talleFiltro))
      .sort((a, b) => b.talles.reduce((s, t) => s + paresBA(t), 0) - a.talles.reduce((s, t) => s + paresBA(t), 0))
  }, [enDeposito, busqueda, talleFiltro])

  const pares = enDeposito.reduce((s, x) => s + x.talles.reduce((a, t) => a + paresBA(t), 0), 0)
  const valor = enDeposito.reduce((s, x) => s + getPrecioReal(x.m) * x.talles.reduce((a, t) => a + paresBA(t), 0), 0)

  return (
    <div className="sba">
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock Buenos Aires</h1>
          <p className="sba-sub"><Truck size={14} /> Está en el depósito de la proveedora. Se vende solo por envío, no se retira en el showroom.</p>
        </div>
      </div>

      <div className="sba-pestanas" role="tablist">
        <button role="tab" aria-selected={pestana === 'deposito'} className={`sba-pestana${pestana === 'deposito' ? ' on' : ''}`} onClick={() => setPestana('deposito')}>
          En el depósito
        </button>
        <button role="tab" aria-selected={pestana === 'pedidos'} className={`sba-pestana${pestana === 'pedidos' ? ' on' : ''}`} onClick={() => setPestana('pedidos')}>
          Pedidos de la proveedora
        </button>
      </div>

      {pestana === 'pedidos' ? (
        <>
          <p className="sba-aviso" role="status">
            Esta lista es un registro de los pedidos cargados desde los PDF. <b>No cambia el stock</b>: el stock de Buenos Aires se carga en TiendaNube, en la ubicación "Deposito CABA".
          </p>
          <StockBuenosAires role={role} empleadoId={empleadoId} modelosLocales={modelosLocales} embebido />
        </>
      ) : (
        <>
          <div className="sba-resumen">
            <div className="sba-dato"><strong>{fmt(pares)}</strong><span>pares</span></div>
            <div className="sba-dato"><strong>{fmt(enDeposito.length)}</strong><span>modelos</span></div>
            <div className="sba-dato"><strong>${fmt(valor)}</strong><span>a precio de venta</span></div>
          </div>
          <p className="sba-nota">Sale de TiendaNube (ubicación "Deposito CABA"): baja sola con cada venta. Para cargar pares, se hace en TiendaNube.</p>

          <div className="sba-filtros">
            <div className="sba-fila-filtros">
              <label className="sba-buscar">
                <Search size={15} />
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar modelo…" />
              </label>
              <select className="vf-select" value={talleFiltro} onChange={e => setTalleFiltro(e.target.value)}>
                <option value="">Todos los talles</option>
                {talles.map(t => <option key={t} value={String(t)}>{t}</option>)}
              </select>
            </div>
          </div>

          {visibles.length === 0 ? (
            <p className="sba-vacio">{enDeposito.length === 0 ? 'No hay pares en el depósito de Buenos Aires.' : 'Nada coincide con la búsqueda.'}</p>
          ) : (
            <div className="sba-grid">
              {visibles.map(({ m, talles: ts }) => {
                const n = ts.reduce((s, t) => s + paresBA(t), 0)
                const foto = [...(m.modelo_fotos ?? [])].sort((a, b) => a.orden - b.orden)[0]?.foto_url ?? null
                return (
                  <div key={m.id} className="sba-card">
                    <div className="sba-foto-wrap">
                      <FotoBA src={foto} alt={`${m.marca} ${m.modelo}`} />
                      <span className="sba-pares">{n === 1 ? 'Último par' : n}</span>
                    </div>
                    <p className="sba-nombre">{m.marca} {m.modelo}</p>
                    <p className="sba-codigo">{m.categoria} · {m.gama}</p>
                    <p className="sba-precio">${fmt(getPrecioReal(m))}</p>
                    <div className="sba-chips">
                      {ts.map(t => (
                        <span key={t.id} className={`sba-chip${talleFiltro === String(t.talle_arg) ? ' on' : ''}`}>{t.talle_arg}<b>×{paresBA(t)}</b></span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
