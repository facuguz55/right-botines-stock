import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { getIntentosFallidos, marcarIntentosVistos, type IntentoFallido } from '../../services/auth'
import './AccessAlerts.css'

const POLL_MS = 30000

export function AccessAlerts() {
  const [noVistos, setNoVistos] = useState<IntentoFallido[]>([])
  const [historial, setHistorial] = useState<IntentoFallido[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const cargar = useCallback(async () => {
    try {
      const data = await getIntentosFallidos()
      setHistorial(data)
      setNoVistos(data.filter(i => !i.visto))
    } catch { /* noop */ }
  }, [])

  useEffect(() => {
    cargar()
    const id = setInterval(cargar, POLL_MS)
    return () => clearInterval(id)
  }, [cargar])

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && noVistos.length > 0) {
      const ids = noVistos.map(i => i.id)
      try { await marcarIntentosVistos(ids) } catch { /* noop */ }
      setNoVistos([])
    }
  }

  return (
    <div className="access-alerts" ref={boxRef}>
      <button className={`access-alerts-btn${noVistos.length > 0 ? ' alert' : ''}`} onClick={toggle} title="Intentos de acceso fallidos">
        <Bell size={16} />
        {noVistos.length > 0 && <span className="access-alerts-badge">{noVistos.length}</span>}
      </button>

      {open && (
        <div className="access-alerts-panel">
          <p className="access-alerts-title">Intentos de PIN incorrecto</p>
          {historial.length === 0 ? (
            <p className="access-alerts-empty">Sin intentos fallidos registrados.</p>
          ) : (
            <ul className="access-alerts-list">
              {historial.map(i => (
                <li key={i.id}>
                  {new Date(i.fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
