import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { HabilitarDispositivoModal } from './HabilitarDispositivoModal'
import { EVENTO_NO_HABILITADO, getDeviceToken } from '../../lib/dispositivo'
import { getTNCredentials } from '../../services/tiendanubeService'
import { esteDispositivoHabilitado } from '../../services/dispositivos'
import './DispositivoBanner.css'

// Aviso para dispositivos que no están habilitados para TiendaNube. Sin
// habilitar, las ventas, cambios y devoluciones hechos desde acá no
// actualizan el stock de la web. Se habilita UNA vez con el PIN del dueño.
// No aparece en dispositivos con credenciales propias de TiendaNube cargadas
// en Ajustes (esos no necesitan las del servidor).
export function DispositivoBanner() {
  const [mostrar, setMostrar] = useState(false)
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    const { storeId, token } = getTNCredentials()
    if (storeId && token) return
    // Si tiene permiso guardado, se confirma que siga vigente (el dueño
    // pudo haberlo quitado).
    esteDispositivoHabilitado(getDeviceToken()).then(ok => setMostrar(!ok))

    const alRechazar = () => setMostrar(true)
    window.addEventListener(EVENTO_NO_HABILITADO, alRechazar)
    return () => window.removeEventListener(EVENTO_NO_HABILITADO, alRechazar)
  }, [])

  if (!mostrar) return null

  return (
    <>
      <div className="dispositivo-banner">
        <ShieldAlert size={16} />
        <span>
          Este dispositivo todavía no está habilitado para TiendaNube. Habilitalo con el PIN del dueño para que sus ventas y cambios sigan actualizando el stock de la web.
        </span>
        <button className="btn btn-primary btn-sm" onClick={() => setAbierto(true)}>Habilitar</button>
      </div>
      <HabilitarDispositivoModal
        isOpen={abierto}
        onClose={() => setAbierto(false)}
        onHabilitado={() => setMostrar(false)}
      />
    </>
  )
}
