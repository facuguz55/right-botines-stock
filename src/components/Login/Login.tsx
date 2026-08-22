import { useEffect, useState } from 'react'
import { Briefcase, ShieldCheck, Headset, Delete, AlertTriangle, User, ArrowLeft } from 'lucide-react'
import type { Empleado } from '../../types'
import './Login.css'

interface LoginProps {
  empleados: Empleado[]
  loadingEmpleados: boolean
  onLoginEmpleado: (empleado: Empleado, rol?: 'empleado' | 'atencion') => Promise<void>
  onLoginDueno: (pin: string) => Promise<boolean>
}

const PIN_LENGTH = 4

export function Login({ empleados, loadingEmpleados, onLoginEmpleado, onLoginDueno }: LoginProps) {
  const [modo, setModo] = useState<'select' | 'empleado' | 'atencion' | 'pin'>('select')
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(false)
  const [empleadoError, setEmpleadoError] = useState<string | null>(null)
  const [entrandoId, setEntrandoId] = useState<string | null>(null)

  const volver = () => {
    setModo('select')
    setPin('')
    setError(false)
    setEmpleadoError(null)
    setEntrandoId(null)
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

  const elegirEmpleado = async (empleado: Empleado) => {
    if (entrandoId) return
    setEmpleadoError(null)
    setEntrandoId(empleado.id)
    try {
      await onLoginEmpleado(empleado, modo === 'atencion' ? 'atencion' : 'empleado')
    } catch {
      setEmpleadoError('No se pudo registrar el ingreso, probá de nuevo.')
      setEntrandoId(null)
    }
  }

  // Permite ingresar el PIN con el teclado físico, no solo tocando el teclado numérico.
  useEffect(() => {
    if (modo !== 'pin') return
    const onKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) presionar(e.key)
      else if (e.key === 'Backspace') borrar()
      else if (e.key === 'Escape') volver()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [modo, pin, checking])

  return (
    <div className="login-screen">
      <img src="/logo.png" alt="Right Botines" className="login-logo" />

      {modo === 'select' && (
        <div className="login-select">
          <button className="login-card" onClick={() => setModo('empleado')}>
            <Briefcase size={28} />
            <span>Acceso empleado</span>
            <small>Entrá sin contraseña</small>
          </button>
          <button className="login-card login-card-atencion" onClick={() => setModo('atencion')}>
            <Headset size={28} />
            <span>Atención al público</span>
            <small>Vender y ver fotos</small>
          </button>
          <button className="login-card login-card-dueno" onClick={() => setModo('pin')}>
            <ShieldCheck size={28} />
            <span>Acceso dueño</span>
            <small>Requiere PIN</small>
          </button>
        </div>
      )}

      {(modo === 'empleado' || modo === 'atencion') && (
        <div className="login-empleados">
          <p className="login-pin-title">¿Quién sos?</p>

          {loadingEmpleados ? (
            <p className="login-empleados-empty">Cargando...</p>
          ) : empleados.length === 0 ? (
            <p className="login-empleados-empty">
              No hay empleados cargados. Pedile al dueño que los agregue en Empleados.
            </p>
          ) : (
            <div className="login-empleados-list">
              {empleados.map(emp => (
                <button
                  key={emp.id}
                  className="login-empleado-btn"
                  onClick={() => elegirEmpleado(emp)}
                  disabled={!!entrandoId}
                >
                  <User size={16} />
                  <span>{emp.nombre}</span>
                </button>
              ))}
            </div>
          )}

          {empleadoError && (
            <p className="login-pin-error"><AlertTriangle size={13} /> {empleadoError}</p>
          )}

          <button className="login-key-ghost login-volver" onClick={volver} disabled={!!entrandoId}>
            <ArrowLeft size={14} /> Volver
          </button>
        </div>
      )}

      {modo === 'pin' && (
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
