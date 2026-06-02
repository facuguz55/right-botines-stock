import { useState, useEffect } from 'react'
import { RefreshCw, Tag } from 'lucide-react'
import { fetchTNCoupons, getTNCredentials, type TNCoupon } from '../../services/tiendanubeService'
import { TNSetup } from '../TNSetup/TNSetup'
import './TNCupones.css'

export function TNCupones() {
  const creds = getTNCredentials()
  const isConfigured = !!creds.storeId && !!creds.token

  const [coupons, setCoupons] = useState<TNCoupon[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [filter, setFilter]   = useState<'all' | 'active' | 'expired'>('all')

  const load = async () => {
    const { storeId, token } = getTNCredentials()
    if (!storeId || !token) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchTNCoupons(storeId, token)
      setCoupons(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar cupones')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (isConfigured) load() }, [isConfigured])

  if (!isConfigured) return <TNSetup onConfigured={load} />
  if (loading) return <div className="tn-loading"><div className="spinner" /><p>Cargando cupones...</p></div>
  if (error) return <div className="tn-error"><p>⚠ {error}</p><button className="btn btn-secondary btn-sm" onClick={load}>Reintentar</button></div>

  const now = new Date()

  function isExpired(c: TNCoupon) {
    if (!c.valid_to) return false
    return new Date(c.valid_to) < now
  }

  function isActive(c: TNCoupon) {
    if (!c.valid) return false
    if (c.max_uses !== null && c.used_times >= c.max_uses) return false
    return !isExpired(c)
  }

  const filtered = coupons.filter(c => {
    if (filter === 'active')  return isActive(c)
    if (filter === 'expired') return isExpired(c) || !c.valid
    return true
  })

  const activeCount  = coupons.filter(isActive).length
  const expiredCount = coupons.filter(c => isExpired(c) || !c.valid).length
  const totalUses    = coupons.reduce((s, c) => s + c.used_times, 0)

  return (
    <div className="tn-cupones">
      <div className="page-header">
        <div>
          <h1 className="page-title">Cupones</h1>
          <p className="page-subtitle">{coupons.length} cupones en total · {totalUses} usos</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load}>
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      <div className="tn-cupones-stats">
        <div className="tn-cupon-stat active">
          <Tag size={14} />
          <span>{activeCount} activos</span>
        </div>
        <div className="tn-cupon-stat expired">
          <Tag size={14} />
          <span>{expiredCount} expirados/inactivos</span>
        </div>
        <div className="tn-cupon-stat total">
          <span>{totalUses} usos totales</span>
        </div>
      </div>

      <div className="tn-tabs">
        {([['all', `Todos (${coupons.length})`], ['active', `Activos (${activeCount})`], ['expired', `Expirados (${expiredCount})`]] as const).map(([k, l]) => (
          <button key={k} className={`tn-tab${filter === k ? ' active' : ''}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>

      <div className="tn-table-wrap">
        <table className="tn-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Tipo</th>
              <th>Valor</th>
              <th>Usos</th>
              <th>Válido desde</th>
              <th>Válido hasta</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const expired = isExpired(c)
              const active  = isActive(c)
              return (
                <tr key={c.id} className={!active ? 'row-inactive' : ''}>
                  <td>
                    <span className="tn-coupon-code">{c.code}</span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '.8rem' }}>
                    {c.type === 'percentage' ? 'Porcentaje' : c.type === 'absolute' ? 'Monto fijo' : 'Envío gratis'}
                  </td>
                  <td className="tn-coupon-value">
                    {c.type === 'percentage' ? `${c.value}%` : c.type === 'absolute' ? `$${c.value}` : 'Gratis'}
                  </td>
                  <td>
                    <span className="tn-coupon-uses">
                      {c.used_times}{c.max_uses !== null ? `/${c.max_uses}` : ''}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>
                    {c.valid_from ? new Date(c.valid_from).toLocaleDateString('es-AR') : '—'}
                  </td>
                  <td style={{ color: expired ? 'var(--danger)' : 'var(--text-muted)', fontSize: '.75rem' }}>
                    {c.valid_to ? new Date(c.valid_to).toLocaleDateString('es-AR') : '—'}
                  </td>
                  <td>
                    <span className={`tn-status-badge ${active ? 'badge-green' : 'badge-muted'}`}>
                      {active ? 'Activo' : expired ? 'Expirado' : 'Inactivo'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="tn-empty">No hay cupones en esta categoría.</div>}
      </div>
    </div>
  )
}
