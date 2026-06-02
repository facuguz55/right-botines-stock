import { Mail, MousePointerClick, TrendingUp, RefreshCw } from 'lucide-react'
import { useSeguimientos } from '../../hooks/useSeguimientos'
import './Seguimientos.css'

function fmt(ts: string) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function shortUrl(url: string) {
  try {
    const u = new URL(url)
    return u.hostname + (u.pathname.length > 20 ? u.pathname.slice(0, 20) + '…' : u.pathname)
  } catch {
    return url.length > 35 ? url.slice(0, 35) + '…' : url
  }
}

function safeHref(url: string): string | undefined {
  try {
    const u = new URL(url)
    return (u.protocol === 'https:' || u.protocol === 'http:') ? u.toString() : undefined
  } catch { return undefined }
}

export function Seguimientos() {
  const { data, loading, error, reload } = useSeguimientos()

  if (loading) return (
    <div className="seguimientos">
      <div className="page-header">
        <div className="skeleton" style={{ height: 36, width: 220 }} />
      </div>
      <div className="seg-metrics">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="seg-metric" style={{ gap: '1rem' }}>
            <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="skeleton" style={{ height: 32, width: 48 }} />
              <div className="skeleton" style={{ height: 11, width: 100 }} />
            </div>
          </div>
        ))}
      </div>
      <div className="seg-tables">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="seg-card">
            <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div className="skeleton" style={{ height: 14, width: 14 }} />
              <div className="skeleton" style={{ height: 14, width: 130 }} />
            </div>
            <div style={{ padding: '0.25rem 0' }}>
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} style={{ display: 'flex', gap: '2rem', padding: '0.625rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
                  <div className="skeleton" style={{ height: 13, flex: 2 }} />
                  <div className="skeleton" style={{ height: 13, flex: 1 }} />
                  <div className="skeleton" style={{ height: 13, flex: 1 }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  if (error) return (
    <div className="seg-error">
      <p>Error: {error}</p>
      <button className="btn btn-secondary" onClick={reload}>Reintentar</button>
    </div>
  )

  if (!data) return null

  const totalConvertido = data.conversiones.reduce(
    (s, c) => s + parseFloat(c.total_orden || '0'), 0
  )

  return (
    <div className="seguimientos">
      <div className="page-header">
        <h1 className="page-title">Seguimientos</h1>
        <button className="seg-refresh" onClick={reload} title="Actualizar">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* ── Métricas ── */}
      <div className="seg-metrics">
        <div className="seg-metric">
          <div className="seg-metric-icon"><Mail size={18} /></div>
          <div>
            <p className="seg-metric-value">{data.emailsEnviados.length}</p>
            <p className="seg-metric-label">Emails enviados</p>
          </div>
        </div>
        <div className="seg-metric seg-metric--accent">
          <div className="seg-metric-icon"><TrendingUp size={18} /></div>
          <div>
            <p className="seg-metric-value accent">{data.conversiones.length}</p>
            <p className="seg-metric-label">
              Conversiones
              {data.conversiones.length > 0 && (
                <span className="seg-metric-sub">
                  ${totalConvertido.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ARS
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="seg-metric">
          <div className="seg-metric-icon"><MousePointerClick size={18} /></div>
          <div>
            <p className="seg-metric-value">{data.clicks.length}</p>
            <p className="seg-metric-label">Clics</p>
          </div>
        </div>
      </div>

      {/* ── Tablas ── */}
      <div className="seg-tables">

        {/* Emails enviados */}
        <div className="seg-card">
          <h3 className="seg-card-title">
            <Mail size={14} /> Emails enviados
            <span className="seg-card-count">{data.emailsEnviados.length}</span>
          </h3>
          {data.emailsEnviados.length === 0 ? (
            <p className="seg-empty">Sin emails registrados.</p>
          ) : (
            <div className="seg-table-wrap">
              <table className="seg-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {data.emailsEnviados.map(e => (
                    <tr key={e.id}>
                      <td className="seg-email">{e.email}</td>
                      <td className="seg-date">{fmt(e.fecha)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Conversiones */}
        <div className="seg-card">
          <h3 className="seg-card-title">
            <TrendingUp size={14} /> Conversiones
            <span className="seg-card-count seg-card-count--accent">{data.conversiones.length}</span>
          </h3>
          {data.conversiones.length === 0 ? (
            <p className="seg-empty">Sin conversiones registradas.</p>
          ) : (
            <div className="seg-table-wrap">
              <table className="seg-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Email</th>
                    <th>Orden</th>
                    <th>Total</th>
                    <th>Campaña</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {data.conversiones.map(c => (
                    <tr key={c.id}>
                      <td className="seg-bold">{c.nombre_cliente || '—'}</td>
                      <td className="seg-email">{c.email}</td>
                      <td className="seg-mono">#{c.id_orden}</td>
                      <td className="seg-money">
                        ${parseFloat(c.total_orden || '0').toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                      </td>
                      <td>
                        {c.utm_campaign ? (
                          <span className="seg-badge">{c.utm_campaign}</span>
                        ) : '—'}
                      </td>
                      <td className="seg-date">{fmt(c.fecha_orden)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Clics */}
        <div className="seg-card">
          <h3 className="seg-card-title">
            <MousePointerClick size={14} /> Clics
            <span className="seg-card-count">{data.clicks.length}</span>
          </h3>
          {data.clicks.length === 0 ? (
            <p className="seg-empty">Sin clics registrados.</p>
          ) : (
            <div className="seg-table-wrap">
              <table className="seg-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>URL destino</th>
                    <th>Fecha clic</th>
                  </tr>
                </thead>
                <tbody>
                  {data.clicks.map(c => (
                    <tr key={c.id}>
                      <td className="seg-email">{c.email}</td>
                      <td>
                        {safeHref(c.checkout_url) ? (
                          <a
                            href={safeHref(c.checkout_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="seg-link"
                          >
                            {shortUrl(c.checkout_url)}
                          </a>
                        ) : (
                          <span className="seg-link">{shortUrl(c.checkout_url)}</span>
                        )}
                      </td>
                      <td className="seg-date">{fmt(c.fecha_click)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
