import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { Modal } from '../Modal/Modal'
import { EVENTO_NO_HABILITADO, getDeviceToken } from '../../lib/dispositivo'
import { getTNCredentials } from '../../services/tiendanubeService'
import { esteDispositivoHabilitado, habilitarEsteDispositivo } from '../../services/dispositivos'
import './DispositivoBanner.css'

// Aviso para dispositivos que no están habilitados para TiendaNube. Sin
// habilitar, las ventas, cambios y devoluciones hechos desde acá no
// actualizan el stock de la web. Se habilita UNA vez con el PIN del dueño.
// No aparece en dispositivos con credenciales propias de TiendaNube cargadas
// en Ajustes (esos no necesitan las del servidor).
export function DispositivoBanner() {
  const [mostrar, setMostrar] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('Compu del local')
  const [pin, setPin] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)

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

  const habilitar = async () => {
    setError(null)
    setGuardando(true)
    try {
      await habilitarEsteDispositivo(pin, nombre)
      setListo(true)
      setPin('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  const cerrar = () => {
    setAbierto(false)
    if (listo) setMostrar(false)
  }

  return (
    <>
      <div className="dispositivo-banner">
        <ShieldAlert size={16} />
        <span>
          Este dispositivo todavía no está habilitado para TiendaNube. Habilitalo con el PIN del dueño para que sus ventas y cambios sigan actualizando el stock de la web.
        </span>
        <button className="btn btn-primary btn-sm" onClick={() => setAbierto(true)}>Habilitar</button>
      </div>

      <Modal isOpen={abierto} onClose={() => !guardando && cerrar()} title="Habilitar este dispositivo" maxWidth="380px">
        {listo ? (
          <div className="dispositivo-form">
            <p className="dispositivo-ok">Listo, este dispositivo quedó habilitado. No hace falta volver a hacerlo.</p>
            <button className="btn btn-primary" onClick={cerrar}>Cerrar</button>
          </div>
        ) : (
          <div className="dispositivo-form">
            <p className="dispositivo-ayuda">
              Se hace una sola vez por dispositivo. Lo tiene que hacer el dueño con su PIN.
            </p>
            <div className="form-group">
              <label>Nombre del dispositivo</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Compu del local, celular de Cami" />
            </div>
            <div className="form-group">
              <label>PIN del dueño</label>
              <input
                type="password" inputMode="numeric" maxLength={4} autoFocus
                value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                onKeyDown={e => { if (e.key === 'Enter' && pin.length === 4 && !guardando) habilitar() }}
                placeholder="••••"
              />
            </div>
            {error && <p className="dispositivo-error">⚠ {error}</p>}
            <div className="dispositivo-acciones">
              <button className="btn btn-secondary" onClick={cerrar} disabled={guardando}>Cancelar</button>
              <button className="btn btn-primary" onClick={habilitar} disabled={guardando || pin.length !== 4 || !nombre.trim()}>
                {guardando ? 'Habilitando...' : 'Habilitar'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
