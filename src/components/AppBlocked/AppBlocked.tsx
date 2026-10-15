import { useEffect } from 'react'
import { Lock } from 'lucide-react'
import { sanitizeHtml } from '../../utils/sanitizeHtml'
import './AppBlocked.css'

// Sin mensaje escrito en el panel de creadores, el bloqueo se muestra como
// una página 404 genérica (sin candado ni "acceso restringido").
function sinTexto(html: string | undefined): boolean {
  return !(html ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

interface AppBlockedProps {
  mensaje: string
  // true cuando se usa embebida como vista previa dentro del panel de
  // creadores (ocupa el contenedor, no la pantalla completa).
  preview?: boolean
}

export function AppBlocked({ mensaje, preview = false }: AppBlockedProps) {
  const es404 = sinTexto(mensaje)
  useEffect(() => {
    if (es404 && !preview) document.title = '404: Página no encontrada'
  }, [es404, preview])

  if (es404) {
    return (
      <div className={`app-blocked-screen app-404-screen${preview ? ' app-blocked-screen--preview' : ''}`}>
        <div className="app-blocked-box app-404-box">
          <p className="app-404-code">404</p>
          <p className="app-404-title">Página no encontrada</p>
          <p className="app-404-text">El servidor no pudo encontrar el recurso solicitado.</p>
        </div>
      </div>
    )
  }
  const html = sanitizeHtml(mensaje)
  return (
    <div className={`app-blocked-screen${preview ? ' app-blocked-screen--preview' : ''}`}>
      <div className="app-blocked-glow" />
      <div className="app-blocked-box">
        <div className="app-blocked-badge"><Lock size={14} /> Acceso restringido</div>
        <div className="app-blocked-mensaje" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  )
}
