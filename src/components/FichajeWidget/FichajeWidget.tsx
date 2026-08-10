import { useState, useEffect } from 'react'
import { Play, Square } from 'lucide-react'
import type { useFichajeActual } from '../../hooks/useFichajeActual'
import { Modal } from '../Modal/Modal'
import './FichajeWidget.css'

function tiempoEnTurno(horaEntrada: string): string {
  const entrada = new Date(horaEntrada).getTime()
  const mins = Math.max(0, Math.round((Date.now() - entrada) / 60000))
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

interface FichajeWidgetProps {
  fichajeHook: ReturnType<typeof useFichajeActual>
}

// Fichar entrada/salida es una acción propia, separada de iniciar/cerrar
// sesión — así el empleado puede seguir usando la app sin que eso afecte
// su fichaje, y es responsable de ficharse él mismo.
export function FichajeWidget({ fichajeHook }: FichajeWidgetProps) {
  const { fichaje, loading, ficharEntrada, ficharSalida, cierrePendiente, confirmarSalidaConCierre, cancelarCierrePendiente } = fichajeHook
  const [saving, setSaving] = useState(false)
  const [, setTick] = useState(0)
  const [montoContado, setMontoContado] = useState('')
  const [notas, setNotas] = useState('')
  const [cerrando, setCerrando] = useState(false)

  useEffect(() => {
    if (!fichaje) return
    const id = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [fichaje])

  if (loading) return null

  const handleClick = async () => {
    setSaving(true)
    try {
      if (fichaje) await ficharSalida()
      else await ficharEntrada()
    } finally {
      setSaving(false)
    }
  }

  const contadoNum = montoContado ? Number(montoContado) : null
  const diferencia = cierrePendiente && contadoNum != null ? contadoNum - cierrePendiente.esperado : null

  const handleCancelarCierre = () => {
    cancelarCierrePendiente()
    setMontoContado('')
    setNotas('')
  }

  const handleConfirmarCierre = async () => {
    if (contadoNum == null) return
    setCerrando(true)
    try {
      await confirmarSalidaConCierre(contadoNum, notas.trim() || null)
      setMontoContado('')
      setNotas('')
    } finally {
      setCerrando(false)
    }
  }

  return (
    <div className={`fichaje-widget${fichaje ? ' en-turno' : ''}`}>
      {fichaje && (
        <span className="fichaje-tiempo">En turno · {tiempoEnTurno(fichaje.hora_entrada)}</span>
      )}
      <button
        type="button"
        className={`fichaje-btn${fichaje ? ' salida' : ' entrada'}`}
        onClick={handleClick}
        disabled={saving}
      >
        {fichaje ? <Square size={12} /> : <Play size={12} />}
        <span>{saving ? 'Guardando...' : fichaje ? 'Fichar salida' : 'Fichar entrada'}</span>
      </button>

      <Modal isOpen={!!cierrePendiente} onClose={() => !cerrando && handleCancelarCierre()} title="Cerrar caja" maxWidth="380px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p className="fichaje-cierre-info">
            Sos el último en fichar salida hoy — contá el efectivo de la caja para cerrarla.
          </p>

          <div className="form-group">
            <label>Efectivo contado</label>
            <input
              type="number" min={0} autoFocus
              value={montoContado} onChange={e => setMontoContado(e.target.value)}
              placeholder="0"
            />
          </div>

          {diferencia !== null && (
            <p className={`fichaje-diferencia ${diferencia === 0 ? 'neutral' : diferencia > 0 ? 'positive' : 'negative'}`}>
              {diferencia === 0
                ? 'Cuadra exacto.'
                : diferencia > 0
                  ? `Sobran $${diferencia.toLocaleString('es-AR')}`
                  : `Faltan $${Math.abs(diferencia).toLocaleString('es-AR')}`}
            </p>
          )}

          <div className="form-group">
            <label>Notas (opcional)</label>
            <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional" />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem' }}>
            <button className="btn btn-secondary" onClick={handleCancelarCierre} disabled={cerrando}>Cancelar</button>
            <button className="btn btn-primary" disabled={!montoContado || cerrando} onClick={handleConfirmarCierre}>
              {cerrando ? 'Cerrando...' : 'Fichar salida y cerrar caja'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
