import { useState } from 'react'
import { HabilitarDispositivoModal } from './HabilitarDispositivoModal'

interface Props {
  error: string
  onRetry?: () => void
}

// Error de las pantallas de Tienda Online. Si el motivo es que este dispositivo
// no está habilitado (el proxy responde DISPOSITIVO_NO_HABILITADO), en vez del
// JSON crudo explica qué pasa y deja habilitarlo desde acá mismo.
export function ErrorTienda({ error, onRetry }: Props) {
  const [abierto, setAbierto] = useState(false)
  const noHabilitado = error.includes('DISPOSITIVO_NO_HABILITADO')

  return (
    <div className="tn-error">
      {noHabilitado ? (
        <>
          <p>⚠ Este dispositivo todavía no está habilitado para usar TiendaNube. Lo habilita el dueño, una sola vez, con su PIN.</p>
          <button className="btn btn-primary btn-sm" onClick={() => setAbierto(true)}>Habilitar este dispositivo</button>
          <HabilitarDispositivoModal isOpen={abierto} onClose={() => setAbierto(false)} onHabilitado={onRetry} />
        </>
      ) : (
        <>
          <p>⚠ {error}</p>
          {onRetry && <button className="btn btn-secondary btn-sm" onClick={onRetry}>Reintentar</button>}
        </>
      )}
    </div>
  )
}
