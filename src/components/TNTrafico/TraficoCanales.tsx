import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import type { TraficoCanales as Datos } from '../../services/trafico'

// Con menos visitas que esto, las tasas de un canal son ruido.
const MIN_SESIONES_PARA_COMPARAR = 10

function pct(n: number, total: number): string {
  if (!total) return '—'
  const v = (n / total) * 100
  return `${v < 10 ? v.toFixed(1) : Math.round(v)}%`
}

// Usos típicos de la marca → utm_source / utm_medium. Mismos valores que
// reconoce web_canal en la base, para que caigan en el canal correcto.
const USOS = [
  { key: 'ig_bio', label: 'Bio de Instagram', source: 'instagram', medium: 'bio' },
  { key: 'ig_story', label: 'Historia de Instagram', source: 'instagram', medium: 'story' },
  { key: 'ig_post', label: 'Publicación de Instagram', source: 'instagram', medium: 'post' },
  { key: 'wa_msg', label: 'Mensaje de WhatsApp', source: 'whatsapp', medium: 'mensaje' },
  { key: 'wa_estado', label: 'Estado de WhatsApp', source: 'whatsapp', medium: 'estado' },
  { key: 'tiktok', label: 'TikTok', source: 'tiktok', medium: 'bio' },
  { key: 'email', label: 'Email / newsletter', source: 'email', medium: 'email' },
  { key: 'otro', label: 'Otro (influencer, flyer, etc.)', source: '', medium: '' },
]

// Para anuncios no se arma un link a mano: Meta completa los valores solo
// con estos parámetros dinámicos (se pegan en "Parámetros de URL" del anuncio).
const PARAMS_META_ADS = 'utm_source={{site_source_name}}&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}'

function slug(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function copiar(texto: string, alCopiar: () => void) {
  try {
    await navigator.clipboard.writeText(texto)
    alCopiar()
  } catch {
    // Mismo fallback que Preventas: el Clipboard API puede estar bloqueado
    // (permisos, webviews). El texto igual queda visible para copiarlo a mano.
    try {
      window.prompt('No se pudo copiar automáticamente. Seleccioná el texto y copialo con Ctrl+C / Cmd+C:', texto)
    } catch {
      window.alert(texto)
    }
  }
}

interface Props {
  datos: Datos
}

export function TraficoCanales({ datos }: Props) {
  const { canales, campanas } = datos
  const totalSesiones = canales.reduce((s, c) => s + c.sesiones, 0)

  // Mejor canal por tasa de carrito, solo entre los que tienen volumen.
  const comparables = canales.filter(c => c.sesiones >= MIN_SESIONES_PARA_COMPARAR)
  const mejor = comparables.length > 1
    ? comparables.reduce((a, b) => (b.carritos / b.sesiones > a.carritos / a.sesiones ? b : a))
    : null

  const [uso, setUso] = useState(USOS[0].key)
  const [base, setBase] = useState('https://right.com.ar/')
  const [campana, setCampana] = useState('')
  const [sourceOtro, setSourceOtro] = useState('')
  const [copiado, setCopiado] = useState<'link' | 'meta' | null>(null)

  const elegido = USOS.find(u => u.key === uso)!
  const source = elegido.key === 'otro' ? slug(sourceOtro) : elegido.source
  const medium = elegido.key === 'otro' ? 'referido' : elegido.medium

  let link = ''
  let linkError: string | null = null
  try {
    const url = new URL(base.trim())
    if (!/right\.com\.ar$|mitiendanube\.com$/.test(url.hostname)) linkError = 'El link tiene que ser de right.com.ar'
    if (source) url.searchParams.set('utm_source', source)
    if (medium) url.searchParams.set('utm_medium', medium)
    if (slug(campana)) url.searchParams.set('utm_campaign', slug(campana))
    link = url.toString()
  } catch {
    linkError = 'Pegá un link válido de la tienda (ej. https://right.com.ar/productos/...)'
  }
  if (!linkError && elegido.key === 'otro' && !source) linkError = 'Escribí de dónde viene (ej. el nombre del influencer)'

  const marcarCopiado = (q: 'link' | 'meta') => {
    setCopiado(q)
    setTimeout(() => setCopiado(null), 2000)
  }

  return (
    <>
      <div className="tn-card">
        <h3 className="tn-card-title">De dónde vienen las visitas</h3>
        <p className="analytics-chart-sub">
          Qué canal trae gente y cuál trae gente que avanza hacia la compra. Las compras en sí no se pueden
          atribuir a un canal (TiendaNube no deja medir dentro del checkout), así que lo más profundo que se
          compara es quién agrega al carrito y quién llega al checkout.
        </p>
        {canales.length === 0 ? (
          <p className="tn-no-data">Sin visitas en este rango.</p>
        ) : (
          <table className="tp-tabla tc-tabla">
            <thead>
              <tr>
                <th>Canal</th><th>Visitas</th><th>Vieron producto</th><th>Al carrito</th><th>Al checkout</th><th>Págs./visita</th>
              </tr>
            </thead>
            <tbody>
              {canales.map(c => (
                <tr key={c.canal}>
                  <td>
                    <span className="tc-canal">{c.canal}</span>
                    {mejor?.canal === c.canal && <span className="tc-badge">Mejor carrito</span>}
                  </td>
                  <td>{c.sesiones} <span className="tp-neutro">({pct(c.sesiones, totalSesiones)})</span></td>
                  <td>{pct(c.vieron_producto, c.sesiones)}</td>
                  <td className={c.sesiones >= MIN_SESIONES_PARA_COMPARAR ? 'tp-bueno' : ''}>{pct(c.carritos, c.sesiones)}</td>
                  <td>{pct(c.checkouts, c.sesiones)}</td>
                  <td>{c.paginas_por_visita}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="trafico-nota">
          "Directo" son visitas sin rastro de origen: escribieron la dirección, entraron desde favoritos o desde un
          link pegado en una app que no lo informa (muy común en WhatsApp). Para que esas visitas se identifiquen,
          usá links con UTM — abajo los podés armar.
        </p>
      </div>

      <div className="tn-card">
        <h3 className="tn-card-title">Campañas</h3>
        <p className="analytics-chart-sub">Links etiquetados con un nombre de campaña (utm_campaign).</p>
        {campanas.length === 0 ? (
          <p className="tn-no-data">Todavía no entró ninguna visita desde un link con campaña. Armá uno abajo.</p>
        ) : (
          <table className="tp-tabla tc-tabla">
            <thead><tr><th>Campaña</th><th>Origen</th><th>Visitas</th><th>Al carrito</th><th>Al checkout</th></tr></thead>
            <tbody>
              {campanas.map(c => (
                <tr key={`${c.campana}-${c.utm_source}-${c.utm_medium}`}>
                  <td><span className="tc-canal">{c.campana}</span></td>
                  <td className="tp-neutro">{c.canal}{c.utm_medium ? ` · ${c.utm_medium}` : ''}</td>
                  <td>{c.sesiones}</td>
                  <td>{pct(c.carritos, c.sesiones)}</td>
                  <td>{pct(c.checkouts, c.sesiones)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="tn-card">
        <h3 className="tn-card-title">Armar link con seguimiento</h3>
        <p className="analytics-chart-sub">
          Usá este link en vez del link pelado de la tienda: las visitas que entren por acá van a aparecer con su
          canal y campaña en esta pantalla.
        </p>

        <div className="tc-form">
          <div className="form-group">
            <label>¿Dónde lo vas a publicar?</label>
            <select value={uso} onChange={e => setUso(e.target.value)}>
              {USOS.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
            </select>
          </div>
          {elegido.key === 'otro' && (
            <div className="form-group">
              <label>¿De dónde viene?</label>
              <input value={sourceOtro} onChange={e => setSourceOtro(e.target.value)} placeholder="Ej: influencer juan, flyer local" />
            </div>
          )}
          <div className="form-group">
            <label>Link de la tienda</label>
            <input value={base} onChange={e => setBase(e.target.value)} placeholder="https://right.com.ar/productos/..." />
          </div>
          <div className="form-group">
            <label>Nombre de la campaña (opcional)</label>
            <input value={campana} onChange={e => setCampana(e.target.value)} placeholder="Ej: hot sale, lanzamiento mercurial" />
          </div>
        </div>

        {linkError ? (
          <p className="tc-error">{linkError}</p>
        ) : (
          <div className="tc-resultado">
            <input readOnly value={link} onFocus={e => e.currentTarget.select()} className="tc-link" />
            <button className="btn btn-primary btn-sm" onClick={() => copiar(link, () => marcarCopiado('link'))}>
              {copiado === 'link' ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
            </button>
          </div>
        )}

        <div className="tc-meta">
          <h4 className="tp-subtitulo">Para anuncios de Meta (Instagram / Facebook Ads)</h4>
          <p className="tp-ayuda">
            No hace falta armar un link por anuncio. En el Administrador de anuncios, dentro de cada anuncio, en
            "Parámetros de URL", pegá esto una sola vez: Meta completa solo el nombre de la campaña y del anuncio, y
            esas visitas van a aparecer como "Meta Ads".
          </p>
          <div className="tc-resultado">
            <input readOnly value={PARAMS_META_ADS} onFocus={e => e.currentTarget.select()} className="tc-link" />
            <button className="btn btn-secondary btn-sm" onClick={() => copiar(PARAMS_META_ADS, () => marcarCopiado('meta'))}>
              {copiado === 'meta' ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
