import { useEffect, useState } from 'react'
import { Modal } from '../Modal/Modal'
import { habilitarEsteDispositivo } from '../../services/dispositivos'
import './DispositivoBanner.css'

interface Props {
  isOpen: boolean
  onClose: () => void
  // Se llama cuando el dispositivo quedó habilitado, al cerrar la ventana.
  onHabilitado?: () => void
}

// Ventana para habilitar ESTE dispositivo con el PIN del dueño (migración 046).
// La usan el aviso de arriba, Ajustes → Seguridad y las pantallas de Tienda
// Online cuando muestran el error de dispositivo no habilitado.
export function HabilitarDispositivoModal({ isOpen, onClose, onHabilitado }: Props) {
  const [nombre, setNombre] = useState('Compu del local')
  const [pin, setPin] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    if (isOpen) { setPin(''); setError(null); setListo(false) }
  }, [isOpen])

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
    onClose()
    if (listo) onHabilitado?.()
  }

  return (
    <Modal isOpen={isOpen} onClose={() => !guardando && cerrar()} title="Habilitar este dispositivo" maxWidth="380px">
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
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Compu del local, Mac de Cami" />
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
  )
}
