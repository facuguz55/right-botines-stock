import { useEffect, useState } from 'react'
import { Lock, Unlock, ShieldAlert, Loader2 } from 'lucide-react'
import { getAppLockStatus, setAppLock, setCreatorPin, verifyCreatorPin } from '../../services/creatorLock'
import './CreatorLockPanel.css'

// Panel de emergencia para los creadores de right-botines-stock: permite
// bloquear el acceso de TODOS (dueño y empleados incluidos) sin tocar
// código ni depender de Vercel/Supabase. Solo se llega acá con la URL
// secreta (ver ROUTE en src/main.tsx); además pide un pin propio, distinto
// del pin del dueño, verificado siempre server-side.
export function CreatorLockPanel() {
  const [pin, setPin] = useState('')
  const [authed, setAuthed] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const [locked, setLocked] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  const [nuevoPin, setNuevoPin] = useState('')
  const [nuevoPinConfirm, setNuevoPinConfirm] = useState('')
  const [pinMsg, setPinMsg] = useState<string | null>(null)

  const cargarEstado = async () => {
    setLoadingStatus(true)
    try {
      const status = await getAppLockStatus()
      setLocked(status.locked)
      setMensaje(status.mensaje)
    } catch {
      setSaveMsg('No se pudo leer el estado actual.')
    } finally {
      setLoadingStatus(false)
    }
  }

  useEffect(() => {
    if (authed) cargarEstado()
  }, [authed])

  const ingresar = async () => {
    if (!pin || checking) return
    setChecking(true)
    setAuthError(null)
    try {
      const ok = await verifyCreatorPin(pin)
      if (ok) setAuthed(true)
      else setAuthError('Pin incorrecto')
    } catch {
      setAuthError('Error verificando el pin')
    } finally {
      setChecking(false)
    }
  }

  const guardar = async (nuevoLocked: boolean) => {
    setSaving(true)
    setSaveMsg(null)
    try {
      const ok = await setAppLock(pin, nuevoLocked, mensaje)
      if (ok) {
        setLocked(nuevoLocked)
        setSaveMsg(nuevoLocked ? 'App bloqueada para todos los usuarios.' : 'App desbloqueada.')
      } else {
        setSaveMsg('El pin dejó de ser válido, volvé a ingresar.')
        setAuthed(false)
      }
    } catch {
      setSaveMsg('No se pudo guardar el cambio.')
    } finally {
      setSaving(false)
    }
  }

  const cambiarPin = async () => {
    setPinMsg(null)
    if (nuevoPin.length < 6) {
      setPinMsg('El pin nuevo debe tener al menos 6 caracteres.')
      return
    }
    if (nuevoPin !== nuevoPinConfirm) {
      setPinMsg('Los pines no coinciden.')
      return
    }
    try {
      const ok = await setCreatorPin(pin, nuevoPin)
      if (ok) {
        setPin(nuevoPin)
        setNuevoPin('')
        setNuevoPinConfirm('')
        setPinMsg('Pin actualizado.')
      } else {
        setPinMsg('El pin actual no es válido.')
      }
    } catch {
      setPinMsg('No se pudo cambiar el pin.')
    }
  }

  if (!authed) {
    return (
      <div className="creator-lock-screen">
        <div className="creator-lock-box">
          <ShieldAlert size={32} />
          <h1>Panel de creadores</h1>
          <p>Acceso restringido. Ingresá el pin de creador.</p>
          <input
            type="password"
            autoFocus
            value={pin}
            onChange={e => setPin(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ingresar()}
            placeholder="Pin de creador"
          />
          {authError && <p className="creator-lock-error">{authError}</p>}
          <button onClick={ingresar} disabled={checking || !pin}>
            {checking ? <Loader2 size={16} className="spin" /> : 'Entrar'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="creator-lock-screen">
      <div className="creator-lock-box creator-lock-panel">
        <ShieldAlert size={32} />
        <h1>Panel de creadores</h1>

        {loadingStatus ? (
          <p>Cargando estado...</p>
        ) : (
          <>
            <div className={`creator-lock-status ${locked ? 'is-locked' : 'is-open'}`}>
              {locked ? <Lock size={18} /> : <Unlock size={18} />}
              <span>La app está actualmente {locked ? 'BLOQUEADA' : 'abierta'}</span>
            </div>

            <label className="creator-lock-label">
              Mensaje que verán los usuarios bloqueados
              <textarea
                value={mensaje}
                onChange={e => setMensaje(e.target.value)}
                rows={3}
              />
            </label>

            <div className="creator-lock-actions">
              {locked ? (
                <button className="creator-lock-btn-unlock" disabled={saving} onClick={() => guardar(false)}>
                  <Unlock size={16} /> Desbloquear app
                </button>
              ) : (
                <button className="creator-lock-btn-lock" disabled={saving} onClick={() => guardar(true)}>
                  <Lock size={16} /> Bloquear app para todos
                </button>
              )}
            </div>

            {saveMsg && <p className="creator-lock-savemsg">{saveMsg}</p>}
          </>
        )}

        <hr />

        <div className="creator-lock-pin-change">
          <p className="creator-lock-label-title">Cambiar pin de creador</p>
          <input
            type="password"
            value={nuevoPin}
            onChange={e => setNuevoPin(e.target.value)}
            placeholder="Pin nuevo (mín. 6 caracteres)"
          />
          <input
            type="password"
            value={nuevoPinConfirm}
            onChange={e => setNuevoPinConfirm(e.target.value)}
            placeholder="Repetir pin nuevo"
          />
          <button onClick={cambiarPin} disabled={!nuevoPin || !nuevoPinConfirm}>Actualizar pin</button>
          {pinMsg && <p className="creator-lock-savemsg">{pinMsg}</p>}
        </div>
      </div>
    </div>
  )
}
