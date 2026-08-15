import { Lock } from 'lucide-react'
import { sanitizeHtml } from '../../utils/sanitizeHtml'
import './AppBlocked.css'

const DEFAULT_MENSAJE = 'La aplicación está temporalmente fuera de servicio.'

export function AppBlocked({ mensaje }: { mensaje: string }) {
  const html = sanitizeHtml(mensaje?.trim() || DEFAULT_MENSAJE)
  return (
    <div className="app-blocked-screen">
      <div className="app-blocked-box">
        <Lock size={36} />
        <h1>App no disponible</h1>
        <div className="app-blocked-mensaje" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  )
}
