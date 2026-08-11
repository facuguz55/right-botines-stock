import { useState } from 'react'
import { Wallet } from 'lucide-react'
import './AperturaCajaGate.css'

interface AperturaCajaGateProps {
  empleadoNombre: string | null
  onConfirm: (montoApertura: number) => Promise<void>
  onLogout: () => void
}

// Pantalla bloqueante para el primer empleado que ficha en el día: no hay
// caja abierta todavía, así que fichar entrada y abrir caja quedan atados
// en un solo paso obligatorio — no se puede "cancelar" la apertura en sí
// (si sos vos, tenés que abrirla para poder usar la app). Pero si alguien
// entró sin querer o eligió el perfil equivocado, tiene que poder salir de
// esta pantalla sin fichar ni abrir nada — para eso está "No soy yo".
export function AperturaCajaGate({ empleadoNombre, onConfirm, onLogout }: AperturaCajaGateProps) {
  const [monto, setMonto] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async () => {
    const n = Number(monto)
    if (!(n >= 0)) return
    setLoading(true)
    setError(null)
    try {
      await onConfirm(n)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="apertura-gate">
      <img src="/logo.png" alt="Right Botines" className="apertura-gate-logo" />

      <div className="apertura-gate-card">
        <Wallet size={22} className="apertura-gate-icon" />
        <h1 className="apertura-gate-title">
          {empleadoNombre ? `Hola, ${empleadoNombre}` : 'Hola'}
        </h1>
        <p className="apertura-gate-desc">
          Sos el primero en fichar hoy — para empezar hay que abrir la caja
          con el efectivo inicial que hay ahora mismo.
        </p>

        <div className="form-group">
          <label>Efectivo inicial</label>
          <input
            type="number" min={0} autoFocus
            value={monto} onChange={e => setMonto(e.target.value)}
            placeholder="0"
            onKeyDown={e => { if (e.key === 'Enter' && monto && !loading) handleConfirm() }}
          />
        </div>

        {error && <p className="apertura-gate-error">⚠ {error}</p>}

        <button
          className="btn btn-primary apertura-gate-btn"
          disabled={!monto || loading}
          onClick={handleConfirm}
        >
          {loading ? 'Abriendo...' : 'Fichar entrada y abrir caja'}
        </button>

        <button className="apertura-gate-logout" onClick={onLogout} disabled={loading}>
          No soy yo — cerrar sesión
        </button>
      </div>
    </div>
  )
}
