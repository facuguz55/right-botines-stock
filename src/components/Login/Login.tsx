import { useState } from 'react'
import { Briefcase, ShieldCheck, Delete, AlertTriangle } from 'lucide-react'
import './Login.css'

interface LoginProps {
  onLoginEmpleado: () => void
  onLoginDueno: (pin: string) => Promise<boolean>
}

const PIN_LENGTH = 4

export function Login({ onLoginEmpleado, onLoginDueno }: LoginProps) {
  const [modo, setModo] = useState<'select' | 'pin'>('select')
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(false)

  const volver = () => {
    setModo('select')
    setPin('')
    setError(false)
  }

  const presionar = async (digito: string) => {
    if (checking || pin.length >= PIN_LENGTH) return
    const nuevo = pin + digito
    setPin(nuevo)
    setError(false)
    if (nuevo.length === PIN_LENGTH) {
      setChecking(true)
      const ok = await onLoginDueno(nuevo)
      setChecking(false)
      if (!ok) {
        setError(true)
        setPin('')
      }
    }
  }

  const borrar = () => setPin(p => p.slice(0, -1))

  return (
    <div className="login-screen">
      <img src="/logo.png" alt="Right Botines" className="login-logo" />

      {modo === 'select' ? (
        <div className="login-select">
          <button className="login-card" onClick={onLoginEmpleado}>
            <Briefcase size={28} />
            <span>Acceso empleado</span>
            <small>Entrá sin contraseña</small>
          </button>
          <button className="login-card login-card-dueno" onClick={() => setModo('pin')}>
            <ShieldCheck size={28} />
            <span>Acceso dueño</span>
            <small>Requiere PIN</small>
          </button>
        </div>
      ) : (
        <div className="login-pin">
          <p className="login-pin-title">Ingresá el PIN</p>

          <div className="login-pin-dots">
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <span key={i} className={`login-pin-dot${i < pin.length ? ' filled' : ''}${error ? ' error' : ''}`} />
            ))}
          </div>

          {error && (
            <p className="login-pin-error"><AlertTriangle size={13} /> PIN incorrecto</p>
          )}

          <div className="login-keypad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => (
              <button key={n} className="login-key" onClick={() => presionar(n)} disabled={checking}>{n}</button>
            ))}
            <button className="login-key login-key-ghost" onClick={volver} disabled={checking}>Volver</button>
            <button className="login-key" onClick={() => presionar('0')} disabled={checking}>0</button>
            <button className="login-key login-key-ghost" onClick={borrar} disabled={checking || pin.length === 0}>
              <Delete size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
