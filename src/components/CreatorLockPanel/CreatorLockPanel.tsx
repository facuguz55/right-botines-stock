import { useEffect, useState } from 'react'
import { Lock, Unlock, ShieldAlert, Loader2, KeyRound, Eye } from 'lucide-react'
import { getAppLockStatus, setAppLock, setCreatorPin, verifyCreatorPin } from '../../services/creatorLock'
import { RichTextEditor } from '../RichTextEditor/RichTextEditor'
import { AppBlocked } from '../AppBlocked/AppBlocked'
import { sanitizeHtml } from '../../utils/sanitizeHtml'
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

  const [showPinChange, setShowPinChange] = useState(false)
  const [nuevoPin, setNuevoPin] = useState('')
  const [nuevoPinConfirm, setNuevoPinConfirm] = useState('')
  const [pinMsg, setPinMsg] = useState<string | null>(null)
  const [savingPin, setSavingPin] = useState(false)

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
      const ok = await setAppLock(pin, nuevoLocked, sanitizeHtml(mensaje))
      if (ok) {
        setLocked(nuevoLocked)
        setSaveMsg(nuevoLocked ? '✓ App bloqueada para todos los usuarios.' : '✓ App desbloqueada.')
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
    setSavingPin(true)
    try {
      const ok = await setCreatorPin(pin, nuevoPin)
      if (ok) {
        setPin(nuevoPin)
        setNuevoPin('')
        setNuevoPinConfirm('')
        setPinMsg('✓ Pin actualizado.')
      } else {
        setPinMsg('El pin actual no es válido.')
      }
    } catch {
      setPinMsg('No se pudo cambiar el pin.')
    } finally {
      setSavingPin(false)
    }
  }

  if (!authed) {
    return (
      <div className="clp-gate">
        <div className="clp-gate-card">
          <div className="clp-gate-icon"><ShieldAlert size={26} /></div>
          <h1>Panel de creadores</h1>
          <p>Acceso restringido. Ingresá el pin de creador para continuar.</p>
          <input
            type="password"
            autoFocus
            value={pin}
            onChange={e => setPin(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ingresar()}
            placeholder="Pin de creador"
          />
          {authError && <p className="clp-gate-error">{authError}</p>}
          <button className="clp-btn clp-btn-primary" onClick={ingresar} disabled={checking || !pin}>
            {checking ? <Loader2 size={16} className="clp-spin" /> : 'Entrar'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="clp-page">
      <header className="clp-header">
        <div className="clp-header-title">
          <ShieldAlert size={20} />
          <h1>Panel de creadores</h1>
        </div>
        {!loadingStatus && (
          <span className={`clp-status ${locked ? 'is-locked' : 'is-open'}`}>
            {locked ? <Lock size={13} /> : <Unlock size={13} />}
            {locked ? 'App bloqueada' : 'App abierta'}
          </span>
        )}
      </header>

      {loadingStatus ? (
        <p className="clp-loading">Cargando estado...</p>
      ) : (
        <div className="clp-main">
          <section className="clp-editor-col">
            <p className="clp-section-label">Mensaje para los usuarios bloqueados</p>
            <RichTextEditor value={mensaje} onChange={setMensaje} />

            <div className="clp-actions">
              {locked ? (
                <button className="clp-btn clp-btn-unlock" disabled={saving} onClick={() => guardar(false)}>
                  <Unlock size={16} /> {saving ? 'Guardando...' : 'Desbloquear app'}
                </button>
              ) : (
                <button className="clp-btn clp-btn-lock" disabled={saving} onClick={() => guardar(true)}>
                  <Lock size={16} /> {saving ? 'Guardando...' : 'Bloquear app para todos'}
                </button>
              )}
            </div>

            {saveMsg && <p className="clp-savemsg">{saveMsg}</p>}
          </section>

          <section className="clp-preview-col">
            <p className="clp-section-label"><Eye size={13} /> Así lo van a ver</p>
            <div className="clp-preview-frame">
              <div className="clp-preview-chrome">
                <span /><span /><span />
              </div>
              <div className="clp-preview-body">
                <AppBlocked mensaje={mensaje} preview />
              </div>
            </div>
          </section>
        </div>
      )}

      <footer className="clp-footer">
        <button className="clp-pinchange-toggle" onClick={() => setShowPinChange(v => !v)}>
          <KeyRound size={13} /> Cambiar pin de creador
        </button>

        {showPinChange && (
          <div className="clp-pinchange">
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
            <button className="clp-btn clp-btn-secondary" onClick={cambiarPin} disabled={!nuevoPin || !nuevoPinConfirm || savingPin}>
              {savingPin ? 'Guardando...' : 'Actualizar pin'}
            </button>
            {pinMsg && <p className="clp-savemsg">{pinMsg}</p>}
          </div>
        )}
      </footer>
    </div>
  )
}
