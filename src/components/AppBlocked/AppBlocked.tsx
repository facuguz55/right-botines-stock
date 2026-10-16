import { Lock } from 'lucide-react'
import { sanitizeHtml } from '../../utils/sanitizeHtml'
import './AppBlocked.css'

const DEFAULT_MENSAJE = '<h1>La aplicación está temporalmente fuera de servicio.</h1><p>Volvé a intentarlo más tarde.</p>'

interface AppBlockedProps {
  mensaje: string
  // true cuando se usa embebida como vista previa dentro del panel de
  // creadores (ocupa el contenedor, no la pantalla completa).
  preview?: boolean
}

export function AppBlocked({ mensaje, preview = false }: AppBlockedProps) {
  const html = sanitizeHtml(mensaje?.trim() || DEFAULT_MENSAJE)
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
