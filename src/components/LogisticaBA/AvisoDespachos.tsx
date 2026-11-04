import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { activarPush, estadoPush, type EstadoPush } from '../../services/push'

// Botón para que este celu reciba una notificación cada vez que la logística
// de Buenos Aires despacha un pedido (api/logistica-push). Es aparte del aviso
// de mensajes del CRM: se activa acá, en cada celu que lo quiera.
const KEY = 'rb_aviso_despachos'
const leer = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
const guardar = (v: boolean) => { try { localStorage.setItem(KEY, v ? '1' : '0') } catch { /* noop */ } }

export function AvisoDespachos() {
  const [activo, setActivo] = useState(leer())
  const [estado, setEstado] = useState<EstadoPush | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { estadoPush().then(setEstado) }, [])

  const cambiar = async (on: boolean) => {
    setCargando(true)
    setError(null)
    try {
      const r = await activarPush(undefined, on)
      if (r === 'activo') { setActivo(on); guardar(on) }
      else setEstado(r)
    } catch {
      setError('No se pudo guardar. Probá de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  if (estado === 'no_soportado') return null
  if (estado === 'ios_instalar') {
    return <p className="lba-aviso-desp off"><Bell size={14} /> Para recibir un aviso cuando la proveedora despacha, abrí la app desde el ícono de la pantalla de inicio del celu.</p>
  }
  if (estado === 'denegado') {
    return <p className="lba-aviso-desp off"><BellOff size={14} /> Las notificaciones están bloqueadas en este celu. Activalas en los ajustes del navegador para recibir el aviso de despachos.</p>
  }
  return (
    <div className={`lba-aviso-desp${activo ? ' on' : ''}`}>
      {activo
        ? <><Bell size={14} /> Este celu recibe un aviso cada vez que la proveedora despacha.
            <button className="lba-aviso-link" disabled={cargando} onClick={() => cambiar(false)}>Desactivar</button></>
        : <><button className="btn btn-secondary btn-sm" disabled={cargando} onClick={() => cambiar(true)}>
            <Bell size={13} /> {cargando ? 'Activando…' : 'Avisarme en este celu cuando despache'}
          </button></>}
      {error && <span className="lba-error"> {error}</span>}
    </div>
  )
}
