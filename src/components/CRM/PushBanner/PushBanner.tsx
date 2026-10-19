import { useEffect, useState } from 'react'
import { activarPush, estadoPush, type EstadoPush } from '../../../services/push'

interface Props { nombre?: string | null }

// Barra chica para activar las notificaciones del CRM en este celular.
// Se oculta sola cuando ya están activas o si el dispositivo no las soporta.
export function PushBanner({ nombre }: Props) {
  const [estado, setEstado] = useState<EstadoPush | null>(null)
  const [cerrado, setCerrado] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { estadoPush().then(setEstado).catch(() => setEstado('no_soportado')) }, [])

  if (cerrado || estado === null || estado === 'activo' || estado === 'no_soportado') return null

  const texto =
    estado === 'ios_instalar' ? 'Para recibir avisos: Compartir > Añadir a pantalla de inicio, y abrí el CRM desde ahí.'
    : estado === 'denegado' ? 'Las notificaciones están bloqueadas. Activalas en los ajustes del celu para esta app.'
    : error || 'Activá las notificaciones para enterarte cuando llega un mensaje.'

  async function activar() {
    setTrabajando(true); setError('')
    try { setEstado(await activarPush(nombre)) } catch { setError('No se pudo activar. Probá de nuevo.') }
    setTrabajando(false)
  }

  return (
    <div role="status" style={{
      position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 60,
      maxWidth: 'calc(100vw - 24px)', display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 12px', borderRadius: 12, background: '#101826', color: '#e8edf5',
      border: '1px solid #243049', fontSize: 13, boxShadow: '0 6px 20px rgba(0,0,0,.35)',
    }}>
      <span>{texto}</span>
      {estado === 'inactivo' && (
        <button onClick={activar} disabled={trabajando} style={{
          background: '#ff6a2b', color: '#1a0a02', border: 0, borderRadius: 8, padding: '6px 10px',
          fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
        }}>{trabajando ? 'Activando…' : 'Activar'}</button>
      )}
      <button onClick={() => setCerrado(true)} aria-label="Cerrar" style={{ background: 'none', border: 0, color: '#8a96ab', cursor: 'pointer', fontSize: 16 }}>×</button>
    </div>
  )
}
