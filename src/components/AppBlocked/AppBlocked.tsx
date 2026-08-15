import { Lock } from 'lucide-react'
import './AppBlocked.css'

export function AppBlocked({ mensaje }: { mensaje: string }) {
  return (
    <div className="app-blocked-screen">
      <div className="app-blocked-box">
        <Lock size={36} />
        <h1>App no disponible</h1>
        <p>{mensaje || 'La aplicación está temporalmente fuera de servicio.'}</p>
      </div>
    </div>
  )
}
