import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertOctagon } from 'lucide-react'
import { getFallasDevolucionesCambios, marcarFallasVistas } from '../../services/devolucionesCambiosFallos'
import type { FallaDevolucionCambio } from '../../types'
import '../AccessAlerts/AccessAlerts.css'

const POLL_MS = 30000

// Mismo patrón que AccessAlerts (intentos de PIN) — ver migración
// 038_log_fallas_devoluciones_cambios.sql para el por qué: cuando un cambio
// o devolución rechaza (sin caja, sin fichaje, stock insuficiente...), la
// transacción entera se cancela y no queda nada guardado en el historial
// normal. Esto le da al dueño visibilidad de esos rechazos sin tener que
// reconstruirlos a mano por ausencia de datos.
// También recibe ventas, ingresos, cambios y devoluciones que se registraron
// pero no llegaron a TiendaNube (services/stockTN.ts avisarFallaStockTN).
export function DevolucionesAlerts() {
  const [noVistos, setNoVistos] = useState<FallaDevolucionCambio[]>([])
  const [historial, setHistorial] = useState<FallaDevolucionCambio[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const cargar = useCallback(async () => {
    try {
      const data = await getFallasDevolucionesCambios()
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
      try { await marcarFallasVistas(ids) } catch { /* noop */ }
      setNoVistos([])
    }
  }

  return (
    <div className="access-alerts" ref={boxRef}>
      <button className={`access-alerts-btn${noVistos.length > 0 ? ' alert' : ''}`} onClick={toggle} title="Problemas con ventas, ingresos, cambios y devoluciones">
        <AlertOctagon size={16} />
        {noVistos.length > 0 && <span className="access-alerts-badge">{noVistos.length}</span>}
      </button>

      {open && (
        <div className="access-alerts-panel" style={{ width: 300 }}>
          <p className="access-alerts-title">Problemas con ventas, ingresos, cambios y devoluciones</p>
          {historial.length === 0 ? (
            <p className="access-alerts-empty">Sin fallos registrados.</p>
          ) : (
            <ul className="access-alerts-list">
              {historial.map(f => (
                <li key={f.id}>
                  <strong>{new Date(f.fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</strong>
                  {' · '}{f.empleados?.nombre ?? 'Dueño/Atención'}
                  <br />{f.mensaje}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
